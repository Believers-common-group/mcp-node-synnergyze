import { createHash } from "node:crypto";

import type { EffectVerificationSuccessV1 } from "../synnergyze/effect-verification.ts";
import type { ModernCapabilityLegSnapshotV1 } from "./modern-capability-leg.ts";
import type { ModernJourneyRuntimeSnapshotV1 } from "./modern-journey-runtime.ts";

export type ModernJourneyConfluenceLegTypeV1 = "PAYMENT" | "CONNECTIVITY" | "COMPUTE";
export type ModernJourneyConfluenceStateV1 =
  | "IN_PROGRESS"
  | "RECOVERY_REQUIRED"
  | "BLOCKED"
  | "EFFECT_PENDING"
  | "CLOSED";

export interface ModernJourneyNativeConsumptionV1 {
  legRef: string;
  legType: Exclude<ModernJourneyConfluenceLegTypeV1, "PAYMENT">;
  providerRef: string;
  resourceRef: string;
  resourceOwnerRef: string;
  resourceType: "NETWORK" | "COMPUTE";
  quantity: number;
  unit: string;
}

export interface ModernJourneyMonetaryTotalV1 {
  currency: string;
  amount: number;
}

export interface ModernJourneyConfluenceLegSummaryV1 {
  legRef: string;
  legType: ModernJourneyConfluenceLegTypeV1;
  journeyRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  state: string;
  effectRef?: string;
  providerRefs: readonly string[];
  failureCount: number;
  monetaryValue?: number;
  currency?: string;
  nativeConsumption?: ModernJourneyNativeConsumptionV1;
  outstandingObligationCount: number;
}

export interface ModernWorkReceiptV1 {
  receiptRef: string;
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  requiredLegTypes: readonly ModernJourneyConfluenceLegTypeV1[];
  legRefs: readonly string[];
  providerRefs: readonly string[];
  failureCount: number;
  monetaryTotals: readonly ModernJourneyMonetaryTotalV1[];
  nativeConsumptions: readonly ModernJourneyNativeConsumptionV1[];
  outstandingObligationCount: number;
  finalEffectRef: string;
  finalEffectObservedStateRef: string;
  completedAt: string;
  synthetic: true;
}

export interface ModernJourneyConfluenceV1 {
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  requiredLegTypes: readonly ModernJourneyConfluenceLegTypeV1[];
  state: ModernJourneyConfluenceStateV1;
  legs: readonly ModernJourneyConfluenceLegSummaryV1[];
  missingLegTypes: readonly ModernJourneyConfluenceLegTypeV1[];
  finalEffectRef?: string;
  workReceipt?: ModernWorkReceiptV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function paymentSummary(snapshot: ModernJourneyRuntimeSnapshotV1): ModernJourneyConfluenceLegSummaryV1 {
  const transaction = snapshot.transaction;
  const providers = uniqueSorted(transaction.attempts.map((attempt) => attempt.providerRef));
  const failureCount = transaction.attempts.filter((attempt) => attempt.status === "FAILED").length;
  return {
    legRef: transaction.transactionRef,
    legType: "PAYMENT",
    journeyRef: transaction.journeyRef,
    silkAccountRef: transaction.silkAccountRef,
    economicOwnerRef: transaction.economicOwnerRef,
    state: transaction.state,
    effectRef: transaction.verifiedEffectRef,
    providerRefs: providers,
    failureCount,
    monetaryValue: transaction.economicEvent?.amount,
    currency: transaction.economicEvent?.currency,
    outstandingObligationCount: transaction.reimbursementObligation?.state === "OPEN" ? 1 : 0,
  };
}

function capabilitySummary(
  snapshot: ModernCapabilityLegSnapshotV1,
): ModernJourneyConfluenceLegSummaryV1 {
  const leg = snapshot.leg;
  const providers = uniqueSorted(leg.attempts.map((attempt) => attempt.providerRef));
  const failureCount = leg.attempts.filter((attempt) => attempt.status === "FAILED").length;
  const consumption = leg.consumption;
  const legType = leg.capabilityType;
  return {
    legRef: leg.legRef,
    legType,
    journeyRef: leg.journeyRef,
    silkAccountRef: leg.silkAccountRef,
    economicOwnerRef: leg.economicOwnerRef,
    state: leg.state,
    effectRef: leg.verifiedEffectRef,
    providerRefs: providers,
    failureCount,
    monetaryValue: consumption?.monetaryValue,
    currency: consumption?.currency,
    nativeConsumption: consumption
      ? {
          legRef: leg.legRef,
          legType,
          providerRef: consumption.providerRef,
          resourceRef: consumption.resourceRef,
          resourceOwnerRef: consumption.resourceOwnerRef,
          resourceType: consumption.resourceType,
          quantity: consumption.quantity,
          unit: consumption.unit,
        }
      : undefined,
    outstandingObligationCount: 0,
  };
}

function assertLegLineage(
  leg: ModernJourneyConfluenceLegSummaryV1,
  input: {
    journeyRef: string;
    silkAccountRef: string;
    economicOwnerRef: string;
  },
): void {
  if (leg.journeyRef !== input.journeyRef) throw new Error("modern_confluence_leg_journey_mismatch");
  if (leg.silkAccountRef !== input.silkAccountRef) {
    throw new Error("modern_confluence_leg_silk_account_mismatch");
  }
  if (leg.economicOwnerRef !== input.economicOwnerRef) {
    throw new Error("modern_confluence_leg_economic_owner_mismatch");
  }
}

function aggregateMonetaryTotals(
  legs: readonly ModernJourneyConfluenceLegSummaryV1[],
): ModernJourneyMonetaryTotalV1[] {
  const totals = new Map<string, number>();
  for (const leg of legs) {
    if (leg.monetaryValue === undefined) {
      if (leg.currency !== undefined) throw new Error("modern_confluence_currency_without_value");
      continue;
    }
    if (!Number.isFinite(leg.monetaryValue) || leg.monetaryValue < 0) {
      throw new Error("modern_confluence_invalid_monetary_value");
    }
    if (!leg.currency?.trim()) throw new Error("modern_confluence_currency_required");
    totals.set(leg.currency, (totals.get(leg.currency) ?? 0) + leg.monetaryValue);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }));
}

function receiptFor(input: {
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  requiredLegTypes: readonly ModernJourneyConfluenceLegTypeV1[];
  legs: readonly ModernJourneyConfluenceLegSummaryV1[];
  finalEffect: EffectVerificationSuccessV1;
}): ModernWorkReceiptV1 {
  const providerRefs = uniqueSorted(input.legs.flatMap((leg) => [...leg.providerRefs]));
  const nativeConsumptions = input.legs
    .map((leg) => leg.nativeConsumption)
    .filter((value): value is ModernJourneyNativeConsumptionV1 => Boolean(value))
    .sort((left, right) => left.legRef.localeCompare(right.legRef));
  const monetaryTotals = aggregateMonetaryTotals(input.legs);
  const failureCount = input.legs.reduce((total, leg) => total + leg.failureCount, 0);
  const outstandingObligationCount = input.legs.reduce(
    (total, leg) => total + leg.outstandingObligationCount,
    0,
  );
  const legRefs = input.legs.map((leg) => leg.legRef).sort();
  const completedAt = input.finalEffect.effect.verifiedAt;
  const identity = digest(
    JSON.stringify({
      journeyRef: input.journeyRef,
      objectiveRef: input.objectiveRef,
      digitalMeRef: input.digitalMeRef,
      silkAccountRef: input.silkAccountRef,
      economicOwnerRef: input.economicOwnerRef,
      requiredLegTypes: [...input.requiredLegTypes].sort(),
      legRefs,
      providerRefs,
      failureCount,
      monetaryTotals,
      nativeConsumptions,
      outstandingObligationCount,
      finalEffectRef: input.finalEffect.effect.effectRef,
      finalEffectObservedStateRef: input.finalEffect.effect.observedStateRef,
      completedAt,
    }),
  ).slice(0, 24);
  return {
    receiptRef: `MODERN-WORK-RECEIPT:${identity}`,
    journeyRef: input.journeyRef,
    objectiveRef: input.objectiveRef,
    digitalMeRef: input.digitalMeRef,
    silkAccountRef: input.silkAccountRef,
    economicOwnerRef: input.economicOwnerRef,
    requiredLegTypes: [...input.requiredLegTypes],
    legRefs,
    providerRefs,
    failureCount,
    monetaryTotals,
    nativeConsumptions,
    outstandingObligationCount,
    finalEffectRef: input.finalEffect.effect.effectRef,
    finalEffectObservedStateRef: input.finalEffect.effect.observedStateRef,
    completedAt,
    synthetic: true,
  };
}

export function composeModernJourneyConfluenceV1(input: {
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  requiredLegTypes: readonly ModernJourneyConfluenceLegTypeV1[];
  payment?: ModernJourneyRuntimeSnapshotV1;
  capabilityLegs?: readonly ModernCapabilityLegSnapshotV1[];
  finalEffect?: EffectVerificationSuccessV1;
}): ModernJourneyConfluenceV1 {
  if (!input.journeyRef.trim()) throw new Error("modern_confluence_journey_ref_required");
  if (!input.objectiveRef.trim()) throw new Error("modern_confluence_objective_ref_required");
  if (!input.digitalMeRef.trim()) throw new Error("modern_confluence_digital_me_ref_required");
  if (!input.silkAccountRef.trim()) throw new Error("modern_confluence_silk_account_ref_required");
  if (!input.economicOwnerRef.trim()) throw new Error("modern_confluence_economic_owner_ref_required");
  if (input.requiredLegTypes.length === 0) throw new Error("modern_confluence_required_legs_required");
  if (new Set(input.requiredLegTypes).size !== input.requiredLegTypes.length) {
    throw new Error("modern_confluence_duplicate_required_leg_type");
  }

  const legs: ModernJourneyConfluenceLegSummaryV1[] = [];
  if (input.payment) legs.push(paymentSummary(input.payment));
  for (const snapshot of input.capabilityLegs ?? []) legs.push(capabilitySummary(snapshot));
  const seenTypes = new Set<ModernJourneyConfluenceLegTypeV1>();
  for (const leg of legs) {
    assertLegLineage(leg, input);
    if (seenTypes.has(leg.legType)) throw new Error("modern_confluence_duplicate_leg_type");
    seenTypes.add(leg.legType);
  }

  const requiredSet = new Set(input.requiredLegTypes);
  for (const leg of legs) {
    if (!requiredSet.has(leg.legType)) throw new Error("modern_confluence_unrequired_leg_type");
  }
  const missingLegTypes = input.requiredLegTypes.filter((legType) => !seenTypes.has(legType));

  let state: ModernJourneyConfluenceStateV1 = "IN_PROGRESS";
  if (legs.some((leg) => leg.state === "BLOCKED")) {
    state = "BLOCKED";
  } else if (legs.some((leg) => leg.state === "RECOVERY_REQUIRED")) {
    state = "RECOVERY_REQUIRED";
  } else if (missingLegTypes.length > 0 || legs.some((leg) => leg.state !== "CLOSED")) {
    state = "IN_PROGRESS";
  } else {
    state = "EFFECT_PENDING";
  }

  if (input.finalEffect) {
    if (state !== "EFFECT_PENDING") {
      throw new Error("modern_confluence_final_effect_before_required_legs_closed");
    }
    if (input.finalEffect.effect.programRef !== input.journeyRef) {
      throw new Error("modern_confluence_final_effect_journey_mismatch");
    }
    const workReceipt = receiptFor({
      ...input,
      legs,
      finalEffect: input.finalEffect,
    });
    return {
      journeyRef: input.journeyRef,
      objectiveRef: input.objectiveRef,
      digitalMeRef: input.digitalMeRef,
      silkAccountRef: input.silkAccountRef,
      economicOwnerRef: input.economicOwnerRef,
      requiredLegTypes: [...input.requiredLegTypes],
      state: "CLOSED",
      legs,
      missingLegTypes,
      finalEffectRef: input.finalEffect.effect.effectRef,
      workReceipt,
    };
  }

  return {
    journeyRef: input.journeyRef,
    objectiveRef: input.objectiveRef,
    digitalMeRef: input.digitalMeRef,
    silkAccountRef: input.silkAccountRef,
    economicOwnerRef: input.economicOwnerRef,
    requiredLegTypes: [...input.requiredLegTypes],
    state,
    legs,
    missingLegTypes,
  };
}