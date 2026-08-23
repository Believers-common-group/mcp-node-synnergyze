import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import type { SyntheticWardenDecisionPolicyV1 } from "../warden/decision-service.ts";
import { executeSyntheticFederatedLicenceR1 } from "./runtime.ts";

const MISSION_REF = "MISSION-CREATOR-CROSSBORDER-001";
const PRODUCT_REF = "PRODUCT-X-001";
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
    requestedEffect: "licence_state.releasable_to_destination",
    authorityRefs: ["AUTHORITY:IP-LICENSOR-001"],
    policyRefs: ["POLICY:IN-MY-CREATOR-FEDERATION-001"],
    representationSourceRefs: ["GENESIS:CREATOR-IP-RELATIONSHIP-001"],
    requestedAt: "2026-08-24T00:00:00.000Z",
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function sourcePolicy(): SyntheticWardenDecisionPolicyV1 {
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
    constraints: ["NO_FOREIGN_DIRECT_STATE_MUTATION", "SYNTHETIC_REFERENCE_ONLY"],
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
    requestedEffect: "licence_state.recognised_in_destination",
    authorityRefs: ["AUTHORITY:MY-LICENCE-RECOGNITION-001"],
    policyRefs: ["POLICY:IN-MY-CREATOR-FEDERATION-001"],
    representationSourceRefs: ["FEDERATION-OBJECT:IN-MY:LICENCE:001"],
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
    constraints: ["DESTINATION_AUTHORITY_REQUIRED", "SYNTHETIC_REFERENCE_ONLY"],
  };
}

function execute(
  overrides: {
    sourceRequest?: Partial<WardenDecisionRequestV1>;
    destinationRequest?: Partial<WardenDecisionRequestV1>;
    sourcePolicy?: Partial<SyntheticWardenDecisionPolicyV1>;
    destinationPolicy?: Partial<SyntheticWardenDecisionPolicyV1>;
  } = {},
) {
  return executeSyntheticFederatedLicenceR1({
    missionRef: MISSION_REF,
    federationObjectRef: "FEDERATION-OBJECT:IN-MY:LICENCE:001",
    productRef: PRODUCT_REF,
    source: {
      request: sourceRequest(overrides.sourceRequest),
      policy: { ...sourcePolicy(), ...overrides.sourcePolicy },
      decidedAt: "2026-08-24T00:00:30.000Z",
    },
    destination: {
      request: destinationRequest(overrides.destinationRequest),
      policy: { ...destinationPolicy(), ...overrides.destinationPolicy },
      decidedAt: "2026-08-24T00:01:30.000Z",
    },
    executedAt: "2026-08-24T00:02:00.000Z",
    observedAt: "2026-08-24T00:02:30.000Z",
    verifiedAt: "2026-08-24T00:03:00.000Z",
  });
}

describe("VSR-FEDERATED-MISSION-REFERENCE-001 R1.0", () => {
  it("creates a Malaysian licence effect only after independent source and destination Warden ALLOW decisions", () => {
    const result = execute();

    expect(result.state).toBe("COMPLETED");
    if (result.state !== "COMPLETED") throw new Error("expected_completed");

    expect(result.sourceDecision.decision).toBe("ALLOW");
    expect(result.destinationDecision.decision).toBe("ALLOW");
    expect(result.localRecognition.domainRef).toBe("DOMAIN-MY");
    expect(result.localRecognition.createdByWardenRef).toBe("WARDEN-MY");
    expect(result.localRecognition.sourceDecisionRef).toBe(result.sourceDecision.decisionRef);
    expect(result.localRecognition.destinationDecisionRef).toBe(result.destinationDecision.decisionRef);
    expect(result.localRecognition.effectRef).toBe(result.effectReceipt.effectRef);
    expect(result.effectReceipt.observedStateRef).toContain("LICENCE_RECOGNISED");
    expect(result.riverEventReceipt.correlationId).toBe(CORRELATION_ID);
  });

  it("returns a blocked destination result and creates no local effect when the Malaysian Warden denies", () => {
    const result = execute({ destinationPolicy: { lifecycle: "REVOKED" } });

    expect(result.state).toBe("BLOCKED_DESTINATION");
    if (result.state !== "BLOCKED_DESTINATION") throw new Error("expected_blocked_destination");

    expect(result.sourceDecision.decision).toBe("ALLOW");
    expect(result.destinationDecision.decision).toBe("DENY");
    expect(result.destinationDecision.reasonCodes).toEqual(["authority_revoked"]);
    expect("localRecognition" in result).toBe(false);
    expect("riverEventReceipt" in result).toBe(false);
    expect("effectReceipt" in result).toBe(false);
  });

  it("routes the destination effect through the existing River reservation, controlled execution and effect-verification lineage", () => {
    const result = execute();

    expect(result.state).toBe("COMPLETED");
    if (result.state !== "COMPLETED") throw new Error("expected_completed");

    expect(result.reservation.wardenDecisionRef).toBe(result.destinationDecision.decisionRef);
    expect(result.executionReceipt.state).toBe("EXECUTED_UNVERIFIED");
    expect(result.executionReceipt.wardenDecisionRef).toBe(result.destinationDecision.decisionRef);
    expect(result.executionReceipt.reservationRef).toBe(result.reservation.reservationRef);
    expect(result.observation.executionReceiptRef).toBe(result.executionReceipt.receiptRef);
    expect(result.effectReceipt.executionReceiptRef).toBe(result.executionReceipt.receiptRef);
    expect(result.effectReceipt.reservationRef).toBe(result.reservation.reservationRef);
    expect(result.effectReceipt.wardenDecisionRef).toBe(result.destinationDecision.decisionRef);
  });

  it("returns a blocked source result before destination execution when the Indian Warden denies licensing authority", () => {
    const result = execute({ sourcePolicy: { lifecycle: "REVOKED" } });

    expect(result.state).toBe("BLOCKED_SOURCE");
    if (result.state !== "BLOCKED_SOURCE") throw new Error("expected_blocked_source");

    expect(result.sourceDecision.decision).toBe("DENY");
    expect(result.sourceDecision.reasonCodes).toEqual(["authority_revoked"]);
    expect("destinationDecision" in result).toBe(false);
    expect("reservation" in result).toBe(false);
    expect("executionReceipt" in result).toBe(false);
    expect("effectReceipt" in result).toBe(false);
  });

  it("blocks federation lineage before the destination Warden when the source licence targets a different product", () => {
    const result = execute({ sourceRequest: { targetRef: "PRODUCT-Y-001" } });

    expect(result.state).toBe("BLOCKED_LINEAGE");
    if (result.state !== "BLOCKED_LINEAGE") throw new Error("expected_blocked_lineage");

    expect(result.sourceDecision.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe("source_product_mismatch");
    expect("destinationDecision" in result).toBe(false);
    expect("reservation" in result).toBe(false);
    expect("effectReceipt" in result).toBe(false);
  });
});
