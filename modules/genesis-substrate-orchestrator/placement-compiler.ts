import {
  stableDigest,
  type PlacementCandidateV1,
  type PlacementPlanV1,
  type PlacementPolicyV1,
  type PlacementRankingKey,
  type PlacementReasonCode,
  type SubstrateCapacitySnapshotV1,
  type SubstrateKind,
  type WorkloadRequirementV1,
} from "./contracts.ts";

export interface CompilePlacementInputV1 {
  workload: WorkloadRequirementV1;
  policy: PlacementPolicyV1;
  snapshots: readonly SubstrateCapacitySnapshotV1[];
  computedAt: string;
}

const MANDATORY_TIE_BREAKER = "INSTANCE_REF_ASC" as const;

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(errorCode);
  }
  return parsed;
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function normalizedRankingOrder(policy: PlacementPolicyV1): readonly PlacementRankingKey[] {
  return [
    ...policy.rankingOrder.filter((key) => key !== MANDATORY_TIE_BREAKER),
    MANDATORY_TIE_BREAKER,
  ];
}

function isKindAllowed(
  kind: SubstrateKind,
  workload: WorkloadRequirementV1,
  policy: PlacementPolicyV1,
): boolean {
  return workload.allowedSubstrateKinds.includes(kind) && policy.allowedSubstrateKinds.includes(kind);
}

function isJurisdictionAllowed(
  jurisdictionRef: string,
  workload: WorkloadRequirementV1,
  policy: PlacementPolicyV1,
): boolean {
  if (workload.forbiddenJurisdictionRefs.includes(jurisdictionRef)) return false;
  if (policy.forbiddenJurisdictionRefs.includes(jurisdictionRef)) return false;
  if (
    workload.allowedJurisdictionRefs.length > 0 &&
    !workload.allowedJurisdictionRefs.includes(jurisdictionRef)
  ) {
    return false;
  }
  if (
    policy.allowedJurisdictionRefs.length > 0 &&
    !policy.allowedJurisdictionRefs.includes(jurisdictionRef)
  ) {
    return false;
  }
  return true;
}

function isProviderAllowed(providerRef: string, policy: PlacementPolicyV1): boolean {
  if (policy.forbiddenProviderRefs.includes(providerRef)) return false;
  if (policy.allowedProviderRefs && policy.allowedProviderRefs.length > 0) {
    return policy.allowedProviderRefs.includes(providerRef);
  }
  return true;
}

function preferenceIndex(kind: SubstrateKind, values: readonly SubstrateKind[]): number {
  const index = values.indexOf(kind);
  return index >= 0 ? index : values.length + 1;
}

function substratePreferenceRank(
  kind: SubstrateKind,
  workload: WorkloadRequirementV1,
  policy: PlacementPolicyV1,
): number {
  const policyRank = preferenceIndex(kind, policy.preferredSubstrateKinds);
  const workloadRank = preferenceIndex(kind, workload.preferredSubstrateKinds);
  return policyRank * 100 + workloadRank;
}

function buildRankVector(
  snapshot: SubstrateCapacitySnapshotV1,
  workload: WorkloadRequirementV1,
  policy: PlacementPolicyV1,
): readonly (string | number)[] {
  return normalizedRankingOrder(policy).map((key) => {
    switch (key) {
      case "SUBSTRATE_PREFERENCE":
        return substratePreferenceRank(snapshot.substrateKind, workload, policy);
      case "LOCAL_BINDING":
        if (!policy.preferLocalBinding || !policy.localBindingRef) return 0;
        return snapshot.bindingRefs.includes(policy.localBindingRef) ? 0 : 1;
      case "AVAILABLE_CPU_DESC":
        return -snapshot.availableCpuUnits;
      case "AVAILABLE_MEMORY_DESC":
        return -snapshot.availableMemoryMiB;
      case "AVAILABLE_STORAGE_DESC":
        return -snapshot.availableStorageMiB;
      case "INSTANCE_REF_ASC":
        return snapshot.substrateInstanceRef;
    }
  });
}

function compareRankValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function compareCandidates(left: PlacementCandidateV1, right: PlacementCandidateV1): number {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  if (left.eligible && right.eligible) {
    const length = Math.max(left.rankVector.length, right.rankVector.length);
    for (let index = 0; index < length; index += 1) {
      const leftValue = left.rankVector[index];
      const rightValue = right.rankVector[index];
      if (leftValue === undefined && rightValue === undefined) break;
      if (leftValue === undefined) return -1;
      if (rightValue === undefined) return 1;
      const compared = compareRankValues(leftValue, rightValue);
      if (compared !== 0) return compared;
    }
  }
  return left.substrateInstanceRef.localeCompare(right.substrateInstanceRef);
}

function rejectionReasons(
  snapshot: SubstrateCapacitySnapshotV1,
  workload: WorkloadRequirementV1,
  policy: PlacementPolicyV1,
  computedAtMs: number,
): readonly PlacementReasonCode[] {
  const reasons: PlacementReasonCode[] = [];
  const expiresAtMs = parseInstant(snapshot.expiresAt, "invalid_capacity_snapshot_expiry");

  if (expiresAtMs <= computedAtMs) reasons.push("capacity_snapshot_expired");
  if (
    snapshot.status !== "AVAILABLE" &&
    !(snapshot.status === "DEGRADED" && policy.allowDegraded)
  ) {
    reasons.push("substrate_status_ineligible");
  }
  if (policy.requireAttestation && !snapshot.attested) {
    reasons.push("substrate_attestation_required");
  }
  if (!isKindAllowed(snapshot.substrateKind, workload, policy)) {
    reasons.push("substrate_kind_not_allowed");
  }
  if (!isProviderAllowed(snapshot.providerRef, policy)) {
    reasons.push("provider_not_allowed");
  }
  if (!isJurisdictionAllowed(snapshot.jurisdictionRef, workload, policy)) {
    reasons.push("jurisdiction_not_allowed");
  }

  const requiredCapabilities = stableUnique([
    ...workload.requiredCapabilities,
    ...policy.requiredCapabilityRefs,
  ]);
  if (requiredCapabilities.some((capability) => !snapshot.capabilityRefs.includes(capability))) {
    reasons.push("required_capability_missing");
  }
  if (snapshot.availableCpuUnits < workload.minimumCpuUnits) {
    reasons.push("cpu_capacity_insufficient");
  }
  if (snapshot.availableMemoryMiB < workload.minimumMemoryMiB) {
    reasons.push("memory_capacity_insufficient");
  }
  if (snapshot.availableStorageMiB < workload.minimumStorageMiB) {
    reasons.push("storage_capacity_insufficient");
  }
  if (workload.gpuRequirement === "REQUIRED" && snapshot.gpuCapabilities.length === 0) {
    reasons.push("gpu_capability_missing");
  }

  return reasons;
}

function alternateCount(workload: WorkloadRequirementV1): number {
  switch (workload.resilienceProfile) {
    case "BRONZE":
      return 0;
    case "SILVER":
      return 1;
    case "GOLD":
      return 2;
  }
}

export function compilePlacementV1(input: CompilePlacementInputV1): PlacementPlanV1 {
  const computedAtMs = parseInstant(input.computedAt, "invalid_placement_computed_at");
  const sortedSnapshots = [...input.snapshots].sort((left, right) =>
    left.snapshotRef.localeCompare(right.snapshotRef),
  );

  const candidates = sortedSnapshots
    .map((snapshot): PlacementCandidateV1 => {
      const reasons = rejectionReasons(snapshot, input.workload, input.policy, computedAtMs);
      return {
        substrateInstanceRef: snapshot.substrateInstanceRef,
        eligible: reasons.length === 0,
        rejectionReasons: reasons,
        rankVector:
          reasons.length === 0
            ? buildRankVector(snapshot, input.workload, input.policy)
            : [snapshot.substrateInstanceRef],
        sourceSnapshotRef: snapshot.snapshotRef,
      };
    })
    .sort(compareCandidates);

  const eligible = candidates.filter((candidate) => candidate.eligible);
  const primary = eligible[0]?.substrateInstanceRef;
  const alternates = eligible
    .slice(1, 1 + alternateCount(input.workload))
    .map((candidate) => candidate.substrateInstanceRef);

  const canonical = {
    workload: input.workload,
    policy: input.policy,
    snapshots: sortedSnapshots,
    computedAt: input.computedAt,
  };
  const sourceDigest = stableDigest(canonical);

  return {
    placementRef: `GENESIS-PLACEMENT:${sourceDigest.slice(0, 24)}`,
    correlationId: input.workload.correlationId,
    workloadRef: input.workload.workloadRef,
    policyRef: input.policy.policyRef,
    sourceSnapshotRefs: sortedSnapshots.map((snapshot) => snapshot.snapshotRef),
    primarySubstrateInstanceRef: primary,
    alternateSubstrateInstanceRefs: alternates,
    candidateResults: candidates,
    blockingReasons: primary ? [] : ["no_eligible_substrate"],
    computedAt: input.computedAt,
    sourceDigest,
    projectionOnly: true,
  };
}
