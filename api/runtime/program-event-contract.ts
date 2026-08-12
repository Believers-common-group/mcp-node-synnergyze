export const PROGRAM_EVENT_CONTRACT_VERSION = "synnergyze.program-event.v1" as const;

export type RegistryResolutionStatus =
  | "RESOLVED"
  | "UNKNOWN"
  | "AMBIGUOUS"
  | "NOT_APPLICABLE"
  | "REQUIRES_EVIDENCE"
  | "REQUIRES_AUTHORIZATION"
  | "DENIED"
  | "CONFLICT"
  | "EXPIRED"
  | "REVOKED"
  | "SUPERSEDED"
  | "UNSUPPORTED";

export type ProgramState =
  | "DRAFT"
  | "READY_FOR_RESOLUTION"
  | "BLOCKED_REQUIREMENT"
  | "READY_FOR_AUTHORIZATION"
  | "AUTHORIZED"
  | "RUNNING"
  | "PAUSED"
  | "DENIED"
  | "FAILED"
  | "EXCEPTION"
  | "COMPENSATING"
  | "VERIFIED"
  | "EFFECT_RECORDED"
  | "SETTLED_RECONCILED"
  | "CLOSED"
  | "SUPERSEDED";

export type EventExecutionState =
  | "PENDING"
  | "BLOCKED_REQUIREMENT"
  | "READY_FOR_AUTHORIZATION"
  | "DENIED"
  | "AUTHORIZED"
  | "EVIDENCE_RESERVED"
  | "EXECUTED"
  | "CONFIRMATION_MISMATCH"
  | "VERIFIED"
  | "EFFECT_RECORDED"
  | "SETTLED_RECONCILED"
  | "EXCEPTION";

export interface ProgramContractV1 {
  contractVersion: typeof PROGRAM_EVENT_CONTRACT_VERSION;
  programRef: string;
  programType: string;
  version: number;
  sourceRef: string;
  ownerContextRef: string;
  missionPurpose: string;
  targetOutcomeRefs: string[];
  contextRefs: string[];
  participantRoleRefs: string[];
  dependencyRefs: string[];
  constraintRefs: string[];
  authorityRefs: string[];
  requirementRefs: string[];
  economicRuleRefs: string[];
  settlementContextRefs: string[];
  state: ProgramState;
  supersedesProgramRef?: string;
}

export interface EventContractV1 {
  eventDefinitionRef: string;
  programRef: string;
  sequence: number;
  actorRef: string;
  actingCapacityRef?: string;
  placeRef?: string;
  thingRef: string;
  requestedCapability: string;
  dependencyRefs: string[];
  constraintRefs: string[];
  authorityRefs: string[];
  requirementRefs: string[];
  economicRuleRefs: string[];
}

export interface RegistryResolutionBundle {
  requestRef: string;
  r1: RegistryResolutionStatus;
  r2: RegistryResolutionStatus;
  r3: RegistryResolutionStatus;
  r4: RegistryResolutionStatus;
  r5: RegistryResolutionStatus;
  candidateAction?: string;
  unmetRequirementRefs: string[];
  authorityRefs: string[];
  evidenceRequirementRefs: string[];
  expectedEffectRefs: string[];
  economicContextRefs: string[];
}

export interface PreparedProgramAction {
  correlationId: string;
  idempotencyKey: string;
  programRef: string;
  eventDefinitionRef: string;
  actorRef: string;
  actingCapacityRef?: string;
  targetRef: string;
  requestedCapability: string;
  candidateAction: string;
  authorityRefs: string[];
  evidenceRequirementRefs: string[];
}

export interface WardenAuthorizationResult {
  decisionRef: string;
  outcome: "AUTHORIZED" | "DENIED" | "REVIEW_REQUIRED";
  reason?: string;
}

export interface RiverReservationResult {
  reservationRef: string;
  status: "RESERVED" | "UNAVAILABLE";
  reason?: string;
}

export interface ExecutionReceipt {
  receiptRef: string;
  providerOperationRef?: string;
}

export interface ConfirmationReceipt {
  confirmationRef: string;
  matched: boolean;
  reason?: string;
}

export interface RiverSealReceipt {
  evidenceRef: string;
}

export interface EffectReceipt {
  effectRef: string;
}

export interface EconomicConsequenceReceipt {
  consequenceRef: string;
  settlementState: "NOT_REQUIRED" | "PENDING" | "RECONCILED";
}

export type ProgramTraceStep =
  | "RESOLVE_R1_R5"
  | "PREPARE_ACTION"
  | "WARDEN_AUTHORIZE"
  | "RIVER_RESERVE"
  | "EXECUTE_CAPABILITY"
  | "CONFIRM_RESULT"
  | "RIVER_SEAL"
  | "RECORD_EFFECT"
  | "ECONOMIC_CONSEQUENCE"
  | "UPDATE_STATE";

export interface ProgramExecutionTraceEntry {
  step: ProgramTraceStep;
  state: ProgramState;
  ref?: string;
  detail?: string;
}

export interface ProgramExecutionResult {
  programRef: string;
  eventDefinitionRef: string;
  state: ProgramState;
  eventState: EventExecutionState;
  trace: ProgramExecutionTraceEntry[];
  wardenDecisionRef?: string;
  evidenceRef?: string;
  effectRef?: string;
  economicConsequenceRef?: string;
  reason?: string;
}

export interface ProgramExecutionGateway {
  resolveR1ToR5(program: ProgramContractV1, event: EventContractV1): Promise<RegistryResolutionBundle>;
  authorize(action: PreparedProgramAction, resolution: RegistryResolutionBundle): Promise<WardenAuthorizationResult>;
  reserveEvidence(action: PreparedProgramAction, decision: WardenAuthorizationResult): Promise<RiverReservationResult>;
  executeCapability(action: PreparedProgramAction, reservation: RiverReservationResult): Promise<ExecutionReceipt>;
  confirmResult(action: PreparedProgramAction, receipt: ExecutionReceipt): Promise<ConfirmationReceipt>;
  sealEvidence(
    action: PreparedProgramAction,
    receipt: ExecutionReceipt,
    confirmation: ConfirmationReceipt,
  ): Promise<RiverSealReceipt>;
  recordEffect(
    action: PreparedProgramAction,
    confirmation: ConfirmationReceipt,
    evidence: RiverSealReceipt,
    expectedEffectRefs: string[],
  ): Promise<EffectReceipt>;
  recordEconomicConsequence(
    program: ProgramContractV1,
    event: EventContractV1,
    effect: EffectReceipt,
    economicContextRefs: string[],
  ): Promise<EconomicConsequenceReceipt | null>;
}
