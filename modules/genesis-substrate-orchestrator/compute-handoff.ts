import type { ComputeGrant, ComputeIntent } from "../../compute/runtime.ts";
import type {
  CapacityReservationV1,
  PlacementPlanV1,
  SubstrateWardenBindingV1,
  WorkloadRequirementV1,
} from "./contracts.ts";

export interface SubstrateRuntimeBindingV1 {
  substrateInstanceRef: string;
  runnerId: string;
  provider: ComputeIntent["provider"];
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function validateReservation(input: {
  workload: WorkloadRequirementV1;
  placement: PlacementPlanV1;
  reservation: CapacityReservationV1;
  runtimeBinding: SubstrateRuntimeBindingV1;
  handedOffAtMs: number;
}): void {
  if (input.reservation.status !== "AUTHORIZED") {
    throw new Error("handoff_reservation_not_authorized");
  }
  if (
    input.reservation.correlationId !== input.workload.correlationId ||
    input.reservation.workloadRef !== input.workload.workloadRef ||
    input.reservation.placementRef !== input.placement.placementRef ||
    input.placement.correlationId !== input.workload.correlationId ||
    input.placement.workloadRef !== input.workload.workloadRef
  ) {
    throw new Error("handoff_reservation_mismatch");
  }

  const reservationExpiresAtMs = parseInstant(
    input.reservation.expiresAt,
    "invalid_reservation_expiry",
  );
  if (input.handedOffAtMs >= reservationExpiresAtMs) {
    throw new Error("reservation_expired");
  }

  if (
    !input.placement.primarySubstrateInstanceRef ||
    input.placement.primarySubstrateInstanceRef !== input.reservation.substrateInstanceRef ||
    input.runtimeBinding.substrateInstanceRef !== input.reservation.substrateInstanceRef
  ) {
    throw new Error("handoff_substrate_mismatch");
  }
}

function validateWardenBinding(input: {
  workload: WorkloadRequirementV1;
  reservation: CapacityReservationV1;
  binding: SubstrateWardenBindingV1;
  handedOffAtMs: number;
}): void {
  if (input.binding.decision !== "ALLOW") {
    throw new Error("warden_decision_denied");
  }
  if (
    input.binding.correlationId !== input.workload.correlationId ||
    input.binding.workloadRef !== input.workload.workloadRef ||
    input.binding.reservationRef !== input.reservation.reservationRef ||
    input.reservation.wardenDecisionRef !== input.binding.decisionRef
  ) {
    throw new Error("warden_reservation_mismatch");
  }
  if (input.binding.substrateInstanceRef !== input.reservation.substrateInstanceRef) {
    throw new Error("warden_substrate_mismatch");
  }
  if (
    input.binding.principalRef !== input.workload.principalRef ||
    input.binding.representedEntityRef !== input.workload.representedEntityRef
  ) {
    throw new Error("warden_identity_mismatch");
  }

  const decidedAtMs = parseInstant(input.binding.decidedAt, "invalid_warden_decision_time");
  const validUntilMs = parseInstant(
    input.binding.validUntil,
    "invalid_warden_decision_validity",
  );
  if (validUntilMs <= decidedAtMs || input.handedOffAtMs < decidedAtMs) {
    throw new Error("invalid_warden_decision_window");
  }
  if (input.handedOffAtMs >= validUntilMs) {
    throw new Error("warden_decision_expired");
  }
}

function validateIdentity(input: {
  workload: WorkloadRequirementV1;
  intent: ComputeIntent;
  grant: ComputeGrant;
}): void {
  if (
    input.intent.correlationId !== input.workload.correlationId ||
    input.intent.principalRef !== input.workload.principalRef ||
    input.intent.representedEntityRef !== input.workload.representedEntityRef ||
    input.grant.principalRef !== input.workload.principalRef ||
    input.grant.representedEntityRef !== input.workload.representedEntityRef ||
    input.grant.nodeId !== input.intent.nodeId
  ) {
    throw new Error("handoff_identity_mismatch");
  }
}

function validateRuntimeBinding(input: {
  runtimeBinding: SubstrateRuntimeBindingV1;
  intent: ComputeIntent;
  grant: ComputeGrant;
}): void {
  if (
    input.runtimeBinding.runnerId !== input.intent.runnerId ||
    input.runtimeBinding.runnerId !== input.grant.runnerId
  ) {
    throw new Error("handoff_runner_mismatch");
  }
  if (
    input.runtimeBinding.provider !== input.intent.provider ||
    input.runtimeBinding.provider !== input.grant.provider
  ) {
    throw new Error("handoff_provider_mismatch");
  }
  if (
    input.grant.operation !== input.intent.operation ||
    input.grant.modelRef !== input.intent.modelRef
  ) {
    throw new Error("handoff_compute_scope_mismatch");
  }
  if (input.grant.status !== "ALLOW") {
    throw new Error("handoff_compute_grant_denied");
  }
}

function validateComputeGrantWindow(grant: ComputeGrant, handedOffAtMs: number): void {
  const issuedAtMs = parseInstant(grant.issuedAt, "invalid_compute_grant_time");
  const expiresAtMs = parseInstant(grant.expiresAt, "invalid_compute_grant_expiry");
  if (expiresAtMs <= issuedAtMs || handedOffAtMs < issuedAtMs) {
    throw new Error("invalid_compute_grant_window");
  }
  if (handedOffAtMs >= expiresAtMs) {
    throw new Error("compute_grant_expired");
  }
}

export function validateComputeHandoffV1(input: {
  workload: WorkloadRequirementV1;
  placement: PlacementPlanV1;
  reservation: CapacityReservationV1;
  binding: SubstrateWardenBindingV1;
  runtimeBinding: SubstrateRuntimeBindingV1;
  intent: ComputeIntent;
  grant: ComputeGrant;
  handedOffAt: string;
}): { intent: ComputeIntent; grant: ComputeGrant } {
  const handedOffAtMs = parseInstant(input.handedOffAt, "invalid_handoff_time");

  validateReservation({
    workload: input.workload,
    placement: input.placement,
    reservation: input.reservation,
    runtimeBinding: input.runtimeBinding,
    handedOffAtMs,
  });
  validateWardenBinding({
    workload: input.workload,
    reservation: input.reservation,
    binding: input.binding,
    handedOffAtMs,
  });
  validateIdentity({ workload: input.workload, intent: input.intent, grant: input.grant });
  validateRuntimeBinding({
    runtimeBinding: input.runtimeBinding,
    intent: input.intent,
    grant: input.grant,
  });
  validateComputeGrantWindow(input.grant, handedOffAtMs);

  if (
    !input.workload.evidenceRequired ||
    !input.binding.evidenceRequired ||
    !input.grant.evidenceRequired ||
    !input.reservation.riverEvidenceRef
  ) {
    throw new Error("evidence_requirement_missing");
  }

  return { intent: input.intent, grant: input.grant };
}
