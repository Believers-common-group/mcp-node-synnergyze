export type GenesisAssetClassV1 =
  | "LAND"
  | "MALL"
  | "RETAIL"
  | "OFFICE"
  | "INDUSTRIAL"
  | "WAREHOUSE"
  | "HOTEL"
  | "RESIDENTIAL"
  | "HOSPITAL"
  | "EDUCATION"
  | "DATA_CENTRE"
  | "MIXED_USE";

export type GenesisCandidateLifecycleV1 =
  | "DISCOVERED"
  | "IDENTIFIED"
  | "DILIGENCE_READY"
  | "ACQUISITION_READY_CANDIDATE"
  | "ADMISSION_REVIEW"
  | "ADMITTED"
  | "REJECTED"
  | "SUPERSEDED";

export interface GenesisCandidateV1 {
  candidateRef: string;
  candidateType: "PROPERTY";
  displayName: string;
  jurisdictionRef: string;
  assetClass: GenesisAssetClassV1;
  lifecycle: GenesisCandidateLifecycleV1;
  createdAt: string;
  sourceEvidenceRefs: readonly string[];
  correlationId: string;
}

export type CandidateIdentityKindV1 =
  | "ADDRESS"
  | "GEO_POINT"
  | "GEO_POLYGON"
  | "SURVEY_NUMBER"
  | "PID"
  | "EID"
  | "MUNICIPAL_ID"
  | "REGISTERED_DOCUMENT_REF"
  | "OWNER_IDENTIFIER"
  | "DOCUMENT_REF";

export interface CandidateIdentityV1 {
  identityRef: string;
  candidateRef: string;
  kind: CandidateIdentityKindV1;
  normalizedValue: string;
  sourceEvidenceRefs: readonly string[];
  observedAt: string;
}

export type CandidateClaimStateV1 =
  | "OBSERVED"
  | "EVIDENCED"
  | "CORROBORATED_PUBLIC"
  | "AUTHORITATIVELY_VERIFIED"
  | "INFERRED"
  | "DISPUTED"
  | "SUPERSEDED"
  | "REJECTED";

export type ConfidenceBandV1 = "LOW" | "MEDIUM" | "HIGH";

export interface CandidateClaimV1 {
  claimRef: string;
  candidateRef: string;
  claimType: "IDENTITY" | "PROPERTY_ATTRIBUTE" | "RELATIONSHIP" | "APPROVAL" | "GEOMETRY";
  subjectRef: string;
  predicate: string;
  value: string;
  valueUnit?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  sourceEvidenceRefs: readonly string[];
  claimState: CandidateClaimStateV1;
  confidenceBand: ConfidenceBandV1;
  supersedesClaimRef?: string;
}

export type EvidenceStateV1 =
  | "DISCOVERED"
  | "RETRIEVED"
  | "SEALED"
  | "VALIDATED"
  | "STALE"
  | "SUPERSEDED"
  | "REJECTED";

export type EvidenceAccessClassV1 = "PUBLIC" | "CONTROLLED" | "CONFIDENTIAL" | "REGULATED";

export interface CandidateEvidenceV1 {
  evidenceRef: string;
  candidateRef: string;
  evidenceClass: string;
  sourceAuthorityRef?: string;
  sourceSystemRef?: string;
  documentRef?: string;
  retrievedAt: string;
  effectiveAt?: string;
  evidenceState: EvidenceStateV1;
  contentDigest?: string;
  accessClass: EvidenceAccessClassV1;
  sourceLocatorRef?: string;
}

export type CandidateConflictClassificationV1 =
  | "IDENTITY_CONFLICT"
  | "BOUNDARY_CONFLICT"
  | "AREA_CONFLICT"
  | "PARTY_CONFLICT"
  | "CHRONOLOGY_CONFLICT"
  | "APPROVAL_CONFLICT"
  | "USE_CONFLICT"
  | "EVIDENCE_INSUFFICIENT";

export interface CandidateConflictV1 {
  conflictRef: string;
  candidateRef: string;
  claimRefs: readonly string[];
  identityRefs?: readonly string[];
  evidenceRefs: readonly string[];
  classification: CandidateConflictClassificationV1;
  severity: "INFO" | "REVIEW" | "BLOCKING";
  resolutionState: "OPEN" | "RESOLVED" | "WAIVED";
  requiredReviewCapabilityRef: string;
}

export type AcquisitionGateV1 = "G0" | "G1" | "G2" | "G3" | "G4";

export interface EvidenceRequirementV1 {
  requirementRef: string;
  candidateRef: string;
  requirementClass: string;
  category: string;
  assetClass: GenesisAssetClassV1;
  jurisdictionRef: string;
  mandatoryForGate: AcquisitionGateV1;
  waivable: boolean;
  acceptableEvidenceClasses: readonly string[];
  status: "MISSING" | "PARTIAL" | "SATISFIED" | "WAIVED_BY_WARDEN" | "NOT_APPLICABLE";
  reasonCode: string;
  satisfiedByEvidenceRefs: readonly string[];
  waiverDecisionRef?: string;
}

export interface AcquisitionGateProjectionV1 {
  highestPassedGate: AcquisitionGateV1 | "NONE";
  blockedAtGate?: AcquisitionGateV1;
  status: "PASS" | "BLOCKED";
}

export interface AcquisitionReadinessSnapshotV1 {
  snapshotRef: string;
  candidateRef: string;
  gate: AcquisitionGateProjectionV1;
  categoryScores: Readonly<Record<string, number>>;
  blockingRequirementRefs: readonly string[];
  blockingConflictRefs: readonly string[];
  evidenceCoverage: number;
  computedAt: string;
  sourceDigest: string;
  projectionOnly: true;
}
