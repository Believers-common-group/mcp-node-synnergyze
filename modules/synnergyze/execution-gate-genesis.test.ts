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
import type { ResolvedDeviceSecurityContextV1 } from "./contracts.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";

const REQUESTED_AT = "2026-09-12T05:10:00.000Z";
const DECIDED_AT = "2026-09-12T05:11:00.000Z";
const RESERVED_AT = "2026-09-12T05:11:00.000Z";
const CHECKED_AT = "2026-09-12T05:12:00.000Z";
const EXECUTED_AT = "2026-09-12T05:13:00.000Z";

function request(): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:EXEC-GENESIS-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:EXEC-GENESIS-001",
    eventRef: "SYNNERGYZE-EVENT:EXEC-GENESIS-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    executionDeviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    genesisDevice: {
      resolutionRef: "GENESIS-DEVICE-RESOLUTION:execgen001",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      estateRef: "GENESIS-ESTATE-001",
      attestationRef: "GENESIS-DEVICE-ATTESTATION-EXEC-GENESIS-001",
      assuranceLevel: "L3",
      evidenceRefs: ["RIVER-DEVICE-EVIDENCE-EXEC-GENESIS-001"],
      resolvedAt: "2026-09-12T05:00:00.000Z",
      validUntil: "2026-09-12T06:00:00.000Z",
    },
    deviceSecurityState: "ACTIVE",
    deviceSecurityPolicyRef: "DEVICE-SECURITY-POLICY-001",
    deviceSecuritySourceRefs: [
      "DEVICE-SECURITY-RESOLUTION-001",
      "DEVICE-SECURITY-EVIDENCE-001",
    ],
    deviceSecurityResolvedAt: "2026-09-12T05:00:00.000Z",
    deviceSecurityValidUntil: "2026-09-12T06:00:00.000Z",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["GENESIS-REPRESENTATION-001"],
    requestedAt: REQUESTED_AT,
    correlationId: "CORR:EXEC-GENESIS-001",
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:EXEC-GENESIS-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:EXEC-GENESIS-001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
  };
}

function executionDeviceSecurity(): ResolvedDeviceSecurityContextV1 {
  return {
    resolutionRef: "DEVICE-SECURITY-RESOLUTION-001",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    state: "ACTIVE",
    policyRef: "DEVICE-SECURITY-POLICY-001",
    evidenceRef: "DEVICE-SECURITY-EVIDENCE-001",
    assuranceLevel: "L3",
    resolvedAt: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
  };
}

describe("controlled execution Genesis provenance replay binding", () => {
  it("fails closed when the same authorized action is replayed with a different Genesis digest", () => {
    const requestValue = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: requestValue,
      policy: policy(),
      decidedAt: DECIDED_AT,
    });
    if (decision.decision !== "ALLOW") throw new Error("expected_allow");

    const action = buildAuthorizedActionEnvelopeV1(requestValue, decision);
    const river = new SyntheticRiverReservationServiceV1();
    const reservation = river.reserve({
      request: requestValue,
      decision,
      action,
      reservedAt: RESERVED_AT,
    });
    const checkpoint: WardenExecutionCheckpointV1 = {
      checkpointRef: "WARDEN-EXEC-CHECK:EXEC-GENESIS-001",
      decisionRef: decision.decisionRef,
      wardenRef: decision.wardenRef,
      correlationId: decision.correlationId,
      state: "VALID",
      checkedAt: CHECKED_AT,
      reasonCodes: ["runtime_activation_r0.1_checkpoint_valid"],
    };
    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const gate = new ControlledExecutionGateV1([adapter]);
    const executionSecurity = executionDeviceSecurity();

    gate.execute({
      action,
      reservation,
      decision,
      checkpoint,
      executionDeviceSecurity: executionSecurity,
      executedAt: EXECUTED_AT,
    });

    expect(() =>
      gate.execute({
        action: {
          ...action,
          genesisDeviceRequestDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
        reservation,
        decision,
        checkpoint,
        executionDeviceSecurity: executionSecurity,
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("execution_idempotency_conflict");
    expect(adapter.invocationCount()).toBe(1);
  });
});
