import { createHash } from "node:crypto";

import type { EvidenceSealV1 } from "../river/contracts.ts";
import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { VerifiedScopedRemedyEffectV1 } from "./remedy-effect-verification.ts";

export interface RemedyCausalSealV1 extends EvidenceSealV1 {
  version: "REMEDY-CAUSAL-SEAL-001";
  originalExceptionRef: string;
  assessmentRef: string;
  effectSetRef: string;
  proposalRef: string;
  authorizationRef: string;
  originalExecutionReceiptRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  remedyExecutionReceiptRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  componentRefs: readonly string[];
  observationRefs: readonly string[];
  sourceEvidenceRefs: readonly string[];
  synthetic: true;
}

export interface ExceptionSupersessionRecordV1 {
  version: "EXCEPTION-SUPERSESSION-001";
  supersessionRef: string;
  exceptionRef: string;
  priorState: "OPEN";
  disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY" | "SUPERSEDED_BY_VERIFIED_COMPENSATION";
  assessmentRef: string;
  proposalRef: string;
  authorizationRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverSealRef: string;
  originalExecutionReceiptRef: string;
  remedyExecutionReceiptRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  componentRefs: readonly string[];
  sourceEvidenceRefs: readonly string[];
  supersededAt: string;
  state: "RESOLVED_APPEND_ONLY";
  synthetic: true;
}

export type RemedyClosureRejectCodeV1 =
  | "REMEDY_CLOSURE_EXCEPTION_NOT_OPEN"
  | "REMEDY_CLOSURE_NON_SYNTHETIC_INPUT"
  | "REMEDY_CLOSURE_EXECUTION_MISMATCH"
  | "REMEDY_CLOSURE_RESERVATION_MISMATCH"
  | "REMEDY_CLOSURE_DECISION_MISMATCH"
  | "REMEDY_CLOSURE_PROGRAM_MISMATCH"
  | "REMEDY_CLOSURE_EVENT_MISMATCH"
  | "REMEDY_CLOSURE_TARGET_MISMATCH"
  | "REMEDY_CLOSURE_PARENT_CORRELATION_MISMATCH"
  | "REMEDY_CLOSURE_ASSESSMENT_MISMATCH"
  | "REMEDY_CLOSURE_SCOPE_MISMATCH"
  | "REMEDY_CLOSURE_INVALID_TIME"
  | "REMEDY_CLOSURE_BEFORE_VERIFICATION"
  | "REMEDY_CLOSURE_CONFLICT";

export type RemedyClosureResultV1 =
  | {
      state: "SEALED_AND_SUPERSEDED";
      seal: RemedyCausalSealV1;
      supersession: ExceptionSupersessionRecordV1;
      idempotentReplay: boolean;
    }
  | { state: "REJECTED_INPUT"; reasonCode: RemedyClosureRejectCodeV1 };

interface StoredClosureV1 {
  sourceDigest: string;
  seal: RemedyCausalSealV1;
  supersession: ExceptionSupersessionRecordV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(stableUnique(left)) === JSON.stringify(stableUnique(right));
}

function cloneSeal(seal: RemedyCausalSealV1): RemedyCausalSealV1 {
  return {
    ...seal,
    componentRefs: [...seal.componentRefs],
    observationRefs: [...seal.observationRefs],
    sourceEvidenceRefs: [...seal.sourceEvidenceRefs],
  };
}

function cloneSupersession(value: ExceptionSupersessionRecordV1): ExceptionSupersessionRecordV1 {
  return {
    ...value,
    componentRefs: [...value.componentRefs],
    sourceEvidenceRefs: [...value.sourceEvidenceRefs],
  };
}

export class RemedyLineageClosureServiceV1 {
  private readonly byExceptionRef = new Map<string, StoredClosureV1>();

  close(input: {
    exception: CanonicalExceptionRecordV1;
    assessment: CompositeEffectAssessmentV1;
    effect: VerifiedScopedRemedyEffectV1;
    sealedAt: string;
  }): RemedyClosureResultV1 {
    const { exception, assessment, effect, sealedAt } = input;
    if (exception.state !== "OPEN") {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_EXCEPTION_NOT_OPEN" };
    }
    if (exception.synthetic !== true || assessment.synthetic !== true || effect.synthetic !== true) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_NON_SYNTHETIC_INPUT" };
    }
    if (
      exception.executionReceiptRef !== assessment.executionReceiptRef ||
      effect.originalExecutionReceiptRef !== assessment.executionReceiptRef
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_EXECUTION_MISMATCH" };
    }
    if (
      exception.reservationRef !== assessment.reservationRef ||
      effect.originalReservationRef !== assessment.reservationRef
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_RESERVATION_MISMATCH" };
    }
    if (
      exception.originalWardenDecisionRef !== assessment.originalWardenDecisionRef ||
      effect.originalWardenDecisionRef !== assessment.originalWardenDecisionRef
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_DECISION_MISMATCH" };
    }
    if (exception.programRef !== assessment.programRef) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_PROGRAM_MISMATCH" };
    }
    if (exception.eventRef !== assessment.eventRef) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_EVENT_MISMATCH" };
    }
    if (exception.targetRef !== assessment.targetRef || effect.targetRef !== assessment.targetRef) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_TARGET_MISMATCH" };
    }
    if (
      exception.correlationId !== assessment.correlationId ||
      effect.parentCorrelationId !== assessment.correlationId
    ) {
      return {
        state: "REJECTED_INPUT",
        reasonCode: "REMEDY_CLOSURE_PARENT_CORRELATION_MISMATCH",
      };
    }
    if (
      effect.assessmentRef !== assessment.assessmentRef ||
      effect.effectSetRef !== assessment.effectSetRef
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_ASSESSMENT_MISMATCH" };
    }
    const proposal = assessment.candidateRemedies.find(
      (candidate) => candidate.proposalRef === effect.proposalRef,
    );
    if (!proposal || proposal.kind !== effect.proposalKind || !sameScope(proposal.componentRefs, effect.componentRefs)) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_SCOPE_MISMATCH" };
    }

    const verifiedAt = parseInstant(effect.verifiedAt);
    const sealedAtMs = parseInstant(sealedAt);
    if (verifiedAt === null || sealedAtMs === null) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_INVALID_TIME" };
    }
    if (sealedAtMs < verifiedAt) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_BEFORE_VERIFICATION" };
    }

    const componentRefs = stableUnique(effect.componentRefs);
    const observationRefs = stableUnique(effect.observationRefs);
    const sourceEvidenceRefs = stableUnique([
      ...exception.sourceEvidenceRefs,
      ...assessment.sourceEvidenceRefs,
      ...effect.sourceEvidenceRefs,
    ]);
    const sourceDigest = `sha256:${digest(
      JSON.stringify({
        exceptionRef: exception.exceptionRef,
        exceptionSourceDigest: exception.sourceDigest,
        assessmentRef: assessment.assessmentRef,
        effectSetRef: assessment.effectSetRef,
        proposalRef: effect.proposalRef,
        proposalKind: effect.proposalKind,
        authorizationRef: effect.authorizationRef,
        originalExecutionReceiptRef: effect.originalExecutionReceiptRef,
        originalReservationRef: effect.originalReservationRef,
        originalWardenDecisionRef: effect.originalWardenDecisionRef,
        remedyWardenDecisionRef: effect.remedyWardenDecisionRef,
        remedyExecutionReceiptRef: effect.remedyExecutionReceiptRef,
        remedyEffectRef: effect.effectRef,
        remedyVerificationRef: effect.verificationRef,
        parentCorrelationId: effect.parentCorrelationId,
        remedyCorrelationId: effect.remedyCorrelationId,
        targetRef: effect.targetRef,
        componentRefs,
        observationRefs,
        sourceEvidenceRefs,
      }),
    )}`;

    const existing = this.byExceptionRef.get(exception.exceptionRef);
    if (existing) {
      if (existing.sourceDigest !== sourceDigest) {
        return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_CONFLICT" };
      }
      return {
        state: "SEALED_AND_SUPERSEDED",
        seal: cloneSeal(existing.seal),
        supersession: cloneSupersession(existing.supersession),
        idempotentReplay: true,
      };
    }

    const traceDigest = `sha256:${digest(
      JSON.stringify({ sourceDigest, verifiedAt: effect.verifiedAt }),
    )}`;
    const sealRef = `RIVER-REMEDY-SEAL:${digest(`${exception.exceptionRef}|${effect.effectRef}|${traceDigest}`).slice(0, 24)}`;
    const seal: RemedyCausalSealV1 = {
      version: "REMEDY-CAUSAL-SEAL-001",
      sealRef,
      reservationRef: effect.originalReservationRef,
      correlationId: effect.parentCorrelationId,
      state: "SEALED",
      traceDigest,
      sealedAt,
      originalExceptionRef: exception.exceptionRef,
      assessmentRef: assessment.assessmentRef,
      effectSetRef: assessment.effectSetRef,
      proposalRef: effect.proposalRef,
      authorizationRef: effect.authorizationRef,
      originalExecutionReceiptRef: effect.originalExecutionReceiptRef,
      originalWardenDecisionRef: effect.originalWardenDecisionRef,
      remedyWardenDecisionRef: effect.remedyWardenDecisionRef,
      remedyExecutionReceiptRef: effect.remedyExecutionReceiptRef,
      remedyEffectRef: effect.effectRef,
      remedyVerificationRef: effect.verificationRef,
      parentCorrelationId: effect.parentCorrelationId,
      remedyCorrelationId: effect.remedyCorrelationId,
      componentRefs,
      observationRefs,
      sourceEvidenceRefs,
      synthetic: true,
    };
    const disposition =
      effect.proposalKind === "RECOVER"
        ? "SUPERSEDED_BY_VERIFIED_RECOVERY"
        : "SUPERSEDED_BY_VERIFIED_COMPENSATION";
    const supersession: ExceptionSupersessionRecordV1 = {
      version: "EXCEPTION-SUPERSESSION-001",
      supersessionRef: `EXCEPTION-SUPERSESSION:${digest(
        `${exception.exceptionRef}|${sealRef}|${effect.verificationRef}`,
      ).slice(0, 24)}`,
      exceptionRef: exception.exceptionRef,
      priorState: "OPEN",
      disposition,
      assessmentRef: assessment.assessmentRef,
      proposalRef: effect.proposalRef,
      authorizationRef: effect.authorizationRef,
      remedyEffectRef: effect.effectRef,
      remedyVerificationRef: effect.verificationRef,
      riverSealRef: sealRef,
      originalExecutionReceiptRef: effect.originalExecutionReceiptRef,
      remedyExecutionReceiptRef: effect.remedyExecutionReceiptRef,
      originalWardenDecisionRef: effect.originalWardenDecisionRef,
      remedyWardenDecisionRef: effect.remedyWardenDecisionRef,
      parentCorrelationId: effect.parentCorrelationId,
      remedyCorrelationId: effect.remedyCorrelationId,
      componentRefs,
      sourceEvidenceRefs,
      supersededAt: sealedAt,
      state: "RESOLVED_APPEND_ONLY",
      synthetic: true,
    };

    this.byExceptionRef.set(exception.exceptionRef, { sourceDigest, seal, supersession });
    return {
      state: "SEALED_AND_SUPERSEDED",
      seal: cloneSeal(seal),
      supersession: cloneSupersession(supersession),
      idempotentReplay: false,
    };
  }

  closureCount(): number {
    return this.byExceptionRef.size;
  }
}
