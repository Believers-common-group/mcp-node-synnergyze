import { describe, expect, it } from "vitest";

import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type { WardenAllowDecisionV1 } from "../warden/contracts.ts";
import type { SilkEconomicEventV1, SilkResourceReservationV1 } from "./confluence-reference.ts";
import { SyntheticModernJourneyTransactionRuntimeV1 } from "./modern-journey-runtime.ts";
import { createPersonalFundingFallbackConsentV1 } from "./modern-journey-transaction.ts";

const TRANSACTION_REF = "TXN-TIMING-001";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-TIMING-001";
const SILK_ACCOUNT_REF = "SILK-ENT-042";
const DIGITAL_ME_REF = "DIGITALME-CONFLUENCE-001";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";

function decision(overrides: Partial<WardenAllowDecisionV1> = {}): WardenAllowDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:TIMING-FALLBACK",
    requestRef: "WARDEN-REQUEST:TIMING-FALLBACK",
    wardenRef: "WARDEN-ALPHA-CONFLUENCE-001",
    action: "payment.visa.authorize",
    targetRef: "MERCHANT-ENGINEERING-001",
    reasonCodes: ["synthetic_timing_test"],
    constraints: ["SYNTHETIC_CONFLUENCE_ONLY"],
    decidedAt: "2026-08-24T00:00:09.000Z",
    validUntil: "2026-08-24T00:00:20.000Z",
    correlationId: `${TRANSACTION_REF}:VISA`,
    decision: "ALLOW",
    actionToken: "synthetic-action-token",
    ...overrides,
  };
}

function primaryReservation(state: "RESERVED" | "RELEASED" = "RESERVED"): SilkResourceReservationV1 {
  return {
    reservationRef: "SILK-RESERVATION:PRIMARY-TIMING",
    journeyRef: JOURNEY_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    resourceRef: "FUNDING:CORPORATE-CREDIT-001",
    resourceOwnerRef: ENTERPRISE_REF,
    resourceType: "CREDIT",
    quantity: 4800,
    unit: "INR",
    wardenDecisionRef: "WARDEN-DECISION:PRIMARY-TIMING",
    authorizationCorrelationId: `${TRANSACTION_REF}:MC`,
    correlationId: `${TRANSACTION_REF}:PRIMARY-RESOURCE`,
    reservedAt: "2026-08-24T00:00:03.000Z",
    capacity: 5000,
    state,
    idempotentReplay: false,
  };
}

function fallbackReservation(
  state: "RESERVED" | "CONSUMED" = "RESERVED",
  reservedAt = "2026-08-24T00:00:13.000Z",
): SilkResourceReservationV1 {
  return {
    reservationRef: "SILK-RESERVATION:FALLBACK-TIMING",
    journeyRef: JOURNEY_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
    resourceOwnerRef: DIGITAL_ME_REF,
    resourceType: "CREDIT",
    quantity: 4800,
    unit: "INR",
    wardenDecisionRef: decision().decisionRef,
    authorizationCorrelationId: decision().correlationId,
    correlationId: `${TRANSACTION_REF}:FALLBACK-RESOURCE`,
    reservedAt,
    capacity: 10000,
    state,
    idempotentReplay: false,
  };
}

function runtimeInRecovery(): SyntheticModernJourneyTransactionRuntimeV1 {
  const runtime = new SyntheticModernJourneyTransactionRuntimeV1();
  runtime.open({
    transactionRef: TRANSACTION_REF,
    journeyRef: JOURNEY_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ENTERPRISE_REF,
    amount: 4800,
    currency: "INR",
    actorRef: DIGITAL_ME_REF,
    openedAt: "2026-08-24T00:00:01.000Z",
  });
  runtime.recordReservation({
    transactionRef: TRANSACTION_REF,
    reservation: primaryReservation(),
    actorRef: DIGITAL_ME_REF,
    occurredAt: "2026-08-24T00:00:04.000Z",
    fallback: false,
  });
  runtime.recordProviderFailure({
    transactionRef: TRANSACTION_REF,
    attemptRef: "ATTEMPT:TIMING:MC",
    providerRef: "BANK-B",
    capabilityRef: "payment.mastercard.authorize",
    failure: {
      failureClass: "ISSUER_DECLINE",
      recoverable: true,
      providerError: "synthetic",
    },
    actorRef: DIGITAL_ME_REF,
    occurredAt: "2026-08-24T00:00:06.000Z",
  });
  runtime.recordRelease({
    transactionRef: TRANSACTION_REF,
    reservation: primaryReservation("RELEASED"),
    actorRef: DIGITAL_ME_REF,
    occurredAt: "2026-08-24T00:00:08.000Z",
  });
  return runtime;
}

function consent(grantedAt: string) {
  return createPersonalFundingFallbackConsentV1({
    transactionRef: TRANSACTION_REF,
    digitalMeRef: DIGITAL_ME_REF,
    economicOwnerRef: ENTERPRISE_REF,
    amount: 4800,
    currency: "INR",
    wardenDecisionRef: decision().decisionRef,
    grantedAt,
  });
}

function receipt(executedAt: string): SynnergyzeExecutionReceiptV1 {
  return {
    receiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:TIMING-VISA",
    actionRef: "ACTION:TIMING-VISA",
    reservationRef: "RIVER-RESERVATION:TIMING-VISA",
    wardenDecisionRef: decision().decisionRef,
    checkpointRef: "WARDEN-CHECKPOINT:TIMING-VISA",
    programRef: JOURNEY_REF,
    eventRef: "MODERN-JOURNEY-EVENT:TIMING-VISA",
    capabilityRef: "payment.visa.authorize",
    targetRef: "MERCHANT-ENGINEERING-001",
    requestedEffect: "engineering_service.payment_authorized",
    correlationId: decision().correlationId,
    adapterRef: "SYNTHETIC-VISA-ADAPTER-001",
    adapterResultRef: "SYNTHETIC-CONFLUENCE:TIMING-VISA",
    state: "EXECUTED_UNVERIFIED",
    executedAt,
    synthetic: true,
    idempotentReplay: false,
  };
}

function economicEvent(): SilkEconomicEventV1 {
  return {
    economicEventRef: "SILK-ECONOMIC-EVENT:TIMING",
    journeyRef: JOURNEY_REF,
    transactionRef: TRANSACTION_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ENTERPRISE_REF,
    actualPayerRef: DIGITAL_ME_REF,
    amount: 4800,
    currency: "INR",
    instrumentRef: "VISA-PERSONAL-001",
    providerRef: "BANK-A",
    occurredAt: "2026-08-24T00:00:15.000Z",
  };
}

describe("MODERN-JOURNEY-FALLBACK-TIMING-001", () => {
  it("rejects personal-funding consent granted before the fallback Warden decision", () => {
    const runtime = runtimeInRecovery();
    expect(() =>
      runtime.authorizeFallback({
        transactionRef: TRANSACTION_REF,
        decision: decision(),
        providerRef: "BANK-A",
        capabilityRef: "payment.visa.authorize",
        actorRef: DIGITAL_ME_REF,
        authorizedAt: "2026-08-24T00:00:12.000Z",
        personalFundingConsent: consent("2026-08-24T00:00:08.500Z"),
      }),
    ).toThrow("modern_runtime_fallback_consent_before_decision");
  });

  it("rejects fallback authorization after the Warden decision expires", () => {
    const runtime = runtimeInRecovery();
    expect(() =>
      runtime.authorizeFallback({
        transactionRef: TRANSACTION_REF,
        decision: decision({ validUntil: "2026-08-24T00:00:11.000Z" }),
        providerRef: "BANK-A",
        capabilityRef: "payment.visa.authorize",
        actorRef: DIGITAL_ME_REF,
        authorizedAt: "2026-08-24T00:00:12.000Z",
      }),
    ).toThrow("modern_runtime_fallback_decision_expired");
  });

  it("rejects consent granted after fallback authorization", () => {
    const runtime = runtimeInRecovery();
    expect(() =>
      runtime.authorizeFallback({
        transactionRef: TRANSACTION_REF,
        decision: decision(),
        providerRef: "BANK-A",
        capabilityRef: "payment.visa.authorize",
        actorRef: DIGITAL_ME_REF,
        authorizedAt: "2026-08-24T00:00:12.000Z",
        personalFundingConsent: consent("2026-08-24T00:00:12.500Z"),
      }),
    ).toThrow("modern_runtime_fallback_consent_after_authorization");
  });

  it("rejects fallback capacity reserved before its authorization event", () => {
    const runtime = runtimeInRecovery();
    const validConsent = consent("2026-08-24T00:00:11.000Z");
    runtime.authorizeFallback({
      transactionRef: TRANSACTION_REF,
      decision: decision(),
      providerRef: "BANK-A",
      capabilityRef: "payment.visa.authorize",
      actorRef: DIGITAL_ME_REF,
      authorizedAt: "2026-08-24T00:00:12.000Z",
      personalFundingConsent: validConsent,
    });

    expect(() =>
      runtime.recordReservation({
        transactionRef: TRANSACTION_REF,
        reservation: fallbackReservation("RESERVED", "2026-08-24T00:00:11.500Z"),
        actorRef: DIGITAL_ME_REF,
        occurredAt: "2026-08-24T00:00:12.500Z",
        fallback: true,
      }),
    ).toThrow("modern_runtime_fallback_reservation_before_authorization");
  });

  it("rejects fallback execution that predates the authorization event", () => {
    const runtime = runtimeInRecovery();
    const validConsent = consent("2026-08-24T00:00:11.000Z");
    runtime.authorizeFallback({
      transactionRef: TRANSACTION_REF,
      decision: decision(),
      providerRef: "BANK-A",
      capabilityRef: "payment.visa.authorize",
      actorRef: DIGITAL_ME_REF,
      authorizedAt: "2026-08-24T00:00:12.000Z",
      personalFundingConsent: validConsent,
    });
    runtime.recordReservation({
      transactionRef: TRANSACTION_REF,
      reservation: fallbackReservation(),
      actorRef: DIGITAL_ME_REF,
      occurredAt: "2026-08-24T00:00:13.500Z",
      fallback: true,
    });

    expect(() =>
      runtime.recordProviderExecution({
        transactionRef: TRANSACTION_REF,
        attemptRef: "ATTEMPT:TIMING:VISA",
        providerRef: "BANK-A",
        receipt: receipt("2026-08-24T00:00:11.500Z"),
        consumedReservation: fallbackReservation("CONSUMED"),
        economicEvent: economicEvent(),
        personalFundingConsent: validConsent,
        actorRef: DIGITAL_ME_REF,
        occurredAt: "2026-08-24T00:00:14.000Z",
      }),
    ).toThrow("modern_runtime_fallback_execution_before_authorization");
  });
});