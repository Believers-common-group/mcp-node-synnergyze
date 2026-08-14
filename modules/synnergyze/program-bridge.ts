import { createHash } from "node:crypto";

import type { NormalizedIntentV1, ProgramPlanDraftV1 } from "../qel/contracts.ts";
import type {
  SynnergyzeEventDraftV1,
  SynnergyzePlanningStateV1,
  SynnergyzeProgramCompileResultV1,
  SynnergyzeProgramDraftV1,
} from "./contracts.ts";

export interface SynnergyzeProgramCompileRequestV1 {
  intent: NormalizedIntentV1;
  plan: ProgramPlanDraftV1;
  compiledAt: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function planningState(
  intent: NormalizedIntentV1,
  plan: ProgramPlanDraftV1,
  requirementRefs: readonly string[],
): SynnergyzePlanningStateV1 {
  if (!intent.placeRef || !intent.thingRef) {
    return "READY_FOR_RESOLUTION";
  }

  if (!intent.capabilityRef || requirementRefs.includes("CAPABILITY_RESOLUTION_REQUIRED")) {
    return "BLOCKED_REQUIREMENT";
  }

  const unresolvedOperationalRequirement = requirementRefs.some(
    (requirementRef) =>
      requirementRef !== "WARDEN_EVALUATION_REQUIRED" &&
      requirementRef !== "AUTHORITY_RESOLUTION_REQUIRED",
  );

  if (unresolvedOperationalRequirement) {
    return "BLOCKED_REQUIREMENT";
  }

  if (plan.status === "DRAFT") {
    return "READY_FOR_AUTHORIZATION";
  }

  return "DRAFT";
}

function fail(
  code: Exclude<SynnergyzeProgramCompileResultV1, { ok: true }>["code"],
  reason: string,
  intent: NormalizedIntentV1,
  plan: ProgramPlanDraftV1,
): SynnergyzeProgramCompileResultV1 {
  return {
    ok: false,
    code,
    reason,
    sourceIntentRef: intent.intentRef,
    sourcePlanRef: plan.planRef,
    correlationId: intent.correlationId,
  };
}

export function compileQelPlanToSynnergyzeDraftsV1(
  request: SynnergyzeProgramCompileRequestV1,
): SynnergyzeProgramCompileResultV1 {
  const { intent, plan } = request;

  if (intent.authorized !== false || plan.authorized !== false) {
    return fail(
      "QEL_AUTHORITY_VIOLATION",
      "qel_input_must_remain_non_authoritative",
      intent,
      plan,
    );
  }

  if (plan.intentRef !== intent.intentRef) {
    return fail("INTENT_PLAN_MISMATCH", "plan_intent_ref_mismatch", intent, plan);
  }

  if (plan.correlationId !== intent.correlationId) {
    return fail("CORRELATION_MISMATCH", "plan_correlation_mismatch", intent, plan);
  }

  if (plan.steps.length === 0) {
    return fail("EMPTY_PLAN", "program_plan_contains_no_steps", intent, plan);
  }

  for (const [index, step] of plan.steps.entries()) {
    if (!step.stepRef || !step.action) {
      return fail("INVALID_STEP", `invalid_step_at_index:${index}`, intent, plan);
    }
  }

  const canonicalCompilationInput = JSON.stringify({
    intent: {
      intentRef: intent.intentRef,
      actorRef: intent.actorRef,
      contextRef: intent.contextRef,
      placeRef: intent.placeRef ?? null,
      thingRef: intent.thingRef ?? null,
      action: intent.action,
      requestedEffect: intent.requestedEffect ?? null,
      capabilityRef: intent.capabilityRef ?? null,
      sourceExpressionRef: intent.sourceExpressionRef,
      correlationId: intent.correlationId,
    },
    plan: {
      planRef: plan.planRef,
      intentRef: plan.intentRef,
      steps: plan.steps.map((step) => ({
        stepRef: step.stepRef,
        action: step.action,
        targetRef: step.targetRef ?? null,
        dependencyRefs: [...step.dependencyRefs],
        requirementRefs: [...step.requirementRefs],
      })),
      dependencyRefs: [...plan.dependencyRefs],
      constraintRefs: [...plan.constraintRefs],
      correlationId: plan.correlationId,
    },
  });

  const compilationDigest = `sha256:${digest(canonicalCompilationInput)}`;
  const identitySeed = digest(
    [intent.intentRef, plan.planRef, intent.correlationId, compilationDigest].join("|"),
  ).slice(0, 20);
  const programRef = `SYNNERGYZE-PROGRAM:${identitySeed}`;

  const requirementRefs = unique(plan.steps.flatMap((step) => [...step.requirementRefs]));
  const state = planningState(intent, plan, requirementRefs);

  const events: SynnergyzeEventDraftV1[] = plan.steps.map((step, index) => {
    const sequence = index + 1;
    const eventRef = `SYNNERGYZE-EVENT:${identitySeed}:${String(sequence).padStart(3, "0")}`;

    return {
      eventRef,
      programRef,
      sourcePlanRef: plan.planRef,
      sourceIntentRef: intent.intentRef,
      sourceStepRef: step.stepRef,
      sequence,
      actorRef: intent.actorRef,
      contextRef: intent.contextRef,
      placeRef: intent.placeRef,
      targetRef: step.targetRef ?? intent.thingRef,
      action: step.action,
      capabilityRef: intent.capabilityRef,
      requestedEffect: sequence === plan.steps.length ? intent.requestedEffect : undefined,
      dependencyRefs: [...step.dependencyRefs],
      requirementRefs: [...step.requirementRefs],
      state: "DRAFT",
      authorized: false,
      correlationId: intent.correlationId,
    };
  });

  const program: SynnergyzeProgramDraftV1 = {
    programRef,
    sourcePlanRef: plan.planRef,
    sourceIntentRef: intent.intentRef,
    sourceExpressionRef: intent.sourceExpressionRef,
    actorRef: intent.actorRef,
    contextRef: intent.contextRef,
    placeRef: intent.placeRef,
    thingRef: intent.thingRef,
    requestedEffect: intent.requestedEffect,
    capabilityRef: intent.capabilityRef,
    state,
    authorized: false,
    eventRefs: events.map((event) => event.eventRef),
    dependencyRefs: unique(plan.dependencyRefs),
    constraintRefs: unique(plan.constraintRefs),
    requirementRefs,
    correlationId: intent.correlationId,
    compiledAt: request.compiledAt,
    compilationDigest,
  };

  return {
    ok: true,
    bundle: {
      program,
      events,
    },
  };
}
