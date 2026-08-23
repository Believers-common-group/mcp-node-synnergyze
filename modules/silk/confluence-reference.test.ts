import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import { ControlledExecutionGateV1 } from "../synnergyze/execution-gate.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  deriveReimbursementObligationV1,
  normalizeConfluenceProviderFailureV1,
  SyntheticConfluenceCapabilityAdapterV1,
  SyntheticSilkCapabilityRegistryV1,
  SyntheticSilkResourceReservationServiceV1,
  type SilkEconomicEventV1,
} from "./confluence-reference.ts";

const DECIDED_AT = "2026-08-24T00:00:10.000Z";
const RESERVED_AT = "2026-08-24T00:00:20.000Z";
const CHECKED_AT = "2026-08-24T00:00:25.000Z";
const EXECUTED_AT = "2026-08-24T00:00:30.000Z";

function request(capabilityRef: string, suffix: string): WardenDecisionRequestV1 {
  return {
    requestRef: `WARDEN-REQUEST:CONFLUENCE:${suffix}`,
    actorRef: "DIGITALME-CONFLUENCE-001",
    representedPrincipalRef: "ENTERPRISE-CONFLUENCE-001",
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: "SILK-ENT-042",
    programRef: "MODERN-JOURNEY:MJ-000001",
    eventRef: `MODERN-JOURNEY-EVENT:${suffix}`,
    action: capabilityRef,
    capabilityRef,
    targetRef: "MERCHANT-ENGINEERING-001",
    requestedEffect: "engineering_service.payment_authorized",
    authorityRefs: ["AUTHORITY:PROJECT-SPEND-001"],
    policyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    representationSourceRefs: ["GENESIS:ENTERPRISE-REPRESENTATION-001"],
    requestedAt: "2026-08-24T00:00:00.000Z",
    correlationId: `TXN-00088:${suffix}`,
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:CONFLUENCE-001",
    wardenRef: "WARDEN-ALPHA-CONFLUENCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T23:55:00.000Z",
    validUntil: "2026-08-24T00:05:00.000Z",
    actorRef: "DIGITALME-CONFLUENCE-001",
    representedPrincipalRef: "ENTERPRISE-CONFLUENCE-001",
    actingCapacityRef: "CAPACITY:PROJECT-ENGINEER-001",
    contextRef: "SILK-ENT-042",
    programRef: "MODERN-JOURNEY:MJ-000001",
    requiredAuthorityRefs: ["AUTHORITY:PROJECT-SPEND-001"],
    requiredPolicyRefs: ["POLICY:SILK-CONFLUENCE-PILOT-001"],
    allowedCapabilityRefs: ["payment.mastercard.authorize", "payment.visa.authorize"],
    manualReviewCapabilityRefs: [],
    constraints: ["SYNTHETIC_CONFLUENCE_ONLY", "NO_LIVE_MONEY_MOVEMENT"],
  };
}

function authorizedChain(capabilityRef: string, suffix: string) {
  const decisionRequest = request(capabilityRef, suffix);
  const decision = evaluateSyntheticWardenDecisionV1({
    request: decisionRequest,
    policy: policy(),
    decidedAt: DECIDED_AT,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_decision");

  const action = buildAuthorizedActionEnvelopeV1(decisionRequest, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({
    request: decisionRequest,
    decision,
    action,
    reservedAt: RESERVED_AT,
  });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-CHECKPOINT:${suffix}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["decision_active_for_confluence_execution"],
  };
  return { decisionRequest, decision, action, reservation, checkpoint };
}

function creditReservations(): SyntheticSilkResourceReservationServiceV1 {
  return new SyntheticSilkResourceReservationServiceV1([
    {
      resourceRef: "FUNDING:CORPORATE-CREDIT-001",
      silkAccountRef: "SILK-ENT-042",
      resourceType: "CREDIT",
      capacity: 5000,
      unit: "INR",
    },
  ]);
}

function resourceRequest(decisionRef: string, authCorrelation: string, suffix: string) {
  return {
    journeyRef: "MODERN-JOURNEY:MJ-000001",
    silkAccountRef: "SILK-ENT-042",
    resourceRef: "FUNDING:CORPORATE-CREDIT-001",
    resourceType: "CREDIT" as const,
    quantity: 4800,
    unit: "INR",
    wardenDecisionRef: decisionRef,
    authorizationCorrelationId: authCorrelation,
    correlationId: `SILK-RESOURCE:${suffix}`,
    reservedAt: RESERVED_AT,
  };
}

describe("SILK-CONFLUENCE-REFERENCE-0.1", () => {
  it("resolves Mastercard primary and Visa fallback without collapsing provider identity", () => {
    const registry = new SyntheticSilkCapabilityRegistryV1([
      {
        providerCapabilityRef: "PCAP-MC-CORP",
        providerRef: "BANK-B",
        capabilityRef: "payment.mastercard.authorize",
        capabilityType: "PAYMENT",
        silkAccountRef: "SILK-ENT-042",
        priority: 1,
        fallback: false,
        health: "AVAILABLE",
      },
      {
        providerCapabilityRef: "PCAP-VISA-PERSONAL",
        providerRef: "BANK-A",
        capabilityRef: "payment.visa.authorize",
        capabilityType: "PAYMENT",
        silkAccountRef: "SILK-ENT-042",
        priority: 2,
        fallback: true,
        health: "AVAILABLE",
      },
    ]);

    const resolution = registry.resolve({ silkAccountRef: "SILK-ENT-042", capabilityType: "PAYMENT" });
    expect(resolution.preferred?.providerCapabilityRef).toBe("PCAP-MC-CORP");
    expect(resolution.preferred?.providerRef).toBe("BANK-B");
    expect(resolution.fallbacks.map((capability) => capability.providerCapabilityRef)).toEqual([
      "PCAP-VISA-PERSONAL",
    ]);
  });

  it("requires an actual Warden ALLOW decision before reserving scarce financial capacity", () => {
    const reservations = creditReservations();
    const chain = authorizedChain("payment.mastercard.authorize", "RESERVE-AUTH");
    const input = resourceRequest(
      chain.decision.decisionRef,
      chain.decision.correlationId,
      "AUTHORIZED",
    );

    const reserved = reservations.reserve(input, chain.decision);
    expect(reserved.state).toBe("RESERVED");
    expect(reserved.wardenDecisionRef).toBe(chain.decision.decisionRef);
    expect(reserved.authorizationCorrelationId).toBe(chain.decision.correlationId);

    expect(() =>
      reservations.reserve(
        { ...input, correlationId: "SILK-RESOURCE:FORGED", wardenDecisionRef: "WARDEN-DECISION:FORGED" },
        chain.decision,
      ),
    ).toThrow("silk_reservation_warden_decision_mismatch");

    const denied = { ...chain.decision, decision: "DENY" as const, actionToken: undefined };
    expect(() =>
      reservations.reserve({ ...input, correlationId: "SILK-RESOURCE:DENIED" }, denied),
    ).toThrow("silk_reservation_warden_allow_required");
  });

  it("prevents two journeys from over-reserving authoritative scarce financial capacity", () => {
    const reservations = creditReservations();
    const firstChain = authorizedChain("payment.mastercard.authorize", "RESERVE-FIRST");
    const firstInput = resourceRequest(
      firstChain.decision.decisionRef,
      firstChain.decision.correlationId,
      "FIRST",
    );
    const first = reservations.reserve(firstInput, firstChain.decision);

    expect(first.capacity).toBe(5000);
    expect(reservations.reservedQuantity("FUNDING:CORPORATE-CREDIT-001")).toBe(4800);

    const secondChain = authorizedChain("payment.mastercard.authorize", "RESERVE-SECOND");
    expect(() =>
      reservations.reserve(
        {
          ...resourceRequest(
            secondChain.decision.decisionRef,
            secondChain.decision.correlationId,
            "SECOND",
          ),
          journeyRef: "MODERN-JOURNEY:MJ-000002",
          quantity: 500,
        },
        secondChain.decision,
      ),
    ).toThrow("silk_reservation_capacity_conflict");

    const replay = reservations.reserve(firstInput, firstChain.decision);
    expect(replay.reservationRef).toBe(first.reservationRef);
    expect(replay.idempotentReplay).toBe(true);
  });

  it("rejects cross-account, resource-type, and unit drift against registered capacity", () => {
    const reservations = creditReservations();
    const chain = authorizedChain("payment.mastercard.authorize", "RESERVE-DRIFT");
    const base = resourceRequest(
      chain.decision.decisionRef,
      chain.decision.correlationId,
      "DRIFT",
    );

    expect(() =>
      reservations.reserve({ ...base, silkAccountRef: "SILK-IND-001" }, chain.decision),
    ).toThrow("silk_resource_account_mismatch");
    expect(() =>
      reservations.reserve({ ...base, resourceType: "COMPUTE" }, chain.decision),
    ).toThrow("silk_resource_type_mismatch");
    expect(() => reservations.reserve({ ...base, unit: "USD" }, chain.decision)).toThrow(
      "silk_resource_unit_mismatch",
    );
  });

  it("normalizes a synthetic Mastercard decline, executes a separately authorized Visa fallback, and derives reimbursement", () => {
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
    let providerFailure: unknown;
    try {
      gate.execute({ ...primary, executedAt: EXECUTED_AT });
    } catch (error) {
      providerFailure = error;
    }
    const normalized = normalizeConfluenceProviderFailureV1(providerFailure);
    expect(normalized).toMatchObject({ failureClass: "ISSUER_DECLINE", recoverable: true });

    const fallback = authorizedChain("payment.visa.authorize", "VISA-FALLBACK");
    const fallbackReceipt = gate.execute({ ...fallback, executedAt: EXECUTED_AT });
    expect(fallbackReceipt.capabilityRef).toBe("payment.visa.authorize");

    const economicEvent: SilkEconomicEventV1 = {
      economicEventRef: "SILK-ECONOMIC-EVENT:ECO-1901",
      journeyRef: "MODERN-JOURNEY:MJ-000001",
      transactionRef: "TXN-00088",
      silkAccountRef: "SILK-ENT-042",
      economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
      actualPayerRef: "DIGITALME-CONFLUENCE-001",
      amount: 4800,
      currency: "INR",
      instrumentRef: "VISA-PERSONAL-001",
      providerRef: "BANK-A",
      occurredAt: EXECUTED_AT,
    };
    expect(deriveReimbursementObligationV1(economicEvent)).toMatchObject({
      type: "REIMBURSEMENT",
      obligorRef: "ENTERPRISE-CONFLUENCE-001",
      beneficiaryRef: "DIGITALME-CONFLUENCE-001",
      amount: 4800,
      state: "OPEN",
    });
  });

  it("does not create reimbursement when economic owner and actual payer are the same", () => {
    const event: SilkEconomicEventV1 = {
      economicEventRef: "SILK-ECONOMIC-EVENT:ECO-SELF",
      journeyRef: "MODERN-JOURNEY:MJ-SELF",
      transactionRef: "TXN-SELF",
      silkAccountRef: "SILK-IND-001",
      economicOwnerRef: "DIGITALME-CONFLUENCE-001",
      actualPayerRef: "DIGITALME-CONFLUENCE-001",
      amount: 500,
      currency: "INR",
      instrumentRef: "VISA-PERSONAL-001",
      providerRef: "BANK-A",
      occurredAt: EXECUTED_AT,
    };
    expect(deriveReimbursementObligationV1(event)).toBeUndefined();
  });
});
