import { describe, expect, it } from "vitest";

import type {
  PlacementPlanV1,
  SubstrateCapacitySnapshotV1,
  SubstrateWardenBindingV1,
  WorkloadRequirementV1,
} from "./contracts.ts";
import { CapacityReservationServiceV1 } from "./reservation-service.ts";

const REQUESTED_AT = "2026-09-03T03:00:00.000Z";
const EXPIRES_AT = "2026-09-03T03:10:00.000Z";
const AUTHORIZED_AT = "2026-09-03T03:01:00.000Z";

function makeWorkload(overrides: Partial<WorkloadRequirementV1> = {}): WorkloadRequirementV1 {
  return {
    workloadRef: "WORKLOAD-CREATOR-AI-001",
    correlationId: "CORR-RESERVATION-001",
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

function makePlacement(overrides: Partial<PlacementPlanV1> = {}): PlacementPlanV1 {
  return {
    placementRef: "GENESIS-PLACEMENT:reservation001",
    correlationId: "CORR-RESERVATION-001",
    workloadRef: "WORKLOAD-CREATOR-AI-001",
    policyRef: "PLACEMENT-POLICY-001",
    sourceSnapshotRefs: ["SNAPSHOT:G3-001"],
    primarySubstrateInstanceRef: "G3-001",
    alternateSubstrateInstanceRefs: [],
    candidateResults: [],
    blockingReasons: [],
    computedAt: "2026-09-03T02:59:00.000Z",
    sourceDigest: "sha256:placement",
    projectionOnly: true,
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<SubstrateCapacitySnapshotV1> = {},
): SubstrateCapacitySnapshotV1 {
  return {
    snapshotRef: "SNAPSHOT:G3-001",
    substrateInstanceRef: "G3-001",
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
    decisionRef: "WARDEN-DECISION:reservation001",
    decision: "ALLOW",
    correlationId: "CORR-RESERVATION-001",
    workloadRef: "WORKLOAD-CREATOR-AI-001",
    reservationRef,
    substrateInstanceRef: "G3-001",
    principalRef: "DIGITALME-CREATOR-001",
    representedEntityRef: "CREATOR-STUDIO-001",
    decidedAt: "2026-09-03T03:00:30.000Z",
    validUntil: "2026-09-03T03:05:00.000Z",
    evidenceRequired: true,
    ...overrides,
  };
}

function requestReservation(
  service: CapacityReservationServiceV1,
  workload = makeWorkload(),
  placement = makePlacement(),
  snapshot = makeSnapshot(),
) {
  return service.request({
    workload,
    placement,
    snapshot,
    requestedAt: REQUESTED_AT,
    expiresAt: EXPIRES_AT,
    riverEvidenceRef: "RIVER-EVIDENCE:reservation-requested",
  });
}

describe("CapacityReservationServiceV1", () => {
  it("rejects a reservation that exceeds the selected capacity snapshot", () => {
    const service = new CapacityReservationServiceV1();

    expect(() =>
      requestReservation(
        service,
        makeWorkload({ minimumCpuUnits: 32 }),
        makePlacement(),
        makeSnapshot({ availableCpuUnits: 16 }),
      ),
    ).toThrowError("reservation_exceeds_snapshot");
  });

  it("creates the same reservation for the same canonical request", () => {
    const service = new CapacityReservationServiceV1();

    const first = requestReservation(service);
    const second = requestReservation(service);

    expect(second).toEqual(first);
    expect(first.status).toBe("REQUESTED");
    expect(first.substrateInstanceRef).toBe("G3-001");
  });

  it("rejects authorization when Warden denies", () => {
    const service = new CapacityReservationServiceV1();
    const workload = makeWorkload();
    const reservation = requestReservation(service, workload);

    expect(() =>
      service.authorize({
        reservation,
        workload,
        binding: makeBinding(reservation.reservationRef, { decision: "DENY" }),
        authorizedAt: AUTHORIZED_AT,
      }),
    ).toThrowError("warden_decision_denied");
  });

  it("rejects authorization when reservationRef mismatches", () => {
    const service = new CapacityReservationServiceV1();
    const workload = makeWorkload();
    const reservation = requestReservation(service, workload);

    expect(() =>
      service.authorize({
        reservation,
        workload,
        binding: makeBinding("RESERVATION-OTHER"),
        authorizedAt: AUTHORIZED_AT,
      }),
    ).toThrowError("warden_reservation_mismatch");
  });

  it("rejects authorization when substrateInstanceRef mismatches", () => {
    const service = new CapacityReservationServiceV1();
    const workload = makeWorkload();
    const reservation = requestReservation(service, workload);

    expect(() =>
      service.authorize({
        reservation,
        workload,
        binding: makeBinding(reservation.reservationRef, { substrateInstanceRef: "G3-OTHER" }),
        authorizedAt: AUTHORIZED_AT,
      }),
    ).toThrowError("warden_substrate_mismatch");
  });

  it("rejects authorization when principal or represented entity mismatches", () => {
    const service = new CapacityReservationServiceV1();
    const workload = makeWorkload();
    const reservation = requestReservation(service, workload);

    expect(() =>
      service.authorize({
        reservation,
        workload,
        binding: makeBinding(reservation.reservationRef, { principalRef: "DIGITALME-OTHER" }),
        authorizedAt: AUTHORIZED_AT,
      }),
    ).toThrowError("warden_identity_mismatch");
  });

  it("rejects an expired Warden decision", () => {
    const service = new CapacityReservationServiceV1();
    const workload = makeWorkload();
    const reservation = requestReservation(service, workload);

    expect(() =>
      service.authorize({
        reservation,
        workload,
        binding: makeBinding(reservation.reservationRef, {
          validUntil: "2026-09-03T03:00:59.000Z",
        }),
        authorizedAt: AUTHORIZED_AT,
      }),
    ).toThrowError("warden_decision_expired");
  });

  it("rejects an expired reservation", () => {
    const service = new CapacityReservationServiceV1();
    const workload = makeWorkload();
    const reservation = service.request({
      workload,
      placement: makePlacement(),
      snapshot: makeSnapshot(),
      requestedAt: REQUESTED_AT,
      expiresAt: "2026-09-03T03:00:30.000Z",
      riverEvidenceRef: "RIVER-EVIDENCE:reservation-requested",
    });

    expect(() =>
      service.authorize({
        reservation,
        workload,
        binding: makeBinding(reservation.reservationRef),
        authorizedAt: AUTHORIZED_AT,
      }),
    ).toThrowError("reservation_expired");
  });
});
