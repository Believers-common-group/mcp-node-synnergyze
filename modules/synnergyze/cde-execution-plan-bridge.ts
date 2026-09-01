import { createHash } from "node:crypto";

import type {
  SynnergyzeEventDraftV1,
  SynnergyzeProgramDraftV1,
  SynnergyzeProgramEventDraftBundleV1,
} from "./contracts.ts";

export type CdeExecutionEnvironmentV1 = "PRODUCTION" | "STAGING" | "TEST_FIXTURE";
export type CdeConnectorV1 =
  | "ERP"
  | "OMS"
  | "POS"
  | "WOOQER"
  | "GENESIS_NODE"
  | "SILK"
  | "OTHER";

export interface CdeTargetScopeV1 {
  programme_ref: string;
  location_refs: readonly string[];
  product_refs: readonly string[];
  valid_from: string;
  valid_to: string;
}

export interface CdeExecutionStepV1 {
  step_id: string;
  connector: CdeConnectorV1;
  action: string;
  target_ref: string;
  payload_digest_sha256?: string | null;
  rollback: Readonly<Record<string, unknown>>;
}

export interface CdeExecutionPlanV1 {
  plan_id: string;
  environment: CdeExecutionEnvironmentV1;
  decision_ref: string;
  warden_decision_ref: string;
  target_scope: CdeTargetScopeV1;
  steps: readonly CdeExecutionStepV1[];
  production_effect_allowed: boolean;
}

export interface CdeExecutionPlanCompileRequestV1 {
  plan: CdeExecutionPlanV1;
  actorRef: string;
  contextRef: string;
  correlationId: string;
  compiledAt: string;
}

export interface CdeSynnergyzeStepBindingV1 {
  eventRef: string;
  sourceStepRef: string;
  connector: Exclude<CdeConnectorV1, "OTHER">;
  capabilityRef: string;
  targetRef: string;
  payloadDigestSha256?: string | null;
  rollback: Readonly<Record<string, unknown>>;
}

export type CdeExecutionPlanCompileErrorCodeV1 =
  | "IDENTITY_CONTEXT_REQUIRED"
  | "PLAN_IDENTITY_REQUIRED"
  | "EMPTY_PLAN"
  | "DUPLICATE_STEP_ID"
  | "INVALID_SCOPE_TIME"
  | "PLAN_OUTSIDE_EFFECTIVE_WINDOW"
  | "PRODUCTION_EFFECT_ENVIRONMENT_MISMATCH"
  | "UNMAPPED_CONNECTOR"
  | "TARGET_OUTSIDE_SCOPE"
  | "INVALID_STEP";

export interface CdeExecutionPlanCompileFailureV1 {
  ok: false;
  code: CdeExecutionPlanCompileErrorCodeV1;
  reason: string;
  planRef: string;
  decisionRef: string;
  correlationId: string;
}

export interface CdeExecutionPlanCompileSuccessV1 {
  ok: true;
  bundle: SynnergyzeProgramEventDraftBundleV1;
  bindings: readonly CdeSynnergyzeStepBindingV1[];
  sourceCommercialDecisionRef: string;
  sourceCommercialWardenDecisionRef: string;
  environment: CdeExecutionEnvironmentV1;
  productionEffectAllowed: boolean;
}

export type CdeExecutionPlanCompileResultV1 =
  | CdeExecutionPlanCompileFailureV1
  | CdeExecutionPlanCompileSuccessV1;

const CAPABILITY_BY_CONNECTOR: Readonly<Record<Exclude<CdeConnectorV1, "OTHER">, string>> = {
  ERP: "cde.connector.erp.execute",
  OMS: "cde.connector.oms.execute",
  POS: "cde.connector.pos.execute",
  WOOQER: "cde.connector.wooqer.execute",
  GENESIS_NODE: "cde.connector.genesis_node.execute",
  SILK: "cde.connector.silk.execute",
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function fail(
  request: CdeExecutionPlanCompileRequestV1,
  code: CdeExecutionPlanCompileErrorCodeV1,
  reason: string,
): CdeExecutionPlanCompileFailureV1 {
  return {
    ok: false,
    code,
    reason,
    planRef: request.plan.plan_id,
    decisionRef: request.plan.decision_ref,
    correlationId: request.correlationId,
  };
}

export function compileCdeExecutionPlanToSynnergyzeDraftsV1(
  request: CdeExecutionPlanCompileRequestV1,
): CdeExecutionPlanCompileResultV1 {
  const { plan } = request;

  if (!request.actorRef || !request.contextRef || !request.correlationId) {
    return fail(request, "IDENTITY_CONTEXT_REQUIRED", "actor_context_and_correlation_are_required");
  }
  if (!plan.plan_id || !plan.decision_ref || !plan.warden_decision_ref) {
    return fail(request, "PLAN_IDENTITY_REQUIRED", "plan_decision_and_warden_references_are_required");
  }
  if (plan.steps.length === 0) {
    return fail(request, "EMPTY_PLAN", "cde_execution_plan_contains_no_steps");
  }

  const stepIds = plan.steps.map((step) => step.step_id);
  if (new Set(stepIds).size !== stepIds.length) {
    return fail(request, "DUPLICATE_STEP_ID", "cde_execution_plan_step_ids_must_be_unique");
  }

  const validFrom = parseInstant(plan.target_scope.valid_from);
  const validTo = parseInstant(plan.target_scope.valid_to);
  const compiledAt = parseInstant(request.compiledAt);
  if (
    validFrom === undefined ||
    validTo === undefined ||
    compiledAt === undefined ||
    validTo <= validFrom
  ) {
    return fail(request, "INVALID_SCOPE_TIME", "cde_target_scope_time_window_is_invalid");
  }
  if (compiledAt < validFrom || compiledAt > validTo) {
    return fail(request, "PLAN_OUTSIDE_EFFECTIVE_WINDOW", "cde_plan_is_not_effective_at_compilation_time");
  }

  if (plan.production_effect_allowed && plan.environment !== "PRODUCTION") {
    return fail(
      request,
      "PRODUCTION_EFFECT_ENVIRONMENT_MISMATCH",
      "production_effect_requires_production_environment",
    );
  }

  const allowedTargets = new Set([
    ...plan.target_scope.location_refs,
    ...plan.target_scope.product_refs,
  ]);
  if (allowedTargets.size === 0) {
    return fail(request, "TARGET_OUTSIDE_SCOPE", "cde_target_scope_contains_no_executable_targets");
  }

  for (const [index, step] of plan.steps.entries()) {
    if (!step.step_id || !step.action || !step.target_ref || !step.rollback) {
      return fail(request, "INVALID_STEP", `invalid_cde_step_at_index:${index}`);
    }
    if (step.connector === "OTHER") {
      return fail(request, "UNMAPPED_CONNECTOR", `explicit_connector_mapping_required:${step.step_id}`);
    }
    if (!allowedTargets.has(step.target_ref)) {
      return fail(request, "TARGET_OUTSIDE_SCOPE", `step_target_outside_cde_scope:${step.step_id}`);
    }
  }

  const scopeIdentity = {
    programmeRef: plan.target_scope.programme_ref,
    locationRefs: unique(plan.target_scope.location_refs),
    productRefs: unique(plan.target_scope.product_refs),
    validFrom: plan.target_scope.valid_from,
    validTo: plan.target_scope.valid_to,
  };
  const scopeDigest = `sha256:${digest(JSON.stringify(scopeIdentity))}`;
  const canonicalInput = JSON.stringify({
    planId: plan.plan_id,
    environment: plan.environment,
    decisionRef: plan.decision_ref,
    commercialWardenDecisionRef: plan.warden_decision_ref,
    scope: scopeIdentity,
    steps: plan.steps.map((step) => ({
      stepId: step.step_id,
      connector: step.connector,
      action: step.action,
      targetRef: step.target_ref,
      payloadDigestSha256: step.payload_digest_sha256 ?? null,
      rollback: step.rollback,
    })),
    productionEffectAllowed: plan.production_effect_allowed,
    actorRef: request.actorRef,
    contextRef: request.contextRef,
    correlationId: request.correlationId,
  });
  const compilationDigest = `sha256:${digest(canonicalInput)}`;
  const identitySeed = digest(
    [plan.plan_id, plan.decision_ref, request.correlationId, compilationDigest].join("|"),
  ).slice(0, 20);
  const programRef = `SYNNERGYZE-CDE-PROGRAM:${identitySeed}`;

  // The commercial Warden decision is provenance/scope evidence only here.
  // It is deliberately NOT converted into an action token. Each event remains
  // non-authoritative and must pass the normal Warden request/execution gates.
  const dependencyRefs = unique([
    `CDE-DECISION:${plan.decision_ref}`,
    `CDE-COMMERCIAL-WARDEN-DECISION:${plan.warden_decision_ref}`,
  ]);
  const requirementRefs = [
    "WARDEN_EVALUATION_REQUIRED",
    "AUTHORITY_RESOLUTION_REQUIRED",
  ] as const;

  const events: SynnergyzeEventDraftV1[] = plan.steps.map((step, index) => {
    const connector = step.connector as Exclude<CdeConnectorV1, "OTHER">;
    return {
      eventRef: `SYNNERGYZE-CDE-EVENT:${identitySeed}:${String(index + 1).padStart(3, "0")}`,
      programRef,
      sourcePlanRef: plan.plan_id,
      sourceIntentRef: plan.decision_ref,
      sourceStepRef: step.step_id,
      sequence: index + 1,
      actorRef: request.actorRef,
      contextRef: request.contextRef,
      targetRef: step.target_ref,
      action: step.action,
      capabilityRef: CAPABILITY_BY_CONNECTOR[connector],
      dependencyRefs,
      requirementRefs,
      state: "DRAFT",
      authorized: false,
      correlationId: request.correlationId,
    };
  });

  const program: SynnergyzeProgramDraftV1 = {
    programRef,
    sourcePlanRef: plan.plan_id,
    sourceIntentRef: plan.decision_ref,
    sourceExpressionRef: `CDE-EXECUTION-PLAN:${plan.plan_id}`,
    actorRef: request.actorRef,
    contextRef: request.contextRef,
    state: "READY_FOR_AUTHORIZATION",
    authorized: false,
    eventRefs: events.map((event) => event.eventRef),
    dependencyRefs,
    constraintRefs: [
      `CDE-SCOPE:${scopeDigest}`,
      `CDE-ENVIRONMENT:${plan.environment}`,
      `CDE-PRODUCTION-EFFECT:${String(plan.production_effect_allowed)}`,
    ],
    requirementRefs,
    correlationId: request.correlationId,
    compiledAt: request.compiledAt,
    compilationDigest,
  };

  const bindings: CdeSynnergyzeStepBindingV1[] = events.map((event, index) => {
    const step = plan.steps[index]!;
    const connector = step.connector as Exclude<CdeConnectorV1, "OTHER">;
    return {
      eventRef: event.eventRef,
      sourceStepRef: step.step_id,
      connector,
      capabilityRef: CAPABILITY_BY_CONNECTOR[connector],
      targetRef: step.target_ref,
      payloadDigestSha256: step.payload_digest_sha256,
      rollback: step.rollback,
    };
  });

  return {
    ok: true,
    bundle: { program, events },
    bindings,
    sourceCommercialDecisionRef: plan.decision_ref,
    sourceCommercialWardenDecisionRef: plan.warden_decision_ref,
    environment: plan.environment,
    productionEffectAllowed: plan.production_effect_allowed,
  };
}
