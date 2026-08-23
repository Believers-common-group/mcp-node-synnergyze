import { describe, expect, it } from "vitest";

import type { CompositeEffectAssessmentV1, ScopedRemedyProposalV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import { RemedyLineageClosureServiceV1 } from "./remedy-lineage-closure.ts";
import type { VerifiedScopedRemedyEffectV1 } from "./remedy-effect-verification.ts";

const proposal: ScopedRemedyProposalV1 = {
  proposalRef: "REMEDY-PROPOSAL:RECOVER-DEST",
  kind: "RECOVER",
  capabilityRef: "inventory.destination_credit.recover",
  effectSetRef: "EXPECTED-EFFECT-SET:TRANSFER-001",
  componentRefs: ["EFFECT:DEST-CREDIT-10"],
  reasonCode: "complete_exact_missing_components",
  requiresFreshWardenDecision: true,
  authorized: false,
};

const assessment: CompositeEffectAssessmentV1 = {
  version: "PARTIAL-EFFECT-ASSESSMENT-001",
  assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:TRANSFER-001",
  effectSetRef: proposal.effectSetRef,
  executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:TRANSFER-001",
  reservationRef: "RIVER-RESERVATION:TRANSFER-001",
  originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
  programRef: "PROGRAM:TRANSFER-001",
  eventRef: "EVENT:TRANSFER-001",
  targetRef: "TRANSFER:SKU-001:SRC-A:DST-B",
  correlationId: "CORR:TRANSFER-001",
  classification: "PARTIAL_EFFECT",
  matchedComponentRefs: ["EFFECT:SOURCE-DEBIT-10"],
  missingComponentRefs: ["EFFECT:DEST-CREDIT-10"],
  unexpectedComponentRefs: [],
  duplicateComponentRefs: [],
  conflictingComponentRefs: [],
  sourceEvidenceRefs: ["RIVER-EVIDENCE:SOURCE-DEBIT"],
  candidateRemedies: [proposal],
  assessedAt: "2026-08-22T13:00:05.000Z",
  state: "DETERMINED_UNAUTHORIZED",
  authorized: false,
  synthetic: true,
};

const exception: CanonicalExceptionRecordV1 = {
  version: "EXCEPTION-FABRIC-001",
  exceptionRef: "EXCEPTION:TRANSFER-001",
  source: "EFFECT_VERIFICATION",
  classification: "EVIDENCE",
  reasonCode: "MISSING_SOURCE_EVIDENCE",
  reasonDigest: "sha256:reason",
  executionReceiptRef: assessment.executionReceiptRef,
  actionRef: "ACTION:TRANSFER-001",
  reservationRef: assessment.reservationRef,
  originalWardenDecisionRef: assessment.originalWardenDecisionRef,
  checkpointRef: "WARDEN-CHECKPOINT:TRANSFER-001",
  programRef: assessment.programRef,
  eventRef: assessment.eventRef,
  capabilityRef: "inventory.transfer",
  targetRef: assessment.targetRef,
  requestedEffect: "inventory.transfer.completed",
  correlationId: assessment.correlationId,
  sourceEvidenceRefs: ["RIVER-EVIDENCE:ORIGINAL-FAILURE"],
  lineageViolations: [],
  executedAt: "2026-08-22T13:00:03.000Z",
  detectedAt: "2026-08-22T13:00:04.000Z",
  sourceDigest: "sha256:exception-source",
  state: "OPEN",
  synthetic: true,
};

function effect(overrides: Partial<VerifiedScopedRemedyEffectV1> = {}): VerifiedScopedRemedyEffectV1 {
  return {
    version: "SCOPED-REMEDY-EFFECT-VERIFICATION-001",
    effectRef: "VERIFIED-REMEDY-EFFECT:TRANSFER-001",
    verificationRef: "REMEDY-EFFECT-VERIFICATION:TRANSFER-001",
    assessmentRef: assessment.assessmentRef,
    effectSetRef: assessment.effectSetRef,
    proposalRef: proposal.proposalRef,
    proposalKind: "RECOVER",
    authorizationRef: "REMEDY-AUTHORIZATION:RECOVER",
    remedyExecutionReceiptRef: "SCOPED-REMEDY-EXECUTION-RECEIPT:RECOVER",
    originalExecutionReceiptRef: assessment.executionReceiptRef,
    originalReservationRef: assessment.reservationRef,
    originalWardenDecisionRef: assessment.originalWardenDecisionRef,
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY:RECOVER",
    parentCorrelationId: assessment.correlationId,
    remedyCorrelationId: "CORR:REMEDY:RECOVER",
    targetRef: assessment.targetRef,
    componentRefs: ["EFFECT:DEST-CREDIT-10"],
    observationRefs: ["POST-REMEDY-OBSERVATION:RECOVER"],
    sourceEvidenceRefs: ["RIVER-EVIDENCE:POST-REMEDY:RECOVER"],
    verifiedAt: "2026-08-22T13:00:09.000Z",
    state: "VERIFIED_REMEDY_EFFECT",
    synthetic: true,
    ...overrides,
  };
}

describe("REMEDY-CAUSAL-SEAL-001 / EXCEPTION-SUPERSESSION-001", () => {
  it("seals the complete causal chain only after a verified remedy and appends a supersession record", () => {
    const service = new RemedyLineageClosureServiceV1();
    const result = service.close({
      exception,
      assessment,
      effect: effect(),
      sealedAt: "2026-08-22T13:00:10.000Z",
    });

    expect(result.state).toBe("SEALED_AND_SUPERSEDED");
    if (result.state !== "SEALED_AND_SUPERSEDED") throw new Error("expected_sealed");
    expect(result.seal.state).toBe("SEALED");
    expect(result.seal.originalExceptionRef).toBe(exception.exceptionRef);
    expect(result.seal.originalExecutionReceiptRef).toBe(assessment.executionReceiptRef);
    expect(result.seal.remedyExecutionReceiptRef).toBe(effect().remedyExecutionReceiptRef);
    expect(result.seal.remedyEffectRef).toBe(effect().effectRef);
    expect(result.seal.sourceEvidenceRefs).toEqual([
      "RIVER-EVIDENCE:ORIGINAL-FAILURE",
      "RIVER-EVIDENCE:POST-REMEDY:RECOVER",
      "RIVER-EVIDENCE:SOURCE-DEBIT",
    ]);
    expect(result.supersession.disposition).toBe("SUPERSEDED_BY_VERIFIED_RECOVERY");
    expect(result.supersession.state).toBe("RESOLVED_APPEND_ONLY");
    expect(exception.state).toBe("OPEN");
    expect(service.closureCount()).toBe(1);
  });

  it("replays exact causal closure idempotently without changing the original seal time", () => {
    const service = new RemedyLineageClosureServiceV1();
    const first = service.close({
      exception,
      assessment,
      effect: effect(),
      sealedAt: "2026-08-22T13:00:10.000Z",
    });
    const replay = service.close({
      exception,
      assessment,
      effect: effect(),
      sealedAt: "2026-08-22T13:00:20.000Z",
    });

    expect(first.state).toBe("SEALED_AND_SUPERSEDED");
    expect(replay.state).toBe("SEALED_AND_SUPERSEDED");
    if (first.state !== "SEALED_AND_SUPERSEDED" || replay.state !== "SEALED_AND_SUPERSEDED") {
      throw new Error("expected_sealed");
    }
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.seal.sealRef).toBe(first.seal.sealRef);
    expect(replay.seal.sealedAt).toBe(first.seal.sealedAt);
    expect(service.closureCount()).toBe(1);
  });

  it("rejects a remedy effect from another original Warden decision", () => {
    const result = new RemedyLineageClosureServiceV1().close({
      exception,
      assessment,
      effect: effect({ originalWardenDecisionRef: "WARDEN-DECISION:OTHER" }),
      sealedAt: "2026-08-22T13:00:10.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_CLOSURE_DECISION_MISMATCH",
    });
  });

  it("rejects scope widening at closure even when the remedy effect claims verification", () => {
    const result = new RemedyLineageClosureServiceV1().close({
      exception,
      assessment,
      effect: effect({
        componentRefs: ["EFFECT:DEST-CREDIT-10", "EFFECT:SOURCE-DEBIT-10"],
      }),
      sealedAt: "2026-08-22T13:00:10.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_CLOSURE_SCOPE_MISMATCH",
    });
  });

  it("cannot seal before the remedy effect was verified", () => {
    const result = new RemedyLineageClosureServiceV1().close({
      exception,
      assessment,
      effect: effect(),
      sealedAt: "2026-08-22T13:00:08.500Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_CLOSURE_BEFORE_VERIFICATION",
    });
  });

  it("records compensation as a distinct resolved disposition rather than rewriting recovery semantics", () => {
    const compensationProposal: ScopedRemedyProposalV1 = {
      ...proposal,
      proposalRef: "REMEDY-PROPOSAL:COMPENSATE-SOURCE",
      kind: "COMPENSATE",
      capabilityRef: "inventory.source_debit.compensate",
      componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
      reasonCode: "rollback_exact_realized_components",
    };
    const compensationAssessment: CompositeEffectAssessmentV1 = {
      ...assessment,
      candidateRemedies: [compensationProposal],
    };
    const compensationEffect = effect({
      proposalRef: compensationProposal.proposalRef,
      proposalKind: "COMPENSATE",
      authorizationRef: "REMEDY-AUTHORIZATION:COMPENSATE",
      remedyExecutionReceiptRef: "SCOPED-REMEDY-EXECUTION-RECEIPT:COMPENSATE",
      remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY:COMPENSATE",
      remedyCorrelationId: "CORR:REMEDY:COMPENSATE",
      componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
      observationRefs: ["POST-REMEDY-OBSERVATION:COMPENSATE"],
      sourceEvidenceRefs: ["RIVER-EVIDENCE:POST-REMEDY:COMPENSATE"],
      effectRef: "VERIFIED-REMEDY-EFFECT:COMPENSATE",
      verificationRef: "REMEDY-EFFECT-VERIFICATION:COMPENSATE",
    });
    const result = new RemedyLineageClosureServiceV1().close({
      exception,
      assessment: compensationAssessment,
      effect: compensationEffect,
      sealedAt: "2026-08-22T13:00:10.000Z",
    });

    expect(result.state).toBe("SEALED_AND_SUPERSEDED");
    if (result.state !== "SEALED_AND_SUPERSEDED") throw new Error("expected_sealed");
    expect(result.supersession.disposition).toBe("SUPERSEDED_BY_VERIFIED_COMPENSATION");
  });
});
