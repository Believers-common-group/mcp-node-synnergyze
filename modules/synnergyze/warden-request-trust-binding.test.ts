import { describe, expect, it } from "vitest";

import { normalizeQelExpressionV1 } from "../qel/normalizer.ts";
import type { WardenTrustResolutionV1 } from "../warden/contracts.ts";
import { compileQelPlanToSynnergyzeDraftsV1 } from "./program-bridge.ts";
import { buildWardenDecisionRequestV1 } from "./warden-request-bridge.ts";

function readyPlanningBundle() {
  const normalized = normalizeQelExpressionV1({
    expressionRef: "QEL-EXPR-TRUST-BINDING-001",
    rawExpression:
      "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS CREATE ON THING LAB-SERVICE-DESK-001 THEN EFFECT SERVICE_REQUEST_CREATED USING CAPABILITY service_request.create",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    contextRef: "ALPHA-NODE-001",
    sourceRef: "TEST-SOURCE-TRUST-BINDING-001",
    submittedAt: "2026-08-14T06:00:00Z",
    correlationId: "CORR-WARDEN-TRUST-BINDING-001",
  });
  if (!normalized.ok) throw new Error(`normalization_failed:${normalized.code}`);

  const compiled = compileQelPlanToSynnergyzeDraftsV1({
    intent: normalized.intent,
    plan: normalized.plan,
    compiledAt: "2026-08-14T06:01:00Z",
  });
  if (!compiled.ok) throw new Error(`program_compile_failed:${compiled.code}`);
  return compiled.bundle;
}

describe("WARDEN Trust Fabric request binding", () => {
  it("binds a resolved trust result into the Warden decision request", () => {
    const bundle = readyPlanningBundle();
    const trustResolution: WardenTrustResolutionV1 = {
      resolutionRef: "TRUST-RESOLUTION:STALE-AUTHORITY-001",
      result: "REQUIRES_STEP_UP",
      material: true,
      irreversibleEffect: true,
      reasonCodes: ["stale_authority_assurance"],
    };
    const input = {
      program: bundle.program,
      event: bundle.events[0],
      representation: {
        resolutionRef: "REGISTRY-REPRESENTATION-RESOLUTION-001",
        actorRef: "DIGITALME-ALPHA-TEST-001",
        representedPrincipalRef: "LAB-COMPANY-001",
        actingCapacityRef: "LAB-COMPANY-OPERATOR-001",
        contextRef: "ALPHA-NODE-001",
        authorityRefs: ["AUTH-LAB-OPERATOR-001"],
        policyRefs: ["POLICY-SERVICE-REQUEST-001"],
        sourceRefs: ["REGISTRY-R3-AUTHORITY-001"],
        resolvedAt: "2026-08-14T06:02:00Z",
      },
      trustResolution,
      requestedAt: "2026-08-14T06:03:00Z",
    };

    const result = buildWardenDecisionRequestV1(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.trustResolution).toEqual(trustResolution);
  });
});
