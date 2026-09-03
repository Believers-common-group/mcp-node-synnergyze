import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import type { SyntheticWardenDecisionPolicyV1 } from "../warden/decision-service.ts";
import { executeSyntheticFederatedLicenceR1 } from "./runtime.ts";

const MISSION_REF = "MISSION-CREATOR-CROSSBORDER-001";
const PRODUCT_REF = "PRODUCT-X-001";
const FEDERATION_OBJECT_REF = "FEDERATION-OBJECT:IN-MY:LICENCE:001";
const CORRELATION_ID = "CORR-FED-LICENCE-001";

function sourceRequest(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:IN:LICENCE:001",
    actorRef: "DM-IN-CREATOR-001",
    representedPrincipalRef: "DM-IN-CREATOR-001",
    actingCapacityRef: "CAPACITY:CREATOR-LICENSOR-001",
    contextRef: "DOMAIN-IN",
    programRef: MISSION_REF,
    eventRef: "FED-EVENT:IN:LICENCE:001",
    action: "federation.licence.release",
    capabilityRef: "federation.licence.release",
    targetRef: PRODUCT_REF,
    authorityRefs: ["AUTHORITY:IP-LICENSOR-001"],
    policyRefs: ["POLICY:IN-MY-CREATOR-FEDERATION-001"],
    representationSourceRefs: ["GENESIS:CREATOR-IP-RELATIONSHIP-001"],
    requestedAt: "2026-08-24T00:00:00.000Z",
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function sourcePolicy(overrides: Partial<SyntheticWardenDecisionPolicyV1> = {}): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY:IN:FEDERATION:001",
    wardenRef: "WARDEN-IN",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T23:55:00.000Z",
    validUntil: "2026-08-24T00:30:00.000Z",
    actorRef: "DM-IN-CREATOR-001",
    representedPrincipalRef: "DM-IN-CREATOR-001",
    actingCapacityRef: "CAPACITY:CREATOR-LICENSOR-001",
    contextRef: "DOMAIN-IN",
    programRef: MISSION_REF,
    requiredAuthorityRefs: ["AUTHORITY:IP-LICENSOR-001"],
    requiredPolicyRefs: ["POLICY:IN-MY-CREATOR-FEDERATION-001"],
    allowedCapabilityRefs: ["federation.licence.release"],
    manualReviewCapabilityRefs: [],
    constraints: ["SYNTHETIC_REFERENCE_ONLY"],
    ...overrides,
  };
}

function destinationRequest(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:MY:LICENCE:001",
    actorRef: "ENT-MY-BUYER-001",
    representedPrincipalRef: "ENT-MY-BUYER-001",
    actingCapacityRef: "CAPACITY:MY-LICENSEE-001",
    contextRef: "DOMAIN-MY",
    programRef: MISSION_REF,
    eventRef: "FED-EVENT:MY:LICENCE:001",
    action: "federation.licence.recognise",
    capabilityRef: "federation.licence.recognise",
    targetRef: PRODUCT_REF,
    authorityRefs: ["AUTHORITY:MY-LICENCE-RECOGNITION-001"],
    policyRefs: ["POLICY:IN-MY-CREATOR-FEDERATION-001"],
    representationSourceRefs: [FEDERATION_OBJECT_REF],
    requestedAt: "2026-08-24T00:01:00.000Z",
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function destinationPolicy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY:MY:FEDERATION:001",
    wardenRef: "WARDEN-MY",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T23:55:00.000Z",
    validUntil: "2026-08-24T00:30:00.000Z",
    actorRef: "ENT-MY-BUYER-001",
    representedPrincipalRef: "ENT-MY-BUYER-001",
    actingCapacityRef: "CAPACITY:MY-LICENSEE-001",
    contextRef: "DOMAIN-MY",
    programRef: MISSION_REF,
    requiredAuthorityRefs: ["AUTHORITY:MY-LICENCE-RECOGNITION-001"],
    requiredPolicyRefs: ["POLICY:IN-MY-CREATOR-FEDERATION-001"],
    allowedCapabilityRefs: ["federation.licence.recognise"],
    manualReviewCapabilityRefs: [],
    constraints: ["SYNTHETIC_REFERENCE_ONLY"],
  };
}

function execute(input: {
  sourceRequest?: Partial<WardenDecisionRequestV1>;
  sourcePolicy?: Partial<SyntheticWardenDecisionPolicyV1>;
  destinationRequest?: Partial<WardenDecisionRequestV1>;
}) {
  return executeSyntheticFederatedLicenceR1({
    missionRef: MISSION_REF,
    federationObjectRef: FEDERATION_OBJECT_REF,
    productRef: PRODUCT_REF,
    source: {
      request: sourceRequest(input.sourceRequest),
      policy: sourcePolicy(input.sourcePolicy),
      decidedAt: "2026-08-24T00:00:30.000Z",
    },
    destination: {
      request: destinationRequest(input.destinationRequest),
      policy: destinationPolicy(),
      decidedAt: "2026-08-24T00:01:30.000Z",
    },
    executedAt: "2026-08-24T00:02:00.000Z",
    observedAt: "2026-08-24T00:02:30.000Z",
    verifiedAt: "2026-08-24T00:03:00.000Z",
  });
}

describe("VSR federated licence lineage", () => {
  it("rejects mission, product, correlation and federation-envelope drift before destination authority is evaluated", () => {
    const cases = [
      {
        result: execute({
          sourceRequest: { programRef: "MISSION-OTHER-001" },
          sourcePolicy: { programRef: "MISSION-OTHER-001" },
        }),
        reasonCode: "source_mission_mismatch",
      },
      {
        result: execute({ destinationRequest: { programRef: "MISSION-OTHER-001" } }),
        reasonCode: "destination_mission_mismatch",
      },
      {
        result: execute({ destinationRequest: { targetRef: "PRODUCT-Y-001" } }),
        reasonCode: "destination_product_mismatch",
      },
      {
        result: execute({ destinationRequest: { correlationId: "CORR-OTHER-001" } }),
        reasonCode: "correlation_mismatch",
      },
      {
        result: execute({
          destinationRequest: { representationSourceRefs: ["FEDERATION-OBJECT:OTHER"] },
        }),
        reasonCode: "federation_object_mismatch",
      },
    ] as const;

    for (const testCase of cases) {
      expect(testCase.result.state).toBe("BLOCKED_LINEAGE");
      if (testCase.result.state !== "BLOCKED_LINEAGE") throw new Error("expected_blocked_lineage");
      expect(testCase.result.sourceDecision.decision).toBe("ALLOW");
      expect(testCase.result.reasonCode).toBe(testCase.reasonCode);
      expect("destinationDecision" in testCase.result).toBe(false);
      expect("effectReceipt" in testCase.result).toBe(false);
    }
  });
});
