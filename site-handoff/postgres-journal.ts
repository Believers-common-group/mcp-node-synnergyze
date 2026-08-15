import type {
  GovernedHandoffResultV1,
  HandoffExecutionJournalV1,
  HandoffJournalBeginResultV1,
  HandoffJournalStartV1,
} from "./governed-runtime.ts";

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

interface JournalRowV1 {
  nonce: string;
  handoff_ref: string;
  token_digest: string;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  expires_at_ms: string | number;
  result_json: GovernedHandoffResultV1 | string | null;
}

function parseResult(value: JournalRowV1["result_json"]): GovernedHandoffResultV1 | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return JSON.parse(value) as GovernedHandoffResultV1;
  return value;
}

export class PostgresHandoffExecutionJournalV1 implements HandoffExecutionJournalV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async begin(input: HandoffJournalStartV1): Promise<HandoffJournalBeginResultV1> {
    await this.db.query(
      `DELETE FROM vsr_handoff_execution_journal
       WHERE expires_at_ms <= $1`,
      [input.startedAtMs],
    );

    const inserted = await this.db.query<{ nonce: string }>(
      `INSERT INTO vsr_handoff_execution_journal
        (nonce, handoff_ref, token_digest, state, expires_at_ms, started_at_ms, updated_at_ms)
       VALUES ($1, $2, $3, 'IN_PROGRESS', $4, $5, $5)
       ON CONFLICT (nonce) DO NOTHING
       RETURNING nonce`,
      [input.nonce, input.handoffRef, input.tokenDigest, input.expiresAtMs, input.startedAtMs],
    );
    if (inserted.rowCount === 1) return { state: "STARTED" };

    const selected = await this.db.query<JournalRowV1>(
      `SELECT nonce, handoff_ref, token_digest, state, expires_at_ms, result_json
       FROM vsr_handoff_execution_journal
       WHERE nonce = $1`,
      [input.nonce],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("handoff_journal_race_missing_row");
    if (row.token_digest !== input.tokenDigest || row.handoff_ref !== input.handoffRef) {
      return { state: "CONFLICT" };
    }
    if (row.state === "COMPLETED") {
      const result = parseResult(row.result_json);
      if (!result) throw new Error("handoff_journal_completed_result_missing");
      return { state: "COMPLETED", result };
    }
    return { state: row.state };
  }

  async complete(input: {
    nonce: string;
    tokenDigest: string;
    result: GovernedHandoffResultV1;
    completedAtMs: number;
  }): Promise<void> {
    const updated = await this.db.query<{ nonce: string }>(
      `UPDATE vsr_handoff_execution_journal
       SET state = 'COMPLETED', result_json = $3::jsonb, failure_reason = NULL,
           completed_at_ms = $4, updated_at_ms = $4
       WHERE nonce = $1 AND token_digest = $2 AND state = 'IN_PROGRESS'
       RETURNING nonce`,
      [input.nonce, input.tokenDigest, JSON.stringify(input.result), input.completedAtMs],
    );
    if (updated.rowCount !== 1) throw new Error("handoff_journal_complete_conflict");
  }

  async fail(input: {
    nonce: string;
    tokenDigest: string;
    reason: string;
    failedAtMs: number;
  }): Promise<void> {
    const updated = await this.db.query<{ nonce: string }>(
      `UPDATE vsr_handoff_execution_journal
       SET state = 'FAILED', failure_reason = $3, failed_at_ms = $4, updated_at_ms = $4
       WHERE nonce = $1 AND token_digest = $2 AND state = 'IN_PROGRESS'
       RETURNING nonce`,
      [input.nonce, input.tokenDigest, input.reason, input.failedAtMs],
    );
    if (updated.rowCount !== 1) throw new Error("handoff_journal_fail_conflict");
  }
}
