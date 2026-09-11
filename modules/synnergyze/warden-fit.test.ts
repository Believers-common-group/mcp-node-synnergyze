import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1, WardenDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
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

function validRequest(): WardenDecisionRequestV1 {
  return buildSynnergyzeWardenDecisionRequestV1({
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
}

function allowDecision(overrides: Partial<WardenDecisionV1> = {}): WardenDecisionV1 {
  return {
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
    ...overrides,
  } as WardenDecisionV1;
}

function validCheckpoint(
  overrides: Partial<WardenExecutionCheckpointV1> = {},
): WardenExecutionCheckpointV1 {
  return {
    checkpointRef: "WARDEN-CHECKPOINT:001",
    decisionRef: "WARDEN-DECISION:001",
    wardenRef: "WARDEN:ESTATE-001",
    correlationId: "CORR:EGP-001",
    state: "VALID",
    checkedAt: "2026-09-11T03:37:00.000Z",
    reasonCodes: [],
    ...overrides,
  };
}

describe("SYNNERGYZE-WARDEN-FIT-R0.1", () => {
  it("binds the current Genesis device resolution into the Warden request without granting authority", () => {
    const request = validRequest();

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
        ...validRequest(),
        contextRef: "GENESIS-ESTATE-002",
        device,
      }),
    ).toThrow("synnergyze_warden_device_estate_mismatch");
  });

  it("rejects an expired Genesis device resolution before Warden evaluation", () => {
    expect(() =>
      buildSynnergyzeWardenDecisionRequestV1({
        ...validRequest(),
        requestedAt: "2026-09-11T04:31:00.000Z",
        device,
      }),
    ).toThrow("synnergyze_warden_device_resolution_expired");
  });

  it("accepts only a current VALID checkpoint bound to the exact request and ALLOW decision", () => {
    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        validRequest(),
        allowDecision(),
        validCheckpoint(),
      ),
    ).not.toThrow();
  });

  it("fails closed on DENY and ESCALATE decisions", () => {
    const request = validRequest();
    const base = allowDecision();

    const deny: WardenDecisionV1 = {
      ...base,
      decision: "DENY",
      reasonCodes: ["policy_denied"],
      actionToken: undefined as never,
    };
    const escalate: WardenDecisionV1 = {
      ...base,
      decision: "ESCALATE",
      reasonCodes: ["manual_review_required"],
      actionToken: undefined as never,
    };

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(request, deny, validCheckpoint()),
    ).toThrow("synnergyze_warden_decision_not_allow:DENY");
    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(request, escalate, validCheckpoint()),
    ).toThrow("synnergyze_warden_decision_not_allow:ESCALATE");
  });

  it("fails closed when the ALLOW decision is not for the exact Synnergyze request", () => {
    const request = validRequest();

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        allowDecision({ requestRef: "WARDEN-REQUEST:OTHER" }),
        validCheckpoint(),
      ),
    ).toThrow("synnergyze_warden_decision_request_mismatch");

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        allowDecision({ action: "artifact.delete" }),
        validCheckpoint(),
      ),
    ).toThrow("synnergyze_warden_decision_action_mismatch");

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        allowDecision({ targetRef: "ESTATE-TEST-ARTIFACT:OTHER" }),
        validCheckpoint(),
      ),
    ).toThrow("synnergyze_warden_decision_target_mismatch");

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        allowDecision({ correlationId: "CORR:OTHER" }),
        validCheckpoint(),
      ),
    ).toThrow("synnergyze_warden_decision_correlation_mismatch");
  });

  it("fails closed when the Warden checkpoint is revoked before execution", () => {
    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        validRequest(),
        allowDecision(),
        validCheckpoint({ state: "REVOKED", reasonCodes: ["authority_revoked"] }),
      ),
    ).toThrow("synnergyze_warden_checkpoint_not_valid:REVOKED");
  });

  it("fails closed when checkpoint lineage does not match the ALLOW decision", () => {
    const request = validRequest();
    const decision = allowDecision();

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        decision,
        validCheckpoint({ decisionRef: "WARDEN-DECISION:OTHER" }),
      ),
    ).toThrow("synnergyze_warden_checkpoint_decision_mismatch");

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        decision,
        validCheckpoint({ wardenRef: "WARDEN:OTHER" }),
      ),
    ).toThrow("synnergyze_warden_checkpoint_warden_mismatch");

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        decision,
        validCheckpoint({ correlationId: "CORR:OTHER" }),
      ),
    ).toThrow("synnergyze_warden_checkpoint_correlation_mismatch");
  });

  it("fails closed when checkpoint timing is before the decision or after decision expiry", () => {
    const request = validRequest();
    const decision = allowDecision();

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        decision,
        validCheckpoint({ checkedAt: "2026-09-11T03:35:59.000Z" }),
      ),
    ).toThrow("synnergyze_warden_checkpoint_before_decision");

    expect(() =>
      assertSynnergyzeExecutionCheckpointV1(
        request,
        decision,
        validCheckpoint({ checkedAt: "2026-09-11T04:00:01.000Z" }),
      ),
    ).toThrow("synnergyze_warden_checkpoint_after_decision_expiry");
  });
});
