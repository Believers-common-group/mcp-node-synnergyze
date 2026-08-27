export type RealityMaturityV1 =
  | "M0_MODELLED"
  | "M1_SYNTHETIC"
  | "M2_REPLAYED"
  | "M3_SHADOW"
  | "M4_ADVISORY"
  | "M5_GOVERNED_PILOT"
  | "M6_VERIFIED_LIVE"
  | "M7_ECONOMICALLY_ADMISSIBLE"
  | "M8_SILK_ACTIVE";

export type R0_1RealityMaturityV1 = Extract<
  RealityMaturityV1,
  "M0_MODELLED" | "M1_SYNTHETIC" | "M2_REPLAYED" | "M3_SHADOW"
>;

export type ComputeGovernanceLevelV1 =
  | "CG0_EXPERIMENTAL"
  | "CG1_REPRODUCIBLE"
  | "CG2_EVIDENCE_BOUND"
  | "CG3_POLICY_GOVERNED"
  | "CG4_INDEPENDENTLY_VERIFIABLE"
  | "CG5_CONTROLLED_LIVE"
  | "CG6_ECONOMIC_COMPUTATION"
  | "CG7_SETTLEMENT_GRADE";

export type SimulationModeV1 =
  | "SYNTHETIC"
  | "HISTORICAL_REPLAY"
  | "COUNTERFACTUAL"
  | "SHADOW";

export interface SimulationEffectFlagsV1 {
  mayCreateAuthority: false;
  mayCreateQualification: false;
  mayCreateObligation: false;
  mayCreatePayment: false;
  mayTriggerExecution: false;
}

export interface ComputeGovernanceProfileV1 {
  profileRef: string;
  level: ComputeGovernanceLevelV1;
  policyRef: string;
  evidenceRefs: readonly string[];
  validFrom: string;
  validUntil: string;
  sourceDigest: string;
}

export interface RealityAdmissionPolicyV1 {
  policyRef: string;
  version: string;
  active: boolean;
  maximumAdmittedMaturity: R0_1RealityMaturityV1;
  minimumComputeGovernance: Readonly<Record<R0_1RealityMaturityV1, ComputeGovernanceLevelV1>>;
  sourceDigest: string;
}

export interface RealityAdmissionRequestV1 {
  admissionRequestRef: string;
  objectType: string;
  objectRef: string;
  fromMaturity: RealityMaturityV1;
  requestedMaturity: RealityMaturityV1;
  qualificationSchemeRevisionRefs: readonly string[];
  computeGovernanceProfileRef: string;
  evidenceSnapshotRef: string;
  legalPolicyRefs: readonly string[];
  privacyPolicyRefs: readonly string[];
  authoritySnapshotRef: string;
  riskSnapshotRef: string;
  submittedAt: string;
  effectFlags: SimulationEffectFlagsV1;
  envelopeHash: string;
}

export type RealityAdmissionReasonCodeV1 =
  | "COMPUTE_GOVERNANCE_INSUFFICIENT"
  | "SIMULATION_INPUT_DRIFT"
  | "REALITY_PROMOTION_NOT_PERMITTED"
  | "REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY";

export interface RealityAdmissionDecisionV1 {
  admitted: boolean;
  reasonCodes: readonly RealityAdmissionReasonCodeV1[];
  fromMaturity: RealityMaturityV1;
  requestedMaturity: RealityMaturityV1;
  computeGovernanceLevel: ComputeGovernanceLevelV1;
  envelopeHash: string;
  effectFlags: SimulationEffectFlagsV1;
}
