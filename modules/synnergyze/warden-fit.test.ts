import { describe, expect, it } from "vitest";

import type { ResolvedGenesisDeviceContextV1 } from "./genesis-device-bridge.ts";
import {
  buildSynnergyzeWardenDecisionRequestV1,
  assertSynnergyzeExecutionCheckpointV1,
} from "./warden-fit.ts";

const device: ResolvedGenesisDeviceContextV1 = {
  genesisResolutionRef: "GENESIS-DEVICE-RESOLUTION:001",
  deviceRef: "GENESIS-DEVICE:LG-GRAM-001",
  estateRef: "GENESIS-ESTATE-001",
  locationRef: "GENESIS-LOCATION-001",
  runtimeInstanceRef: "GENESIS-RUNTIME-001",
  state: "ACTIVE",
  assuranceLevel: "L1",
  sourceEvidenceRefs: ["RIVER-EVIDENCE:DEVICE-001"],
  attestationRef: "GENESIS-DEVICE-ATTESTATION:001",
  resolvedAt: "2026-09-11T03:30:00.000Z",
  validUntil: "2026-09-11T04:30:00.000Z",
};

describe("SYNNERGYZE-WARDEN-FIT-R0.1", () => {
  it("binds the current Genesis device resolution into the Warden request without granting authority", () => {
    const request = buildSynnergyzeWardenDecisionRequestV1({
      requestRef: "WARDEN-REQUEST:001",
      actorRef: "DIGITALME:FAIZ",
      representedPrincipalRef: "DIGITALME:FAIZ",
      actingCapacityRef: "CAPACITY:ESTATE-OPERATOR",
      contextRef: "GENESIS-ESTATE-001",
      programRef: "SYNNERGYZE-PROGRAM:001",
      eventRef: "SYNNERGYZE-EVENT:001",
      action: "artifact.write",
      capabilityRef: "CAPABILITY:ARTIFACT-WRITE",
      targetRef: "ESTATE-TEST-ARTIFACT:001",
      requestedEffect: "sha256:requested-effect",
      authorityRefs: ["AUTHORITY:ESTATE-OPERATOR"],
      policyRefs: ["POLICY:ESTATE-GOLD-PROOF"],
      representationSourceRefs: ["GENESIS:REPRESENTATION:001"],
      requestedAt: "2026-09-11T03:35:00.000Z",
      correlationId: "CORR:EGP-001",
      device,
    });

    expect(request.executionDeviceRef).toBe(device.deviceRef);
    expect(request.deviceSecurityState).toBe("ACTIVE");
    expect(request.deviceSecuritySourceRefs).toEqual([
      device.genesisResolutionRef,
      device.attestationRef,
      ...device.sourceEvidenceRefs,
    ]);
    expect(request.deviceSecurityResolvedAt).toBe(device.resolvedAt);
    expect(request.deviceSecurityValidUntil).toBe(device.validUntil);
    expect(request.authorityRefs).toEqual(["AUTHORITY:ESTATE-OPERATOR"]);
  });

  it("rejects a Genesis device resolution from another estate", () => {
    expect(() =>
      buildSynnergyzeWardenDecisionRequestV1({
        requestRef: "WARDEN-REQUEST:002",
        actorRef: "DIGITALME:FAIZ",
        representedPrincipalRef: "DIGITALME:FAIZ",
        actingCapacityRef: "CAPACITY:ESTATE-OPERATOR",
        contextRef: "GENESIS-ESTATE-002",
        programRef: "SYNNERGYZE-PROGRAM:001",
        eventRef: "SYNNERGYZE-EVENT:002",
        action: "artifact.write",
        capabilityRef: "CAPABILITY:ARTIFACT-WRITE",
        targetRef: "ESTATE-TEST-ARTIFACT:001",
        requestedEffect: "sha256:requested-effect",
        authorityRefs: ["AUTHORITY:ESTATE-OPERATOR"],
        policyRefs: ["POLICY:ESTATE-GOLD-PROOF"],
        representationSourceRefs: ["GENESIS:REPRESENTATION:001"],
        requestedAt: "2026-09-11T03:35:00.000Z",
        correlationId: "CORR:EGP-002",
        device,
      }),
    ).toThrow("synnergyze_warden_device_estate_mismatch");
  });

  it("rejects an expired Genesis device resolution before Warden evaluation", () => {
    expect(() =>
      buildSynnergyzeWardenDecisionRequestV1({
        requestRef: "WARDEN-REQUEST:003",
        actorRef: "DIGITALME:FAIZ",
        representedPrincipalRef: "DIGITALME:FAIZ",
        actingCapacityRef: "CAPACITY:ESTATE-OPERATOR",
        contextRef: "GENESIS-ESTATE-001",
        programRef: "SYNNERGYZE-PROGRAM:001",
        eventRef: "SYNNERGYZE-EVENT:003",
        action: "artifact.write",
        capabilityRef: "CAPABILITY:ARTIFACT-WRITE",
        targetRef: "ESTATE-TEST-ARTIFACT:001",
        requestedEffect: "sha256:requested-effect",
        authorityRefs: ["AUTHORITY:ESTATE-OPERATOR"],
        policyRefs: ["POLICY:ESTATE-GOLD-PROOF"],
        representationSourceRefs: ["GENESIS:REPRESENTATION:001"],
        requestedAt: "2026-09-11T04:31:00.000Z",
        correlationId: "CORR:EGP-003",
        device,
      }),
    ).toThrow("synnergyze_warden_device_resolution_expired");
  });

  it("accepts only a current VALID checkpoint bound to the exact ALLOW decision", () => {
    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        {
          decisionRef: "WARDEN-DECISION:001",
          requestRef: "WARDEN-REQUEST:001",
          wardenRef: "WARDEN:ESTATE-001",
          action: "artifact.write",
          targetRef: "ESTATE-TEST-ARTIFACT:001",
          reasonCodes: ["bounded_policy_allow"],
          constraints: [],
          decidedAt: "2026-09-11T03:36:00.000Z",
          validUntil: "2026-09-11T04:00:00.000Z",
          correlationId: "CORR:EGP-001",
          decision: "ALLOW",
          actionToken: "WARDEN-ACTION-TOKEN:test",
        },
        {
          checkpointRef: "WARDEN-CHECKPOINT:001",
          decisionRef: "WARDEN-DECISION:001",
          wardenRef: "WARDEN:ESTATE-001",
          correlationId: "CORR:EGP-001",
          state: "VALID",
          checkedAt: "2026-09-11T03:37:00.000Z",
          reasonCodes: [],
        },
      ),
    ).not.toThrow();
  });

  it("fails closed when the Warden checkpoint is revoked before execution", () => {
    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        {
          decisionRef: "WARDEN-DECISION:001",
          requestRef: "WARDEN-REQUEST:001",
          wardenRef: "WARDEN:ESTATE-001",
          action: "artifact.write",
          targetRef: "ESTATE-TEST-ARTIFACT:001",
          reasonCodes: ["bounded_policy_allow"],
          constraints: [],
          decidedAt: "2026-09-11T03:36:00.000Z",
          validUntil: "2026-09-11T04:00:00.000Z",
          correlationId: "CORR:EGP-001",
          decision: "ALLOW",
          actionToken: "WARDEN-ACTION-TOKEN:test",
        },
        {
          checkpointRef: "WARDEN-CHECKPOINT:002",
          decisionRef: "WARDEN-DECISION:001",
          wardenRef: "WARDEN:ESTATE-001",
          correlationId: "CORR:EGP-001",
          state: "REVOKED",
          checkedAt: "2026-09-11T03:37:00.000Z",
          reasonCodes: ["authority_revoked"],
        },
      ),
    ).toThrow("synnergyze_warden_checkpoint_not_valid:REVOKED");
  });
});
