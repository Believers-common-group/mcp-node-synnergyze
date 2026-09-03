import { describe, expect, it } from "vitest";

import {
  buildCdeStepWardenDecisionRequestV1,
  compileCdeExecutionPlanToSynnergyzeDraftsV1,
  type CdeExecutionPlanV1,
} from "./cde-execution-plan-bridge.ts";

function fixture(): CdeExecutionPlanV1 {
  return {
    plan_id: "CDE-PLAN-VOI-TEST-001",
    environment: "TEST_FIXTURE",
    decision_ref: "CDE-DEC-VOI-TEST-002",
    warden_decision_ref: "TEST-WARDEN-DECISION-NONPRODUCTION-001",
    target_scope: {
      programme_ref: "CDE-PILOT-VOI-001",
      location_refs: ["VOI-LOC-TEST-A", "VOI-LOC-TEST-B"],
      product_refs: ["VOI-SKU-TEST-DENIM-5012"],
      valid_from: "2026-09-02T02:00:00+05:30",
      valid_to: "2026-09-09T02:00:00+05:30",
    },
    steps: [
      {
        step_id: "STEP-001",
        connector: "ERP",
        action: "TEST_ONLY_TRANSFER_15_UNITS",
        target_ref: "VOI-SKU-TEST-DENIM-5012",
        payload_digest_sha256: "97f9e3b0ab388674b425f21cd8da8da005f936b2abd2d3c6bfd978a578293c1e",
        rollback: { action: "TEST_ONLY_REVERSE_TRANSFER" },
      },
      {
        step_id: "STEP-002",
        connector: "POS",
        action: "TEST_ONLY_SET_DISCOUNT_25_PERCENT",
        target_ref: "VOI-SKU-TEST-DENIM-5012",
        payload_digest_sha256: "99cb29fd2d2e3f41f1923c47972861b3beb6852cfb8e608950d83441b7b4b904",
        rollback: { action: "TEST_ONLY_RESTORE_DISCOUNT_20_PERCENT" },
      },
      {
        step_id: "STEP-003",
        connector: "WOOQER",
        action: "TEST_ONLY_CREATE_MERCHANDISING_TASK",
        target_ref: "VOI-LOC-TEST-B",
        payload_digest_sha256: "b32524b5ba12385f4db42fcf84fbf1345a6b3967889c8825c5c26cc3533628f1",
        rollback: { action: "TEST_ONLY_CANCEL_TASK" },
      },
    ],
    production_effect_allowed: false,
  };
}

const request = (plan: CdeExecutionPlanV1, correlationId = "CDE-CORR-VOI-001") => ({
  plan,
  actorRef: "DIGITALME-TEST-COMMERCIAL-OPERATOR-001",
  contextRef: "CDE-CONTEXT-VOI-TEST-001",
  compiledAt: "2026-09-02T04:00:00+05:30",
  correlationId,
});

const representation = {
  resolutionRef: "REP-CDE-VOI-TEST-001",
  actorRef: "DIGITALME-TEST-COMMERCIAL-OPERATOR-001",
  representedPrincipalRef: "VOI-TEST-PRINCIPAL-001",
  actingCapacityRef: "VOI-COMMERCIAL-OPERATOR-TEST",
  contextRef: "CDE-CONTEXT-VOI-TEST-001",
  authorityRefs: ["CDE-COMMERCIAL-WARDEN-DECISION:TEST-WARDEN-DECISION-NONPRODUCTION-001"],
  policyRefs: ["POLICY-CDE-TEST-FIXTURE-001"],
  sourceRefs: ["CDE-DECISION:CDE-DEC-VOI-TEST-002"],
  resolvedAt: "2026-09-02T03:59:00+05:30",
};

describe("CDE execution plan → Synnergyze draft bridge", () => {
  it("compiles the synthetic VOI plan into non-authoritative action drafts", () => {
    const result = compileCdeExecutionPlanToSynnergyzeDraftsV1(request(fixture()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bundle.program.state).toBe("READY_FOR_AUTHORIZATION");
    expect(result.bundle.program.authorized).toBe(false);
    expect(result.bundle.events).toHaveLength(3);
    expect(result.bundle.events.map((event) => event.capabilityRef)).toEqual([
      "cde.connector.erp.execute",
      "cde.connector.pos.execute",
      "cde.connector.wooqer.execute",
    ]);
    expect(result.bundle.events.every((event) => event.authorized === false)).toBe(true);
    expect(
      result.bundle.events.every((event) =>
        event.requirementRefs.includes("WARDEN_EVALUATION_REQUIRED"),
      ),
    ).toBe(true);
    expect(result.bundle.events.every((event) => !("actionToken" in event))).toBe(true);
    expect(result.bundle.events.every((event) => event.requestedEffect?.startsWith("CDE-STEP-EFFECT:sha256:"))).toBe(true);
    expect(result.sourceCommercialWardenDecisionRef).toBe(
      "TEST-WARDEN-DECISION-NONPRODUCTION-001",
    );
    expect(result.bundle.program.dependencyRefs).toContain(
      "CDE-COMMERCIAL-WARDEN-DECISION:TEST-WARDEN-DECISION-NONPRODUCTION-001",
    );
  });

  it("fails closed when a step target is outside the CDE scope", () => {
    const plan = fixture();
    plan.steps = [{ ...plan.steps[0]!, target_ref: "VOI-LOC-OUTSIDE-SCOPE" }];

    const result = compileCdeExecutionPlanToSynnergyzeDraftsV1(request(plan));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("TARGET_OUTSIDE_SCOPE");
  });

  it("does not allow production effects in staging or test fixtures", () => {
    const plan = fixture();
    plan.production_effect_allowed = true;

    const result = compileCdeExecutionPlanToSynnergyzeDraftsV1(request(plan));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PRODUCTION_EFFECT_ENVIRONMENT_MISMATCH");
  });

  it("requires an explicit mapping instead of guessing OTHER connectors", () => {
    const plan = fixture();
    plan.steps = [{ ...plan.steps[0]!, connector: "OTHER" }];

    const result = compileCdeExecutionPlanToSynnergyzeDraftsV1(request(plan));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("UNMAPPED_CONNECTOR");
  });

  it("rejects compilation outside the plan's effective window", () => {
    const plan = fixture();
    const result = compileCdeExecutionPlanToSynnergyzeDraftsV1({
      ...request(plan),
      compiledAt: "2026-09-10T04:00:00+05:30",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PLAN_OUTSIDE_EFFECTIVE_WINDOW");
  });

  it("is deterministic for identical plan and compilation context", () => {
    const first = compileCdeExecutionPlanToSynnergyzeDraftsV1(request(fixture()));
    const second = compileCdeExecutionPlanToSynnergyzeDraftsV1(request(fixture()));
    expect(first).toEqual(second);
  });

  it("rechecks the CDE window while building the per-step Warden request", () => {
    const result = buildCdeStepWardenDecisionRequestV1({
      plan: fixture(),
      stepId: "STEP-001",
      representation,
      requestedAt: "2026-09-02T04:01:00+05:30",
      correlationId: "CDE-CORR-VOI-WARDEN-001",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.action).toBe("TEST_ONLY_TRANSFER_15_UNITS");
    expect(result.request.capabilityRef).toBe("cde.connector.erp.execute");
    expect(result.request.targetRef).toBe("VOI-SKU-TEST-DENIM-5012");
    expect(result.request.requestedEffect?.startsWith("CDE-STEP-EFFECT:sha256:")).toBe(true);
    expect("actionToken" in result.request).toBe(false);
  });

  it("blocks a Warden request when the compiled CDE plan has expired", () => {
    const result = buildCdeStepWardenDecisionRequestV1({
      plan: fixture(),
      stepId: "STEP-001",
      representation,
      requestedAt: "2026-09-10T04:01:00+05:30",
      correlationId: "CDE-CORR-VOI-WARDEN-EXPIRED",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("CDE_PLAN");
    expect(result.code).toBe("PLAN_OUTSIDE_EFFECTIVE_WINDOW");
  });

  it("fails closed if a requested CDE step does not exist", () => {
    const result = buildCdeStepWardenDecisionRequestV1({
      plan: fixture(),
      stepId: "STEP-404",
      representation,
      requestedAt: "2026-09-02T04:01:00+05:30",
      correlationId: "CDE-CORR-VOI-WARDEN-404",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("CDE_PLAN");
    expect(result.code).toBe("STEP_NOT_FOUND");
  });
});
