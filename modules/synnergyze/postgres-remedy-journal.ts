import type {
  RemedyExecutionJournalV1,
  RemedyExecutionReceiptV1,
  RemedyJournalBeginResultV1,
  RemedyJournalStartV1,
} from "./remedy-execution.ts";

export interface PostgresQueryResultV1<T> {
  rows: T[];
  rowCount: number;
}

export interface PostgresQueryExecutorV1 {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<PostgresQueryResultV1<T>>;
}

interface RemedyJournalRowV1 {
  authorization_ref: string;
  execution_fingerprint: string;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  expires_at_ms: string | number;
  receipt_json: RemedyExecutionReceiptV1 | string | null;
}

function parseReceipt(value: RemedyJournalRowV1["receipt_json"]): RemedyExecutionReceiptV1 | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return JSON.parse(value) as RemedyExecutionReceiptV1;
  return value;
}

export class PostgresRemedyExecutionJournalV1 implements RemedyExecutionJournalV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async begin(input: RemedyJournalStartV1): Promise<RemedyJournalBeginResultV1> {
    const inserted = await this.db.query<{ authorization_ref: string }>(
      `INSERT INTO vsr_remedy_execution_journal
        (authorization_ref, execution_fingerprint, state, expires_at_ms, started_at_ms, updated_at_ms)
       VALUES ($1, $2, 'IN_PROGRESS', $3, $4, $4)
       ON CONFLICT (authorization_ref) DO NOTHING
       RETURNING authorization_ref`,
      [
        input.authorizationRef,
        input.executionFingerprint,
        input.expiresAtMs,
        input.startedAtMs,
      ],
    );
    if (inserted.rowCount === 1) return { state: "STARTED" };

    const selected = await this.db.query<RemedyJournalRowV1>(
      `SELECT authorization_ref, execution_fingerprint, state, expires_at_ms, receipt_json
       FROM vsr_remedy_execution_journal
       WHERE authorization_ref = $1`,
      [input.authorizationRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("remedy_journal_race_missing_row");
    if (row.execution_fingerprint !== input.executionFingerprint) return { state: "CONFLICT" };
    if (row.state === "COMPLETED") {
      const receipt = parseReceipt(row.receipt_json);
      if (!receipt) throw new Error("remedy_journal_completed_receipt_missing");
      return { state: "COMPLETED", receipt };
    }
    return { state: row.state };
  }

  async complete(input: {
    authorizationRef: string;
    executionFingerprint: string;
    receipt: RemedyExecutionReceiptV1;
    completedAtMs: number;
  }): Promise<void> {
    const updated = await this.db.query<{ authorization_ref: string }>(
      `UPDATE vsr_remedy_execution_journal
       SET state = 'COMPLETED', receipt_json = $3::jsonb, failure_reason = NULL,
           completed_at_ms = $4, updated_at_ms = $4
       WHERE authorization_ref = $1 AND execution_fingerprint = $2 AND state = 'IN_PROGRESS'
       RETURNING authorization_ref`,
      [
        input.authorizationRef,
        input.executionFingerprint,
        JSON.stringify(input.receipt),
        input.completedAtMs,
      ],
    );
    if (updated.rowCount !== 1) throw new Error("remedy_journal_complete_conflict");
  }

  async fail(input: {
    authorizationRef: string;
    executionFingerprint: string;
    reason: string;
    failedAtMs: number;
  }): Promise<void> {
    const updated = await this.db.query<{ authorization_ref: string }>(
      `UPDATE vsr_remedy_execution_journal
       SET state = 'FAILED', failure_reason = $3, failed_at_ms = $4, updated_at_ms = $4
       WHERE authorization_ref = $1 AND execution_fingerprint = $2 AND state = 'IN_PROGRESS'
       RETURNING authorization_ref`,
      [input.authorizationRef, input.executionFingerprint, input.reason, input.failedAtMs],
    );
    if (updated.rowCount !== 1) throw new Error("remedy_journal_fail_conflict");
  }
}
