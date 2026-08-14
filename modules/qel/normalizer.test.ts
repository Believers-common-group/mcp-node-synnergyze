import { describe, expect, it } from "vitest";

import type { QelExpressionRequestV1 } from "./contracts.ts";
import { normalizeQelExpressionV1, QEL_3_GRAMMAR_VERSION } from "./normalizer.ts";

function request(overrides: Partial<QelExpressionRequestV1> = {}): QelExpressionRequestV1 {
  return {
    expressionRef: "QEL-EXPR-001",
    rawExpression:
      "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS service_request.create ON THING LAB-SERVICE-DESK-001 THEN EFFECT service_request.created USING CAPABILITY service_request.create",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    contextRef: "ALPHA-NODE-001",
    sourceRef: "TEST-VECTOR-001",
    submittedAt: "2026-08-14T05:45:00.000Z",
    correlationId: "QEL-CORR-001",
    grammarVersion: QEL_3_GRAMMAR_VERSION,
    ...overrides,
  };
}

describe("QEL 3 normalization", () => {
  it("normalizes the canonical Actor/Place/Thing/Effect form without authorization", () => {
    const result = normalizeQelExpressionV1(request());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);

    expect(result.intent).toMatchObject({
      actorRef: "DIGITALME-ALPHA-TEST-001",
      contextRef: "ALPHA-NODE-001",
      placeRef: "ALPHA-NODE-001",
      thingRef: "LAB-SERVICE-DESK-001",
      action: "service_request.create",
      requestedEffect: "service_request.created",
      capabilityRef: "service_request.create",
      authorityState: "UNRESOLVED",
      authorized: false,
    });
    expect(result.plan.status).toBe("DRAFT");
    expect(result.plan.authorized).toBe(false);
    expect(result.plan.constraintRefs).toEqual([
      "QEL_NO_AUTHORIZATION",
      "QEL_NO_EXECUTION",
      "QEL_NO_EFFECT_VERIFICATION",
    ]);
    expect(result.evidence.grammarVersion).toBe("QEL-3.0");
    expect(result.evidence.expressionDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is deterministic for the same expression and context", () => {
    const first = normalizeQelExpressionV1(request());
    const second = normalizeQelExpressionV1(request());

    expect(first).toEqual(second);
  });

  it("does not infer a capability when the expression omits it", () => {
    const result = normalizeQelExpressionV1(
      request({
        rawExpression:
          "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS inspect ON THING MACHINE-001 THEN EFFECT inspection.requested",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);

    expect(result.intent.capabilityRef).toBeUndefined();
    expect(result.plan.steps[0]?.requirementRefs).toContain("CAPABILITY_RESOLUTION_REQUIRED");
    expect(result.intent.authorized).toBe(false);
  });

  it("fails closed on actor-reference mismatch", () => {
    const result = normalizeQelExpressionV1(request({ actorRef: "DIGITALME-OTHER-001" }));

    expect(result).toEqual({
      ok: false,
      code: "AMBIGUOUS_REFERENCE",
      reason: "actor_ref_mismatch",
      expressionRef: "QEL-EXPR-001",
      correlationId: "QEL-CORR-001",
    });
  });

  it("rejects unsupported grammar versions", () => {
    const result = normalizeQelExpressionV1(request({ grammarVersion: "QEL-2.0" }));

    expect(result).toMatchObject({
      ok: false,
      code: "SCHEMA_MISMATCH",
      reason: "unsupported_grammar_version:QEL-2.0",
    });
  });

  it("rejects malformed or unknown trailing syntax rather than guessing", () => {
    const malformed = normalizeQelExpressionV1(
      request({
        rawExpression:
          "IF ACTOR DIGITALME-ALPHA-TEST-001 AT PLACE ALPHA-NODE-001 ACTS inspect ON THING MACHINE-001 THEN EFFECT inspection.requested",
      }),
    );
    const unknown = normalizeQelExpressionV1(
      request({
        rawExpression:
          "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS inspect ON THING MACHINE-001 THEN EFFECT inspection.requested MAGIC TOKEN",
      }),
    );

    expect(malformed).toMatchObject({ ok: false, code: "PARSE_ERROR" });
    expect(unknown).toMatchObject({ ok: false, code: "UNKNOWN_SYMBOL" });
  });
});
