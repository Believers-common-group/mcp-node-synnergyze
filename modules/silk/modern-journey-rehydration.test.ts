import { describe, expect, it } from "vitest";

import { ModernJourneyEventLogV1 } from "./modern-journey-event-log.ts";
import {
  rebuildModernJourneyRuntimeSnapshotV1,
  rehydrateModernJourneyTransactionV1,
} from "./modern-journey-rehydration.ts";

const TRANSACTION_REF = "TXN-REHYDRATE-001";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-REHYDRATE-001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";

function closedEvents() {
  const log = new ModernJourneyEventLogV1();
  const append = (
    index: number,
    eventType:
      | "TRANSACTION_OPENED"
      | "RESOURCE_RESERVED"
      | "PROVIDER_EXECUTION_FAILED"
      | "RESOURCE_RELEASED"
      | "FALLBACK_AUTHORIZED"
      | "FALLBACK_RESOURCE_RESERVED"
      | "PROVIDER_EXECUTED_UNVERIFIED"
      | "RESOURCE_CONSUMED"
      | "ECONOMIC_EVENT_RECORDED"
      | "OBLIGATION_CREATED"
      | "EFFECT_VERIFIED"
      | "TRANSACTION_CLOSED",
    payload: Record<string, unknown>,
  ) =>
    log.append({
      idempotencyKey: `${TRANSACTION_REF}:${index}:${eventType}`,
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType,
      occurredAt: `2026-08-24T00:00:${String(index).padStart(2, "0")}.000Z`,
      payload,
    });

  append(1, "TRANSACTION_OPENED", {
    silkAccountRef: "SILK-ENT-042",
    economicOwnerRef: ENTERPRISE_REF,
    amount: 4800,
    currency: "INR",
  });
  append(2, "RESOURCE_RESERVED", {
    reservationRef: "SILK-RESERVATION:PRIMARY",
    resourceRef: "FUNDING:CORPORATE-CREDIT-001",
  });
  append(3, "PROVIDER_EXECUTION_FAILED", {
    attemptRef: "ATTEMPT:MC",
    providerRef: "BANK-B",
    capabilityRef: "payment.mastercard.authorize",
    failureClass: "ISSUER_DECLINE",
    recoverable: true,
  });
  append(4, "RESOURCE_RELEASED", {
    resourceRef: "FUNDING:CORPORATE-CREDIT-001",
  });
  append(5, "FALLBACK_AUTHORIZED", {
    wardenDecisionRef: "WARDEN-DECISION:VISA",
    providerRef: "BANK-A",
    capabilityRef: "payment.visa.authorize",
    consentRef: "PERSONAL-FUNDING-CONSENT:001",
  });
  append(6, "FALLBACK_RESOURCE_RESERVED", {
    reservationRef: "SILK-RESERVATION:FALLBACK",
    resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
  });
  append(7, "PROVIDER_EXECUTED_UNVERIFIED", {
    attemptRef: "ATTEMPT:VISA",
    providerRef: "BANK-A",
    capabilityRef: "payment.visa.authorize",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:VISA",
    wardenDecisionRef: "WARDEN-DECISION:VISA",
  });
  append(8, "RESOURCE_CONSUMED", {
    resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
  });
  append(9, "ECONOMIC_EVENT_RECORDED", {
    economicEventRef: "SILK-ECONOMIC-EVENT:001",
    economicOwnerRef: ENTERPRISE_REF,
    actualPayerRef: ACTOR_REF,
    amount: 4800,
    currency: "INR",
    instrumentRef: "VISA-PERSONAL-001",
    providerRef: "BANK-A",
  });
  append(10, "OBLIGATION_CREATED", {
    obligationRef: "SILK-OBLIGATION:001",
    type: "REIMBURSEMENT",
    obligorRef: ENTERPRISE_REF,
    beneficiaryRef: ACTOR_REF,
    amount: 4800,
    currency: "INR",
    consentRef: "PERSONAL-FUNDING-CONSENT:001",
  });
  append(11, "EFFECT_VERIFIED", {
    effectRef: "VERIFIED-EFFECT:001",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:VISA",
  });
  append(12, "TRANSACTION_CLOSED", {
    state: "CLOSED",
    effectRef: "VERIFIED-EFFECT:001",
  });
  return log.stream(TRANSACTION_REF);
}

describe("MODERN-JOURNEY-REHYDRATION-001", () => {
  it("reconstructs a closed transaction and economic lineage from append-only events", () => {
    const snapshot = rebuildModernJourneyRuntimeSnapshotV1(closedEvents());

    expect(snapshot.projection.state).toBe("CLOSED");
    expect(snapshot.transaction).toMatchObject({
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      silkAccountRef: "SILK-ENT-042",
      economicOwnerRef: ENTERPRISE_REF,
      amount: 4800,
      currency: "INR",
      state: "CLOSED",
      successfulExecutionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:VISA",
      personalFundingConsentRef: "PERSONAL-FUNDING-CONSENT:001",
      verifiedEffectRef: "VERIFIED-EFFECT:001",
    });
    expect(snapshot.transaction.attempts).toEqual([
      {
        attemptRef: "ATTEMPT:MC",
        providerRef: "BANK-B",
        capabilityRef: "payment.mastercard.authorize",
        status: "FAILED",
        failureClass: "ISSUER_DECLINE",
        recoverable: true,
      },
      {
        attemptRef: "ATTEMPT:VISA",
        providerRef: "BANK-A",
        capabilityRef: "payment.visa.authorize",
        status: "EXECUTED_UNVERIFIED",
        executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:VISA",
      },
    ]);
    expect(snapshot.transaction.economicEvent).toMatchObject({
      economicEventRef: "SILK-ECONOMIC-EVENT:001",
      actualPayerRef: ACTOR_REF,
      instrumentRef: "VISA-PERSONAL-001",
      providerRef: "BANK-A",
    });
    expect(snapshot.transaction.reimbursementObligation).toMatchObject({
      obligationRef: "SILK-OBLIGATION:001",
      obligorRef: ENTERPRISE_REF,
      beneficiaryRef: ACTOR_REF,
      state: "OPEN",
    });
  });

  it("reconstructs unrecoverable provider failure as BLOCKED", () => {
    const log = new ModernJourneyEventLogV1();
    log.append({
      idempotencyKey: "BLOCKED:OPEN",
      transactionRef: "TXN-BLOCKED",
      journeyRef: "MODERN-JOURNEY:BLOCKED",
      actorRef: ACTOR_REF,
      eventType: "TRANSACTION_OPENED",
      occurredAt: "2026-08-24T00:00:01.000Z",
      payload: {
        silkAccountRef: "SILK-ENT-042",
        economicOwnerRef: ENTERPRISE_REF,
        amount: 4800,
        currency: "INR",
      },
    });
    log.append({
      idempotencyKey: "BLOCKED:FAIL",
      transactionRef: "TXN-BLOCKED",
      journeyRef: "MODERN-JOURNEY:BLOCKED",
      actorRef: ACTOR_REF,
      eventType: "PROVIDER_EXECUTION_FAILED",
      occurredAt: "2026-08-24T00:00:02.000Z",
      payload: {
        attemptRef: "ATTEMPT:BLOCKED",
        providerRef: "BANK-B",
        capabilityRef: "payment.mastercard.authorize",
        failureClass: "HARD_DECLINE",
        recoverable: false,
      },
    });

    const transaction = rehydrateModernJourneyTransactionV1(log.stream("TXN-BLOCKED"));
    expect(transaction.state).toBe("BLOCKED");
    expect(transaction.attempts[0]).toMatchObject({ recoverable: false, failureClass: "HARD_DECLINE" });
  });

  it("fails closed when a reimbursement event lacks its consent reference", () => {
    const tampered = closedEvents().map((event) =>
      event.eventType === "OBLIGATION_CREATED"
        ? { ...event, payload: { ...event.payload, consentRef: null } }
        : event,
    );

    expect(() => rehydrateModernJourneyTransactionV1(tampered)).toThrow(
      "modern_rehydration_reimbursement_consent_required",
    );
  });
});