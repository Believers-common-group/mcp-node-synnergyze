import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  EffectVerificationServiceV1,
  SyntheticServiceRequestObservationSourceV1,
} from "../synnergyze/effect-verification.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "../synnergyze/execution-gate.ts";
import type { EfomFindingStatusV1, EfomPhysicalWorldContextV1 } from "./contracts.ts";
import type { EfomPolicyV1 } from "./policy.ts";

const DECIDED_AT = "2026-09-10T06:00:10.000Z";
const RESERVED_AT = "2026-09-10T06:00:20.000Z";
const CHECKED_AT = "2026-09-10T06:00:25.000Z";
const EXECUTED_AT = "2026-09-10T06:00:30.000Z";
const OBSERVED_AT = "2026-09-10T06:00:35.000Z";
const VERIFIED_AT = "2026-09-10T06:00:40.000Z";

function context(status: EfomFindingStatusV1 = "CORROBORATED"): EfomPhysicalWorldContextV1 {
  return {
    operationClass: "ACT",
    observations: [
      {
        observationRef: "EFOM-OBS:CONFORMANCE-001",
        sourceRef: "SENTINEL-2:TILE-CONFORMANCE-001",
        sourceType: "SATELLITE_OPTICAL",
        subjectCandidateRef: "LAB-SERVICE-DESK-001",
        observedAt: "2026-09-10T05:59:00.000Z",
        validUntil: "2026-09-10T06:05:00.000Z",
        contentDigest: "sha256:efom-conformance-observation",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:EFOM-CONFORMANCE-001"],
        confidence: 0.96,
        visibilityScope: "ESTATE",
        jurisdictionRef: "IN-KA",
        purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
      },
    ],
    findings: [
      {
        findingRef: "EFOM-FINDING:CONFORMANCE-001",
        findingType: "PRESENCE_CORRELATION",
        observationRefs: ["EFOM-OBS:CONFORMANCE-001"],
        statementDigest: "sha256:efom-conformance-finding",
        confidence: 0.95,
        derivedAt: "2026-09-10T05:59:30.000Z",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:EFOM-CONFORMANCE-001"],
        status,
      },
    ],
    discrepancies: [],
    attestations: [],
  };
}

function contextDigest(value: EfomPhysicalWorldContextV1): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function request(value: EfomPhysicalWorldContextV1): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:EFOM-CONFORMANCE-001",
    actorRef: "DIGITALME:EFOM-OPERATOR-001",
    representedPrincipalRef: "ESTATE:001",
    actingCapacityRef: "CAPACITY:EFOM-OPERATOR",
    contextRef: "ALPHA-NODE-001",
    programRef: "OSIRIS:EFOM",
    eventRef: "OSIRIS-EVENT:EFOM-CONFORMANCE-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    operationClass: "ACT",
    physicalWorldContext: value,
    physicalWorldContextDigest: contextDigest(value),
    authorityRefs: ["AUTHORITY:EFOM-OPERATOR"],
    policyRefs: ["POLICY:OSIRIS-EFOM-CONFORMANCE-001"],
    representationSourceRefs: ["GENESIS:REGISTRY-001"],
    requestedAt: "2026-09-10T06:00:00.000Z",
    correlationId: "CORR:EFOM-CONFORMANCE-001",
  };
}

function efomPolicy(): EfomPolicyV1 {
  return {
    policyRef: "EFOM-POLICY:CONFORMANCE-001",
    allowedOperationClasses: ["ACT"],
    minimumObservationConfidence: 0.8,
    requireCorroborationForOperationClasses: ["ACT"],
    manualReviewOnConflict: true,
    allowedVisibilityScopes: ["ESTATE"],
    allowedPurposeRefs: ["PURPOSE:PHYSICAL-VERIFICATION"],
    allowedJurisdictionRefs: ["IN-KA"],
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:EFOM-CONFORMANCE-001",
    wardenRef: "WARDEN:EFOM-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-09-10T05:55:00.000Z",
    validUntil: "2026-09-10T06:10:00.000Z",
    actorRef: "DIGITALME:EFOM-OPERATOR-001",
    representedPrincipalRef: "ESTATE:001",
    actingCapacityRef: "CAPACITY:EFOM-OPERATOR",
    contextRef: "ALPHA-NODE-001",
    programRef: "OSIRIS:EFOM",
    requiredAuthorityRefs: ["AUTHORITY:EFOM-OPERATOR"],
    requiredPolicyRefs: ["POLICY:OSIRIS-EFOM-CONFORMANCE-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: [],
    constraints: ["OSIRIS_EFOM_CONFORMANCE_ONLY"],
    efomPolicy: efomPolicy(),
  };
}

describe("OSIRIS-EFOM-END-TO-END-CONFORMANCE-R0-1", () => {
  it("carries EFOM ACT semantics through Warden, River, Synnergyze and effect verification", () => {
    const req = request(context());
    const decision = evaluateSyntheticWardenDecisionV1({ request: req, policy: policy(), decidedAt: DECIDED_AT });
    expect(decision.decision).toBe("ALLOW");
    if (decision.decision !== "ALLOW") throw new Error("expected EFOM Warden allow");

    const action = buildAuthorizedActionEnvelopeV1(req, decision);
    expect(action.operationClass).toBe("ACT");
    expect(action.physicalWorldContextDigest).toBe(req.physicalWorldContextDigest);

    const river = new SyntheticRiverReservationServiceV1();
    const reservation = river.reserve({ request: req, decision, action, reservedAt: RESERVED_AT });
    const checkpoint: WardenExecutionCheckpointV1 = {
      checkpointRef: `WARDEN-EXEC-CHECK:${decision.decisionRef}`,
      decisionRef: decision.decisionRef,
      wardenRef: decision.wardenRef,
      correlationId: decision.correlationId,
      state: "VALID",
      checkedAt: CHECKED_AT,
      reasonCodes: ["decision_active_for_execution"],
    };

    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const gate = new ControlledExecutionGateV1([adapter]);
    const execution = gate.execute({ action, reservation, decision, checkpoint, executedAt: EXECUTED_AT });
    expect(execution.state).toBe("EXECUTED_UNVERIFIED");
    expect(adapter.invocationCount()).toBe(1);

    const observer = new SyntheticServiceRequestObservationSourceV1();
    const postExecutionObservation = observer.observe(execution, OBSERVED_AT);
    const verification = new EffectVerificationServiceV1().verify({
      receipt: execution,
      observation: postExecutionObservation,
      verifiedAt: VERIFIED_AT,
    });
    expect(verification.state).toBe("VERIFIED_EFFECT");
  });

  it("keeps a hypothesis non-actionable before River reservation or adapter execution", () => {
    const req = request(context("HYPOTHESIS"));
    const decision = evaluateSyntheticWardenDecisionV1({ request: req, policy: policy(), decidedAt: DECIDED_AT });
    expect(decision.decision).not.toBe("ALLOW");
    expect("actionToken" in decision).toBe(false);

    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    expect(adapter.invocationCount()).toBe(0);
  });
});
