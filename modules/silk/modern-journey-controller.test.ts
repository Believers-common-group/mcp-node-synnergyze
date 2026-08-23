import { describe, expect, it } from "vitest";

import type { EffectVerificationSuccessV1 } from "../synnergyze/effect-verification.ts";
import type { ModernCapabilityLegSnapshotV1, ModernCapabilityLegStateV1 } from "./modern-capability-leg.ts";
import { resolveModernJourneyNextActionV1, type ModernJourneyPlanV1 } from "./modern-journey-controller.ts";
import type { ModernJourneyRuntimeSnapshotV1 } from "./modern-journey-runtime.ts";

const JOURNEY = "MODERN-JOURNEY:CONTROLLER-001";
const SILK = "SILK-ENT-042";
const OWNER = "ENTERPRISE-CONFLUENCE-001";

function plan(): ModernJourneyPlanV1 {
  return {
    journeyRef: JOURNEY,
    objectiveRef: "OBJECTIVE:ENGINEERING-SUBMISSION-001",
    digitalMeRef: "DIGITALME-CONFLUENCE-001",
    silkAccountRef: SILK,
    economicOwnerRef: OWNER,
    legs: [
      { legRef: "LEG:CONNECTIVITY", legType: "CONNECTIVITY", dependsOn: [] },
      { legRef: "LEG:COMPUTE", legType: "COMPUTE", dependsOn: ["CONNECTIVITY"] },
      { legRef: "TXN:PAYMENT", legType: "PAYMENT", dependsOn: ["COMPUTE"] },
    ],
  };
}

function capability(type: "CONNECTIVITY" | "COMPUTE", state: ModernCapabilityLegStateV1): ModernCapabilityLegSnapshotV1 {
  const legRef = type === "CONNECTIVITY" ? "LEG:CONNECTIVITY" : "LEG:COMPUTE";
  const resourceType = type === "CONNECTIVITY" ? "NETWORK" : "COMPUTE";
  return {
    leg: {
      legRef,
      journeyRef: JOURNEY,
      silkAccountRef: SILK,
      economicOwnerRef: OWNER,
      capabilityType: type,
      resourceType,
      quantity: type === "CONNECTIVITY" ? 5 : 2,
      unit: type === "CONNECTIVITY" ? "GB" : "GPU_HOUR",
      state,
      attempts: [],
      verifiedEffectRef: state === "CLOSED" || state === "EFFECT_VERIFIED" ? `EFFECT:${type}` : undefined,
    },
    projection: {
      transactionRef: legRef,
      journeyRef: JOURNEY,
      state,
      sequence: 1,
      lastEventRef: `EVENT:${legRef}`,
      failedProviderCount: 0,
      fallbackAuthorized: false,
      activeResourceRefs: [],
      consumedResourceRefs: [],
      economicEventRecorded: false,
      obligationCount: 0,
      effectVerified: state === "CLOSED" || state === "EFFECT_VERIFIED",
    },
    events: [],
  };
}

function payment(): ModernJourneyRuntimeSnapshotV1 {
  return {
    transaction: {
      transactionRef: "TXN:PAYMENT",
      journeyRef: JOURNEY,
      silkAccountRef: SILK,
      economicOwnerRef: OWNER,
      amount: 4800,
      currency: "INR",
      state: "CLOSED",
      attempts: [],
      verifiedEffectRef: "EFFECT:PAYMENT",
    },
    projection: {
      transactionRef: "TXN:PAYMENT",
      journeyRef: JOURNEY,
      state: "CLOSED",
      sequence: 1,
      lastEventRef: "EVENT:PAYMENT",
      failedProviderCount: 0,
      fallbackAuthorized: false,
      activeResourceRefs: [],
      consumedResourceRefs: [],
      economicEventRecorded: false,
      obligationCount: 0,
      effectVerified: true,
    },
    events: [],
  };
}

function finalEffect(): EffectVerificationSuccessV1 {
  return {
    state: "VERIFIED_EFFECT",
    effect: {
      effectRef: "EFFECT:JOURNEY-FINAL",
      correlationId: "FINAL:CONTROLLER",
      targetRef: "PROJECT-X:SUBMISSION",
      observedStateRef: "ENGINEERING-SUBMISSION:ACCEPTED",
      verifiedAt: "2026-08-24T05:00:00.000Z",
      verificationRef: "VERIFY:JOURNEY-FINAL",
      executionReceiptRef: "EXECUTION:JOURNEY-FINAL",
      reservationRef: "RIVER:JOURNEY-FINAL",
      wardenDecisionRef: "WARDEN:JOURNEY-FINAL",
      programRef: JOURNEY,
      eventRef: "EVENT:JOURNEY-FINAL",
      synthetic: true,
    },
    observationRef: "OBSERVATION:JOURNEY-FINAL",
    idempotentReplay: false,
  };
}

describe("MODERN-JOURNEY-CONTROLLER-001", () => {
  it("starts connectivity first and requires Warden authority", () => {
    expect(resolveModernJourneyNextActionV1({ plan: plan() })).toMatchObject({
      action: "START_LEG",
      legType: "CONNECTIVITY",
      requiresWardenDecision: true,
    });
  });

  it("starts compute only after connectivity is closed", () => {
    expect(
      resolveModernJourneyNextActionV1({ plan: plan(), capabilityLegs: [capability("CONNECTIVITY", "CLOSED")] }),
    ).toMatchObject({ action: "START_LEG", legType: "COMPUTE", requiresWardenDecision: true });
  });

  it("surfaces recovery and provider execution verification instead of auto-authorizing", () => {
    const recovery = resolveModernJourneyNextActionV1({
      plan: plan(),
      capabilityLegs: [capability("CONNECTIVITY", "CLOSED"), capability("COMPUTE", "RECOVERY_REQUIRED")],
    });
    expect(recovery).toMatchObject({ action: "RECOVER_LEG", legType: "COMPUTE", requiresWardenDecision: true });

    const verify = resolveModernJourneyNextActionV1({
      plan: plan(),
      capabilityLegs: [capability("CONNECTIVITY", "CLOSED"), capability("COMPUTE", "EXECUTED_UNVERIFIED")],
    });
    expect(verify).toMatchObject({ action: "VERIFY_LEG_EFFECT", legType: "COMPUTE", requiresWardenDecision: false });
  });

  it("requests the overall journey effect after all legs close, then hands off closure persistence", () => {
    const legs = [capability("CONNECTIVITY", "CLOSED"), capability("COMPUTE", "CLOSED")];
    expect(resolveModernJourneyNextActionV1({ plan: plan(), capabilityLegs: legs, payment: payment() }).action).toBe(
      "VERIFY_JOURNEY_EFFECT",
    );
    expect(
      resolveModernJourneyNextActionV1({ plan: plan(), capabilityLegs: legs, payment: payment(), finalEffect: finalEffect() }),
    ).toMatchObject({ action: "PERSIST_JOURNEY_CLOSURE", requiresWardenDecision: false });
  });

  it("rejects dependency cycles", () => {
    const cyclic: ModernJourneyPlanV1 = {
      ...plan(),
      legs: [
        { legRef: "LEG:CONNECTIVITY", legType: "CONNECTIVITY", dependsOn: ["COMPUTE"] },
        { legRef: "LEG:COMPUTE", legType: "COMPUTE", dependsOn: ["CONNECTIVITY"] },
      ],
    };
    expect(() => resolveModernJourneyNextActionV1({ plan: cyclic })).toThrow("modern_controller_dependency_cycle");
  });
});