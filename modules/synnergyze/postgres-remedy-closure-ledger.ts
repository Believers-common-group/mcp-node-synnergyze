import type { PostgresQueryExecutorV1 } from "./postgres-remedy-journal.ts";
import type {
  ExceptionSupersessionRecordV1,
  RemedyCausalSealV1,
} from "./remedy-lineage-closure.ts";

export type RemedyClosureLedgerAppendResultV1 =
  | { state: "APPENDED" }
  | {
      state: "EXISTING";
      seal: RemedyCausalSealV1;
      supersession: ExceptionSupersessionRecordV1;
    }
  | { state: "CONFLICT" };

interface RemedyClosureRowV1 {
  exception_ref: string;
  seal_ref: string;
  remedy_effect_ref: string;
  trace_digest: string;
  seal_json: RemedyCausalSealV1 | string;
  supersession_json: ExceptionSupersessionRecordV1 | string;
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function assertExactClosure(
  seal: RemedyCausalSealV1,
  supersession: ExceptionSupersessionRecordV1,
): void {
  if (seal.state !== "SEALED" || supersession.state !== "RESOLVED_APPEND_ONLY") {
    throw new Error("remedy_closure_ledger_terminal_state_required");
  }
  if (seal.originalExceptionRef !== supersession.exceptionRef) {
    throw new Error("remedy_closure_ledger_exception_mismatch");
  }
  if (seal.sealRef !== supersession.riverSealRef) {
    throw new Error("remedy_closure_ledger_seal_mismatch");
  }
  if (seal.remedyEffectRef !== supersession.remedyEffectRef) {
    throw new Error("remedy_closure_ledger_effect_mismatch");
  }
  if (seal.remedyVerificationRef !== supersession.remedyVerificationRef) {
    throw new Error("remedy_closure_ledger_verification_mismatch");
  }
  if (seal.remedyExecutionReceiptRef !== supersession.remedyExecutionReceiptRef) {
    throw new Error("remedy_closure_ledger_execution_mismatch");
  }
  if (seal.originalWardenDecisionRef !== supersession.originalWardenDecisionRef) {
    throw new Error("remedy_closure_ledger_original_decision_mismatch");
  }
  if (seal.remedyWardenDecisionRef !== supersession.remedyWardenDecisionRef) {
    throw new Error("remedy_closure_ledger_remedy_decision_mismatch");
  }
}

export class PostgresRemedyClosureLedgerV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async append(input: {
    seal: RemedyCausalSealV1;
    supersession: ExceptionSupersessionRecordV1;
  }): Promise<RemedyClosureLedgerAppendResultV1> {
    const { seal, supersession } = input;
    assertExactClosure(seal, supersession);

    const inserted = await this.db.query<{ exception_ref: string }>(
      `INSERT INTO vsr_remedy_closure_ledger
        (exception_ref, seal_ref, remedy_effect_ref, trace_digest, original_execution_receipt_ref,
         remedy_execution_receipt_ref, original_warden_decision_ref, remedy_warden_decision_ref,
         parent_correlation_id, remedy_correlation_id, seal_json, supersession_json, sealed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::timestamptz)
       ON CONFLICT (exception_ref) DO NOTHING
       RETURNING exception_ref`,
      [
        seal.originalExceptionRef,
        seal.sealRef,
        seal.remedyEffectRef,
        seal.traceDigest,
        seal.originalExecutionReceiptRef,
        seal.remedyExecutionReceiptRef,
        seal.originalWardenDecisionRef,
        seal.remedyWardenDecisionRef,
        seal.parentCorrelationId,
        seal.remedyCorrelationId,
        JSON.stringify(seal),
        JSON.stringify(supersession),
        seal.sealedAt,
      ],
    );
    if (inserted.rowCount === 1) return { state: "APPENDED" };

    const selected = await this.db.query<RemedyClosureRowV1>(
      `SELECT exception_ref, seal_ref, remedy_effect_ref, trace_digest, seal_json, supersession_json
       FROM vsr_remedy_closure_ledger
       WHERE exception_ref = $1`,
      [seal.originalExceptionRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("remedy_closure_ledger_race_missing_row");
    if (
      row.seal_ref !== seal.sealRef ||
      row.remedy_effect_ref !== seal.remedyEffectRef ||
      row.trace_digest !== seal.traceDigest
    ) {
      return { state: "CONFLICT" };
    }

    const existingSeal = parseJson<RemedyCausalSealV1>(row.seal_json);
    const existingSupersession = parseJson<ExceptionSupersessionRecordV1>(row.supersession_json);
    assertExactClosure(existingSeal, existingSupersession);
    return {
      state: "EXISTING",
      seal: {
        ...existingSeal,
        componentRefs: [...existingSeal.componentRefs],
        observationRefs: [...existingSeal.observationRefs],
        sourceEvidenceRefs: [...existingSeal.sourceEvidenceRefs],
      },
      supersession: {
        ...existingSupersession,
        componentRefs: [...existingSupersession.componentRefs],
        sourceEvidenceRefs: [...existingSupersession.sourceEvidenceRefs],
      },
    };
  }
}
