import type { VerifiedEffectV1 } from "../river/contracts.ts";

export type SynnergyzePlanningStateV1 =
  | "DRAFT"
  | "READY_FOR_RESOLUTION"
  | "BLOCKED_REQUIREMENT"
  | "READY_FOR_AUTHORIZATION";

export interface SynnergyzeEventDraftV1 {
  eventRef: string;
  programRef: string;
  sourcePlanRef: string;
  sourceIntentRef: string;
  sourceStepRef: string;
  sequence: number;
  actorRef: string;
  contextRef: string;
  placeRef?: string;
  targetRef?: string;
  action: string;
  capabilityRef?: string;
  requestedEffect?: string;
  dependencyRefs: readonly string[];
  requirementRefs: readonly string[];
  state: "DRAFT";
  authorized: false;
  correlationId: string;
}

export interface SynnergyzeProgramDraftV1 {
  programRef: string;
  sourcePlanRef: string;
  sourceIntentRef: string;
  sourceExpressionRef: string;
  actorRef: string;
  contextRef: string;
  placeRef?: string;
  thingRef?: string;
  requestedEffect?: string;
  capabilityRef?: string;
  state: SynnergyzePlanningStateV1;
  authorized: false;
  eventRefs: readonly string[];
  dependencyRefs: readonly string[];
  constraintRefs: readonly string[];
  requirementRefs: readonly string[];
  correlationId: string;
  compiledAt: string;
  compilationDigest: string;
}

export interface SynnergyzeProgramEventDraftBundleV1 {
  program: SynnergyzeProgramDraftV1;
  events: readonly SynnergyzeEventDraftV1[];
}

export type SynnergyzeProgramCompileErrorCodeV1 =
  | "EMPTY_PLAN"
  | "INTENT_PLAN_MISMATCH"
  | "CORRELATION_MISMATCH"
  | "QEL_AUTHORITY_VIOLATION"
  | "INVALID_STEP";

export interface SynnergyzeProgramCompileFailureV1 {
  ok: false;
  code: SynnergyzeProgramCompileErrorCodeV1;
  reason: string;
  sourceIntentRef: string;
  sourcePlanRef: string;
  correlationId: string;
}

export interface SynnergyzeProgramCompileSuccessV1 {
  ok: true;
  bundle: SynnergyzeProgramEventDraftBundleV1;
}

export type SynnergyzeProgramCompileResultV1 =
  | SynnergyzeProgramCompileSuccessV1
  | SynnergyzeProgramCompileFailureV1;

export interface SynnergyzeExecutionReceiptV1 {
  receiptRef: string;
  actionRef: string;
  reservationRef: string;
  wardenDecisionRef: string;
  checkpointRef: string;
  programRef: string;
  eventRef: string;
  capabilityRef: string;
  targetRef: string;
  correlationId: string;
  adapterRef: string;
  adapterResultRef: string;
  state: "EXECUTED_UNVERIFIED";
  executedAt: string;
  synthetic: true;
  idempotentReplay: boolean;
}

export interface PostExecutionObservationV1 {
  observationRef: string;
  executionReceiptRef: string;
  actionRef: string;
  programRef: string;
  eventRef: string;
  targetRef: string;
  correlationId: string;
  observerRef: string;
  observedStateRef: string;
  observedAt: string;
  sourceEvidenceRef: string;
  synthetic: true;
}

export type EffectVerificationFailureCodeV1 =
  | "MISSING_OBSERVATION"
  | "EXECUTION_STATE_INVALID"
  | "EXECUTION_RECEIPT_MISMATCH"
  | "ACTION_MISMATCH"
  | "PROGRAM_MISMATCH"
  | "EVENT_MISMATCH"
  | "TARGET_MISMATCH"
  | "CORRELATION_MISMATCH"
  | "INVALID_TIMESTAMP"
  | "OBSERVATION_BEFORE_EXECUTION"
  | "VERIFICATION_BEFORE_OBSERVATION"
  | "OBSERVED_STATE_MISSING"
  | "SOURCE_EVIDENCE_MISSING"
  | "IDEMPOTENCY_CONFLICT";

export interface EffectVerificationSuccessV1 {
  ok: true;
  state: "VERIFIED_EFFECT";
  effect: VerifiedEffectV1;
  idempotentReplay: boolean;
}

export interface EffectVerificationFailureV1 {
  ok: false;
  state: "EXCEPTION";
  code: EffectVerificationFailureCodeV1;
  reason: string;
  executionReceiptRef: string;
  observationRef?: string;
}

export type EffectVerificationResultV1 =
  | EffectVerificationSuccessV1
  | EffectVerificationFailureV1;
