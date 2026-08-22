import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import {
  authorizeReconciliationRemedyV1,
  canonicalRemedyEffectBindingV1,
} from "./remedy-authorization.ts";

const proposal: ReconciliationRemedyProposalV1 = {
  proposalRef: "REMEDY-PROPOSAL:AUTH-001",
  kind: "RETRY_OBSERVATION",
  capabilityRef: "effect.observe.retry",
  reasonCode: "fresh_observation_required",
  requiresFreshWardenDecision: true,
  authorized: false,
};

const determination: ReconciliationDeterminationV1 = {
  version: "RECONCILIATION-FABRIC-001",
  reconciliationRef: "RECONCILIATION:AUTH-001",
  exceptionRef: "EXCEPTION:AUTH-001",
  classification: "EVIDENCE_INSUFFICIENT",
  executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:AUTH-001",
  reservationRef: "RIVER-RESERVATION:AUTH-001",
  originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
  programRef: "SYNNERGYZE-PROGRAM:AUTH-001",
  eventRef: "SYNNERGYZE-EVENT:AUTH-001:001",
  targetRef: "LAB-SERVICE-DESK-001",
  correlationId: "CORR:PARENT:AUTH-001",
  sourceEvidenceRefs: [],
  candidateRemedies: [proposal],
  sourceDigest: "sha256:source",
  reconciledAt: "2026-08-22T12:00:03.000Z",
  state: "DETERMINED_UNAUTHORIZED",
  authorized: false,
  synthetic: true,
};

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:REMEDY-001",
    actorRef: "ACTOR:001",
    representedPrincipalRef: "PRINCIPAL:001",
    actingCapacityRef: "CAPACITY:001",
    contextRef: "CONTEXT:001",
    programRef: determination.programRef,
    eventRef: determination.eventRef,
    action: "effect.observe.retry",
    capabilityRef: proposal.capabilityRef,
    targetRef: determination.targetRef,
    requestedEffect: canonicalRemedyEffectBindingV1(determination, proposal),
    authorityRefs: ["AUTHORITY:REMEDY-001"],
    policyRefs: ["POLICY:REMEDY-001"],
    representationSourceRefs: ["REPRESENTATION:001"],
    requestedAt: "2026-08-22T12:00:04.000Z",
    correlationId: "CORR:REMEDY:AUTH-001",
    ...overrides,
  };
}

function decision(
  requestValue = request(),
  overrides: Partial<WardenDecisionV1> = {},
): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:REMEDY-001",
    requestRef: requestValue.requestRef,
    wardenRef: "WARDEN:001",
    action: requestValue.action,
    targetRef: requestValue.targetRef,
    reasonCodes: ["bounded_policy_allow"],
    constraints: [],
    decidedAt: "2026-08-22T12:00:05.000Z",
    validUntil: "2026-08-22T12:05:00.000Z",
    correlationId: requestValue.correlationId,
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:REMEDY-SECRET",
    ...overrides,
  } as WardenDecisionV1;
}

describe("WARDEN-REMEDY-AUTH-001", () => {
  it("requires a fresh Warden allow and emits a digest-bound grant without exposing the raw token", () => {
    const req = request();
    const result = authorizeReconciliationRemedyV1({
      determination,
      proposal,
      request: req,
      decision: decision(req),
      authorizedAt: "2026-08-22T12:00:06.000Z",
    });

    expect(result.state).toBe("AUTHORIZED");
    if (result.state !== "AUTHORIZED") throw new Error("expected_authorized");
    expect(result.grant.version).toBe("WARDEN-REMEDY-AUTH-001");
    expect(result.grant.originalWardenDecisionRef).toBe(determination.originalWardenDecisionRef);
    expect(result.grant.remedyWardenDecisionRef).not.toBe(determination.originalWardenDecisionRef);
    expect(result.grant.parentCorrelationId).toBe(determination.correlationId);
    expect(result.grant.remedyCorrelationId).toBe(req.correlationId);
    expect(result.grant.remedyCorrelationId).not.toBe(result.grant.parentCorrelationId);
    expect(result.grant.actionTokenDigest).toMatch(/^sha256:/);
    expect("actionToken" in result.grant).toBe(false);
  });

  it("rejects reuse of the original execution decision", () => {
    const req = request();
    const result = authorizeReconciliationRemedyV1({
      determination,
      proposal,
      request: req,
      decision: decision(req, { decisionRef: determination.originalWardenDecisionRef }),
      authorizedAt: "2026-08-22T12:00:06.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_FRESH_DECISION_REQUIRED",
    });
  });

  it("requires a distinct child correlation for the remedy action", () => {
    const req = request({ correlationId: determination.correlationId });
    const result = authorizeReconciliationRemedyV1({
      determination,
      proposal,
      request: req,
      decision: decision(req),
      authorizedAt: "2026-08-22T12:00:06.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_NEW_CORRELATION_REQUIRED",
    });
  });

  it("rejects a different proposal, target, capability or canonical effect binding", () => {
    const cases: Array<[WardenDecisionRequestV1, ReconciliationRemedyProposalV1, string]> = [
      [request(), { ...proposal, proposalRef: "REMEDY-PROPOSAL:OTHER" }, "REMEDY_PROPOSAL_NOT_BOUND"],
      [request({ targetRef: "TARGET:OTHER" }), proposal, "REMEDY_TARGET_MISMATCH"],
      [request({ capabilityRef: "reconciliation.manual_review" }), proposal, "REMEDY_CAPABILITY_MISMATCH"],
      [request({ requestedEffect: "RECONCILIATION-REMEDY:TAMPERED" }), proposal, "REMEDY_EFFECT_BINDING_MISMATCH"],
    ];

    for (const [req, candidate, reasonCode] of cases) {
      const result = authorizeReconciliationRemedyV1({
        determination,
        proposal: candidate,
        request: req,
        decision: decision(req),
        authorizedAt: "2026-08-22T12:00:06.000Z",
      });
      expect(result).toEqual({ state: "REJECTED_INPUT", reasonCode });
    }
  });

  it("rejects non-allow and expired remedy decisions", () => {
    const req = request();
    const denied = authorizeReconciliationRemedyV1({
      determination,
      proposal,
      request: req,
      decision: {
        ...decision(req),
        decision: "DENY",
        actionToken: undefined,
      } as unknown as WardenDecisionV1,
      authorizedAt: "2026-08-22T12:00:06.000Z",
    });
    const expired = authorizeReconciliationRemedyV1({
      determination,
      proposal,
      request: req,
      decision: decision(req, { validUntil: "2026-08-22T12:00:05.500Z" }),
      authorizedAt: "2026-08-22T12:00:06.000Z",
    });

    expect(denied).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_WARDEN_ALLOW_REQUIRED",
    });
    expect(expired).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_DECISION_EXPIRED",
    });
  });
});
