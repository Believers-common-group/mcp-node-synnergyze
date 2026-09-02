import { describe, expect, it } from "vitest";

import type {
  PlacementPolicyV1,
  SubstrateCapacitySnapshotV1,
  SubstrateKind,
  WorkloadRequirementV1,
} from "./contracts.ts";
import { compilePlacementV1 } from "./placement-compiler.ts";

const COMPUTED_AT = "2026-09-03T03:00:00.000Z";

function acceptSubstrateKind(kind: SubstrateKind): SubstrateKind {
  return kind;
}

function makeWorkload(
  overrides: Partial<WorkloadRequirementV1> = {},
): WorkloadRequirementV1 {
  return {
    workloadRef: "WORKLOAD-CREATOR-AI-001",
    correlationId: "CORR-PLACEMENT-001",
    principalRef: "DIGITALME-CREATOR-001",
    representedEntityRef: "CREATOR-STUDIO-001",
    editionRef: "GENESIS-CREATOR-PRO-INDIA-001",
    licenceRefs: ["LICENCE-CREATOR-PRO-001"],
    requiredCapabilities: ["CAPABILITY-COMPUTE"],
    minimumCpuUnits: 4,
    minimumMemoryMiB: 8192,
    minimumStorageMiB: 102400,
    gpuRequirement: "NONE",
    allowedSubstrateKinds: ["G2", "G3", "TERRA"],
    preferredSubstrateKinds: ["G2", "G3", "TERRA"],
    allowedJurisdictionRefs: ["JURISDICTION-IN"],
    forbiddenJurisdictionRefs: [],
    dataClass: "CONFIDENTIAL",
    resilienceProfile: "BRONZE",
    evidenceRequired: true,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<PlacementPolicyV1> = {}): PlacementPolicyV1 {
  return {
    policyRef: "PLACEMENT-POLICY-CREATOR-001",
    allowedSubstrateKinds: ["G2", "G3", "TERRA"],
    preferredSubstrateKinds: ["G2", "G3", "TERRA"],
    allowDegraded: false,
    requireAttestation: true,
    requiredCapabilityRefs: ["CAPABILITY-COMPUTE"],
    forbiddenProviderRefs: [],
    allowedJurisdictionRefs: ["JURISDICTION-IN"],
    forbiddenJurisdictionRefs: [],
    preferLocalBinding: false,
    rankingOrder: [
      "SUBSTRATE_PREFERENCE",
      "AVAILABLE_CPU_DESC",
      "INSTANCE_REF_ASC",
    ],
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    sourceDigest: "sha256:policy",
    ...overrides,
  };
}

function makeSnapshot(
  substrateInstanceRef: string,
  overrides: Partial<SubstrateCapacitySnapshotV1> = {},
): SubstrateCapacitySnapshotV1 {
  return {
    snapshotRef: `SNAPSHOT:${substrateInstanceRef}`,
    substrateInstanceRef,
    substrateKind: "G2",
    providerRef: "PROVIDER-GENESIS-LOCAL",
    productRef: "PRODUCT-GENESIS-EDGE",
    ownerRef: "CREATOR-STUDIO-001",
    operatorRef: "CREATOR-STUDIO-001",
    locationRef: "LOCATION-BLR-001",
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
    sourceDigest: `sha256:${substrateInstanceRef}`,
    ...overrides,
  };
}

describe("Genesis substrate taxonomy", () => {
  it("models G0-G4 plus Terra without a G5 class", () => {
    const kinds: SubstrateKind[] = ["G0", "G1", "G2", "G3", "G4", "TERRA"];

    expect(kinds.map(acceptSubstrateKind)).toEqual([
      "G0",
      "G1",
      "G2",
      "G3",
      "G4",
      "TERRA",
    ]);
  });
});

describe("compilePlacementV1", () => {
  it("selects deterministically and uses instance reference as the final tie-breaker", () => {
    const workload = makeWorkload();
    const policy = makePolicy();
    const snapshots = [makeSnapshot("G2-INSTANCE-B"), makeSnapshot("G2-INSTANCE-A")];

    const first = compilePlacementV1({ workload, policy, snapshots, computedAt: COMPUTED_AT });
    const second = compilePlacementV1({
      workload,
      policy,
      snapshots: [...snapshots].reverse(),
      computedAt: COMPUTED_AT,
    });

    expect(first.primarySubstrateInstanceRef).toBe("G2-INSTANCE-A");
    expect(first.candidateResults.filter((item) => item.eligible).map((item) => item.substrateInstanceRef)).toEqual([
      "G2-INSTANCE-A",
      "G2-INSTANCE-B",
    ]);
    expect(second.primarySubstrateInstanceRef).toBe(first.primarySubstrateInstanceRef);
    expect(second.alternateSubstrateInstanceRefs).toEqual(first.alternateSubstrateInstanceRefs);
    expect(second.sourceDigest).toBe(first.sourceDigest);
    expect(second.placementRef).toBe(first.placementRef);
  });

  it("rejects an expired capacity snapshot", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload(),
      policy: makePolicy(),
      snapshots: [
        makeSnapshot("G2-EXPIRED", { expiresAt: "2026-09-03T02:59:59.000Z" }),
      ],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBeUndefined();
    expect(plan.blockingReasons).toEqual(["no_eligible_substrate"]);
    expect(plan.candidateResults[0]?.rejectionReasons).toContain("capacity_snapshot_expired");
  });

  it("rejects a forbidden jurisdiction", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload({ forbiddenJurisdictionRefs: ["JURISDICTION-US"] }),
      policy: makePolicy(),
      snapshots: [makeSnapshot("TERRA-US", { jurisdictionRef: "JURISDICTION-US", substrateKind: "TERRA" })],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBeUndefined();
    expect(plan.candidateResults[0]?.rejectionReasons).toContain("jurisdiction_not_allowed");
  });

  it("rejects a substrate missing required capabilities", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload({ requiredCapabilities: ["CAPABILITY-COMPUTE", "CAPABILITY-PRIVATE-AI"] }),
      policy: makePolicy(),
      snapshots: [makeSnapshot("G2-MISSING-CAPABILITY")],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBeUndefined();
    expect(plan.candidateResults[0]?.rejectionReasons).toContain("required_capability_missing");
  });

  it("rejects a substrate below CPU, memory, or storage requirements", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload(),
      policy: makePolicy(),
      snapshots: [
        makeSnapshot("G2-UNDERSIZED", {
          availableCpuUnits: 2,
          availableMemoryMiB: 4096,
          availableStorageMiB: 51200,
        }),
      ],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBeUndefined();
    expect(plan.candidateResults[0]?.rejectionReasons).toEqual(
      expect.arrayContaining([
        "cpu_capacity_insufficient",
        "memory_capacity_insufficient",
        "storage_capacity_insufficient",
      ]),
    );
  });

  it("accepts Terra as a projection kind when workload and policy permit it", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload({ allowedSubstrateKinds: ["TERRA"], preferredSubstrateKinds: ["TERRA"] }),
      policy: makePolicy({ allowedSubstrateKinds: ["TERRA"], preferredSubstrateKinds: ["TERRA"] }),
      snapshots: [makeSnapshot("TERRA-IN-BLR-001", { substrateKind: "TERRA" })],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBe("TERRA-IN-BLR-001");
  });

  it("returns one alternate for SILVER resilience", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload({ resilienceProfile: "SILVER" }),
      policy: makePolicy(),
      snapshots: [makeSnapshot("G2-A"), makeSnapshot("G2-B"), makeSnapshot("G2-C")],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBe("G2-A");
    expect(plan.alternateSubstrateInstanceRefs).toEqual(["G2-B"]);
  });

  it("returns up to two alternates for GOLD resilience", () => {
    const plan = compilePlacementV1({
      workload: makeWorkload({ resilienceProfile: "GOLD" }),
      policy: makePolicy(),
      snapshots: [makeSnapshot("G2-A"), makeSnapshot("G2-B"), makeSnapshot("G2-C")],
      computedAt: COMPUTED_AT,
    });

    expect(plan.primarySubstrateInstanceRef).toBe("G2-A");
    expect(plan.alternateSubstrateInstanceRefs).toEqual(["G2-B", "G2-C"]);
  });
});
