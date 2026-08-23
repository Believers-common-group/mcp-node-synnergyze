import { describe, expect, it } from "vitest";

import type {
  CompositeEffectAssessmentV1,
  CompositeExpectedEffectContractV1,
  ScopedRemedyProposalV1,
} from "./composite-effect-reconciliation.ts";
import {
  InventoryDeltaCompensationTargetResolverV1,
  verifyScopedRemedyEffectV1,
  type ScopedRemedyComponentObservationV1,
} from "./remedy-effect-verification.ts";
import type { ScopedRemedyAuthorizationGrantV1 } from "./scoped-remedy-authorization.ts";
import type { ScopedRemedyExecutionReceiptV1 } from "./scoped-remedy-execution.ts";

const contract: CompositeExpectedEffectContractV1 = {
  version: "COMPOSITE-EXPECTED-EFFECT-001",
  effectSetRef: "EXPECTED-EFFECT-SET:TRANSFER-001",
  actionRef: "ACTION:TRANSFER-001",
  reservationRef: "RIVER-RESERVATION:TRANSFER-001",
  wardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
  programRef: "PROGRAM:TRANSFER-001",
  eventRef: "EVENT:TRANSFER-001",
  capabilityRef: "inventory.transfer",
  targetRef: "TRANSFER:SKU-001:SRC-A:DST-B",
  correlationId: "CORR:TRANSFER-001",
  partialFailurePolicy: "COMPLETE_REMAINING_IF_SAFE",
  components: [
    {
      componentRef: "EFFECT:SOURCE-DEBIT-10",
      subjectRef: "INVENTORY:SRC-A:SKU-001",
      matcher: { kind: "EXACT", value: "DELTA:-10" },
      recoveryCapabilityRef: "inventory.source_debit.recover",
      compensationCapabilityRef: "inventory.source_debit.compensate",
      required: true,
    },
    {
      componentRef: "EFFECT:DEST-CREDIT-10",
      subjectRef: "INVENTORY:DST-B:SKU-001",
      matcher: { kind: "EXACT", value: "DELTA:+10" },
      recoveryCapabilityRef: "inventory.destination_credit.recover",
      compensationCapabilityRef: "inventory.destination_credit.compensate",
      required: true,
    },
  ],
  sourceDigest: "sha256:contract-source",
  compiledAt: "2026-08-22T13:00:02.000Z",
  state: "BOUND_PRE_EXECUTION",
  synthetic: true,
};

function proposal(kind: "RECOVER" | "COMPENSATE"): ScopedRemedyProposalV1 {
  return kind === "RECOVER"
    ? {
        proposalRef: "REMEDY-PROPOSAL:RECOVER-DEST",
        kind,
        capabilityRef: "inventory.destination_credit.recover",
        effectSetRef: contract.effectSetRef,
        componentRefs: ["EFFECT:DEST-CREDIT-10"],
        reasonCode: "complete_exact_missing_components",
        requiresFreshWardenDecision: true,
        authorized: false,
      }
    : {
        proposalRef: "REMEDY-PROPOSAL:COMPENSATE-SOURCE",
        kind,
        capabilityRef: "inventory.source_debit.compensate",
        effectSetRef: contract.effectSetRef,
        componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
        reasonCode: "rollback_exact_realized_components",
        requiresFreshWardenDecision: true,
        authorized: false,
      };
}

function assessment(candidate: ScopedRemedyProposalV1): CompositeEffectAssessmentV1 {
  return {
    version: "PARTIAL-EFFECT-ASSESSMENT-001",
    assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:TRANSFER-001",
    effectSetRef: contract.effectSetRef,
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:TRANSFER-001",
    reservationRef: contract.reservationRef,
    originalWardenDecisionRef: contract.wardenDecisionRef,
    programRef: contract.programRef,
    eventRef: contract.eventRef,
    targetRef: contract.targetRef,
    correlationId: contract.correlationId,
    classification: "PARTIAL_EFFECT",
    matchedComponentRefs: ["EFFECT:SOURCE-DEBIT-10"],
    missingComponentRefs: ["EFFECT:DEST-CREDIT-10"],
    unexpectedComponentRefs: [],
    duplicateComponentRefs: [],
    conflictingComponentRefs: [],
    sourceEvidenceRefs: ["RIVER-EVIDENCE:SOURCE-DEBIT"],
    candidateRemedies: [candidate],
    assessedAt: "2026-08-22T13:00:05.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
  };
}

function authorization(
  candidate: ScopedRemedyProposalV1,
  scopeAssessment = assessment(candidate),
): ScopedRemedyAuthorizationGrantV1 {
  return {
    version: "WARDEN-REMEDY-AUTH-001",
    authorizationRef: `REMEDY-AUTHORIZATION:${candidate.kind}`,
    reconciliationRef: scopeAssessment.assessmentRef,
    assessmentRef: scopeAssessment.assessmentRef,
    effectSetRef: scopeAssessment.effectSetRef,
    proposalRef: candidate.proposalRef,
    proposalKind: candidate.kind,
    componentRefs: [...candidate.componentRefs],
    parentCorrelationId: scopeAssessment.correlationId,
    remedyCorrelationId: `CORR:REMEDY:${candidate.kind}`,
    originalWardenDecisionRef: scopeAssessment.originalWardenDecisionRef,
    remedyWardenDecisionRef: `WARDEN-DECISION:REMEDY:${candidate.kind}`,
    remedyWardenRequestRef: `WARDEN-REQUEST:REMEDY:${candidate.kind}`,
    capabilityRef: candidate.capabilityRef,
    targetRef: scopeAssessment.targetRef,
    actionTokenDigest: "sha256:remedy-token",
    authorizedAt: "2026-08-22T13:00:06.000Z",
    validUntil: "2026-08-22T13:05:00.000Z",
    state: "AUTHORIZED_REMEDY",
    synthetic: true,
  };
}

function execution(
  candidate: ScopedRemedyProposalV1,
  grant = authorization(candidate),
): ScopedRemedyExecutionReceiptV1 {
  return {
    version: "SCOPED-REMEDY-EXECUTION-001",
    receiptRef: `SCOPED-REMEDY-EXECUTION-RECEIPT:${candidate.kind}`,
    authorizationRef: grant.authorizationRef,
    assessmentRef: grant.assessmentRef,
    effectSetRef: grant.effectSetRef,
    proposalRef: candidate.proposalRef,
    proposalKind: candidate.kind,
    componentRefs: [...candidate.componentRefs],
    parentCorrelationId: grant.parentCorrelationId,
    remedyCorrelationId: grant.remedyCorrelationId,
    originalWardenDecisionRef: grant.originalWardenDecisionRef,
    remedyWardenDecisionRef: grant.remedyWardenDecisionRef,
    capabilityRef: candidate.capabilityRef,
    targetRef: grant.targetRef,
    adapterRef: `SYNTHETIC-${candidate.kind}-ADAPTER-001`,
    adapterResultRef: `SYNTHETIC-${candidate.kind}-RESULT-001`,
    executedAt: "2026-08-22T13:00:07.000Z",
    state: "EXECUTED_UNVERIFIED_REMEDY",
    synthetic: true,
    idempotentReplay: false,
  };
}

function observation(
  candidate: ScopedRemedyProposalV1,
  observedStateRef: string,
  subjectRef: string,
): ScopedRemedyComponentObservationV1 {
  const grant = authorization(candidate);
  const receipt = execution(candidate, grant);
  return {
    observationRef: `POST-REMEDY-OBSERVATION:${candidate.kind}`,
    remedyExecutionReceiptRef: receipt.receiptRef,
    assessmentRef: grant.assessmentRef,
    effectSetRef: grant.effectSetRef,
    proposalRef: candidate.proposalRef,
    componentRef: candidate.componentRefs[0],
    subjectRef,
    targetRef: grant.targetRef,
    remedyCorrelationId: grant.remedyCorrelationId,
    observerRef: "SYNTHETIC-INVENTORY-OBSERVER-001",
    observedStateRef,
    sourceEvidenceRef: `RIVER-EVIDENCE:POST-REMEDY:${candidate.kind}`,
    observedAt: "2026-08-22T13:00:08.000Z",
    synthetic: true,
  };
}

describe("SCOPED-REMEDY-EFFECT-VERIFICATION-001", () => {
  it("verifies recovery only when the exact missing component reaches its original intended state", () => {
    const candidate = proposal("RECOVER");
    const scopeAssessment = assessment(candidate);
    const grant = authorization(candidate, scopeAssessment);
    const receipt = execution(candidate, grant);
    const result = verifyScopedRemedyEffectV1({
      contract,
      assessment: scopeAssessment,
      proposal: candidate,
      authorization: grant,
      receipt,
      observations: [
        observation(candidate, "DELTA:+10", "INVENTORY:DST-B:SKU-001"),
      ],
      verifiedAt: "2026-08-22T13:00:09.000Z",
    });

    expect(result.state).toBe("VERIFIED_REMEDY_EFFECT");
    if (result.state !== "VERIFIED_REMEDY_EFFECT") throw new Error("expected_verified");
    expect(result.effect.componentRefs).toEqual(["EFFECT:DEST-CREDIT-10"]);
    expect(result.effect.proposalKind).toBe("RECOVER");
    expect(result.effect.originalExecutionReceiptRef).toBe(scopeAssessment.executionReceiptRef);
    expect(result.effect.remedyExecutionReceiptRef).toBe(receipt.receiptRef);
  });

  it("rejects recovery when the post-remedy state still does not satisfy the missing component", () => {
    const candidate = proposal("RECOVER");
    const scopeAssessment = assessment(candidate);
    const grant = authorization(candidate, scopeAssessment);
    const result = verifyScopedRemedyEffectV1({
      contract,
      assessment: scopeAssessment,
      proposal: candidate,
      authorization: grant,
      receipt: execution(candidate, grant),
      observations: [
        observation(candidate, "DELTA:+9", "INVENTORY:DST-B:SKU-001"),
      ],
      verifiedAt: "2026-08-22T13:00:09.000Z",
    });

    expect(result).toEqual({
      state: "EXCEPTION",
      reasonCode: "REMEDY_EFFECT_STATE_MISMATCH",
      componentRefs: ["EFFECT:DEST-CREDIT-10"],
    });
  });

  it("verifies compensation only through a registered resolver that proves the inverse realized effect", () => {
    const candidate = proposal("COMPENSATE");
    const scopeAssessment = assessment(candidate);
    const grant = authorization(candidate, scopeAssessment);
    const result = verifyScopedRemedyEffectV1({
      contract,
      assessment: scopeAssessment,
      proposal: candidate,
      authorization: grant,
      receipt: execution(candidate, grant),
      observations: [
        observation(candidate, "DELTA:+10", "INVENTORY:SRC-A:SKU-001"),
      ],
      compensationResolvers: [
        new InventoryDeltaCompensationTargetResolverV1(candidate.capabilityRef),
      ],
      verifiedAt: "2026-08-22T13:00:09.000Z",
    });

    expect(result.state).toBe("VERIFIED_REMEDY_EFFECT");
    if (result.state !== "VERIFIED_REMEDY_EFFECT") throw new Error("expected_verified");
    expect(result.effect.proposalKind).toBe("COMPENSATE");
    expect(result.effect.componentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
  });

  it("cannot declare compensation verified without a domain compensation target resolver", () => {
    const candidate = proposal("COMPENSATE");
    const scopeAssessment = assessment(candidate);
    const grant = authorization(candidate, scopeAssessment);
    const result = verifyScopedRemedyEffectV1({
      contract,
      assessment: scopeAssessment,
      proposal: candidate,
      authorization: grant,
      receipt: execution(candidate, grant),
      observations: [
        observation(candidate, "DELTA:+10", "INVENTORY:SRC-A:SKU-001"),
      ],
      verifiedAt: "2026-08-22T13:00:09.000Z",
    });

    expect(result).toEqual({
      state: "EXCEPTION",
      reasonCode: "REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED",
      componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
    });
  });

  it("rejects widened post-remedy observation scope", () => {
    const candidate = proposal("RECOVER");
    const scopeAssessment = assessment(candidate);
    const grant = authorization(candidate, scopeAssessment);
    const widened = {
      ...observation(candidate, "DELTA:+10", "INVENTORY:DST-B:SKU-001"),
      componentRef: "EFFECT:SOURCE-DEBIT-10",
      subjectRef: "INVENTORY:SRC-A:SKU-001",
    };
    const result = verifyScopedRemedyEffectV1({
      contract,
      assessment: scopeAssessment,
      proposal: candidate,
      authorization: grant,
      receipt: execution(candidate, grant),
      observations: [widened],
      verifiedAt: "2026-08-22T13:00:09.000Z",
    });

    expect(result).toEqual({
      state: "EXCEPTION",
      reasonCode: "REMEDY_EFFECT_UNEXPECTED_COMPONENT",
      componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
    });
  });
});
