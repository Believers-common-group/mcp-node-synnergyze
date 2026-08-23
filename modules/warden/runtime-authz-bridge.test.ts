import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "./contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "./decision-service.ts";
import { buildRuntimeWardenDecisionReceipt } from "./runtime-authz-bridge.ts";

const DECIDED_AT = "2026-08-23T08:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RUNTIME-001",
    actorRef: "DIGITALME:GENESIS:001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T08:00:00.000Z",
    correlationId: "CORR-RUNTIME-001",
    ...overrides,
  };
}

function policy(
  requestValue: WardenDecisionRequestV1,
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:RUNTIME-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T07:55:00.000Z",
    validUntil: "2026-08-23T08:10:00.000Z",
    actorRef: requestValue.actorRef,
    representedPrincipalRef: requestValue.representedPrincipalRef,
    actingCapacityRef: requestValue.actingCapacityRef,
    contextRef: requestValue.contextRef,
    programRef: requestValue.programRef,
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["NO_EXTERNAL_EFFECT"],
    ...overrides,
  };
}

function principal(digitalMeId = "DIGITALME:GENESIS:001") {
  return {
    digitalMeId,
    authenticatedPrincipalReceiptId: "DIGITALME-PRINCIPAL:RUNTIME-001",
  };
}

describe("GCS-20260823-002 Runtime Warden receipt bridge", () => {
  it("bridges the actual typed decision producer without exposing the action token", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: DECIDED_AT,
    });
    expect(decision.decision).toBe("ALLOW");

    const receipt = buildRuntimeWardenDecisionReceipt({
      request: req,
      decision,
      principal: principal(),
      effectClass: "WRITE",
    });

    expect(receipt.decision).toBe("ALLOW");
    expect(receipt.decision_receipt_id).toBe(decision.decisionRef);
    expect(receipt.action_binding.action_id).toBe(req.action);
    expect(receipt.action_binding.request_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain("WARDEN-ACTION-TOKEN:");
    expect(receipt.grant_binding?.authorization_token_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("maps ESCALATE to zero-effect DENY for Runtime Stitcher", () => {
    const req = request({
      requestRef: "WARDEN-REQUEST:REVIEW",
      action: "contract.execute",
      capabilityRef: "contract.execute",
      targetRef: "LAB-CONTRACT-001",
      requestedEffect: "contract.executed",
    });
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: DECIDED_AT,
    });
    expect(decision.decision).toBe("ESCALATE");

    const receipt = buildRuntimeWardenDecisionReceipt({
      request: req,
      decision,
      principal: principal(),
      effectClass: "EXECUTE",
    });
    expect(receipt.decision).toBe("DENY");
    expect(receipt.reason_codes).toContain("WARDEN_ESCALATE_REQUIRES_REVIEW");
    expect("grant_binding" in receipt).toBe(false);
  });

  it("keeps a Warden DENY zero-effect", () => {
    const req = request({
      capabilityRef: "bank.transfer",
      action: "bank.transfer",
      targetRef: "BANK:TEST",
    });
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: DECIDED_AT,
    });
    expect(decision.decision).toBe("DENY");
    const receipt = buildRuntimeWardenDecisionReceipt({
      request: req,
      decision,
      principal: principal(),
      effectClass: "FINANCIAL",
    });
    expect(receipt.decision).toBe("DENY");
    expect("grant_binding" in receipt).toBe(false);
    expect("authority_refs" in receipt).toBe(false);
  });

  it("fails closed on authenticated DigitalMe mismatch", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: DECIDED_AT,
    });
    expect(() =>
      buildRuntimeWardenDecisionReceipt({
        request: req,
        decision,
        principal: principal("DIGITALME:OTHER"),
        effectClass: "WRITE",
      }),
    ).toThrow(/does not match/);
  });

  it("derives request digest internally and changes it when governed request context changes", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: DECIDED_AT,
    });
    const first = buildRuntimeWardenDecisionReceipt({
      request: req,
      decision,
      principal: principal(),
      effectClass: "WRITE",
    });

    const changedReq = request({ representedPrincipalRef: "OTHER-COMPANY-001" });
    const changedDecision = evaluateSyntheticWardenDecisionV1({
      request: changedReq,
      policy: policy(changedReq),
      decidedAt: DECIDED_AT,
    });
    const changed = buildRuntimeWardenDecisionReceipt({
      request: changedReq,
      decision: changedDecision,
      principal: principal(),
      effectClass: "WRITE",
    });
    expect(changed.action_binding.request_digest).not.toBe(first.action_binding.request_digest);
  });

  it("rejects decision/request mismatches and missing effect binding for mutations", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: DECIDED_AT,
    });
    expect(() =>
      buildRuntimeWardenDecisionReceipt({
        request: req,
        decision: { ...decision, requestRef: "OTHER" },
        principal: principal(),
        effectClass: "WRITE",
      }),
    ).toThrow(/reference mismatch/);

    const noEffect = request({ requestedEffect: undefined });
    const noEffectDecision = evaluateSyntheticWardenDecisionV1({
      request: noEffect,
      policy: policy(noEffect),
      decidedAt: DECIDED_AT,
    });
    expect(() =>
      buildRuntimeWardenDecisionReceipt({
        request: noEffect,
        decision: noEffectDecision,
        principal: principal(),
        effectClass: "WRITE",
      }),
    ).toThrow(/requestedEffect/);
  });
});
