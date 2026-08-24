import { describe, expect, it } from "vitest";

import type {
  WardenDecisionRequestV1,
  WardenTrustResolutionV1,
} from "./contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "./decision-service.ts";

const policy: SyntheticWardenDecisionPolicyV1 = {
  policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:TRUST-001",
  wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
  lifecycle: "ACTIVE",
  validFrom: "2026-08-24T00:00:00.000Z",
  validUntil: "2026-08-24T01:00:00.000Z",
  actorRef: "DIGITALME-TRUST-001",
  representedPrincipalRef: "ENTERPRISE-TRUST-001",
  actingCapacityRef: "CAPACITY:PROCUREMENT-001",
  contextRef: "TRUST-CONTEXT-001",
  programRef: "SYNNERGYZE-PROGRAM:TRUST-001",
  requiredAuthorityRefs: ["AUTHORITY:PROCUREMENT-001"],
  requiredPolicyRefs: ["POLICY:TRUST-001"],
  allowedCapabilityRefs: ["purchase.commit"],
  manualReviewCapabilityRefs: [],
  constraints: ["NO_EXTERNAL_EFFECT"],
};

function request(trustResolution: WardenTrustResolutionV1): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:TRUST-001",
    actorRef: policy.actorRef,
    representedPrincipalRef: policy.representedPrincipalRef,
    actingCapacityRef: policy.actingCapacityRef,
    contextRef: policy.contextRef,
    programRef: policy.programRef,
    eventRef: "SYNNERGYZE-EVENT:TRUST-001",
    action: "purchase.commit",
    capabilityRef: "purchase.commit",
    targetRef: "PURCHASE-ORDER:001",
    requestedEffect: "purchase.committed",
    authorityRefs: policy.requiredAuthorityRefs,
    policyRefs: policy.requiredPolicyRefs,
    representationSourceRefs: ["REGISTRY:REPRESENTATION-TRUST-001"],
    requestedAt: "2026-08-24T00:10:00.000Z",
    correlationId: "CORR-TRUST-001",
    trustResolution,
  };
}

describe("WARDEN-TRUST-FABRIC-001 integration", () => {
  it("escalates a trust hold and never issues an action token", () => {
    const decision = evaluateSyntheticWardenDecisionV1({
      request: request({
        resolutionRef: "TRUST-RESOLUTION:HOLD-001",
        result: "HOLD",
        material: true,
        irreversibleEffect: false,
        reasonCodes: ["insufficient_compute_assurance"],
      }),
      policy,
      decidedAt: "2026-08-24T00:10:30.000Z",
    });

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.reasonCodes).toEqual(["trust_hold:insufficient_compute_assurance"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("denies a denied trust resolution and never issues an action token", () => {
    const decision = evaluateSyntheticWardenDecisionV1({
      request: request({
        resolutionRef: "TRUST-RESOLUTION:DENIED-001",
        result: "DENIED",
        material: true,
        irreversibleEffect: true,
        reasonCodes: ["authority_revoked"],
      }),
      policy,
      decidedAt: "2026-08-24T00:10:30.000Z",
    });

    expect(decision.decision).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["trust_denied:authority_revoked"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("escalates a trust adjudication requirement and never issues an action token", () => {
    const decision = evaluateSyntheticWardenDecisionV1({
      request: request({
        resolutionRef: "TRUST-RESOLUTION:ADJUDICATION-001",
        result: "REQUIRES_ADJUDICATION",
        material: true,
        irreversibleEffect: true,
        reasonCodes: ["jurisdiction_conflict"],
      }),
      policy,
      decidedAt: "2026-08-24T00:10:30.000Z",
    });

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.reasonCodes).toEqual(["trust_adjudication:jurisdiction_conflict"]);
    expect("actionToken" in decision).toBe(false);
  });
});
