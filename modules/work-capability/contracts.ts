export type WorkCapabilityActorClassV1 = "HUMAN" | "AGENT" | "MACHINE" | "INSTITUTION";

export type CapabilityDemandStateV1 = "COVERED" | "CONSTRAINED" | "MISSING";

export interface ObjectiveWorkRefV1 {
  objectiveRef: string;
  principalRef: string;
  requiredEffectRef: string;
  deadline: string;
}

export interface WorkflowInstanceV1 {
  workflowRef: string;
  objectiveRef: string;
  blueprintRef: string;
  stageRefs: readonly string[];
  workUnitRefs: readonly string[];
  synthetic: true;
}

export interface WorkUnitQualityThresholdsV1 {
  firstPassQuality?: number;
}

export interface WorkUnitV1 {
  workUnitRef: string;
  objectiveRef: string;
  workflowRef: string;
  stageRef: string;
  action: string;
  targetRef: string;
  inputStateRef: string;
  requiredOutputStateRef: string;
  requiredCapabilityRefs: readonly string[];
  qualityThresholds: WorkUnitQualityThresholdsV1;
  deadline: string;
  riskClass: "R1" | "R2" | "R3" | "R4";
  requiredEvidenceRefs: readonly string[];
  correlationId: string;
}

export interface CapabilityV1 {
  capabilityRef: string;
  domain: string;
  operation: string;
  context: Readonly<Record<string, string>>;
  verificationRequired: boolean;
}

export interface ActorCapabilityProfileV1 {
  actorRef: string;
  actorClass: WorkCapabilityActorClassV1;
  capabilityRefs: readonly string[];
  context: Readonly<Record<string, string>>;
  evidenceRefs: readonly string[];
  available: boolean;
  implementationRef?: string;
  versionRef?: string;
  assetRef?: string;
}

export interface CapabilityDemandV1 {
  demandRef: string;
  workUnitRef: string;
  requiredCapabilityRefs: readonly string[];
  state: CapabilityDemandStateV1;
  candidateCompositionRefs: readonly string[];
  missingCapabilityRefs: readonly string[];
}

export interface CandidateCompositionV1 {
  compositionRef: string;
  workUnitRef: string;
  actorRefs: readonly string[];
  capabilityRefs: readonly string[];
  eligible: boolean;
  evidenceConfidence: number;
  expectedFirstPassQuality: number;
  expectedCycleSeconds: number;
}

export interface WorkAssignmentV1 {
  assignmentRef: string;
  workUnitRef: string;
  compositionRef: string;
  actorRefs: readonly string[];
  selectedAt: string;
  selectionReasonCodes: readonly string[];
}

export interface CapabilityObservedPerformanceV1 {
  inputQuantity?: number;
  outputQuantity?: number;
  acceptedQuantity?: number;
  reworkQuantity?: number;
  firstPassQuality?: number;
  cycleSeconds?: number;
}

export interface CapabilityEvidenceV1 {
  capabilityEvidenceRef: string;
  capabilityRef: string;
  actorOrCompositionRef: string;
  workUnitRef: string;
  executionReceiptRef: string;
  verifiedEffectRef: string;
  observedPerformance: CapabilityObservedPerformanceV1;
  evidenceRefs: readonly string[];
  observedAt: string;
  synthetic: true;
}

export interface CapabilityOutcomeV1 {
  outcomeRef: string;
  workUnitRef: string;
  state: "FULL_EFFECT" | "PARTIAL_EFFECT" | "FAILED_EFFECT";
  requiredQuantity: number;
  acceptedQuantity: number;
  firstPassQuality: number;
  requiredFirstPassQuality: number;
}

export interface RemainingWorkProposalV1 {
  proposalRef: string;
  workUnitRef: string;
  remainingQuantity: number;
  reasonCode: "QUANTITY_SHORTFALL";
  automaticExecutionAllowed: false;
}
