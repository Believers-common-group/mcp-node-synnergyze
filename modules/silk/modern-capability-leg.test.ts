import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import { ControlledExecutionGateV1 } from "../synnergyze/execution-gate.ts";
import { EffectVerificationServiceV1 } from "../synnergyze/effect-verification.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  normalizeConfluenceProviderFailureV1,
  SyntheticConfluenceCapabilityAdapterV1,
  SyntheticSilkResourceReservationServiceV1,
} from "./confluence-reference.ts";
import { SyntheticModernCapabilityLegRuntimeV1 } from "./modern-capability-leg.ts";
import { buildSyntheticConfluenceObservationV1 } from "./modern-journey-transaction.ts";

const DIGITAL_ME_REF = "DIGITALME-CONFLUENCE-001";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";
const SILK_ACCOUNT_REF = "SILK-ENT-042";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-HYBRID-001";

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:CAPABILITY-LEGS-001",
    wardenRef: "WARDEN-ALPHA-CONFLUENCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-24T00:00:00.000Z",
    validUntil: "2026-08-24T00:30:00.000Z",
    actorRef: DIGITAL_ME_REF,
    representedPrincipalRef: ENTERPRISE_REF,
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: SILK_ACCOUNT_REF,
    programRef: JOURNEY_REF,
    requiredAuthorityRefs: ["AUTHORITY:PROJECT-RESOURCE-USE-001"],
    requiredPolicyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    allowedCapabilityRefs: [
      "connectivity.enterprise.activate",
      "connectivity.esim.activate",
      "compute.private.allocate",
      "compute.public.allocate",
    ],
    manualReviewCapabilityRefs: [],
    constraints: ["SYNTHETIC_CONFLUENCE_ONLY", "NO_LIVE_PROVIDER_ACTIVATION"],
  };
}

function authorizedChain(input: {
  capabilityRef: string;
  targetRef: string;
  requestedEffect: string;
  suffix: string;
  requestedAt: string;
  decidedAt: string;
  riverReservedAt: string;
  checkedAt: string;
}) {
  const request: WardenDecisionRequestV1 = {
    requestRef: `WARDEN-REQUEST:CAPABILITY-LEG:${input.suffix}`,
    actorRef: DIGITAL_ME_REF,
    representedPrincipalRef: ENTERPRISE_REF,
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: SILK_ACCOUNT_REF,
    programRef: JOURNEY_REF,
    eventRef: `MODERN-JOURNEY-EVENT:CAPABILITY-LEG:${input.suffix}`,
    action: input.capabilityRef,
    capabilityRef: input.capabilityRef,
    targetRef: input.targetRef,
    requestedEffect: input.requestedEffect,
    authorityRefs: ["AUTHORITY:PROJECT-RESOURCE-USE-001"],
    policyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    representationSourceRefs: ["GENESIS:ENTERPRISE-REPRESENTATION-001"],
    requestedAt: input.requestedAt,
    correlationId: `${JOURNEY_REF}:${input.suffix}`,
  };
  const decision = evaluateSyntheticWardenDecisionV1({
    request,
    policy: policy(),
    decidedAt: input.decidedAt,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_decision");
  const action = buildAuthorizedActionEnvelopeV1(request, decision);
  const reservation = new SyntheticRiverReservationServiceV1().reserve({
    request,
    decision,
    action,
    reservedAt: input.riverReservedAt,
  });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-CHECKPOINT:CAPABILITY-LEG:${input.suffix}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: input.checkedAt,
    reasonCodes: ["decision_active_for_capability_leg"],
  };
  return { request, decision, action, reservation, checkpoint };
}

function networkResources() {
  return new SyntheticSilkResourceReservationServiceV1([
    {
      resourceRef: "NETWORK:ENTERPRISE-MOBILE-001",
      silkAccountRef: SILK_ACCOUNT_REF,
      resourceOwnerRef: ENTERPRISE_REF,
      resourceType: "NETWORK",
      capacity: 20,
      unit: "GB",
    },
    {
      resourceRef: "NETWORK:ESIM-FALLBACK-001",
      silkAccountRef: SILK_ACCOUNT_REF,
      resourceOwnerRef: DIGITAL_ME_REF,
      resourceType: "NETWORK",
      capacity: 10,
      unit: "GB",
    },
  ]);
}

function computeResources() {
  return new SyntheticSilkResourceReservationServiceV1([
    {
      resourceRef: "COMPUTE:PRIVATE-GPU-001",
      silkAccountRef: SILK_ACCOUNT_REF,
      resourceOwnerRef: ENTERPRISE_REF,
      resourceType: "COMPUTE",
      capacity: 4,
      unit: "GPU_HOUR",
    },
    {
      resourceRef: "COMPUTE:PUBLIC-GPU-001",
      silkAccountRef: SILK_ACCOUNT_REF,
      resourceOwnerRef: ENTERPRISE_REF,
      resourceType: "COMPUTE",
      capacity: 8,
      unit: "GPU_HOUR",
    },
  ]);
}

describe("MODERN-CAPABILITY-LEG-001", () => {
  it("fails over enterprise connectivity to a Warden-authorized eSIM and closes only after connectivity effect verification", () => {
    const legRef = "MODERN-CAPABILITY-LEG:CONNECTIVITY-001";
    const runtime = new SyntheticModernCapabilityLegRuntimeV1();
    runtime.open({
      legRef,
      journeyRef: JOURNEY_REF,
      silkAccountRef: SILK_ACCOUNT_REF,
      economicOwnerRef: ENTERPRISE_REF,
      capabilityType: "CONNECTIVITY",
      resourceType: "NETWORK",
      quantity: 5,
      unit: "GB",
      actorRef: DIGITAL_ME_REF,
      openedAt: "2026-08-24T00:00:01.000Z",
    });
    const silk = networkResources();
    const enterpriseAdapter = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-ENTERPRISE-MOBILE-ADAPTER-001",
      "connectivity.enterprise.activate",
      "CONNECTIVITY_FAILURE",
    );
    const esimAdapter = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-ESIM-ADAPTER-001",
      "connectivity.esim.activate",
    );
    const gate = new ControlledExecutionGateV1([enterpriseAdapter, esimAdapter]);

    const primary = authorizedChain({
      capabilityRef: "connectivity.enterprise.activate",
      targetRef: "NETWORK:ENTERPRISE-MOBILE-001",
      requestedEffect: "connectivity.enterprise.active",
      suffix: "CONNECTIVITY-PRIMARY",
      requestedAt: "2026-08-24T00:00:01.100Z",
      decidedAt: "2026-08-24T00:00:02.000Z",
      riverReservedAt: "2026-08-24T00:00:02.500Z",
      checkedAt: "2026-08-24T00:00:03.000Z",
    });
    const primaryResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "NETWORK:ENTERPRISE-MOBILE-001",
        resourceType: "NETWORK",
        quantity: 5,
        unit: "GB",
        wardenDecisionRef: primary.decision.decisionRef,
        authorizationCorrelationId: primary.decision.correlationId,
        correlationId: `${legRef}:PRIMARY-RESOURCE`,
        reservedAt: "2026-08-24T00:00:03.100Z",
      },
      primary.decision,
    );
    runtime.recordReservation({
      legRef,
      reservation: primaryResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:03.500Z",
      fallback: false,
    });

    let primaryFailure: unknown;
    try {
      gate.execute({ ...primary, executedAt: "2026-08-24T00:00:04.000Z" });
    } catch (error) {
      primaryFailure = error;
    }
    const normalized = normalizeConfluenceProviderFailureV1(primaryFailure);
    expect(normalized).toMatchObject({ failureClass: "CONNECTIVITY_FAILURE", recoverable: true });
    runtime.recordFailure({
      legRef,
      attemptRef: "ATTEMPT:CONNECTIVITY:PRIMARY",
      providerRef: "TELCO-A",
      capabilityRef: "connectivity.enterprise.activate",
      failureClass: normalized.failureClass,
      recoverable: normalized.recoverable,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:05.000Z",
    });
    runtime.recordRelease({
      legRef,
      reservation: silk.transition(primaryResource.reservationRef, "RELEASED"),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:06.000Z",
    });

    const fallback = authorizedChain({
      capabilityRef: "connectivity.esim.activate",
      targetRef: "NETWORK:ESIM-FALLBACK-001",
      requestedEffect: "connectivity.fallback.active",
      suffix: "CONNECTIVITY-FALLBACK",
      requestedAt: "2026-08-24T00:00:06.100Z",
      decidedAt: "2026-08-24T00:00:07.000Z",
      riverReservedAt: "2026-08-24T00:00:07.500Z",
      checkedAt: "2026-08-24T00:00:08.000Z",
    });
    runtime.authorizeFallback({
      legRef,
      decision: fallback.decision,
      providerRef: "ESIM-B",
      capabilityRef: "connectivity.esim.activate",
      actorRef: DIGITAL_ME_REF,
      authorizedAt: "2026-08-24T00:00:08.100Z",
    });
    const fallbackResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "NETWORK:ESIM-FALLBACK-001",
        resourceType: "NETWORK",
        quantity: 5,
        unit: "GB",
        wardenDecisionRef: fallback.decision.decisionRef,
        authorizationCorrelationId: fallback.decision.correlationId,
        correlationId: `${legRef}:FALLBACK-RESOURCE`,
        reservedAt: "2026-08-24T00:00:08.200Z",
      },
      fallback.decision,
    );
    runtime.recordReservation({
      legRef,
      reservation: fallbackResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:08.300Z",
      fallback: true,
    });
    const fallbackReceipt = gate.execute({ ...fallback, executedAt: "2026-08-24T00:00:09.000Z" });
    const executed = runtime.recordExecution({
      legRef,
      attemptRef: "ATTEMPT:CONNECTIVITY:ESIM",
      providerRef: "ESIM-B",
      receipt: fallbackReceipt,
      consumedReservation: silk.transition(fallbackResource.reservationRef, "CONSUMED"),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:09.100Z",
    });
    expect(executed.leg.consumption).toMatchObject({
      capabilityType: "CONNECTIVITY",
      resourceType: "NETWORK",
      resourceOwnerRef: DIGITAL_ME_REF,
      economicOwnerRef: ENTERPRISE_REF,
      quantity: 5,
      unit: "GB",
    });

    const observation = buildSyntheticConfluenceObservationV1(fallbackReceipt, {
      observerRef: "SYNTHETIC-CONNECTIVITY-OBSERVER-001",
      observedStateRef: "CONNECTIVITY:RESTORED",
      observedAt: "2026-08-24T00:00:10.000Z",
    });
    const verification = new EffectVerificationServiceV1().verify({
      receipt: fallbackReceipt,
      observation,
      verifiedAt: "2026-08-24T00:00:11.000Z",
    });
    if (verification.state !== "VERIFIED_EFFECT") throw new Error("expected_verified_connectivity_effect");
    const closed = runtime.verifyAndClose({
      legRef,
      verification,
      actorRef: DIGITAL_ME_REF,
      verifiedAt: "2026-08-24T00:00:11.000Z",
      closedAt: "2026-08-24T00:00:12.000Z",
    });
    expect(closed.leg.state).toBe("CLOSED");
    expect(closed.projection.activeResourceRefs).toEqual([]);
    expect(closed.events.map((event) => event.eventType)).toEqual([
      "TRANSACTION_OPENED",
      "RESOURCE_RESERVED",
      "PROVIDER_EXECUTION_FAILED",
      "RESOURCE_RELEASED",
      "FALLBACK_AUTHORIZED",
      "FALLBACK_RESOURCE_RESERVED",
      "PROVIDER_EXECUTED_UNVERIFIED",
      "RESOURCE_CONSUMED",
      "EFFECT_VERIFIED",
      "TRANSACTION_CLOSED",
    ]);
  });

  it("fails over unavailable private compute to public GPU, meters native GPU-hours and preserves monetary valuation", () => {
    const legRef = "MODERN-CAPABILITY-LEG:COMPUTE-001";
    const runtime = new SyntheticModernCapabilityLegRuntimeV1();
    runtime.open({
      legRef,
      journeyRef: JOURNEY_REF,
      silkAccountRef: SILK_ACCOUNT_REF,
      economicOwnerRef: ENTERPRISE_REF,
      capabilityType: "COMPUTE",
      resourceType: "COMPUTE",
      quantity: 2,
      unit: "GPU_HOUR",
      actorRef: DIGITAL_ME_REF,
      openedAt: "2026-08-24T00:10:01.000Z",
    });
    const silk = computeResources();
    const privateAdapter = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-PRIVATE-COMPUTE-ADAPTER-001",
      "compute.private.allocate",
      "RESOURCE_UNAVAILABLE",
    );
    const publicAdapter = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-PUBLIC-COMPUTE-ADAPTER-001",
      "compute.public.allocate",
    );
    const gate = new ControlledExecutionGateV1([privateAdapter, publicAdapter]);

    const primary = authorizedChain({
      capabilityRef: "compute.private.allocate",
      targetRef: "COMPUTE:PRIVATE-GPU-001",
      requestedEffect: "compute.gpu.available",
      suffix: "COMPUTE-PRIMARY",
      requestedAt: "2026-08-24T00:10:01.100Z",
      decidedAt: "2026-08-24T00:10:02.000Z",
      riverReservedAt: "2026-08-24T00:10:02.500Z",
      checkedAt: "2026-08-24T00:10:03.000Z",
    });
    const primaryResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "COMPUTE:PRIVATE-GPU-001",
        resourceType: "COMPUTE",
        quantity: 2,
        unit: "GPU_HOUR",
        wardenDecisionRef: primary.decision.decisionRef,
        authorizationCorrelationId: primary.decision.correlationId,
        correlationId: `${legRef}:PRIMARY-RESOURCE`,
        reservedAt: "2026-08-24T00:10:03.100Z",
      },
      primary.decision,
    );
    runtime.recordReservation({
      legRef,
      reservation: primaryResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:10:03.500Z",
      fallback: false,
    });
    let primaryFailure: unknown;
    try {
      gate.execute({ ...primary, executedAt: "2026-08-24T00:10:04.000Z" });
    } catch (error) {
      primaryFailure = error;
    }
    const normalized = normalizeConfluenceProviderFailureV1(primaryFailure);
    expect(normalized).toMatchObject({ failureClass: "RESOURCE_UNAVAILABLE", recoverable: true });
    runtime.recordFailure({
      legRef,
      attemptRef: "ATTEMPT:COMPUTE:PRIVATE",
      providerRef: "PRIVATE-CLOUD-A",
      capabilityRef: "compute.private.allocate",
      failureClass: normalized.failureClass,
      recoverable: normalized.recoverable,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:10:05.000Z",
    });
    runtime.recordRelease({
      legRef,
      reservation: silk.transition(primaryResource.reservationRef, "RELEASED"),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:10:06.000Z",
    });

    const fallback = authorizedChain({
      capabilityRef: "compute.public.allocate",
      targetRef: "COMPUTE:PUBLIC-GPU-001",
      requestedEffect: "compute.public_gpu.available",
      suffix: "COMPUTE-FALLBACK",
      requestedAt: "2026-08-24T00:10:06.100Z",
      decidedAt: "2026-08-24T00:10:07.000Z",
      riverReservedAt: "2026-08-24T00:10:07.500Z",
      checkedAt: "2026-08-24T00:10:08.000Z",
    });
    runtime.authorizeFallback({
      legRef,
      decision: fallback.decision,
      providerRef: "PUBLIC-CLOUD-B",
      capabilityRef: "compute.public.allocate",
      actorRef: DIGITAL_ME_REF,
      authorizedAt: "2026-08-24T00:10:08.100Z",
    });
    const fallbackResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "COMPUTE:PUBLIC-GPU-001",
        resourceType: "COMPUTE",
        quantity: 2,
        unit: "GPU_HOUR",
        wardenDecisionRef: fallback.decision.decisionRef,
        authorizationCorrelationId: fallback.decision.correlationId,
        correlationId: `${legRef}:FALLBACK-RESOURCE`,
        reservedAt: "2026-08-24T00:10:08.200Z",
      },
      fallback.decision,
    );
    runtime.recordReservation({
      legRef,
      reservation: fallbackResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:10:08.300Z",
      fallback: true,
    });
    const fallbackReceipt = gate.execute({ ...fallback, executedAt: "2026-08-24T00:10:09.000Z" });
    const executed = runtime.recordExecution({
      legRef,
      attemptRef: "ATTEMPT:COMPUTE:PUBLIC",
      providerRef: "PUBLIC-CLOUD-B",
      receipt: fallbackReceipt,
      consumedReservation: silk.transition(fallbackResource.reservationRef, "CONSUMED"),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:10:09.100Z",
      monetaryValue: 240,
      currency: "INR",
    });
    expect(executed.leg.consumption).toMatchObject({
      capabilityType: "COMPUTE",
      providerRef: "PUBLIC-CLOUD-B",
      resourceType: "COMPUTE",
      resourceOwnerRef: ENTERPRISE_REF,
      economicOwnerRef: ENTERPRISE_REF,
      quantity: 2,
      unit: "GPU_HOUR",
      monetaryValue: 240,
      currency: "INR",
    });

    const observation = buildSyntheticConfluenceObservationV1(fallbackReceipt, {
      observerRef: "SYNTHETIC-COMPUTE-OBSERVER-001",
      observedStateRef: "COMPUTE:GPU-ENDPOINT-REACHABLE",
      observedAt: "2026-08-24T00:10:10.000Z",
    });
    const verification = new EffectVerificationServiceV1().verify({
      receipt: fallbackReceipt,
      observation,
      verifiedAt: "2026-08-24T00:10:11.000Z",
    });
    if (verification.state !== "VERIFIED_EFFECT") throw new Error("expected_verified_compute_effect");
    const closed = runtime.verifyAndClose({
      legRef,
      verification,
      actorRef: DIGITAL_ME_REF,
      verifiedAt: "2026-08-24T00:10:11.000Z",
      closedAt: "2026-08-24T00:10:12.000Z",
    });
    expect(closed.leg.state).toBe("CLOSED");
    expect(closed.leg.verifiedEffectRef).toBe(verification.effect.effectRef);
    expect(closed.projection.consumedResourceRefs).toEqual(["COMPUTE:PUBLIC-GPU-001"]);
  });

  it("rejects capability/resource mismatches at leg creation", () => {
    expect(() =>
      new SyntheticModernCapabilityLegRuntimeV1().open({
        legRef: "MODERN-CAPABILITY-LEG:INVALID-001",
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        economicOwnerRef: ENTERPRISE_REF,
        capabilityType: "CONNECTIVITY",
        resourceType: "COMPUTE",
        quantity: 1,
        unit: "GPU_HOUR",
        actorRef: DIGITAL_ME_REF,
        openedAt: "2026-08-24T00:20:01.000Z",
      }),
    ).toThrow("modern_capability_leg_resource_type_mismatch");
  });
});