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
