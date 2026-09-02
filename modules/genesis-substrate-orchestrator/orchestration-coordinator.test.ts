import { describe, expect, it } from "vitest";

import type {
  PlacementPolicyV1,
  SubstrateCapacitySnapshotV1,
  SubstrateWardenBindingV1,
  WorkloadRequirementV1,
} from "./contracts.ts";
import { SubstrateEvidenceJournalV1 } from "./evidence-journal.ts";
import { SubstrateOrchestrationCoordinatorV1 } from "./orchestration-coordinator.ts";
import { CapacityReservationServiceV1 } from "./reservation-service.ts";

const COMPUTED_AT = "2026-09-03T03:00:00.000Z";
const REQUESTED_AT = "2026-09-03T03:01:00.000Z";
const RESERVATION_EXPIRES_AT = "2026-09-03T03:10:00.000Z";
const AUTHORIZED_AT = "2026-09-03T03:02:00.000Z";

function makeWorkload(overrides: Partial<WorkloadRequirementV1> = {}): WorkloadRequirementV1 {
  return {
    workloadRef: "WORKLOAD-ORCHESTRATION-001",
    correlationId: "CORR-ORCHESTRATION-001",
    principalRef: "DIGITALME-CREATOR-001",
    representedEntityRef: "CREATOR-STUDIO-001",
    editionRef: "GENESIS-CREATOR-PRO-INDIA-001",
    licenceRefs: ["LICENCE-CREATOR-PRO-001"],
    requiredCapabilities: ["CAPABILITY-COMPUTE"],
    minimumCpuUnits: 4,
    minimumMemoryMiB: 8192,
    minimumStorageMiB: 102400,
    gpuRequirement: "NONE",
    allowedSubstrateKinds: ["G3"],
    preferredSubstrateKinds: ["G3"],
    allowedJurisdictionRefs: ["JURISDICTION-IN"],
    forbiddenJurisdictionRefs: [],
    dataClass: "CONFIDENTIAL",
    resilienceProfile: "BRONZE",
    evidenceRequired: true,
    ...overrides,
  };
}

function makePolicy(): PlacementPolicyV1 {
  return {
    policyRef: "PLACEMENT-POLICY-ORCHESTRATION-001",
    allowedSubstrateKinds: ["G3"],
    preferredSubstrateKinds: ["G3"],
    allowDegraded: false,
    requireAttestation: true,
    requiredCapabilityRefs: ["CAPABILITY-COMPUTE"],
    forbiddenProviderRefs: [],
    allowedJurisdictionRefs: ["JURISDICTION-IN"],
    forbiddenJurisdictionRefs: [],
    preferLocalBinding: false,
    rankingOrder: ["INSTANCE_REF_ASC"],
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    sourceDigest: "sha256:policy",
  };
}

function makeSnapshot(
  overrides: Partial<SubstrateCapacitySnapshotV1> = {},
): SubstrateCapacitySnapshotV1 {
  return {
    snapshotRef: "SNAPSHOT:G3-ORCHESTRATION-001",
    substrateInstanceRef: "G3-ORCHESTRATION-001",
    substrateKind: "G3",
    providerRef: "PROVIDER-GENESIS-LOCAL",
    ownerRef: "CREATOR-STUDIO-001",
    operatorRef: "CREATOR-STUDIO-001",
    jurisdictionRef: "JURISDICTION-IN",
    status: "AVAILABLE",
    attested: true,
    availableCpuUnits: 16,
    availableMemoryMiB: 32768,
    availableStorageMiB: 512000,
    gpuCapabilities: [],
    capabilityRefs: ["CAPABILITY-COMPUTE"],
    bindingRefs: ["CREATOR-STUDIO-001"],
    observedAt: "2026-09-03T02:55:00.000Z",
    expiresAt: "2026-09-03T03:05:00.000Z",
    sourceDigest: "sha256:snapshot",
    ...overrides,
  };
}

function makeBinding(
  reservationRef: string,
  overrides: Partial<SubstrateWardenBindingV1> = {},
): SubstrateWardenBindingV1 {
  return {
    decisionRef: "WARDEN-DECISION:orchestration001",
    decision: "ALLOW",
    correlationId: "CORR-ORCHESTRATION-001",
    workloadRef: "WORKLOAD-ORCHESTRATION-001",
    reservationRef,
    substrateInstanceRef: "G3-ORCHESTRATION-001",
    principalRef: "DIGITALME-CREATOR-001",
    representedEntityRef: "CREATOR-STUDIO-001",
    decidedAt: "2026-09-03T03:01:30.000Z",
    validUntil: "2026-09-03T03:05:00.000Z",
    evidenceRequired: true,
    ...overrides,
  };
}

function makeCoordinator() {
  const evidence = new SubstrateEvidenceJournalV1();
  const reservations = new CapacityReservationServiceV1();
  return {
    evidence,
    coordinator: new SubstrateOrchestrationCoordinatorV1(reservations, evidence),
  };
}

describe("SubstrateOrchestrationCoordinatorV1", () => {
  it("returns BLOCKED_NO_ELIGIBLE_SUBSTRATE with evidence and no effect", () => {
    const { coordinator, evidence } = makeCoordinator();

    const result = coordinator.plan({
      workload: makeWorkload({ minimumCpuUnits: 64 }),
      policy: makePolicy(),
      snapshots: [makeSnapshot({ availableCpuUnits: 16 })],
      computedAt: COMPUTED_AT,
    });

    expect(result.attempt.status).toBe("BLOCKED_NO_ELIGIBLE_SUBSTRATE");
    expect(result.attempt.reason).toBe("no_eligible_substrate");
    expect(result.attempt.realWorldEffectOccurred).toBe(false);
    expect(evidence.list().at(-1)?.stage).toBe("PLACEMENT_BLOCKED");
  });

  it("returns BLOCKED_RESERVATION_REQUIRED after a successful placement with no reservation", () => {
    const { coordinator, evidence } = makeCoordinator();

    const result = coordinator.plan({
      workload: makeWorkload(),
      policy: makePolicy(),
      snapshots: [makeSnapshot()],
      computedAt: COMPUTED_AT,
    });

    expect(result.placement.primarySubstrateInstanceRef).toBe("G3-ORCHESTRATION-001");
    expect(result.attempt.status).toBe("BLOCKED_RESERVATION_REQUIRED");
    expect(result.attempt.realWorldEffectOccurred).toBe(false);
    expect(evidence.list().at(-1)?.stage).toBe("PLACEMENT_COMPUTED");
  });

  it("returns BLOCKED_WARDEN_REQUIRED for a requested reservation with no Warden binding", () => {
    const { coordinator, evidence } = makeCoordinator();
    const workload = makeWorkload();
    const snapshot = makeSnapshot();
    const planned = coordinator.plan({
      workload,
      policy: makePolicy(),
      snapshots: [snapshot],
      computedAt: COMPUTED_AT,
    });
    const requested = coordinator.requestReservation({
      workload,
      placement: planned.placement,
      snapshot,
      requestedAt: REQUESTED_AT,
      expiresAt: RESERVATION_EXPIRES_AT,
    });

    const result = coordinator.authorizeReservation({
      workload,
      placement: planned.placement,
      reservation: requested.reservation,
      authorizedAt: AUTHORIZED_AT,
    });

    expect(result.attempt.status).toBe("BLOCKED_WARDEN_REQUIRED");
    expect(result.attempt.reason).toBe("warden_decision_missing");
    expect(result.attempt.realWorldEffectOccurred).toBe(false);
    expect(evidence.list().at(-1)?.reason).toBe("warden_decision_missing");
  });

  it("returns DENIED with evidence when Warden denies", () => {
    const { coordinator, evidence } = makeCoordinator();
    const workload = makeWorkload();
    const snapshot = makeSnapshot();
    const planned = coordinator.plan({
      workload,
      policy: makePolicy(),
      snapshots: [snapshot],
      computedAt: COMPUTED_AT,
    });
    const requested = coordinator.requestReservation({
      workload,
      placement: planned.placement,
      snapshot,
      requestedAt: REQUESTED_AT,
      expiresAt: RESERVATION_EXPIRES_AT,
    });

    const result = coordinator.authorizeReservation({
      workload,
      placement: planned.placement,
      reservation: requested.reservation,
      binding: makeBinding(requested.reservation.reservationRef, { decision: "DENY" }),
      authorizedAt: AUTHORIZED_AT,
    });

    expect(result.attempt.status).toBe("DENIED");
    expect(result.attempt.reason).toBe("warden_decision_denied");
    expect(result.attempt.realWorldEffectOccurred).toBe(false);
    expect(evidence.list().at(-1)?.stage).toBe("RESERVATION_DENIED");
  });

  it("returns PLACEMENT_READY only after an authorized matching reservation", () => {
    const { coordinator, evidence } = makeCoordinator();
    const workload = makeWorkload();
    const snapshot = makeSnapshot();
    const planned = coordinator.plan({
      workload,
      policy: makePolicy(),
      snapshots: [snapshot],
      computedAt: COMPUTED_AT,
    });
    const requested = coordinator.requestReservation({
      workload,
      placement: planned.placement,
      snapshot,
      requestedAt: REQUESTED_AT,
      expiresAt: RESERVATION_EXPIRES_AT,
    });

    const result = coordinator.authorizeReservation({
      workload,
      placement: planned.placement,
      reservation: requested.reservation,
      binding: makeBinding(requested.reservation.reservationRef),
      authorizedAt: AUTHORIZED_AT,
    });

    expect(result.reservation?.status).toBe("AUTHORIZED");
    expect(result.attempt.status).toBe("PLACEMENT_READY");
    expect(result.attempt.realWorldEffectOccurred).toBe(false);
    expect(evidence.list().map((entry) => entry.stage)).toEqual([
      "PLACEMENT_COMPUTED",
      "RESERVATION_REQUESTED",
      "RESERVATION_AUTHORIZED",
    ]);
  });
});
