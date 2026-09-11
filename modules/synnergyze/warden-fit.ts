import type {
  WardenDecisionRequestV1,
  WardenDecisionV1,
  WardenExecutionCheckpointV1,
} from "../warden/contracts.ts";
import type { ResolvedGenesisDeviceContextV1 } from "./genesis-device-bridge.ts";

export type SynnergyzeWardenDecisionRequestInputV1 = Omit<
  WardenDecisionRequestV1,
  | "executionDeviceRef"
  | "deviceSecurityState"
  | "deviceSecurityPolicyRef"
  | "deviceSecuritySourceRefs"
  | "deviceSecurityResolvedAt"
  | "deviceSecurityValidUntil"
> & {
  device: ResolvedGenesisDeviceContextV1;
};

function requireInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

export function buildSynnergyzeWardenDecisionRequestV1(
  input: SynnergyzeWardenDecisionRequestInputV1,
): WardenDecisionRequestV1 {
  const { device, ...request } = input;

  if (device.estateRef !== input.contextRef) {
    throw new Error("synnergyze_warden_device_estate_mismatch");
  }
  if (device.state !== "ACTIVE") {
    throw new Error("synnergyze_warden_device_not_active");
  }

  const requestedAt = requireInstant(
    input.requestedAt,
    "synnergyze_warden_requested_at_invalid",
  );
  const resolvedAt = requireInstant(
    device.resolvedAt,
    "synnergyze_warden_device_resolved_at_invalid",
  );
  if (resolvedAt > requestedAt) {
    throw new Error("synnergyze_warden_device_resolution_from_future");
  }
  if (device.validUntil) {
    const validUntil = requireInstant(
      device.validUntil,
      "synnergyze_warden_device_valid_until_invalid",
    );
    if (requestedAt > validUntil) {
      throw new Error("synnergyze_warden_device_resolution_expired");
    }
  }

  return {
    ...request,
    executionDeviceRef: device.deviceRef,
    deviceSecurityState: "ACTIVE",
    deviceSecuritySourceRefs: [
      device.genesisResolutionRef,
      device.attestationRef,
      ...device.sourceEvidenceRefs,
    ],
    deviceSecurityResolvedAt: device.resolvedAt,
    deviceSecurityValidUntil: device.validUntil,
  };
}

export function assertSynnergyzeExecutionCheckpointV1(
  request: WardenDecisionRequestV1,
  decision: WardenDecisionV1,
  checkpoint: WardenExecutionCheckpointV1,
): void {
  if (decision.decision !== "ALLOW") {
    throw new Error(`synnergyze_warden_decision_not_allow:${decision.decision}`);
  }
  if (decision.requestRef !== request.requestRef) {
    throw new Error("synnergyze_warden_decision_request_mismatch");
  }
  if (decision.action !== request.action) {
    throw new Error("synnergyze_warden_decision_action_mismatch");
  }
  if (decision.targetRef !== request.targetRef) {
    throw new Error("synnergyze_warden_decision_target_mismatch");
  }
  if (decision.correlationId !== request.correlationId) {
    throw new Error("synnergyze_warden_decision_correlation_mismatch");
  }

  if (checkpoint.state !== "VALID") {
    throw new Error(`synnergyze_warden_checkpoint_not_valid:${checkpoint.state}`);
  }
  if (checkpoint.decisionRef !== decision.decisionRef) {
    throw new Error("synnergyze_warden_checkpoint_decision_mismatch");
  }
  if (checkpoint.wardenRef !== decision.wardenRef) {
    throw new Error("synnergyze_warden_checkpoint_warden_mismatch");
  }
  if (checkpoint.correlationId !== decision.correlationId) {
    throw new Error("synnergyze_warden_checkpoint_correlation_mismatch");
  }

  const checkedAt = requireInstant(
    checkpoint.checkedAt,
    "synnergyze_warden_checkpoint_checked_at_invalid",
  );
  const decidedAt = requireInstant(
    decision.decidedAt,
    "synnergyze_warden_decided_at_invalid",
  );
  if (checkedAt < decidedAt) {
    throw new Error("synnergyze_warden_checkpoint_before_decision");
  }
  if (!decision.validUntil) {
    throw new Error("synnergyze_warden_decision_valid_until_required");
  }
  const validUntil = requireInstant(
    decision.validUntil,
    "synnergyze_warden_decision_valid_until_invalid",
  );
  if (checkedAt > validUntil) {
    throw new Error("synnergyze_warden_checkpoint_after_decision_expiry");
  }
}
