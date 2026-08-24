import { describe, expect, it } from "vitest";

import { normalizeQelExpressionV1 } from "../qel/normalizer.ts";
import { compileQelPlanToSynnergyzeDraftsV1 } from "../synnergyze/program-bridge.ts";
import { buildWardenDecisionRequestV1 } from "../synnergyze/warden-request-bridge.ts";
import { resolveTrustV1 } from "../trust-fabric/resolver.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "./decision-service.ts";

function readyPlanningBundle() {
  const normalized = normalizeQelExpressionV1({
    expressionRef: "QEL-EXPR-TRUST-E2E-001",
    rawExpression:
      "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS CREATE ON THING LAB-SERVICE-DESK-001 THEN EFFECT SERVICE_REQUEST_CREATED USING CAPABILITY service_request.create",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    contextRef: "ALPHA-NODE-001",
    sourceRef: "TEST-SOURCE-TRUST-E2E-001",
    submittedAt: "2026-08-14T06:00:00Z",
    correlationId: "CORR-WARDEN-TRUST-E2E-001",
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

describe("WARDEN-TRUST-FABRIC-001 end-to-end", () => {
  it("escalates stale authority assurance before an action token can be issued", () => {
    const bundle = readyPlanningBundle();
    const trustResolution = resolveTrustV1({
      resolutionRef: "TRUST-RESOLUTION:STALE-AUTHORITY-E2E-001",
      actionRef: bundle.events[0].action,
      intendedEffect: {
        type: bundle.events[0].requestedEffect ?? "service_request.created",
        irreversible: true,
      },
      requiredAssurance: {
        identity: 3,
        authority: 4,
        compute: 2,
        evidence: 2,
      },
      observedAssurance: {
        identity: 4,
        authority: 4,
        compute: 4,
        evidence: 4,
      },
      requiredMaxAgeSeconds: { authority: 300 },
      observedAgeSeconds: { authority: 601 },
      materialConflict: false,
    });

    expect(trustResolution).toMatchObject({
      result: "REQUIRES_STEP_UP",
      reasonCodes: ["stale_authority_assurance"],
    });

    const bridged = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: {
        resolutionRef: "REGISTRY-REPRESENTATION-RESOLUTION-E2E-001",
        actorRef: "DIGITALME-ALPHA-TEST-001",
        representedPrincipalRef: "LAB-COMPANY-001",
        actingCapacityRef: "LAB-COMPANY-OPERATOR-001",
        contextRef: "ALPHA-NODE-001",
        authorityRefs: ["AUTH-LAB-OPERATOR-001"],
        policyRefs: ["POLICY-SERVICE-REQUEST-001"],
        sourceRefs: ["REGISTRY-R3-AUTHORITY-E2E-001"],
        resolvedAt: "2026-08-14T06:02:00Z",
      },
      trustResolution,
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(bridged.ok).toBe(true);
    if (!bridged.ok) return;

    const policy: SyntheticWardenDecisionPolicyV1 = {
      policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:TRUST-E2E-001",
      wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
      lifecycle: "ACTIVE",
      validFrom: "2026-08-14T06:00:00Z",
      validUntil: "2026-08-14T07:00:00Z",
      actorRef: "DIGITALME-ALPHA-TEST-001",
      representedPrincipalRef: "LAB-COMPANY-001",
      actingCapacityRef: "LAB-COMPANY-OPERATOR-001",
      contextRef: "ALPHA-NODE-001",
      programRef: bundle.program.programRef,
      requiredAuthorityRefs: ["AUTH-LAB-OPERATOR-001"],
      requiredPolicyRefs: ["POLICY-SERVICE-REQUEST-001"],
      allowedCapabilityRefs: ["service_request.create"],
      manualReviewCapabilityRefs: [],
      constraints: ["NO_EXTERNAL_EFFECT"],
    };

    const decision = evaluateSyntheticWardenDecisionV1({
      request: bridged.request,
      policy,
      decidedAt: "2026-08-14T06:04:00Z",
    });

    expect(decision.decision).toBe("ESCALATE");
    expect(decision.reasonCodes).toEqual(["trust_step_up:stale_authority_assurance"]);
    expect("actionToken" in decision).toBe(false);
  });
});
