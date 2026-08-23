import { createHash } from "node:crypto";

import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { ReconciliationDeterminationV1 } from "./reconciliation-fabric.ts";

export type CausalRecordKindV1 = "EXCEPTION" | "SCALAR_RECONCILIATION" | "COMPOSITE_ASSESSMENT";

export interface CausalRecordSupersessionV1 {
  version: "CAUSAL-RECORD-SUPERSESSION-001";
  supersessionRef: string;
  recordKind: CausalRecordKindV1;
  recordRef: string;
  supersededByRef: string;
  reasonCode: string;
  sourceEvidenceRefs: readonly string[];
  supersededAt: string;
  state: "SUPERSEDED_APPEND_ONLY";
  synthetic: true;
}

export type DurableWriteResultV1<T> =
  | { state: "STORED"; record: T }
  | { state: "IDEMPOTENT_REPLAY"; record: T }
  | { state: "CONFLICT" };

export interface ExceptionCausalHistoryV1 {
  exception: CanonicalExceptionRecordV1;
  scalarReconciliations: readonly ReconciliationDeterminationV1[];
  compositeAssessments: readonly CompositeEffectAssessmentV1[];
  supersessions: readonly CausalRecordSupersessionV1[];
}

export interface CausalRecordStoreV1 {
  putException(record: CanonicalExceptionRecordV1, recordedAt: string): Promise<DurableWriteResultV1<CanonicalExceptionRecordV1>>;
  putScalarReconciliation(input: {
    exception: CanonicalExceptionRecordV1;
    determination: ReconciliationDeterminationV1;
    recordedAt: string;
  }): Promise<DurableWriteResultV1<ReconciliationDeterminationV1>>;
  putCompositeAssessment(input: {
    exception: CanonicalExceptionRecordV1;
    assessment: CompositeEffectAssessmentV1;
    recordedAt: string;
  }): Promise<DurableWriteResultV1<CompositeEffectAssessmentV1>>;
  supersede(input: {
    recordKind: CausalRecordKindV1;
    recordRef: string;
    supersededByRef: string;
    reasonCode: string;
    sourceEvidenceRefs: readonly string[];
    supersededAt: string;
  }): Promise<DurableWriteResultV1<CausalRecordSupersessionV1>>;
  reconstruct(exceptionRef: string): Promise<ExceptionCausalHistoryV1 | undefined>;
}

interface StoredReconciliationV1<T> {
  parentExceptionRef: string;
  sourceDigest: string;
  record: T;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

export function compositeAssessmentSourceDigestV1(assessment: CompositeEffectAssessmentV1): string {
  return `sha256:${digest(JSON.stringify({
    version: assessment.version,
    assessmentRef: assessment.assessmentRef,
    effectSetRef: assessment.effectSetRef,
    executionReceiptRef: assessment.executionReceiptRef,
    reservationRef: assessment.reservationRef,
    originalWardenDecisionRef: assessment.originalWardenDecisionRef,
    programRef: assessment.programRef,
    eventRef: assessment.eventRef,
    targetRef: assessment.targetRef,
    correlationId: assessment.correlationId,
    classification: assessment.classification,
    matchedComponentRefs: stableUnique(assessment.matchedComponentRefs),
    missingComponentRefs: stableUnique(assessment.missingComponentRefs),
    unexpectedComponentRefs: stableUnique(assessment.unexpectedComponentRefs),
    duplicateComponentRefs: stableUnique(assessment.duplicateComponentRefs),
    conflictingComponentRefs: stableUnique(assessment.conflictingComponentRefs),
    sourceEvidenceRefs: stableUnique(assessment.sourceEvidenceRefs),
    candidateRemedies: [...assessment.candidateRemedies]
      .map((proposal) => ({
        ...proposal,
        componentRefs: stableUnique(proposal.componentRefs),
      }))
      .sort((left, right) => left.proposalRef.localeCompare(right.proposalRef)),
    state: assessment.state,
    authorized: assessment.authorized,
    synthetic: assessment.synthetic,
  }))}`;
}

function assertScalarParent(
  exception: CanonicalExceptionRecordV1,
  determination: ReconciliationDeterminationV1,
): void {
  if (determination.exceptionRef !== exception.exceptionRef) throw new Error("causal_store_scalar_exception_mismatch");
  if (determination.executionReceiptRef !== exception.executionReceiptRef) throw new Error("causal_store_scalar_execution_mismatch");
  if (determination.reservationRef !== exception.reservationRef) throw new Error("causal_store_scalar_reservation_mismatch");
  if (determination.originalWardenDecisionRef !== exception.originalWardenDecisionRef) throw new Error("causal_store_scalar_decision_mismatch");
  if (determination.programRef !== exception.programRef) throw new Error("causal_store_scalar_program_mismatch");
  if (determination.eventRef !== exception.eventRef) throw new Error("causal_store_scalar_event_mismatch");
  if (determination.targetRef !== exception.targetRef) throw new Error("causal_store_scalar_target_mismatch");
  if (determination.correlationId !== exception.correlationId) throw new Error("causal_store_scalar_correlation_mismatch");
}

function assertCompositeParent(
  exception: CanonicalExceptionRecordV1,
  assessment: CompositeEffectAssessmentV1,
): void {
  if (assessment.executionReceiptRef !== exception.executionReceiptRef) throw new Error("causal_store_composite_execution_mismatch");
  if (assessment.reservationRef !== exception.reservationRef) throw new Error("causal_store_composite_reservation_mismatch");
  if (assessment.originalWardenDecisionRef !== exception.originalWardenDecisionRef) throw new Error("causal_store_composite_decision_mismatch");
  if (assessment.programRef !== exception.programRef) throw new Error("causal_store_composite_program_mismatch");
  if (assessment.eventRef !== exception.eventRef) throw new Error("causal_store_composite_event_mismatch");
  if (assessment.targetRef !== exception.targetRef) throw new Error("causal_store_composite_target_mismatch");
  if (assessment.correlationId !== exception.correlationId) throw new Error("causal_store_composite_correlation_mismatch");
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

export class InMemoryCausalRecordStoreV1 implements CausalRecordStoreV1 {
  private readonly exceptions = new Map<string, { sourceDigest: string; record: CanonicalExceptionRecordV1 }>();
  private readonly scalar = new Map<string, StoredReconciliationV1<ReconciliationDeterminationV1>>();
  private readonly composite = new Map<string, StoredReconciliationV1<CompositeEffectAssessmentV1>>();
  private readonly supersessions = new Map<string, CausalRecordSupersessionV1>();
  private readonly supersessionByRecord = new Map<string, string>();

  async putException(record: CanonicalExceptionRecordV1, recordedAt: string): Promise<DurableWriteResultV1<CanonicalExceptionRecordV1>> {
    parseInstant(recordedAt, "causal_store_invalid_recorded_at");
    const existing = this.exceptions.get(record.exceptionRef);
    if (existing) {
      if (existing.sourceDigest !== record.sourceDigest) return { state: "CONFLICT" };
      return { state: "IDEMPOTENT_REPLAY", record: cloneException(existing.record) };
    }
    this.exceptions.set(record.exceptionRef, { sourceDigest: record.sourceDigest, record: cloneException(record) });
    return { state: "STORED", record: cloneException(record) };
  }

  async putScalarReconciliation(input: {
    exception: CanonicalExceptionRecordV1;
    determination: ReconciliationDeterminationV1;
    recordedAt: string;
  }): Promise<DurableWriteResultV1<ReconciliationDeterminationV1>> {
    parseInstant(input.recordedAt, "causal_store_invalid_recorded_at");
    assertScalarParent(input.exception, input.determination);
    const existing = this.scalar.get(input.determination.reconciliationRef);
    if (existing) {
      if (existing.parentExceptionRef !== input.exception.exceptionRef || existing.sourceDigest !== input.determination.sourceDigest) {
        return { state: "CONFLICT" };
      }
      return { state: "IDEMPOTENT_REPLAY", record: cloneScalar(existing.record) };
    }
    this.scalar.set(input.determination.reconciliationRef, {
      parentExceptionRef: input.exception.exceptionRef,
      sourceDigest: input.determination.sourceDigest,
      record: cloneScalar(input.determination),
    });
    return { state: "STORED", record: cloneScalar(input.determination) };
  }

  async putCompositeAssessment(input: {
    exception: CanonicalExceptionRecordV1;
    assessment: CompositeEffectAssessmentV1;
    recordedAt: string;
  }): Promise<DurableWriteResultV1<CompositeEffectAssessmentV1>> {
    parseInstant(input.recordedAt, "causal_store_invalid_recorded_at");
    assertCompositeParent(input.exception, input.assessment);
    const sourceDigest = compositeAssessmentSourceDigestV1(input.assessment);
    const existing = this.composite.get(input.assessment.assessmentRef);
    if (existing) {
      if (existing.parentExceptionRef !== input.exception.exceptionRef || existing.sourceDigest !== sourceDigest) {
        return { state: "CONFLICT" };
      }
      return { state: "IDEMPOTENT_REPLAY", record: cloneComposite(existing.record) };
    }
    this.composite.set(input.assessment.assessmentRef, {
      parentExceptionRef: input.exception.exceptionRef,
      sourceDigest,
      record: cloneComposite(input.assessment),
    });
    return { state: "STORED", record: cloneComposite(input.assessment) };
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

    const recordExists = input.recordKind === "EXCEPTION"
      ? this.exceptions.has(input.recordRef)
      : input.recordKind === "SCALAR_RECONCILIATION"
        ? this.scalar.has(input.recordRef)
        : this.composite.has(input.recordRef);
    if (!recordExists) throw new Error("causal_store_superseded_record_missing");

    const identity = `${input.recordKind}:${input.recordRef}`;
    const supersessionRef = `CAUSAL-SUPERSESSION:${digest(JSON.stringify({
      recordKind: input.recordKind,
      recordRef: input.recordRef,
      supersededByRef: input.supersededByRef,
      reasonCode: input.reasonCode,
      sourceEvidenceRefs: stableUnique(input.sourceEvidenceRefs),
    })).slice(0, 24)}`;
    const record: CausalRecordSupersessionV1 = {
      version: "CAUSAL-RECORD-SUPERSESSION-001",
      supersessionRef,
      recordKind: input.recordKind,
      recordRef: input.recordRef,
      supersededByRef: input.supersededByRef,
      reasonCode: input.reasonCode,
      sourceEvidenceRefs: stableUnique(input.sourceEvidenceRefs),
      supersededAt: input.supersededAt,
      state: "SUPERSEDED_APPEND_ONLY",
      synthetic: true,
    };
    const existingRef = this.supersessionByRecord.get(identity);
    if (existingRef) {
      const existing = this.supersessions.get(existingRef)!;
      const same = existing.supersessionRef === record.supersessionRef;
      return same
        ? { state: "IDEMPOTENT_REPLAY", record: cloneSupersession(existing) }
        : { state: "CONFLICT" };
    }
    this.supersessions.set(record.supersessionRef, cloneSupersession(record));
    this.supersessionByRecord.set(identity, record.supersessionRef);
    return { state: "STORED", record: cloneSupersession(record) };
  }

  async reconstruct(exceptionRef: string): Promise<ExceptionCausalHistoryV1 | undefined> {
    const exception = this.exceptions.get(exceptionRef)?.record;
    if (!exception) return undefined;
    const scalarReconciliations = [...this.scalar.values()]
      .filter((value) => value.parentExceptionRef === exceptionRef)
      .map((value) => cloneScalar(value.record));
    const compositeAssessments = [...this.composite.values()]
      .filter((value) => value.parentExceptionRef === exceptionRef)
      .map((value) => cloneComposite(value.record));
    const refs = new Set<string>([
      exceptionRef,
      ...scalarReconciliations.map((value) => value.reconciliationRef),
      ...compositeAssessments.map((value) => value.assessmentRef),
    ]);
    const supersessions = [...this.supersessions.values()]
      .filter((value) => refs.has(value.recordRef))
      .map(cloneSupersession);
    return {
      exception: cloneException(exception),
      scalarReconciliations,
      compositeAssessments,
      supersessions,
    };
  }
}
