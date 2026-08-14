export interface QelExpressionRequestV1 {
  expressionRef: string;
  rawExpression: string;
  actorRef: string;
  contextRef: string;
  sourceRef: string;
  submittedAt: string;
  correlationId: string;
}

export interface NormalizedIntentV1 {
  intentRef: string;
  actorRef: string;
  contextRef: string;
  placeRef?: string;
  thingRef?: string;
  action: string;
  requestedEffect?: string;
  capabilityRef?: string;
  authorityState: "UNRESOLVED";
  authorized: false;
  sourceExpressionRef: string;
  correlationId: string;
}

export interface ProgramPlanStepDraftV1 {
  stepRef: string;
  action: string;
  targetRef?: string;
  dependencyRefs: readonly string[];
  requirementRefs: readonly string[];
}

export interface ProgramPlanDraftV1 {
  planRef: string;
  intentRef: string;
  status: "DRAFT";
  authorized: false;
  steps: readonly ProgramPlanStepDraftV1[];
  dependencyRefs: readonly string[];
  constraintRefs: readonly string[];
  correlationId: string;
}
