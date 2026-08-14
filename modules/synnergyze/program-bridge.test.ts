import { describe, expect, it } from "vitest";

import type { NormalizedIntentV1, ProgramPlanDraftV1 } from "../qel/contracts.ts";
import { normalizeQelExpressionV1 } from "../qel/normalizer.ts";
import { compileQelPlanToSynnergyzeDraftsV1 } from "./program-bridge.ts";

const compiledAt = "2026-08-14T06:00:00Z";

function normalize(capability = true) {
  return normalizeQelExpressionV1({
    expressionRef: capability ? "QEL-EXPR-BRIDGE-001" : "QEL-EXPR-BRIDGE-002",
    rawExpression: capability
      ? "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS service_request.create ON THING LAB-SERVICE-DESK-001 THEN EFFECT SERVICE_REQUEST_PREPARED USING CAPABILITY service_request.create"
      : "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS service_request.create ON THING LAB-SERVICE-DESK-001 THEN EFFECT SERVICE_REQUEST_PREPARED",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    contextRef: "ALPHA-NODE-001",
    sourceRef: "TEST-SOURCE-001",
    submittedAt: "2026-08-14T05:59:00Z",
    correlationId: capability ? "CORR-BRIDGE-001" : "CORR-BRIDGE-002",
    grammarVersion: "QEL-3.0",
  });
}

describe("VSR-NETWORK-QEL-PROGRAM-BRIDGE-001", () => {
  it("compiles a resolved QEL draft into non-authorized Program/Event drafts", () => {
    const normalized = normalize(true);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const result = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: normalized.plan,
      compiledAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bundle.program.state).toBe("READY_FOR_AUTHORIZATION");
    expect(result.bundle.program.authorized).toBe(false);
    expect(result.bundle.events).toHaveLength(1);
    expect(result.bundle.events[0]?.state).toBe("DRAFT");
    expect(result.bundle.events[0]?.authorized).toBe(false);
    expect(result.bundle.events[0]?.action).toBe("service_request.create");
    expect(result.bundle.events[0]?.capabilityRef).toBe("service_request.create");
    expect(result.bundle.program.sourceIntentRef).toBe(normalized.intent.intentRef);
    expect(result.bundle.program.sourcePlanRef).toBe(normalized.plan.planRef);
    expect("wardenDecisionRef" in result.bundle.program).toBe(false);
    expect("evidenceReservationRef" in result.bundle.program).toBe(false);
    expect("effectRef" in result.bundle.program).toBe(false);
  });

  it("blocks a QEL plan whose capability remains unresolved", () => {
    const normalized = normalize(false);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const result = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: normalized.plan,
      compiledAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bundle.program.state).toBe("BLOCKED_REQUIREMENT");
    expect(result.bundle.program.requirementRefs).toContain("CAPABILITY_RESOLUTION_REQUIRED");
    expect(result.bundle.program.capabilityRef).toBeUndefined();
  });

  it("is deterministic for identical QEL intent and plan input", () => {
    const normalized = normalize(true);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const first = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: normalized.plan,
      compiledAt,
    });
    const second = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: normalized.plan,
      compiledAt: "2026-08-14T07:00:00Z",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.bundle.program.programRef).toBe(second.bundle.program.programRef);
    expect(first.bundle.program.compilationDigest).toBe(second.bundle.program.compilationDigest);
    expect(first.bundle.program.eventRefs).toEqual(second.bundle.program.eventRefs);
  });

  it("preserves declared step order, dependencies and source lineage", () => {
    const normalized = normalize(true);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const plan: ProgramPlanDraftV1 = {
      ...normalized.plan,
      steps: [
        {
          stepRef: "QEL-STEP:CUSTOM:001",
          action: "profile.resolve",
          targetRef: "LAB-SERVICE-DESK-001",
          dependencyRefs: ["ALPHA-NODE-001"],
          requirementRefs: [],
        },
        {
          stepRef: "QEL-STEP:CUSTOM:002",
          action: "service_request.create",
          targetRef: "LAB-SERVICE-DESK-001",
          dependencyRefs: ["QEL-STEP:CUSTOM:001"],
          requirementRefs: ["WARDEN_EVALUATION_REQUIRED", "AUTHORITY_RESOLUTION_REQUIRED"],
        },
      ],
    };

    const result = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan,
      compiledAt,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bundle.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(result.bundle.events.map((event) => event.sourceStepRef)).toEqual([
      "QEL-STEP:CUSTOM:001",
      "QEL-STEP:CUSTOM:002",
    ]);
    expect(result.bundle.events[1]?.dependencyRefs).toEqual(["QEL-STEP:CUSTOM:001"]);
    expect(result.bundle.events[0]?.requestedEffect).toBeUndefined();
    expect(result.bundle.events[1]?.requestedEffect).toBe("SERVICE_REQUEST_PREPARED");
  });

  it("fails closed when the plan has no Event steps", () => {
    const normalized = normalize(true);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const emptyPlan: ProgramPlanDraftV1 = { ...normalized.plan, steps: [] };
    const result = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: emptyPlan,
      compiledAt,
    });

    expect(result).toMatchObject({ ok: false, code: "EMPTY_PLAN" });
  });

  it("fails closed on intent/plan or correlation lineage mismatch", () => {
    const normalized = normalize(true);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const wrongIntentPlan: ProgramPlanDraftV1 = {
      ...normalized.plan,
      intentRef: "QEL-INTENT:OTHER",
    };
    const intentMismatch = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: wrongIntentPlan,
      compiledAt,
    });
    expect(intentMismatch).toMatchObject({ ok: false, code: "INTENT_PLAN_MISMATCH" });

    const wrongCorrelationPlan: ProgramPlanDraftV1 = {
      ...normalized.plan,
      correlationId: "CORR-OTHER",
    };
    const correlationMismatch = compileQelPlanToSynnergyzeDraftsV1({
      intent: normalized.intent,
      plan: wrongCorrelationPlan,
      compiledAt,
    });
    expect(correlationMismatch).toMatchObject({ ok: false, code: "CORRELATION_MISMATCH" });
  });

  it("rejects runtime input that tries to smuggle authorization through QEL", () => {
    const normalized = normalize(true);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const unsafeIntent = {
      ...normalized.intent,
      authorized: true,
    } as unknown as NormalizedIntentV1;

    const result = compileQelPlanToSynnergyzeDraftsV1({
      intent: unsafeIntent,
      plan: normalized.plan,
      compiledAt,
    });

    expect(result).toMatchObject({ ok: false, code: "QEL_AUTHORITY_VIOLATION" });
  });
});
