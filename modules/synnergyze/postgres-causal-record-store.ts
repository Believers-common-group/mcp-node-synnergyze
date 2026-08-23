import type { PostgresQueryExecutorV1 } from "./postgres-remedy-journal.ts";
import {
  compositeAssessmentSourceDigestV1,
  type CausalRecordKindV1,
  type CausalRecordStoreV1,
  type CausalRecordSupersessionV1,
  type DurableWriteResultV1,
  type ExceptionCausalHistoryV1,
} from "./causal-record-store.ts";
import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { ReconciliationDeterminationV1 } from "./reconciliation-fabric.ts";

interface ExceptionRowV1 {
  exception_ref: string;
  source_digest: string;
  record_json: CanonicalExceptionRecordV1 | string;
}

interface ReconciliationRowV1 {
  record_ref: string;
  record_kind: "SCALAR_RECONCILIATION" | "COMPOSITE_ASSESSMENT";
  parent_exception_ref: string;
  source_digest: string;
  record_json: ReconciliationDeterminationV1 | CompositeEffectAssessmentV1 | string;
}

interface SupersessionRowV1 {
  supersession_ref: string;
  record_kind: CausalRecordKindV1;
  record_ref: string;
  superseded_by_ref: string;
  supersession_json: CausalRecordSupersessionV1 | string;
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function cloneException(record: CanonicalExceptionRecordV1): CanonicalExceptionRecordV1 {
  return {
    ...record,
    sourceEvidenceRefs: [...record.sourceEvidenceRefs],
    lineageViolations: [...record.lineageViolations],
  };
}

function cloneScalar(record: ReconciliationDeterminationV1): ReconciliationDeterminationV1 {
  return {
    ...record,
    sourceEvidenceRefs: [...record.sourceEvidenceRefs],
    candidateRemedies: record.candidateRemedies.map((proposal) => ({ ...proposal })),
  };
}

function cloneComposite(record: CompositeEffectAssessmentV1): CompositeEffectAssessmentV1 {
  return {
    ...record,
    matchedComponentRefs: [...record.matchedComponentRefs],
    missingComponentRefs: [...record.missingComponentRefs],
    unexpectedComponentRefs: [...record.unexpectedComponentRefs],
    duplicateComponentRefs: [...record.duplicateComponentRefs],
    conflictingComponentRefs: [...record.conflictingComponentRefs],
    sourceEvidenceRefs: [...record.sourceEvidenceRefs],
    candidateRemedies: record.candidateRemedies.map((proposal) => ({
      ...proposal,
      componentRefs: [...proposal.componentRefs],
    })),
  };
}

function cloneSupersession(record: CausalRecordSupersessionV1): CausalRecordSupersessionV1 {
  return { ...record, sourceEvidenceRefs: [...record.sourceEvidenceRefs] };
}

function parseInstant(value: string, code: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function assertScalarParent(exception: CanonicalExceptionRecordV1, determination: ReconciliationDeterminationV1): void {
  if (determination.exceptionRef !== exception.exceptionRef) throw new Error("causal_store_scalar_exception_mismatch");
  if (determination.executionReceiptRef !== exception.executionReceiptRef) throw new Error("causal_store_scalar_execution_mismatch");
  if (determination.reservationRef !== exception.reservationRef) throw new Error("causal_store_scalar_reservation_mismatch");
  if (determination.originalWardenDecisionRef !== exception.originalWardenDecisionRef) throw new Error("causal_store_scalar_decision_mismatch");
  if (determination.programRef !== exception.programRef) throw new Error("causal_store_scalar_program_mismatch");
  if (determination.eventRef !== exception.eventRef) throw new Error("causal_store_scalar_event_mismatch");
  if (determination.targetRef !== exception.targetRef) throw new Error("causal_store_scalar_target_mismatch");
  if (determination.correlationId !== exception.correlationId) throw new Error("causal_store_scalar_correlation_mismatch");
}

function assertCompositeParent(exception: CanonicalExceptionRecordV1, assessment: CompositeEffectAssessmentV1): void {
  if (assessment.executionReceiptRef !== exception.executionReceiptRef) throw new Error("causal_store_composite_execution_mismatch");
  if (assessment.reservationRef !== exception.reservationRef) throw new Error("causal_store_composite_reservation_mismatch");
  if (assessment.originalWardenDecisionRef !== exception.originalWardenDecisionRef) throw new Error("causal_store_composite_decision_mismatch");
  if (assessment.programRef !== exception.programRef) throw new Error("causal_store_composite_program_mismatch");
  if (assessment.eventRef !== exception.eventRef) throw new Error("causal_store_composite_event_mismatch");
  if (assessment.targetRef !== exception.targetRef) throw new Error("causal_store_composite_target_mismatch");
  if (assessment.correlationId !== exception.correlationId) throw new Error("causal_store_composite_correlation_mismatch");
}

export class PostgresCausalRecordStoreV1 implements CausalRecordStoreV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async putException(
    record: CanonicalExceptionRecordV1,
    recordedAt: string,
  ): Promise<DurableWriteResultV1<CanonicalExceptionRecordV1>> {
    parseInstant(recordedAt, "causal_store_invalid_recorded_at");
    const inserted = await this.db.query<{ exception_ref: string }>(
      `INSERT INTO vsr_exception_records
        (exception_ref, source_digest, execution_receipt_ref, reservation_ref,
         original_warden_decision_ref, correlation_id, record_json, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
       ON CONFLICT (exception_ref) DO NOTHING
       RETURNING exception_ref`,
      [
        record.exceptionRef,
        record.sourceDigest,
        record.executionReceiptRef,
        record.reservationRef,
        record.originalWardenDecisionRef,
        record.correlationId,
        JSON.stringify(record),
        recordedAt,
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", record: cloneException(record) };

    const selected = await this.db.query<ExceptionRowV1>(
      `SELECT exception_ref, source_digest, record_json
       FROM vsr_exception_records WHERE exception_ref = $1`,
      [record.exceptionRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("causal_store_exception_race_missing_row");
    if (row.source_digest !== record.sourceDigest) return { state: "CONFLICT" };
    return { state: "IDEMPOTENT_REPLAY", record: cloneException(parseJson(row.record_json)) };
  }

  async putScalarReconciliation(input: {
    exception: CanonicalExceptionRecordV1;
    determination: ReconciliationDeterminationV1;
    recordedAt: string;
  }): Promise<DurableWriteResultV1<ReconciliationDeterminationV1>> {
    parseInstant(input.recordedAt, "causal_store_invalid_recorded_at");
    assertScalarParent(input.exception, input.determination);
    const inserted = await this.db.query<{ record_ref: string }>(
      `INSERT INTO vsr_reconciliation_records
        (record_ref, record_kind, parent_exception_ref, source_digest, record_json, recorded_at)
       VALUES ($1, 'SCALAR_RECONCILIATION', $2, $3, $4::jsonb, $5::timestamptz)
       ON CONFLICT (record_ref) DO NOTHING
       RETURNING record_ref`,
      [
        input.determination.reconciliationRef,
        input.exception.exceptionRef,
        input.determination.sourceDigest,
        JSON.stringify(input.determination),
        input.recordedAt,
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", record: cloneScalar(input.determination) };
    return this.readExistingScalar(input.exception.exceptionRef, input.determination);
  }

  private async readExistingScalar(
    parentExceptionRef: string,
    determination: ReconciliationDeterminationV1,
  ): Promise<DurableWriteResultV1<ReconciliationDeterminationV1>> {
    const selected = await this.db.query<ReconciliationRowV1>(
      `SELECT record_ref, record_kind, parent_exception_ref, source_digest, record_json
       FROM vsr_reconciliation_records WHERE record_ref = $1`,
      [determination.reconciliationRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("causal_store_reconciliation_race_missing_row");
    if (
      row.record_kind !== "SCALAR_RECONCILIATION" ||
      row.parent_exception_ref !== parentExceptionRef ||
      row.source_digest !== determination.sourceDigest
    ) return { state: "CONFLICT" };
    return {
      state: "IDEMPOTENT_REPLAY",
      record: cloneScalar(parseJson(row.record_json as ReconciliationDeterminationV1 | string)),
    };
  }

  async putCompositeAssessment(input: {
    exception: CanonicalExceptionRecordV1;
    assessment: CompositeEffectAssessmentV1;
    recordedAt: string;
  }): Promise<DurableWriteResultV1<CompositeEffectAssessmentV1>> {
    parseInstant(input.recordedAt, "causal_store_invalid_recorded_at");
    assertCompositeParent(input.exception, input.assessment);
    const sourceDigest = compositeAssessmentSourceDigestV1(input.assessment);
    const inserted = await this.db.query<{ record_ref: string }>(
      `INSERT INTO vsr_reconciliation_records
        (record_ref, record_kind, parent_exception_ref, source_digest, record_json, recorded_at)
       VALUES ($1, 'COMPOSITE_ASSESSMENT', $2, $3, $4::jsonb, $5::timestamptz)
       ON CONFLICT (record_ref) DO NOTHING
       RETURNING record_ref`,
      [
        input.assessment.assessmentRef,
        input.exception.exceptionRef,
        sourceDigest,
        JSON.stringify(input.assessment),
        input.recordedAt,
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", record: cloneComposite(input.assessment) };

    const selected = await this.db.query<ReconciliationRowV1>(
      `SELECT record_ref, record_kind, parent_exception_ref, source_digest, record_json
       FROM vsr_reconciliation_records WHERE record_ref = $1`,
      [input.assessment.assessmentRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("causal_store_reconciliation_race_missing_row");
    if (
      row.record_kind !== "COMPOSITE_ASSESSMENT" ||
      row.parent_exception_ref !== input.exception.exceptionRef ||
      row.source_digest !== sourceDigest
    ) return { state: "CONFLICT" };
    return {
      state: "IDEMPOTENT_REPLAY",
      record: cloneComposite(parseJson(row.record_json as CompositeEffectAssessmentV1 | string)),
    };
  }

  async supersede(input: {
    recordKind: CausalRecordKindV1;
    recordRef: string;
    supersededByRef: string;
    reasonCode: string;
    sourceEvidenceRefs: readonly string[];
    supersededAt: string;
  }): Promise<DurableWriteResultV1<CausalRecordSupersessionV1>> {
    parseInstant(input.supersededAt, "causal_store_invalid_superseded_at");
    if (!input.recordRef.trim() || !input.supersededByRef.trim() || input.recordRef === input.supersededByRef) {
      throw new Error("causal_store_invalid_supersession_identity");
    }
    if (!input.reasonCode.trim()) throw new Error("causal_store_supersession_reason_required");
    if (input.sourceEvidenceRefs.length === 0) throw new Error("causal_store_supersession_evidence_required");

    await this.assertRecordExists(input.recordKind, input.recordRef);
    const evidenceRefs = stableUnique(input.sourceEvidenceRefs);
    const supersessionRef = `CAUSAL-SUPERSESSION:${await this.identityDigest(input.recordKind, input.recordRef, input.supersededByRef, input.reasonCode, evidenceRefs)}`;
    const record: CausalRecordSupersessionV1 = {
      version: "CAUSAL-RECORD-SUPERSESSION-001",
      supersessionRef,
      recordKind: input.recordKind,
      recordRef: input.recordRef,
      supersededByRef: input.supersededByRef,
      reasonCode: input.reasonCode,
      sourceEvidenceRefs: evidenceRefs,
      supersededAt: input.supersededAt,
      state: "SUPERSEDED_APPEND_ONLY",
      synthetic: true,
    };
    const inserted = await this.db.query<{ supersession_ref: string }>(
      `INSERT INTO vsr_causal_record_supersessions
        (record_kind, record_ref, supersession_ref, superseded_by_ref, reason_code,
         source_evidence_refs_json, supersession_json, superseded_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)
       ON CONFLICT (record_kind, record_ref) DO NOTHING
       RETURNING supersession_ref`,
      [
        input.recordKind,
        input.recordRef,
        supersessionRef,
        input.supersededByRef,
        input.reasonCode,
        JSON.stringify(evidenceRefs),
        JSON.stringify(record),
        input.supersededAt,
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", record: cloneSupersession(record) };

    const selected = await this.db.query<SupersessionRowV1>(
      `SELECT supersession_ref, record_kind, record_ref, superseded_by_ref, supersession_json
       FROM vsr_causal_record_supersessions
       WHERE record_kind = $1 AND record_ref = $2`,
      [input.recordKind, input.recordRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("causal_store_supersession_race_missing_row");
    if (row.supersession_ref !== supersessionRef || row.superseded_by_ref !== input.supersededByRef) {
      return { state: "CONFLICT" };
    }
    return { state: "IDEMPOTENT_REPLAY", record: cloneSupersession(parseJson(row.supersession_json)) };
  }

  private async assertRecordExists(recordKind: CausalRecordKindV1, recordRef: string): Promise<void> {
    const result = recordKind === "EXCEPTION"
      ? await this.db.query<{ record_ref: string }>(
          `SELECT exception_ref AS record_ref FROM vsr_exception_records WHERE exception_ref = $1`,
          [recordRef],
        )
      : await this.db.query<{ record_ref: string }>(
          `SELECT record_ref FROM vsr_reconciliation_records WHERE record_ref = $1 AND record_kind = $2`,
          [recordRef, recordKind],
        );
    if (result.rowCount !== 1) throw new Error("causal_store_superseded_record_missing");
  }

  private async identityDigest(
    recordKind: CausalRecordKindV1,
    recordRef: string,
    supersededByRef: string,
    reasonCode: string,
    evidenceRefs: readonly string[],
  ): Promise<string> {
    const { createHash } = await import("node:crypto");
    return createHash("sha256")
      .update(JSON.stringify({ recordKind, recordRef, supersededByRef, reasonCode, sourceEvidenceRefs: evidenceRefs }), "utf8")
      .digest("hex")
      .slice(0, 24);
  }

  async reconstruct(exceptionRef: string): Promise<ExceptionCausalHistoryV1 | undefined> {
    const exceptionResult = await this.db.query<ExceptionRowV1>(
      `SELECT exception_ref, source_digest, record_json
       FROM vsr_exception_records WHERE exception_ref = $1`,
      [exceptionRef],
    );
    const exceptionRow = exceptionResult.rows[0];
    if (!exceptionRow) return undefined;
    const exception = cloneException(parseJson(exceptionRow.record_json));

    const reconciliationResult = await this.db.query<ReconciliationRowV1>(
      `SELECT record_ref, record_kind, parent_exception_ref, source_digest, record_json
       FROM vsr_reconciliation_records
       WHERE parent_exception_ref = $1
       ORDER BY recorded_at ASC, record_ref ASC`,
      [exceptionRef],
    );
    const scalarReconciliations: ReconciliationDeterminationV1[] = [];
    const compositeAssessments: CompositeEffectAssessmentV1[] = [];
    for (const row of reconciliationResult.rows) {
      if (row.record_kind === "SCALAR_RECONCILIATION") {
        scalarReconciliations.push(cloneScalar(parseJson(row.record_json as ReconciliationDeterminationV1 | string)));
      } else {
        compositeAssessments.push(cloneComposite(parseJson(row.record_json as CompositeEffectAssessmentV1 | string)));
      }
    }

    const refs = [
      exceptionRef,
      ...scalarReconciliations.map((value) => value.reconciliationRef),
      ...compositeAssessments.map((value) => value.assessmentRef),
    ];
    const supersessionResult = await this.db.query<SupersessionRowV1>(
      `SELECT supersession_ref, record_kind, record_ref, superseded_by_ref, supersession_json
       FROM vsr_causal_record_supersessions
       WHERE record_ref = ANY($1::text[])
       ORDER BY superseded_at ASC, supersession_ref ASC`,
      [refs],
    );
    return {
      exception,
      scalarReconciliations,
      compositeAssessments,
      supersessions: supersessionResult.rows.map((row) => cloneSupersession(parseJson(row.supersession_json))),
    };
  }
}
