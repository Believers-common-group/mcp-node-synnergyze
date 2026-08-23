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
import {
  buildSyntheticConfluenceObservationV1,
  closeModernJourneyTransactionV1,
  createModernJourneyTransactionV1,
  createPersonalFundingFallbackConsentV1,
  recordModernProviderExecutionV1,
  recordModernProviderFailureV1,
} from "./modern-journey-transaction.ts";

const JOURNEY_REF = "MODERN-JOURNEY:MJ-000001";
const TRANSACTION_REF = "TXN-00088";
const SILK_ACCOUNT_REF = "SILK-ENT-042";
const ECONOMIC_OWNER_REF = "ENTERPRISE-CONFLUENCE-001";
const DIGITAL_ME_REF = "DIGITALME-CONFLUENCE-001";
const DECIDED_AT = "2026-08-24T00:00:10.000Z";
const RIVER_RESERVED_AT = "2026-08-24T00:00:20.000Z";
const CHECKED_AT = "2026-08-24T00:00:25.000Z";
const CONSENT_AT = "2026-08-24T00:00:29.000Z";
const EXECUTED_AT = "2026-08-24T00:00:30.000Z";
const OBSERVED_AT = "2026-08-24T00:00:31.000Z";
const VERIFIED_AT = "2026-08-24T00:00:32.000Z";

function decisionRequest(capabilityRef: string, suffix: string): WardenDecisionRequestV1 {
  return {
    requestRef: `WARDEN-REQUEST:MODERN-TXN:${suffix}`,
    actorRef: DIGITAL_ME_REF,
    representedPrincipalRef: ECONOMIC_OWNER_REF,
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: SILK_ACCOUNT_REF,
    programRef: JOURNEY_REF,
    eventRef: `MODERN-JOURNEY-EVENT:${suffix}`,
    action: capabilityRef,
    capabilityRef,
    targetRef: "MERCHANT-ENGINEERING-001",
    requestedEffect: "engineering_service.payment_authorized",
    authorityRefs: ["AUTHORITY:PROJECT-SPEND-001"],
    policyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    representationSourceRefs: ["GENESIS:ENTERPRISE-REPRESENTATION-001"],
    requestedAt: "2026-08-24T00:00:00.000Z",
    correlationId: `${TRANSACTION_REF}:${suffix}`,
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:MODERN-TXN-001",
    wardenRef: "WARDEN-ALPHA-CONFLUENCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T23:55:00.000Z",
    validUntil: "2026-08-24T00:05:00.000Z",
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

function authorizedChain(capabilityRef: string, suffix: string) {
  const request = decisionRequest(capabilityRef, suffix);
  const decision = evaluateSyntheticWardenDecisionV1({ request, policy: policy(), decidedAt: DECIDED_AT });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_decision");
  const action = buildAuthorizedActionEnvelopeV1(request, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({ request, decision, action, reservedAt: RIVER_RESERVED_AT });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-CHECKPOINT:${suffix}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["decision_active_for_modern_transaction"],
  };
  return { request, decision, action, reservation, checkpoint };
}

function resourceReservations() {
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

function economicEvent(providerRef = "BANK-A"): SilkEconomicEventV1 {
  return {
    economicEventRef: "SILK-ECONOMIC-EVENT:ECO-1901",
    journeyRef: JOURNEY_REF,
    transactionRef: TRANSACTION_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ECONOMIC_OWNER_REF,
    actualPayerRef: DIGITAL_ME_REF,
    amount: 4800,
    currency: "INR",
    instrumentRef: "VISA-PERSONAL-001",
    providerRef,
    occurredAt: EXECUTED_AT,
  };
}

function fallbackConsent(wardenDecisionRef: string) {
  return createPersonalFundingFallbackConsentV1({
    transactionRef: TRANSACTION_REF,
    digitalMeRef: DIGITAL_ME_REF,
    economicOwnerRef: ECONOMIC_OWNER_REF,
    amount: 4800,
    currency: "INR",
    wardenDecisionRef,
    grantedAt: CONSENT_AT,
  });
}

function transaction() {
  return createModernJourneyTransactionV1({
    transactionRef: TRANSACTION_REF,
    journeyRef: JOURNEY_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ECONOMIC_OWNER_REF,
    amount: 4800,
    currency: "INR",
  });
}

describe("MODERN-JOURNEY-TRANSACTION-001", () => {
  it("preserves one parent transaction across Mastercard failure, consented Visa fallback, reimbursement, and verified effect", () => {
    const resources = resourceReservations();
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

    const primary = authorizedChain("payment.mastercard.authorize", "MC-PRIMARY");
    const primaryReservation = resources.reserve(
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
        reservedAt: RIVER_RESERVED_AT,
      },
      primary.decision,
    );

    let providerFailure: unknown;
    try {
      gate.execute({ ...primary, executedAt: EXECUTED_AT });
    } catch (error) {
      providerFailure = error;
    }
    const afterPrimaryFailure = recordModernProviderFailureV1(transaction(), {
      attemptRef: "ATTEMPT:MC-PRIMARY",
      providerRef: "BANK-B",
      capabilityRef: "payment.mastercard.authorize",
      failure: normalizeConfluenceProviderFailureV1(providerFailure),
    });
    expect(afterPrimaryFailure.state).toBe("RECOVERY_REQUIRED");
    expect(resources.transition(primaryReservation.reservationRef, "RELEASED").state).toBe("RELEASED");

    const fallback = authorizedChain("payment.visa.authorize", "VISA-FALLBACK");
    const fallbackReservation = resources.reserve(
      {
        journeyRef: JOURNEY_REF,
        silkAccountRef: SILK_ACCOUNT_REF,
        resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        wardenDecisionRef: fallback.decision.decisionRef,
        authorizationCorrelationId: fallback.decision.correlationId,
        correlationId: `${TRANSACTION_REF}:VISA-RESOURCE`,
        reservedAt: RIVER_RESERVED_AT,
      },
      fallback.decision,
    );
    const fallbackReceipt = gate.execute({ ...fallback, executedAt: EXECUTED_AT });
    const consent = fallbackConsent(fallback.decision.decisionRef);

    const afterFallback = recordModernProviderExecutionV1(afterPrimaryFailure, {
      attemptRef: "ATTEMPT:VISA-FALLBACK",
      providerRef: "BANK-A",
      receipt: fallbackReceipt,
      economicEvent: economicEvent(),
      personalFundingConsent: consent,
    });
    expect(afterFallback.state).toBe("EXECUTED_UNVERIFIED");
    expect(afterFallback.personalFundingConsentRef).toBe(consent.consentRef);
    expect(afterFallback.attempts.map((attempt) => attempt.providerRef)).toEqual(["BANK-B", "BANK-A"]);
    expect(afterFallback.reimbursementObligation).toMatchObject({
      type: "REIMBURSEMENT",
      obligorRef: ECONOMIC_OWNER_REF,
      beneficiaryRef: DIGITAL_ME_REF,
      amount: 4800,
      state: "OPEN",
    });
    expect(resources.transition(fallbackReservation.reservationRef, "CONSUMED").state).toBe("CONSUMED");

    const observation = buildSyntheticConfluenceObservationV1(fallbackReceipt, {
      observerRef: "SYNTHETIC-ENGINEERING-SERVICE-OBSERVER-001",
      observedStateRef: "ENGINEERING-SERVICE:DELIVERED",
      observedAt: OBSERVED_AT,
    });
    const verification = new EffectVerificationServiceV1().verify({
      receipt: fallbackReceipt,
      observation,
      verifiedAt: VERIFIED_AT,
    });
    if (verification.state !== "VERIFIED_EFFECT") throw new Error("expected_verified_effect");

    const closed = closeModernJourneyTransactionV1(afterFallback, verification);
    expect(closed.state).toBe("CLOSED");
    expect(closed.verifiedEffectRef).toBe(verification.effect.effectRef);
    expect(closed.reimbursementObligation?.state).toBe("OPEN");
  });

  it("fails closed when personal funding is used without explicit consent", () => {
    const visa = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-VISA-ADAPTER-001",
      "payment.visa.authorize",
    );
    const fallback = authorizedChain("payment.visa.authorize", "VISA-NO-CONSENT");
    const receipt = new ControlledExecutionGateV1([visa]).execute({
      ...fallback,
      executedAt: EXECUTED_AT,
    });

    expect(() =>
      recordModernProviderExecutionV1(transaction(), {
        attemptRef: "ATTEMPT:VISA-NO-CONSENT",
        providerRef: "BANK-A",
        receipt,
        economicEvent: economicEvent(),
      }),
    ).toThrow("modern_personal_funding_consent_required");
  });

  it("rejects personal funding consent bound to another Warden decision", () => {
    const visa = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-VISA-ADAPTER-001",
      "payment.visa.authorize",
    );
    const fallback = authorizedChain("payment.visa.authorize", "VISA-CONSENT-DRIFT");
    const receipt = new ControlledExecutionGateV1([visa]).execute({
      ...fallback,
      executedAt: EXECUTED_AT,
    });

    expect(() =>
      recordModernProviderExecutionV1(transaction(), {
        attemptRef: "ATTEMPT:VISA-CONSENT-DRIFT",
        providerRef: "BANK-A",
        receipt,
        economicEvent: economicEvent(),
        personalFundingConsent: fallbackConsent("WARDEN-DECISION:OTHER"),
      }),
    ).toThrow("modern_personal_funding_consent_decision_mismatch");
  });

  it("fails closed when an effect from another execution is used to close the parent transaction", () => {
    const visa = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-VISA-ADAPTER-001",
      "payment.visa.authorize",
    );
    const gate = new ControlledExecutionGateV1([visa]);
    const fallback = authorizedChain("payment.visa.authorize", "VISA-DIRECT");
    const receipt = gate.execute({ ...fallback, executedAt: EXECUTED_AT });
    const executed = recordModernProviderExecutionV1(transaction(), {
      attemptRef: "ATTEMPT:VISA-DIRECT",
      providerRef: "BANK-A",
      receipt,
      economicEvent: economicEvent(),
      personalFundingConsent: fallbackConsent(fallback.decision.decisionRef),
    });
    const observation = buildSyntheticConfluenceObservationV1(receipt, {
      observerRef: "SYNTHETIC-ENGINEERING-SERVICE-OBSERVER-001",
      observedStateRef: "ENGINEERING-SERVICE:DELIVERED",
      observedAt: OBSERVED_AT,
    });
    const verification = new EffectVerificationServiceV1().verify({
      receipt,
      observation,
      verifiedAt: VERIFIED_AT,
    });
    if (verification.state !== "VERIFIED_EFFECT") throw new Error("expected_verified_effect");

    const wrongVerification = {
      ...verification,
      effect: { ...verification.effect, executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:OTHER" },
    };
    expect(() => closeModernJourneyTransactionV1(executed, wrongVerification)).toThrow(
      "modern_transaction_effect_execution_mismatch",
    );
  });

  it("rejects economic lineage drift before attaching successful provider execution", () => {
    const visa = new SyntheticConfluenceCapabilityAdapterV1(
      "SYNTHETIC-VISA-ADAPTER-001",
      "payment.visa.authorize",
    );
    const gate = new ControlledExecutionGateV1([visa]);
    const fallback = authorizedChain("payment.visa.authorize", "VISA-LINEAGE");
    const receipt = gate.execute({ ...fallback, executedAt: EXECUTED_AT });
    const consent = fallbackConsent(fallback.decision.decisionRef);

    expect(() =>
      recordModernProviderExecutionV1(transaction(), {
        attemptRef: "ATTEMPT:WRONG-TXN",
        providerRef: "BANK-A",
        receipt,
        economicEvent: { ...economicEvent(), transactionRef: "TXN-OTHER" },
        personalFundingConsent: consent,
      }),
    ).toThrow("modern_transaction_economic_transaction_mismatch");
    expect(() =>
      recordModernProviderExecutionV1(transaction(), {
        attemptRef: "ATTEMPT:WRONG-AMOUNT",
        providerRef: "BANK-A",
        receipt,
        economicEvent: { ...economicEvent(), amount: 4801 },
        personalFundingConsent: consent,
      }),
    ).toThrow("modern_transaction_economic_value_mismatch");
    expect(() =>
      recordModernProviderExecutionV1(transaction(), {
        attemptRef: "ATTEMPT:WRONG-PROVIDER",
        providerRef: "BANK-B",
        receipt,
        economicEvent: economicEvent(),
        personalFundingConsent: consent,
      }),
    ).toThrow("modern_transaction_provider_mismatch");
  });
});
