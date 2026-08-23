import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  CompositeEffectAssessmentV1,
  ScopedRemedyProposalV1,
} from "./composite-effect-reconciliation.ts";
import {
  authorizeScopedRemedyV1,
  canonicalScopedRemedyEffectBindingV1,
} from "./scoped-remedy-authorization.ts";

const proposal: ScopedRemedyProposalV1 = {
  proposalRef: "REMEDY-PROPOSAL:SCOPED-001",
  kind: "COMPENSATE",
  capabilityRef: "inventory.source_debit.compensate",
  effectSetRef: "EXPECTED-EFFECT-SET:001",
  componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
  reasonCode: "rollback_exact_realized_components",
  requiresFreshWardenDecision: true,
  authorized: false,
};

const assessment: CompositeEffectAssessmentV1 = {
  version: "PARTIAL-EFFECT-ASSESSMENT-001",
  assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:001",
  effectSetRef: proposal.effectSetRef,
  executionReceiptRef: "EXECUTION:001",
  reservationRef: "RIVER-RESERVATION:001",
  originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
  programRef: "PROGRAM:001",
  eventRef: "EVENT:001",
  targetRef: "TRANSFER:001",
  correlationId: "CORR:PARENT:001",
  classification: "PARTIAL_EFFECT",
  matchedComponentRefs: ["EFFECT:SOURCE-DEBIT-10"],
  missingComponentRefs: ["EFFECT:DEST-CREDIT-10"],
  unexpectedComponentRefs: [],
  duplicateComponentRefs: [],
  conflictingComponentRefs: [],
  sourceEvidenceRefs: ["RIVER-EVIDENCE:SOURCE-DEBIT"],
  candidateRemedies: [proposal],
  assessedAt: "2026-08-22T14:00:03.000Z",
  state: "DETERMINED_UNAUTHORIZED",
  authorized: false,
  synthetic: true,
};

function request(
  candidate = proposal,
  overrides: Partial<WardenDecisionRequestV1> = {},
): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:SCOPED-001",
    actorRef: "DIGITALME:001",
    representedPrincipalRef: "PRINCIPAL:001",
    actingCapacityRef: "CAPACITY:001",
    contextRef: "ALPHA-NODE-001",
    programRef: assessment.programRef,
    eventRef: assessment.eventRef,
    action: candidate.capabilityRef,
    capabilityRef: candidate.capabilityRef,
    targetRef: assessment.targetRef,
    requestedEffect: canonicalScopedRemedyEffectBindingV1(assessment, candidate),
    authorityRefs: ["AUTHORITY:COMPENSATION-001"],
    policyRefs: ["POLICY:COMPENSATION-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-22T14:00:04.000Z",
    correlationId: "CORR:REMEDY:001",
    ...overrides,
  };
}

function decision(
  requestValue = request(),
  overrides: Partial<WardenDecisionV1> = {},
): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:COMPENSATION-001",
    requestRef: requestValue.requestRef,
    wardenRef: "WARDEN:001",
    action: requestValue.action,
    targetRef: requestValue.targetRef,
    reasonCodes: ["bounded_policy_allow"],
    constraints: ["EXACT_EFFECT_SCOPE_ONLY"],
    decidedAt: "2026-08-22T14:00:05.000Z",
    validUntil: "2026-08-22T14:05:00.000Z",
    correlationId: requestValue.correlationId,
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:SCOPED-SECRET",
    ...overrides,
  } as WardenDecisionV1;
}

describe("WARDEN-SCOPED-REMEDY-AUTH-001", () => {
  it("authorizes exactly one pre-reconciled effect scope without persisting the raw action token", () => {
    const req = request();
    const result = authorizeScopedRemedyV1({
      assessment,
      proposal,
      request: req,
      decision: decision(req),
      authorizedAt: "2026-08-22T14:00:06.000Z",
    });

    expect(result.state).toBe("AUTHORIZED");
    if (result.state !== "AUTHORIZED") throw new Error("expected_authorized");
    expect(result.grant.effectSetRef).toBe(assessment.effectSetRef);
    expect(result.grant.assessmentRef).toBe(assessment.assessmentRef);
    expect(result.grant.componentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
    expect(result.grant.actionTokenDigest).toMatch(/^sha256:/);
    expect(JSON.stringify(result.grant)).not.toContain("WARDEN-ACTION-TOKEN:SCOPED-SECRET");
  });

  it("rejects broadening compensation from one realized component to the entire effect set", () => {
    const widened = {
      ...proposal,
      componentRefs: ["EFFECT:SOURCE-DEBIT-10", "EFFECT:DEST-CREDIT-10"],
    };
    const req = request(widened);
    const result = authorizeScopedRemedyV1({
      assessment,
      proposal: widened,
      request: req,
      decision: decision(req),
      authorizedAt: "2026-08-22T14:00:06.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "SCOPED_REMEDY_PROPOSAL_NOT_BOUND",
    });
  });

  it("rejects changing the effect-set identity even when the component name is unchanged", () => {
    const drifted = { ...proposal, effectSetRef: "EXPECTED-EFFECT-SET:OTHER" };
    const req = request(drifted);
    const result = authorizeScopedRemedyV1({
      assessment,
      proposal: drifted,
      request: req,
      decision: decision(req),
      authorizedAt: "2026-08-22T14:00:06.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "SCOPED_REMEDY_PROPOSAL_NOT_BOUND",
    });
  });

  it("rejects reuse of the original execution decision and parent correlation", () => {
    const req = request();
    const reusedDecision = authorizeScopedRemedyV1({
      assessment,
      proposal,
      request: req,
      decision: decision(req, { decisionRef: assessment.originalWardenDecisionRef }),
      authorizedAt: "2026-08-22T14:00:06.000Z",
    });
    expect(reusedDecision).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "SCOPED_REMEDY_FRESH_DECISION_REQUIRED",
    });

    const parentReq = request(proposal, { correlationId: assessment.correlationId });
    const reusedCorrelation = authorizeScopedRemedyV1({
      assessment,
      proposal,
      request: parentReq,
      decision: decision(parentReq),
      authorizedAt: "2026-08-22T14:00:06.000Z",
    });
    expect(reusedCorrelation).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "SCOPED_REMEDY_NEW_CORRELATION_REQUIRED",
    });
  });

  it("rejects a token-valid decision if the canonical effect-scope binding was tampered", () => {
    const req = request(proposal, { requestedEffect: "PARTIAL-EFFECT-REMEDY:TAMPERED" });
    const result = authorizeScopedRemedyV1({
      assessment,
      proposal,
      request: req,
      decision: decision(req),
      authorizedAt: "2026-08-22T14:00:06.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "SCOPED_REMEDY_EFFECT_BINDING_MISMATCH",
    });
  });
});
