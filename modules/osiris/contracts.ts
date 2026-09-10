export type EfomOperationClassV1 = "OBSERVE" | "INFER" | "DISCLOSE" | "ATTEST" | "ACT";
export type EfomVisibilityScopeV1 =
  | "PUBLIC"
  | "NETWORK"
  | "PARTNER"
  | "ESTATE"
  | "REGULATOR"
  | "EMERGENCY";
export type EfomFindingStatusV1 =
  | "HYPOTHESIS"
  | "SUPPORTED"
  | "CONFLICTED"
  | "CORROBORATED"
  | "REJECTED"
  | "SUPERSEDED";

export interface EfomObservationV1 {
  observationRef: string;
  sourceRef: string;
  sourceType: string;
  subjectCandidateRef?: string;
  locationRef?: string;
  terrainClass?: string;
  observedAt: string;
  validUntil?: string;
  contentDigest: string;
  sourceEvidenceRefs: readonly string[];
  confidence: number;
  assuranceLevel?: string;
  visibilityScope: EfomVisibilityScopeV1;
  jurisdictionRef?: string;
  purposeRef: string;
  synthetic?: boolean;
}

export interface EfomFindingV1 {
  findingRef: string;
  findingType: string;
  observationRefs: readonly string[];
  statementDigest: string;
  confidence: number;
  derivedAt: string;
  validUntil?: string;
  sourceEvidenceRefs: readonly string[];
  status: EfomFindingStatusV1;
  supersedesFindingRef?: string;
}

export interface EfomDiscrepancyV1 {
  discrepancyRef: string;
  discrepancyType: string;
  observationRefs: readonly string[];
  findingRefs: readonly string[];
  severity: "INFO" | "REVIEW" | "BLOCKING";
  material: boolean;
  openedAt: string;
  sourceEvidenceRefs: readonly string[];
}

export interface EfomAttestationV1 {
  attestationRef: string;
  attestorPrincipalRef: string;
  authorityRefs: readonly string[];
  evidenceRefs: readonly string[];
  statementDigest: string;
  issuedAt: string;
  validUntil?: string;
  supersedesAttestationRef?: string;
}

export interface EfomPhysicalWorldContextV1 {
  operationClass: EfomOperationClassV1;
  observations: readonly EfomObservationV1[];
  findings: readonly EfomFindingV1[];
  discrepancies: readonly EfomDiscrepancyV1[];
  attestations: readonly EfomAttestationV1[];
}
