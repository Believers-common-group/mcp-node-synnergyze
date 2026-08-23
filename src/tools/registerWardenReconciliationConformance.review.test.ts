import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import {
  EffectVerificationServiceV1,
  type EffectVerificationFailureV1,
} from "../../modules/synnergyze/effect-verification.ts";
import { ReconciliationFabricV1 } from "../../modules/synnergyze/reconciliation-fabric.ts";
import { WardenReconciliationConformanceServiceV1 } from "./registerWardenReconciliationConformance.ts";

const NOW = "2026-08-23T05:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RECON-REVIEW-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:RECON-REVIEW-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T05:00:00.000Z",
    correlationId: "CORR-RECON-REVIEW-001",
    ...overrides,
  };
}

function input(value: WardenDecisionRequestV1) {
  return { request: value };
}

function successfulFixture() {
  const service = new WardenReconciliationConformanceServiceV1();
  const result = service.execute(input(request()), NOW);
  if (
    !result.expectation ||
    !result.effect.execution.executionReceipt ||
    !result.effect.observation ||
    !result.effect.verification ||
    result.effect.verification.state !== "VERIFIED_EFFECT" ||
    !result.effect.seal ||
    !result.effect.causalTrace
  ) {
    throw new Error("expected_complete_reconciliation_fixture");
  }
  return {
    expectation: result.expectation,
    receipt: result.effect.execution.executionReceipt,
    observation: result.effect.observation,
    verification: result.effect.verification,
    seal: result.effect.seal,
    causalTrace: result.effect.causalTrace,
  };
}

describe("WARDEN-RECONCILIATION-CONFORMANCE-1.0 review regressions", () => {
  it("rejects an unsupported requestedEffect before poisoning the request identity", () => {
    const service = new WardenReconciliationConformanceServiceV1();
    const bad = request({ requestedEffect: "service_request.deleted" });
    expect(() => service.execute(input(bad), NOW)).toThrow(
      "reconciliation_conformance_requested_effect_invalid",
    );

    const corrected = service.execute(input(request()), NOW);
    expect(corrected.state).toBe("RECONCILED_CLOSED");
  });

  it("routes a genuine observation lineage conflict to MANUAL_REVIEW rather than rejecting it", () => {
    const fixture = successfulFixture();
    const conflictingObservation = {
      ...fixture.observation,
      targetRef: "LAB-SERVICE-DESK-CONFLICTING",
    };
    const verifier = new EffectVerificationServiceV1();
    const verification = verifier.verify({
      receipt: fixture.receipt,
      observation: conflictingObservation,
      verifiedAt: NOW,
    });
    expect(verification.state).toBe("EXCEPTION");

    const result = new ReconciliationFabricV1().reconcile({
      expectation: fixture.expectation,
      receipt: fixture.receipt,
      observation: conflictingObservation,
      verification,
      reconciledAt: NOW,
    });
    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determination");
    expect(result.determination.classification).toBe("CONFLICTING_EFFECT");
    expect(result.determination.closureEligible).toBe(false);
    expect(result.determination.candidateRemedies[0]).toMatchObject({
      kind: "MANUAL_REVIEW",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
  });

  it("treats an observed state without source evidence as EVIDENCE_INSUFFICIENT", () => {
    const fixture = successfulFixture();
    const observation = { ...fixture.observation, sourceEvidenceRef: "" };
    const verification = new EffectVerificationServiceV1().verify({
      receipt: fixture.receipt,
      observation,
      verifiedAt: NOW,
    });
    expect(verification.state).toBe("EXCEPTION");

    const result = new ReconciliationFabricV1().reconcile({
      expectation: fixture.expectation,
      receipt: fixture.receipt,
      observation,
      verification,
      reconciledAt: NOW,
    });
    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determination");
    expect(result.determination.classification).toBe("EVIDENCE_INSUFFICIENT");
    expect(result.determination.candidateRemedies[0]?.kind).toBe("MANUAL_REVIEW");
  });

  it("rejects a verified effect paired with a different observation attempt", () => {
    const fixture = successfulFixture();
    const differentObservation = {
      ...fixture.observation,
      observationRef: "POST-EXECUTION-OBSERVATION:DIFFERENT",
    };
    const result = new ReconciliationFabricV1().reconcile({
      expectation: fixture.expectation,
      receipt: fixture.receipt,
      observation: differentObservation,
      verification: fixture.verification,
      seal: fixture.seal,
      causalTrace: fixture.causalTrace,
      reconciledAt: NOW,
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_VERIFICATION_OBSERVATION_MISMATCH",
    });
  });

  it("rejects a failure result generated for another execution receipt", () => {
    const fixture = successfulFixture();
    const failure: EffectVerificationFailureV1 = {
      state: "EXCEPTION",
      executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:OTHER",
      reasonCode: "MISSING_OBSERVED_STATE",
      reason: "other execution failed",
    };
    const result = new ReconciliationFabricV1().reconcile({
      expectation: fixture.expectation,
      receipt: fixture.receipt,
      verification: failure,
      reconciledAt: NOW,
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_VERIFICATION_RECEIPT_MISMATCH",
    });
  });

  it("requires causal time ordering through observation, verification, seal and reconciliation", () => {
    const fixture = successfulFixture();
    const lateObservation = {
      ...fixture.observation,
      observedAt: "2026-08-23T05:01:00.000Z",
    };
    const result = new ReconciliationFabricV1().reconcile({
      expectation: fixture.expectation,
      receipt: fixture.receipt,
      observation: lateObservation,
      verification: fixture.verification,
      seal: fixture.seal,
      causalTrace: fixture.causalTrace,
      reconciledAt: NOW,
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_BEFORE_OBSERVATION",
    });
  });

  it("rejects a mutated matcher that retains the original expectation identity", () => {
    const fixture = successfulFixture();
    const expectation = {
      ...fixture.expectation,
      matcher: { kind: "PREFIX" as const, value: "" },
    };
    const result = new ReconciliationFabricV1().reconcile({
      expectation,
      receipt: fixture.receipt,
      observation: fixture.observation,
      verification: fixture.verification,
      seal: fixture.seal,
      causalTrace: fixture.causalTrace,
      reconciledAt: NOW,
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_EXPECTATION_INTEGRITY_INVALID",
    });
  });

  it("rejects a seal whose trace digest does not bind the supplied verified effect", () => {
    const fixture = successfulFixture();
    const seal = {
      ...fixture.seal,
      traceDigest: [
        "RC1-TRACE-V1",
        fixture.seal.reservationRef,
        fixture.seal.sealRef,
        "VERIFIED-EFFECT:OTHER",
        fixture.verification.effect.verificationRef,
      ].join("|"),
    };
    const result = new ReconciliationFabricV1().reconcile({
      expectation: fixture.expectation,
      receipt: fixture.receipt,
      observation: fixture.observation,
      verification: fixture.verification,
      seal,
      causalTrace: fixture.causalTrace,
      reconciledAt: NOW,
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_SEAL_LINEAGE_MISMATCH",
    });
  });
});
