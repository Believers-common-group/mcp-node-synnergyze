import { describe, expect, it } from "vitest";

import type { EfomPhysicalWorldContextV1 } from "./contracts.ts";
import type { EfomPolicyV1 } from "./policy.ts";
import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  physicalWorldContextDigestV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";

const DECIDED_AT = "2026-09-10T07:00:00.000Z";

function historicalContext(): EfomPhysicalWorldContextV1 {
  return {
    operationClass: "OBSERVE",
    observations: [
      {
        observationRef: "EFOM-OBS:HISTORICAL-001",
        sourceRef: "SENTINEL-2:HISTORICAL-001",
        sourceType: "SATELLITE_OPTICAL",
        observedAt: "2026-09-10T05:00:00.000Z",
        validUntil: "2026-09-10T06:30:00.000Z",
        contentDigest: "sha256:historical-observation",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:HISTORICAL-001"],
        confidence: 0.95,
        visibilityScope: "ESTATE",
        jurisdictionRef: "IN-KA",
        purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
      },
    ],
    findings: [],
    discrepancies: [],
    attestations: [],
  };
}

function efomPolicy(): EfomPolicyV1 {
  return {
    policyRef: "EFOM-POLICY:HISTORICAL-001",
    allowedOperationClasses: ["OBSERVE"],
    minimumObservationConfidence: 0.8,
    requireCorroborationForOperationClasses: [],
    manualReviewOnConflict: true,
    allowedVisibilityScopes: ["ESTATE"],
    allowedPurposeRefs: ["PURPOSE:PHYSICAL-VERIFICATION"],
    allowedJurisdictionRefs: ["IN-KA"],
  };
}

describe("OSIRIS-EFOM-HISTORICAL-GRANT-VALIDITY-R0-1", () => {
  it("does not issue an already-expired Warden grant for admissible historical observation", () => {
    const context = historicalContext();
    const request: WardenDecisionRequestV1 = {
      requestRef: "WARDEN-REQUEST:HISTORICAL-001",
      actorRef: "DIGITALME:HISTORICAL-OPERATOR",
      representedPrincipalRef: "ESTATE:HISTORICAL",
      actingCapacityRef: "CAPACITY:OBSERVER",
      contextRef: "GENESIS-NODE:HISTORICAL",
      programRef: "OSIRIS:EFOM",
      eventRef: "EVENT:HISTORICAL-001",
      action: "efom.observe",
      capabilityRef: "efom.observe",
      targetRef: "GEN-NODE:HISTORICAL",
      operationClass: "OBSERVE",
      physicalWorldContext: context,
      physicalWorldContextDigest: physicalWorldContextDigestV1(context),
      authorityRefs: ["AUTHORITY:OBSERVER"],
      policyRefs: ["POLICY:HISTORICAL"],
      representationSourceRefs: ["GENESIS:REGISTRY"],
      requestedAt: "2026-09-10T06:59:00.000Z",
      correlationId: "CORR:HISTORICAL-001",
    };
    const policy: SyntheticWardenDecisionPolicyV1 = {
      policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:HISTORICAL-001",
      wardenRef: "WARDEN:HISTORICAL-001",
      lifecycle: "ACTIVE",
      validFrom: "2026-09-10T06:55:00.000Z",
      validUntil: "2026-09-10T07:10:00.000Z",
      actorRef: request.actorRef,
      representedPrincipalRef: request.representedPrincipalRef,
      actingCapacityRef: request.actingCapacityRef,
      contextRef: request.contextRef,
      programRef: request.programRef,
      requiredAuthorityRefs: ["AUTHORITY:OBSERVER"],
      requiredPolicyRefs: ["POLICY:HISTORICAL"],
      allowedCapabilityRefs: ["efom.observe"],
      manualReviewCapabilityRefs: [],
      constraints: [],
      efomPolicy: efomPolicy(),
    };

    const decision = evaluateSyntheticWardenDecisionV1({ request, policy, decidedAt: DECIDED_AT });
    expect(decision.decision).toBe("ALLOW");
    expect(decision.validUntil).toBe("2026-09-10T07:10:00.000Z");
    expect(Date.parse(decision.validUntil ?? "")).toBeGreaterThan(Date.parse(DECIDED_AT));
  });
});
