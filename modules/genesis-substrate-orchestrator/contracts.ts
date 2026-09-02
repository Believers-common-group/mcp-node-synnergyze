import { createHash } from "node:crypto";

export type PhysicalSubstrateClass = "G0" | "G1" | "G2" | "G3" | "G4";
export type SubstrateKind = PhysicalSubstrateClass | "TERRA";
export type CapacityStatus =
  | "AVAILABLE"
  | "DEGRADED"
  | "MAINTENANCE"
  | "SUSPENDED"
  | "REVOKED";
export type DataClass = "PUBLIC" | "COMMERCIAL" | "CONFIDENTIAL" | "REGULATED";
export type ResilienceProfile = "BRONZE" | "SILVER" | "GOLD";
export type GpuRequirement = "NONE" | "OPTIONAL" | "REQUIRED";
export type PlacementRankingKey =
  | "SUBSTRATE_PREFERENCE"
  | "LOCAL_BINDING"
  | "AVAILABLE_CPU_DESC"
  | "AVAILABLE_MEMORY_DESC"
  | "AVAILABLE_STORAGE_DESC"
  | "INSTANCE_REF_ASC";

export type PlacementReasonCode =
  | "capacity_snapshot_expired"
  | "substrate_status_ineligible"
  | "substrate_attestation_required"
  | "substrate_kind_not_allowed"
  | "provider_not_allowed"
  | "jurisdiction_not_allowed"
  | "required_capability_missing"
  | "cpu_capacity_insufficient"
  | "memory_capacity_insufficient"
  | "storage_capacity_insufficient"
  | "gpu_capability_missing"
  | "no_eligible_substrate"
  | "reservation_exceeds_snapshot"
  | "reservation_expired"
  | "warden_decision_missing"
  | "warden_decision_denied"
  | "warden_reservation_mismatch"
  | "warden_substrate_mismatch"
  | "warden_identity_mismatch"
  | "warden_decision_expired"
  | "evidence_requirement_missing";

export interface WorkloadRequirementV1 {
  workloadRef: string;
  correlationId: string;
  principalRef: string;
  representedEntityRef: string;
  editionRef: string;
  licenceRefs: readonly string[];
  requiredCapabilities: readonly string[];
  minimumCpuUnits: number;
  minimumMemoryMiB: number;
  minimumStorageMiB: number;
  gpuRequirement: GpuRequirement;
  allowedSubstrateKinds: readonly SubstrateKind[];
  preferredSubstrateKinds: readonly SubstrateKind[];
  allowedJurisdictionRefs: readonly string[];
  forbiddenJurisdictionRefs: readonly string[];
  dataClass: DataClass;
  resilienceProfile: ResilienceProfile;
  evidenceRequired: true;
}

export interface SubstrateCapacitySnapshotV1 {
  snapshotRef: string;
  substrateInstanceRef: string;
  substrateKind: SubstrateKind;
  providerRef: string;
  productRef?: string;
  ownerRef: string;
  operatorRef: string;
  locationRef?: string;
  jurisdictionRef: string;
  status: CapacityStatus;
  attested: boolean;
  availableCpuUnits: number;
  availableMemoryMiB: number;
  availableStorageMiB: number;
  gpuCapabilities: readonly string[];
  capabilityRefs: readonly string[];
  bindingRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  sourceDigest: string;
}

export interface PlacementPolicyV1 {
  policyRef: string;
  allowedSubstrateKinds: readonly SubstrateKind[];
  preferredSubstrateKinds: readonly SubstrateKind[];
  allowDegraded: boolean;
  requireAttestation: boolean;
  requiredCapabilityRefs: readonly string[];
  allowedProviderRefs?: readonly string[];
  forbiddenProviderRefs: readonly string[];
  allowedJurisdictionRefs: readonly string[];
  forbiddenJurisdictionRefs: readonly string[];
  preferLocalBinding: boolean;
  localBindingRef?: string;
  rankingOrder: readonly PlacementRankingKey[];
  effectiveFrom: string;
  effectiveUntil?: string;
  sourceDigest: string;
}

export interface PlacementCandidateV1 {
  substrateInstanceRef: string;
  eligible: boolean;
  rejectionReasons: readonly PlacementReasonCode[];
  rankVector: readonly (string | number)[];
  sourceSnapshotRef: string;
}

export interface PlacementPlanV1 {
  placementRef: string;
  correlationId: string;
  workloadRef: string;
  policyRef: string;
  sourceSnapshotRefs: readonly string[];
  primarySubstrateInstanceRef?: string;
  alternateSubstrateInstanceRefs: readonly string[];
  candidateResults: readonly PlacementCandidateV1[];
  blockingReasons: readonly PlacementReasonCode[];
  reservationRef?: string;
  computedAt: string;
  sourceDigest: string;
  projectionOnly: true;
}

export type CapacityReservationStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "DENIED"
  | "EXPIRED"
  | "RELEASED"
  | "CONSUMED";

export interface CapacityReservationV1 {
  reservationRef: string;
  placementRef: string;
  correlationId: string;
  workloadRef: string;
  substrateInstanceRef: string;
  requestedCpuUnits: number;
  requestedMemoryMiB: number;
  requestedStorageMiB: number;
  status: CapacityReservationStatus;
  requestedAt: string;
  expiresAt: string;
  wardenDecisionRef?: string;
  riverEvidenceRef: string;
}

export interface SubstrateWardenBindingV1 {
  decisionRef: string;
  decision: "ALLOW" | "ESCALATE" | "DENY";
  correlationId: string;
  workloadRef: string;
  reservationRef: string;
  substrateInstanceRef: string;
  principalRef: string;
  representedEntityRef: string;
  decidedAt: string;
  validUntil: string;
  evidenceRequired: true;
}

export interface OrchestrationAttemptV1 {
  attemptRef: string;
  correlationId: string;
  workloadRef: string;
  placementRef: string;
  reservationRef?: string;
  wardenDecisionRef?: string;
  riverEvidenceRef: string;
  status:
    | "PLACEMENT_READY"
    | "BLOCKED_NO_ELIGIBLE_SUBSTRATE"
    | "BLOCKED_RESERVATION_REQUIRED"
    | "BLOCKED_WARDEN_REQUIRED"
    | "DENIED";
  reason?: PlacementReasonCode;
  realWorldEffectOccurred: false;
}

export function stableDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
