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
  type SilkEconomicEventV1,
} from "./confluence-reference.ts";
import { SyntheticModernJourneyTransactionRuntimeV1 } from "./modern-journey-runtime.ts";
import {
  buildSyntheticConfluenceObservationV1,
  createPersonalFundingFallbackConsentV1,
} from "./modern-journey-transaction.ts";

const TRANSACTION_REF = "TXN-RUNTIME-001";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-RUNTIME-001";
const SILK_ACCOUNT_REF = "SILK-ENT-042";
const ECONOMIC_OWNER_REF = "ENTERPRISE-CONFLUENCE-001";
const DIGITAL_ME_REF = "DIGITALME-CONFLUENCE-001";

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:RUNTIME-001",
    wardenRef: "WARDEN-ALPHA-CONFLUENCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-24T00:00:00.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
    actorRef: DIGITAL_ME_REF,
    representedPrincipalRef: ECONOMIC_OWNER_REF,
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: SILK_ACCOUNT_REF,
    programRef: JOURNEY_REF,
    requiredAuthorityRefs: ["AUTHORITY:PROJECT-SPEND-001"],
    requiredPolicyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    allowedCapabilityRefs: ["payment.mastercard.authorize", "payment.visa.authorize"],
    manualReviewCapabilityRefs: [],
    constraints: ["SYNTHETIC_CONFLUENCE_ONLY", "NO_LIVE_MONEY_MOVEMENT"],
  };
}

function authorizedChain(input: {
  capabilityRef: string;
  suffix: string;
  requestedAt: string;
  decidedAt: string;
  riverReservedAt: string;
  checkedAt: string;
}) {
  const request: WardenDecisionRequestV1 = {
    requestRef: `WARDEN-REQUEST:RUNTIME:${input.suffix}`,
    actorRef: DIGITAL_ME_REF,
    representedPrincipalRef: ECONOMIC_OWNER_REF,
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: SILK_ACCOUNT_REF,
    programRef: JOURNEY_REF,
    eventRef: `MODERN-JOURNEY-EVENT:RUNTIME:${input.suffix}`,
    action: input.capabilityRef,
    capabilityRef: input.capabilityRef,
    targetRef: "MERCHANT-ENGINEERING-001",
    requestedEffect: "engineering_service.payment_authorized",
    authorityRefs: ["AUTHORITY:PROJECT-SPEND-001"],
    policyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    representationSourceRefs: ["GENESIS:ENTERPRISE-REPRESENTATION-001"],
    requestedAt: input.requestedAt,
    correlationId: `${TRANSACTION_REF}:${input.suffix}`,
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
    checkpointRef: `WARDEN-CHECKPOINT:RUNTIME:${input.suffix}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: input.checkedAt,
    reasonCodes: ["decision_active_for_modern_runtime"],
  };
  return { request, decision, action, reservation, checkpoint };
}

function resources() {
  return new SyntheticSilkResourceReservationServiceV1([
    {
      resourceRef: "FUNDING:CORPORATE-CREDIT-001",
      silkAccountRef: SILK_ACCOUNT_REF,
      resourceType: "CREDIT",
      capacity: 5000,
      unit: "INR",
    },
    {
      resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
      silkAccountRef: SILK_ACCOUNT_REF,
      resourceType: "CREDIT",
      capacity: 10000,
      unit: "INR",
    },
  ]);
}

function economicEvent(): SilkEconomicEventV1 {
  return {
    economicEventRef: "SILK-ECONOMIC-EVENT:RUNTIME-001",
    journeyRef: JOURNEY_REF,
    transactionRef: TRANSACTION_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ECONOMIC_OWNER_REF,
    actualPayerRef: DIGITAL_ME_REF,
    amount: 4800,
    currency: "INR",
    instrumentRef: "VISA-PERSONAL-001",
    providerRef: "BANK-A",
    occurredAt: "2026-08-24T00:00:15.000Z",
  };
}

function openedRuntime() {
  const runtime = new SyntheticModernJourneyTransactionRuntimeV1();
  runtime.open({
    transactionRef: TRANSACTION_REF,
    journeyRef: JOURNEY_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ECONOMIC_OWNER_REF,
    amount: 4800,
    currency: "INR",
    actorRef: DIGITAL_ME_REF,
    openedAt: "2026-08-24T00:00:01.000Z",
  });
  return runtime;
}

describe("MODERN-JOURNEY-TRANSACTION-RUNTIME-001", () => {
  it("automatically emits the 12-event Mastercard-to-consented-Visa fallback journey and closes on verified effect", () => {
    const runtime = openedRuntime();
    const silk = resources();
    const mastercard = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-MASTERCARD-ADAPTER-001",
      "payment.mastercard.authorize",
      "ISSUER_DECLINE",
    );
    const visa = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-VISA-ADAPTER-001",
      "payment.visa.authorize",
    );
    const gate = new ControlledExecutionGateV1([mastercard, visa]);

    const primary = authorizedChain({
      capabilityRef: "payment.mastercard.authorize",
      suffix: "MC",
      requestedAt: "2026-08-24T00:00:01.500Z",
      decidedAt: "2026-08-24T00:00:02.000Z",
      riverReservedAt: "2026-08-24T00:00:03.000Z",
      checkedAt: "2026-08-24T00:00:04.000Z",
    });
    const primaryResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "FUNDING:CORPORATE-CREDIT-001",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        wardenDecisionRef: primary.decision.decisionRef,
        authorizationCorrelationId: primary.decision.correlationId,
        correlationId: `${TRANSACTION_REF}:PRIMARY-RESOURCE`,
        reservedAt: "2026-08-24T00:00:03.500Z",
      },
      primary.decision,
    );
    runtime.recordReservation({
      transactionRef: TRANSACTION_REF,
      reservation: primaryResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:05.000Z",
      fallback: false,
    });

    let primaryFailure: unknown;
    try {
      gate.execute({ ...primary, executedAt: "2026-08-24T00:00:06.000Z" });
    } catch (error) {
      primaryFailure = error;
    }
    runtime.recordProviderFailure({
      transactionRef: TRANSACTION_REF,
      attemptRef: "ATTEMPT:RUNTIME:MC",
      providerRef: "BANK-B",
      capabilityRef: "payment.mastercard.authorize",
      failure: normalizeConfluenceProviderFailureV1(primaryFailure),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:07.000Z",
    });

    const releasedPrimary = silk.transition(primaryResource.reservationRef, "RELEASED");
    runtime.recordRelease({
      transactionRef: TRANSACTION_REF,
      reservation: releasedPrimary,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:08.000Z",
    });

    const fallback = authorizedChain({
      capabilityRef: "payment.visa.authorize",
      suffix: "VISA",
      requestedAt: "2026-08-24T00:00:08.100Z",
      decidedAt: "2026-08-24T00:00:09.000Z",
      riverReservedAt: "2026-08-24T00:00:10.000Z",
      checkedAt: "2026-08-24T00:00:11.000Z",
    });
    const consent = createPersonalFundingFallbackConsentV1({
      transactionRef: TRANSACTION_REF,
      digitalMeRef: DIGITAL_ME_REF,
      economicOwnerRef: ECONOMIC_OWNER_REF,
      amount: 4800,
      currency: "INR",
      wardenDecisionRef: fallback.decision.decisionRef,
      grantedAt: "2026-08-24T00:00:12.000Z",
    });
    runtime.authorizeFallback({
      transactionRef: TRANSACTION_REF,
      decision: fallback.decision,
      providerRef: "BANK-A",
      capabilityRef: "payment.visa.authorize",
      actorRef: DIGITAL_ME_REF,
      authorizedAt: "2026-08-24T00:00:12.000Z",
      personalFundingConsent: consent,
    });

    const fallbackResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        wardenDecisionRef: fallback.decision.decisionRef,
        authorizationCorrelationId: fallback.decision.correlationId,
        correlationId: `${TRANSACTION_REF}:FALLBACK-RESOURCE`,
        reservedAt: "2026-08-24T00:00:13.000Z",
      },
      fallback.decision,
    );
    runtime.recordReservation({
      transactionRef: TRANSACTION_REF,
      reservation: fallbackResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:14.000Z",
      fallback: true,
    });

    const fallbackReceipt = gate.execute({ ...fallback, executedAt: "2026-08-24T00:00:15.000Z" });
    const consumedFallback = silk.transition(fallbackResource.reservationRef, "CONSUMED");
    const executedSnapshot = runtime.recordProviderExecution({
      transactionRef: TRANSACTION_REF,
      attemptRef: "ATTEMPT:RUNTIME:VISA",
      providerRef: "BANK-A",
      receipt: fallbackReceipt,
      consumedReservation: consumedFallback,
      economicEvent: economicEvent(),
      personalFundingConsent: consent,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:16.000Z",
    });

    expect(executedSnapshot.projection.state).toBe("EXECUTED_UNVERIFIED");
    expect(executedSnapshot.projection.activeResourceRefs).toEqual([]);
    expect(executedSnapshot.projection.consumedResourceRefs).toEqual([
      "FUNDING:PERSONAL-VISA-FALLBACK-001",
    ]);
    expect(executedSnapshot.transaction.personalFundingConsentRef).toBe(consent.consentRef);
    expect(executedSnapshot.transaction.reimbursementObligation?.state).toBe("OPEN");

    const observation = buildSyntheticConfluenceObservationV1(fallbackReceipt, {
      observerRef: "SYNTHETIC-ENGINEERING-SERVICE-OBSERVER-001",
      observedStateRef: "ENGINEERING-SERVICE:DELIVERED",
      observedAt: "2026-08-24T00:00:17.000Z",
    });
    const verification = new EffectVerificationServiceV1().verify({
      receipt: fallbackReceipt,
      observation,
      verifiedAt: "2026-08-24T00:00:18.000Z",
    });
    if (verification.state !== "VERIFIED_EFFECT") throw new Error("expected_verified_effect");

    const closed = runtime.verifyAndClose({
      transactionRef: TRANSACTION_REF,
      verification,
      actorRef: DIGITAL_ME_REF,
      verifiedAt: "2026-08-24T00:00:18.000Z",
      closedAt: "2026-08-24T00:00:19.000Z",
    });

    expect(closed.transaction.state).toBe("CLOSED");
    expect(closed.projection).toMatchObject({
      state: "CLOSED",
      sequence: 12,
      failedProviderCount: 1,
      currentProviderRef: "BANK-A",
      fallbackAuthorized: true,
      economicEventRecorded: true,
      obligationCount: 1,
      effectVerified: true,
    });
    expect(closed.events.map((event) => event.eventType)).toEqual([
      "TRANSACTION_OPENED",
      "RESOURCE_RESERVED",
      "PROVIDER_EXECUTION_FAILED",
      "RESOURCE_RELEASED",
      "FALLBACK_AUTHORIZED",
      "FALLBACK_RESOURCE_RESERVED",
      "PROVIDER_EXECUTED_UNVERIFIED",
      "RESOURCE_CONSUMED",
      "ECONOMIC_EVENT_RECORDED",
      "OBLIGATION_CREATED",
      "EFFECT_VERIFIED",
      "TRANSACTION_CLOSED",
    ]);
  });

  it("does not permit fallback authorization while failed primary capacity remains reserved", () => {
    const runtime = openedRuntime();
    const silk = resources();
    const primary = authorizedChain({
      capabilityRef: "payment.mastercard.authorize",
      suffix: "MC-BLOCK",
      requestedAt: "2026-08-24T00:00:01.500Z",
      decidedAt: "2026-08-24T00:00:02.000Z",
      riverReservedAt: "2026-08-24T00:00:03.000Z",
      checkedAt: "2026-08-24T00:00:04.000Z",
    });
    const primaryResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "FUNDING:CORPORATE-CREDIT-001",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        wardenDecisionRef: primary.decision.decisionRef,
        authorizationCorrelationId: primary.decision.correlationId,
        correlationId: `${TRANSACTION_REF}:PRIMARY-BLOCK`,
        reservedAt: "2026-08-24T00:00:03.500Z",
      },
      primary.decision,
    );
    runtime.recordReservation({
      transactionRef: TRANSACTION_REF,
      reservation: primaryResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:05.000Z",
      fallback: false,
    });
    runtime.recordProviderFailure({
      transactionRef: TRANSACTION_REF,
      attemptRef: "ATTEMPT:FAILED",
      providerRef: "BANK-B",
      capabilityRef: "payment.mastercard.authorize",
      failure: { failureClass: "ISSUER_DECLINE", recoverable: true, providerError: "synthetic" },
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:06.000Z",
    });

    const fallback = authorizedChain({
      capabilityRef: "payment.visa.authorize",
      suffix: "VISA-BLOCK",
      requestedAt: "2026-08-24T00:00:06.100Z",
      decidedAt: "2026-08-24T00:00:07.000Z",
      riverReservedAt: "2026-08-24T00:00:08.000Z",
      checkedAt: "2026-08-24T00:00:09.000Z",
    });
    expect(() =>
      runtime.authorizeFallback({
        transactionRef: TRANSACTION_REF,
        decision: fallback.decision,
        providerRef: "BANK-A",
        capabilityRef: "payment.visa.authorize",
        actorRef: DIGITAL_ME_REF,
        authorizedAt: "2026-08-24T00:00:09.500Z",
      }),
    ).toThrow("modern_runtime_fallback_requires_primary_release");
  });

  it("does not accept a fallback reservation without the matching fallback authorization event", () => {
    const runtime = openedRuntime();
    const silk = resources();
    const primary = authorizedChain({
      capabilityRef: "payment.mastercard.authorize",
      suffix: "MC-NO-AUTH",
      requestedAt: "2026-08-24T00:00:01.500Z",
      decidedAt: "2026-08-24T00:00:02.000Z",
      riverReservedAt: "2026-08-24T00:00:03.000Z",
      checkedAt: "2026-08-24T00:00:04.000Z",
    });
    const primaryResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "FUNDING:CORPORATE-CREDIT-001",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        wardenDecisionRef: primary.decision.decisionRef,
        authorizationCorrelationId: primary.decision.correlationId,
        correlationId: `${TRANSACTION_REF}:PRIMARY-NO-AUTH`,
        reservedAt: "2026-08-24T00:00:03.500Z",
      },
      primary.decision,
    );
    runtime.recordReservation({
      transactionRef: TRANSACTION_REF,
      reservation: primaryResource,
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:05.000Z",
      fallback: false,
    });
    runtime.recordProviderFailure({
      transactionRef: TRANSACTION_REF,
      attemptRef: "ATTEMPT:FAILED-NO-AUTH",
      providerRef: "BANK-B",
      capabilityRef: "payment.mastercard.authorize",
      failure: { failureClass: "ISSUER_DECLINE", recoverable: true, providerError: "synthetic" },
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:06.000Z",
    });
    runtime.recordRelease({
      transactionRef: TRANSACTION_REF,
      reservation: silk.transition(primaryResource.reservationRef, "RELEASED"),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:07.000Z",
    });

    const fallback = authorizedChain({
      capabilityRef: "payment.visa.authorize",
      suffix: "VISA-NO-AUTH",
      requestedAt: "2026-08-24T00:00:07.100Z",
      decidedAt: "2026-08-24T00:00:08.000Z",
      riverReservedAt: "2026-08-24T00:00:09.000Z",
      checkedAt: "2026-08-24T00:00:10.000Z",
    });
    const fallbackResource = silk.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        wardenDecisionRef: fallback.decision.decisionRef,
        authorizationCorrelationId: fallback.decision.correlationId,
        correlationId: `${TRANSACTION_REF}:FALLBACK-NO-AUTH`,
        reservedAt: "2026-08-24T00:00:10.500Z",
      },
      fallback.decision,
    );

    expect(() =>
      runtime.recordReservation({
        transactionRef: TRANSACTION_REF,
        reservation: fallbackResource,
        actorRef: DIGITAL_ME_REF,
        occurredAt: "2026-08-24T00:00:11.000Z",
        fallback: true,
      }),
    ).toThrow("modern_runtime_fallback_authorization_required");
  });
});
