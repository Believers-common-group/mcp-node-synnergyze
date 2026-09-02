import {
  stableDigest,
  type CapacityReservationV1,
  type PlacementPlanV1,
  type SubstrateCapacitySnapshotV1,
  type SubstrateWardenBindingV1,
  type WorkloadRequirementV1,
} from "./contracts.ts";

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(errorCode);
  }
  return parsed;
}

function assertPlacementBinding(
  workload: WorkloadRequirementV1,
  placement: PlacementPlanV1,
  snapshot: SubstrateCapacitySnapshotV1,
): void {
  if (
    placement.workloadRef !== workload.workloadRef ||
    placement.correlationId !== workload.correlationId
  ) {
    throw new Error("reservation_workload_mismatch");
  }
  if (!placement.primarySubstrateInstanceRef) {
    throw new Error("no_eligible_substrate");
  }
  if (placement.primarySubstrateInstanceRef !== snapshot.substrateInstanceRef) {
    throw new Error("reservation_snapshot_mismatch");
  }
  if (!placement.sourceSnapshotRefs.includes(snapshot.snapshotRef)) {
    throw new Error("reservation_snapshot_mismatch");
  }
}

function assertCapacity(
  workload: WorkloadRequirementV1,
  snapshot: SubstrateCapacitySnapshotV1,
): void {
  if (
    workload.minimumCpuUnits > snapshot.availableCpuUnits ||
    workload.minimumMemoryMiB > snapshot.availableMemoryMiB ||
    workload.minimumStorageMiB > snapshot.availableStorageMiB
  ) {
    throw new Error("reservation_exceeds_snapshot");
  }
}

function assertRequestWindow(
  requestedAt: string,
  expiresAt: string,
  snapshot: SubstrateCapacitySnapshotV1,
): void {
  const requestedAtMs = parseInstant(requestedAt, "invalid_reservation_request_time");
  const expiresAtMs = parseInstant(expiresAt, "invalid_reservation_expiry");
  const snapshotExpiresAtMs = parseInstant(
    snapshot.expiresAt,
    "invalid_capacity_snapshot_expiry",
  );

  if (expiresAtMs <= requestedAtMs) {
    throw new Error("invalid_reservation_window");
  }
  if (requestedAtMs >= snapshotExpiresAtMs) {
    throw new Error("capacity_snapshot_expired");
  }
}

export class CapacityReservationServiceV1 {
  request(input: {
    workload: WorkloadRequirementV1;
    placement: PlacementPlanV1;
    snapshot: SubstrateCapacitySnapshotV1;
    requestedAt: string;
    expiresAt: string;
    riverEvidenceRef: string;
  }): CapacityReservationV1 {
    assertPlacementBinding(input.workload, input.placement, input.snapshot);
    assertCapacity(input.workload, input.snapshot);
    assertRequestWindow(input.requestedAt, input.expiresAt, input.snapshot);

    const identity = {
      placementRef: input.placement.placementRef,
      correlationId: input.workload.correlationId,
      workloadRef: input.workload.workloadRef,
      substrateInstanceRef: input.snapshot.substrateInstanceRef,
      requestedCpuUnits: input.workload.minimumCpuUnits,
      requestedMemoryMiB: input.workload.minimumMemoryMiB,
      requestedStorageMiB: input.workload.minimumStorageMiB,
      requestedAt: input.requestedAt,
      expiresAt: input.expiresAt,
    };

    return {
      reservationRef: `GENESIS-CAPACITY-RESERVATION:${stableDigest(identity).slice(0, 24)}`,
      placementRef: input.placement.placementRef,
      correlationId: input.workload.correlationId,
      workloadRef: input.workload.workloadRef,
      substrateInstanceRef: input.snapshot.substrateInstanceRef,
      requestedCpuUnits: input.workload.minimumCpuUnits,
      requestedMemoryMiB: input.workload.minimumMemoryMiB,
      requestedStorageMiB: input.workload.minimumStorageMiB,
      status: "REQUESTED",
      requestedAt: input.requestedAt,
      expiresAt: input.expiresAt,
      riverEvidenceRef: input.riverEvidenceRef,
    };
  }

  authorize(input: {
    reservation: CapacityReservationV1;
    workload: WorkloadRequirementV1;
    binding: SubstrateWardenBindingV1;
    authorizedAt: string;
  }): CapacityReservationV1 {
    if (input.binding.decision !== "ALLOW") {
      throw new Error("warden_decision_denied");
    }

    if (
      input.binding.correlationId !== input.reservation.correlationId ||
      input.binding.correlationId !== input.workload.correlationId ||
      input.binding.workloadRef !== input.reservation.workloadRef ||
      input.binding.workloadRef !== input.workload.workloadRef ||
      input.binding.reservationRef !== input.reservation.reservationRef
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

    if (!input.binding.evidenceRequired || !input.workload.evidenceRequired) {
      throw new Error("evidence_requirement_missing");
    }

    const authorizedAtMs = parseInstant(input.authorizedAt, "invalid_authorization_time");
    const reservationExpiresAtMs = parseInstant(
      input.reservation.expiresAt,
      "invalid_reservation_expiry",
    );
    const decidedAtMs = parseInstant(input.binding.decidedAt, "invalid_warden_decision_time");
    const validUntilMs = parseInstant(
      input.binding.validUntil,
      "invalid_warden_decision_validity",
    );

    if (authorizedAtMs >= reservationExpiresAtMs) {
      throw new Error("reservation_expired");
    }
    if (validUntilMs <= decidedAtMs || authorizedAtMs < decidedAtMs) {
      throw new Error("invalid_warden_decision_window");
    }
    if (authorizedAtMs >= validUntilMs) {
      throw new Error("warden_decision_expired");
    }

    return {
      ...input.reservation,
      status: "AUTHORIZED",
      wardenDecisionRef: input.binding.decisionRef,
    };
  }
}
