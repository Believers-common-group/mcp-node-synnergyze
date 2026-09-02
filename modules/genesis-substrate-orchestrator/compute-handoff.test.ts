import { describe, expect, it } from "vitest";

import {
  makeSyntheticComputeGrant,
  makeSyntheticComputeIntent,
  type ComputeGrant,
  type ComputeIntent,
} from "../../compute/runtime.ts";
import type {
  CapacityReservationV1,
  PlacementPlanV1,
  SubstrateWardenBindingV1,
  WorkloadRequirementV1,
} from "./contracts.ts";
import {
  validateComputeHandoffV1,
  type SubstrateRuntimeBindingV1,
} from "./compute-handoff.ts";

const HANDED_OFF_AT = "2026-08-13T07:00:00.000Z";

function makeFixture() {
  const intent = makeSyntheticComputeIntent("SUBSTRATE-HANDOFF-001");
  const grant = makeSyntheticComputeGrant(intent);

  const workload: WorkloadRequirementV1 = {
    workloadRef: "WORKLOAD-SYNTHETIC-COMPUTE-001",
    correlationId: intent.correlationId,
    principalRef: intent.principalRef,
    representedEntityRef: intent.representedEntityRef,
    editionRef: "GENESIS-COMPUTE-PROOF-001",
    licenceRefs: ["LICENCE-COMPUTE-PROOF-001"],
    requiredCapabilities: ["CAPABILITY-GEMM"],
    minimumCpuUnits: 1,
    minimumMemoryMiB: 1,
    minimumStorageMiB: 1,
    gpuRequirement: "NONE",
    allowedSubstrateKinds: ["G3"],
    preferredSubstrateKinds: ["G3"],
    allowedJurisdictionRefs: ["JURISDICTION-TEST"],
    forbiddenJurisdictionRefs: [],
    dataClass: "CONFIDENTIAL",
    resilienceProfile: "BRONZE",
    evidenceRequired: true,
  };

  const placement: PlacementPlanV1 = {
    placementRef: "GENESIS-PLACEMENT:synthetic-handoff",
    correlationId: workload.correlationId,
    workloadRef: workload.workloadRef,
    policyRef: "PLACEMENT-POLICY-SYNTHETIC-001",
    sourceSnapshotRefs: ["SNAPSHOT:G3-ALPHA-SYNTHETIC-001"],
    primarySubstrateInstanceRef: "G3-ALPHA-SYNTHETIC-001",
    alternateSubstrateInstanceRefs: [],
    candidateResults: [],
    blockingReasons: [],
    computedAt: "2026-08-13T06:55:00.000Z",
    sourceDigest: "sha256:synthetic-placement",
    projectionOnly: true,
  };

  const reservation: CapacityReservationV1 = {
    reservationRef: "GENESIS-CAPACITY-RESERVATION:synthetic001",
    placementRef: placement.placementRef,
    correlationId: workload.correlationId,
    workloadRef: workload.workloadRef,
    substrateInstanceRef: "G3-ALPHA-SYNTHETIC-001",
    requestedCpuUnits: 1,
    requestedMemoryMiB: 1,
    requestedStorageMiB: 1,
    status: "AUTHORIZED",
    requestedAt: "2026-08-13T06:56:00.000Z",
    expiresAt: "2026-08-13T07:30:00.000Z",
    wardenDecisionRef: "WARDEN-SUBSTRATE-DECISION:synthetic001",
    riverEvidenceRef: "RIVER-EVIDENCE:synthetic-reservation",
  };

  const binding: SubstrateWardenBindingV1 = {
    decisionRef: "WARDEN-SUBSTRATE-DECISION:synthetic001",
    decision: "ALLOW",
    correlationId: workload.correlationId,
    workloadRef: workload.workloadRef,
    reservationRef: reservation.reservationRef,
    substrateInstanceRef: reservation.substrateInstanceRef,
    principalRef: workload.principalRef,
    representedEntityRef: workload.representedEntityRef,
    decidedAt: "2026-08-13T06:57:00.000Z",
    validUntil: "2026-08-13T07:20:00.000Z",
    evidenceRequired: true,
  };

  const runtimeBinding: SubstrateRuntimeBindingV1 = {
    substrateInstanceRef: reservation.substrateInstanceRef,
    runnerId: intent.runnerId,
    provider: intent.provider,
  };

  return { workload, placement, reservation, binding, runtimeBinding, intent, grant };
}

function handoff(overrides: Partial<{
  workload: WorkloadRequirementV1;
  placement: PlacementPlanV1;
  reservation: CapacityReservationV1;
  binding: SubstrateWardenBindingV1;
  runtimeBinding: SubstrateRuntimeBindingV1;
  intent: ComputeIntent;
  grant: ComputeGrant;
  handedOffAt: string;
}> = {}) {
  return validateComputeHandoffV1({ ...makeFixture(), handedOffAt: HANDED_OFF_AT, ...overrides });
}

describe("validateComputeHandoffV1", () => {
  it("accepts a fully matching authorized reservation and existing compute grant", () => {
    const fixture = makeFixture();
    const result = validateComputeHandoffV1({ ...fixture, handedOffAt: HANDED_OFF_AT });

    expect(result.intent).toBe(fixture.intent);
    expect(result.grant).toBe(fixture.grant);
  });

  it("rejects substrate or runner substitution", () => {
    const fixture = makeFixture();

    expect(() =>
      handoff({
        runtimeBinding: { ...fixture.runtimeBinding, substrateInstanceRef: "G3-OTHER" },
      }),
    ).toThrowError("handoff_substrate_mismatch");

    expect(() =>
      handoff({
        runtimeBinding: { ...fixture.runtimeBinding, runnerId: "RUNNER-OTHER" },
      }),
    ).toThrowError("handoff_runner_mismatch");
  });

  it("rejects provider substitution", () => {
    const fixture = makeFixture();
    const changedIntent: ComputeIntent = { ...fixture.intent, provider: "apple-mpp-local" };

    expect(() => handoff({ intent: changedIntent })).toThrowError("handoff_provider_mismatch");
  });

  it("rejects principal substitution", () => {
    const fixture = makeFixture();
    const changedIntent: ComputeIntent = { ...fixture.intent, principalRef: "DIGITALME-OTHER" };

    expect(() => handoff({ intent: changedIntent })).toThrowError("handoff_identity_mismatch");
  });

  it("rejects represented-entity substitution", () => {
    const fixture = makeFixture();
    const changedIntent: ComputeIntent = {
      ...fixture.intent,
      representedEntityRef: "ENTITY-OTHER",
    };

    expect(() => handoff({ intent: changedIntent })).toThrowError("handoff_identity_mismatch");
  });

  it("rejects an expired reservation", () => {
    const fixture = makeFixture();

    expect(() =>
      handoff({
        reservation: { ...fixture.reservation, expiresAt: "2026-08-13T06:59:59.000Z" },
      }),
    ).toThrowError("reservation_expired");
  });

  it("rejects an expired Warden binding", () => {
    const fixture = makeFixture();

    expect(() =>
      handoff({
        binding: { ...fixture.binding, validUntil: "2026-08-13T06:59:59.000Z" },
      }),
    ).toThrowError("warden_decision_expired");
  });

  it("rejects a missing evidence requirement", () => {
    const fixture = makeFixture();
    const changedGrant: ComputeGrant = {
      ...fixture.grant,
      evidenceRequired: false as true,
    };

    expect(() => handoff({ grant: changedGrant })).toThrowError("evidence_requirement_missing");
  });
});
