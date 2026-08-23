import { describe, expect, it } from "vitest";

import type { EffectVerificationSuccessV1 } from "../synnergyze/effect-verification.ts";
import type { ModernCapabilityLegSnapshotV1 } from "./modern-capability-leg.ts";
import {
  composeModernJourneyConfluenceV1,
} from "./modern-journey-confluence.ts";
import type { ModernJourneyRuntimeSnapshotV1 } from "./modern-journey-runtime.ts";

const JOURNEY_REF = "MODERN-JOURNEY:MJ-CONFLUENCE-001";
const SILK_ACCOUNT_REF = "SILK-ENT-042";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";
const DIGITAL_ME_REF = "DIGITALME-CONFLUENCE-001";
const OBJECTIVE_REF = "OBJECTIVE:ENGINEERING-SUBMISSION-001";

function projection(state: "CLOSED" | "RECOVERY_REQUIRED" | "BLOCKED") {
  return {
    transactionRef: "UNUSED",
    journeyRef: JOURNEY_REF,
    state,
    sequence: 1,
    lastEventRef: "EVENT:UNUSED",
    failedProviderCount: 0,
    fallbackAuthorized: false,
    activeResourceRefs: [],
    consumedResourceRefs: [],
    economicEventRecorded: false,
    obligationCount: 0,
    effectVerified: state === "CLOSED",
  } as const;
}

function payment(): ModernJourneyRuntimeSnapshotV1 {
  return {
    transaction: {
      transactionRef: "TXN-PAYMENT-001",
      journeyRef: JOURNEY_REF,
      silkAccountRef: SILK_ACCOUNT_REF,
      economicOwnerRef: ENTERPRISE_REF,
      amount: 4800,
      currency: "INR",
      state: "CLOSED",
      attempts: [
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
          executionReceiptRef: "EXECUTION:VISA",
        },
      ],
      successfulExecutionReceiptRef: "EXECUTION:VISA",
      personalFundingConsentRef: "CONSENT:PERSONAL-VISA",
      economicEvent: {
        economicEventRef: "ECO:PAYMENT-001",
        journeyRef: JOURNEY_REF,
        transactionRef: "TXN-PAYMENT-001",
        silkAccountRef: SILK_ACCOUNT_REF,
        economicOwnerRef: ENTERPRISE_REF,
        actualPayerRef: DIGITAL_ME_REF,
        amount: 4800,
        currency: "INR",
        instrumentRef: "VISA-PERSONAL-001",
        providerRef: "BANK-A",
        occurredAt: "2026-08-24T03:00:01.000Z",
      },
      reimbursementObligation: {
        obligationRef: "OBLIGATION:REIMBURSEMENT-001",
        sourceEconomicEventRef: "ECO:PAYMENT-001",
        journeyRef: JOURNEY_REF,
        obligorRef: ENTERPRISE_REF,
        beneficiaryRef: DIGITAL_ME_REF,
        amount: 4800,
        currency: "INR",
        type: "REIMBURSEMENT",
        state: "OPEN",
      },
      verifiedEffectRef: "EFFECT:PAYMENT-SERVICE-DELIVERED",
    },
    projection: projection("CLOSED"),
    events: [],
  };
}

function capability(input: {
  legRef: string;
  capabilityType: "CONNECTIVITY" | "COMPUTE";
  resourceType: "NETWORK" | "COMPUTE";
  quantity: number;
  unit: string;
  failedProvider: string;
  successfulProvider: string;
  failedCapability: string;
  successfulCapability: string;
  resourceRef: string;
  resourceOwnerRef: string;
  monetaryValue?: number;
  currency?: string;
  state?: "CLOSED" | "RECOVERY_REQUIRED" | "BLOCKED";
}): ModernCapabilityLegSnapshotV1 {
  const state = input.state ?? "CLOSED";
  return {
    leg: {
      legRef: input.legRef,
      journeyRef: JOURNEY_REF,
      silkAccountRef: SILK_ACCOUNT_REF,
      economicOwnerRef: ENTERPRISE_REF,
      capabilityType: input.capabilityType,
      resourceType: input.resourceType,
      quantity: input.quantity,
      unit: input.unit,
      state,
      attempts: [
        {
          attemptRef: `${input.legRef}:FAILED`,
          providerRef: input.failedProvider,
          capabilityRef: input.failedCapability,
          status: "FAILED",
          recoverable: state !== "BLOCKED",
          failureClass: state === "BLOCKED" ? "POLICY_BLOCK" : "PROVIDER_UNAVAILABLE",
        },
        ...(state === "CLOSED"
          ? [
              {
                attemptRef: `${input.legRef}:SUCCESS`,
                providerRef: input.successfulProvider,
                capabilityRef: input.successfulCapability,
                status: "EXECUTED_UNVERIFIED" as const,
                executionReceiptRef: `${input.legRef}:EXECUTION`,
              },
            ]
          : []),
      ],
      consumption:
        state === "CLOSED"
          ? {
              consumptionRef: `${input.legRef}:CONSUMPTION`,
              legRef: input.legRef,
              journeyRef: JOURNEY_REF,
              silkAccountRef: SILK_ACCOUNT_REF,
              capabilityType: input.capabilityType,
              providerRef: input.successfulProvider,
              capabilityRef: input.successfulCapability,
              resourceRef: input.resourceRef,
              resourceType: input.resourceType,
              resourceOwnerRef: input.resourceOwnerRef,
              economicOwnerRef: ENTERPRISE_REF,
              quantity: input.quantity,
              unit: input.unit,
              monetaryValue: input.monetaryValue,
              currency: input.currency,
              occurredAt: "2026-08-24T03:00:02.000Z",
            }
          : undefined,
      successfulExecutionReceiptRef:
        state === "CLOSED" ? `${input.legRef}:EXECUTION` : undefined,
      verifiedEffectRef: state === "CLOSED" ? `${input.legRef}:EFFECT` : undefined,
    },
    projection: projection(state),
    events: [],
  };
}

function connectivity(state: "CLOSED" | "RECOVERY_REQUIRED" | "BLOCKED" = "CLOSED") {
  return capability({
    legRef: "LEG:CONNECTIVITY-001",
    capabilityType: "CONNECTIVITY",
    resourceType: "NETWORK",
    quantity: 5,
    unit: "GB",
    failedProvider: "TELCO-A",
    successfulProvider: "ESIM-B",
    failedCapability: "connectivity.enterprise.activate",
    successfulCapability: "connectivity.esim.activate",
    resourceRef: "NETWORK:ESIM-FALLBACK-001",
    resourceOwnerRef: DIGITAL_ME_REF,
    state,
  });
}

function compute(state: "CLOSED" | "RECOVERY_REQUIRED" | "BLOCKED" = "CLOSED") {
  return capability({
    legRef: "LEG:COMPUTE-001",
    capabilityType: "COMPUTE",
    resourceType: "COMPUTE",
    quantity: 2,
    unit: "GPU_HOUR",
    failedProvider: "PRIVATE-CLOUD-A",
    successfulProvider: "PUBLIC-CLOUD-B",
    failedCapability: "compute.private.allocate",
    successfulCapability: "compute.public.allocate",
    resourceRef: "COMPUTE:PUBLIC-GPU-001",
    resourceOwnerRef: ENTERPRISE_REF,
    monetaryValue: 240,
    currency: "INR",
    state,
  });
}

function finalEffect(): EffectVerificationSuccessV1 {
  return {
    state: "VERIFIED_EFFECT",
    effect: {
      effectRef: "VERIFIED-EFFECT:ENGINEERING-SUBMISSION-ACCEPTED",
      correlationId: "FINAL-SUBMISSION:001",
      targetRef: "PROJECT-X:SUBMISSION",
      observedStateRef: "ENGINEERING-SUBMISSION:ACCEPTED",
      verifiedAt: "2026-08-24T03:30:00.000Z",
      verificationRef: "EFFECT-VERIFICATION:FINAL-001",
      executionReceiptRef: "EXECUTION:FINAL-SUBMISSION-001",
      reservationRef: "RIVER-RESERVATION:FINAL-001",
      wardenDecisionRef: "WARDEN-DECISION:FINAL-SUBMISSION-001",
      programRef: JOURNEY_REF,
      eventRef: "EVENT:FINAL-SUBMISSION-001",
      synthetic: true,
    },
    observationRef: "OBSERVATION:FINAL-SUBMISSION-001",
    idempotentReplay: false,
  };
}

function compose(input?: {
  payment?: ModernJourneyRuntimeSnapshotV1;
  capabilityLegs?: ModernCapabilityLegSnapshotV1[];
  finalEffect?: EffectVerificationSuccessV1;
}) {
  return composeModernJourneyConfluenceV1({
    journeyRef: JOURNEY_REF,
    objectiveRef: OBJECTIVE_REF,
    digitalMeRef: DIGITAL_ME_REF,
    silkAccountRef: SILK_ACCOUNT_REF,
    economicOwnerRef: ENTERPRISE_REF,
    requiredLegTypes: ["PAYMENT", "CONNECTIVITY", "COMPUTE"],
    payment: input?.payment ?? payment(),
    capabilityLegs: input?.capabilityLegs ?? [connectivity(), compute()],
    finalEffect: input?.finalEffect,
  });
}

describe("MODERN-JOURNEY-CONFLUENCE-001", () => {
  it("remains effect-pending after all required legs close, then issues one deterministic Work Receipt on final verified effect", () => {
    const pending = compose();
    expect(pending.state).toBe("EFFECT_PENDING");
    expect(pending.missingLegTypes).toEqual([]);
    expect(pending.workReceipt).toBeUndefined();

    const closed = compose({ finalEffect: finalEffect() });
    expect(closed.state).toBe("CLOSED");
    expect(closed.finalEffectRef).toBe("VERIFIED-EFFECT:ENGINEERING-SUBMISSION-ACCEPTED");
    expect(closed.workReceipt).toMatchObject({
      journeyRef: JOURNEY_REF,
      objectiveRef: OBJECTIVE_REF,
      digitalMeRef: DIGITAL_ME_REF,
      silkAccountRef: SILK_ACCOUNT_REF,
      economicOwnerRef: ENTERPRISE_REF,
      failureCount: 3,
      outstandingObligationCount: 1,
      monetaryTotals: [{ currency: "INR", amount: 5040 }],
      finalEffectObservedStateRef: "ENGINEERING-SUBMISSION:ACCEPTED",
      synthetic: true,
    });
    expect(closed.workReceipt?.nativeConsumptions).toEqual([
      {
        legRef: "LEG:COMPUTE-001",
        legType: "COMPUTE",
        providerRef: "PUBLIC-CLOUD-B",
        resourceRef: "COMPUTE:PUBLIC-GPU-001",
        resourceOwnerRef: ENTERPRISE_REF,
        resourceType: "COMPUTE",
        quantity: 2,
        unit: "GPU_HOUR",
      },
      {
        legRef: "LEG:CONNECTIVITY-001",
        legType: "CONNECTIVITY",
        providerRef: "ESIM-B",
        resourceRef: "NETWORK:ESIM-FALLBACK-001",
        resourceOwnerRef: DIGITAL_ME_REF,
        resourceType: "NETWORK",
        quantity: 5,
        unit: "GB",
      },
    ]);
    expect(compose({ finalEffect: finalEffect() }).workReceipt?.receiptRef).toBe(
      closed.workReceipt?.receiptRef,
    );
  });

  it("surfaces recovery and refuses the final objective effect while a required leg is not closed", () => {
    const recovering = compose({ capabilityLegs: [connectivity("RECOVERY_REQUIRED"), compute()] });
    expect(recovering.state).toBe("RECOVERY_REQUIRED");
    expect(() =>
      compose({
        capabilityLegs: [connectivity("RECOVERY_REQUIRED"), compute()],
        finalEffect: finalEffect(),
      }),
    ).toThrow("modern_confluence_final_effect_before_required_legs_closed");
  });

  it("lets BLOCKED dominate recovery and reports missing required legs without inventing completion", () => {
    const blocked = compose({ capabilityLegs: [connectivity("BLOCKED"), compute("RECOVERY_REQUIRED")] });
    expect(blocked.state).toBe("BLOCKED");

    const missingCompute = composeModernJourneyConfluenceV1({
      journeyRef: JOURNEY_REF,
      objectiveRef: OBJECTIVE_REF,
      digitalMeRef: DIGITAL_ME_REF,
      silkAccountRef: SILK_ACCOUNT_REF,
      economicOwnerRef: ENTERPRISE_REF,
      requiredLegTypes: ["PAYMENT", "CONNECTIVITY", "COMPUTE"],
      payment: payment(),
      capabilityLegs: [connectivity()],
    });
    expect(missingCompute.state).toBe("IN_PROGRESS");
    expect(missingCompute.missingLegTypes).toEqual(["COMPUTE"]);
  });

  it("rejects cross-context legs rather than silently composing unrelated economic state", () => {
    const wrong = compute();
    const mutated: ModernCapabilityLegSnapshotV1 = {
      ...wrong,
      leg: { ...wrong.leg, silkAccountRef: "SILK-ENT-OTHER" },
    };
    expect(() => compose({ capabilityLegs: [connectivity(), mutated] })).toThrow(
      "modern_confluence_leg_silk_account_mismatch",
    );
  });

  it("rejects a final effect whose program lineage is not the parent Modern journey", () => {
    const wrongEffect = finalEffect();
    const mutated: EffectVerificationSuccessV1 = {
      ...wrongEffect,
      effect: { ...wrongEffect.effect, programRef: "MODERN-JOURNEY:OTHER" },
    };
    expect(() => compose({ finalEffect: mutated })).toThrow(
      "modern_confluence_final_effect_journey_mismatch",
    );
  });
});