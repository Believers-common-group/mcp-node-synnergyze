import { createHash } from "node:crypto";

import type {
  ModernJourneyMonetaryTotalV1,
  ModernJourneyNativeConsumptionV1,
  ModernWorkReceiptV1,
} from "./modern-journey-confluence.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sortedMonetaryTotals(
  values: readonly ModernJourneyMonetaryTotalV1[],
): ModernJourneyMonetaryTotalV1[] {
  return values
    .map((value) => ({ ...value }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function sortedNativeConsumptions(
  values: readonly ModernJourneyNativeConsumptionV1[],
): ModernJourneyNativeConsumptionV1[] {
  return values
    .map((value) => ({ ...value }))
    .sort((left, right) => left.legRef.localeCompare(right.legRef));
}

function identity(receipt: Omit<ModernWorkReceiptV1, "receiptRef">): string {
  return JSON.stringify({
    journeyRef: receipt.journeyRef,
    objectiveRef: receipt.objectiveRef,
    digitalMeRef: receipt.digitalMeRef,
    silkAccountRef: receipt.silkAccountRef,
    economicOwnerRef: receipt.economicOwnerRef,
    requiredLegTypes: [...receipt.requiredLegTypes].sort(),
    legRefs: [...receipt.legRefs].sort(),
    providerRefs: [...receipt.providerRefs].sort(),
    failureCount: receipt.failureCount,
    monetaryTotals: sortedMonetaryTotals(receipt.monetaryTotals),
    nativeConsumptions: sortedNativeConsumptions(receipt.nativeConsumptions),
    outstandingObligationCount: receipt.outstandingObligationCount,
    finalEffectRef: receipt.finalEffectRef,
    finalEffectObservedStateRef: receipt.finalEffectObservedStateRef,
    completedAt: receipt.completedAt,
  });
}

export function modernWorkReceiptRefV1(
  receipt: Omit<ModernWorkReceiptV1, "receiptRef">,
): string {
  return `MODERN-WORK-RECEIPT:${digest(identity(receipt)).slice(0, 24)}`;
}

export function validateModernWorkReceiptV1(receipt: ModernWorkReceiptV1): void {
  if (receipt.synthetic !== true) throw new Error("modern_work_receipt_synthetic_required");
  if (!receipt.journeyRef.trim()) throw new Error("modern_work_receipt_journey_ref_required");
  if (!receipt.objectiveRef.trim()) throw new Error("modern_work_receipt_objective_ref_required");
  if (!receipt.digitalMeRef.trim()) throw new Error("modern_work_receipt_digital_me_ref_required");
  if (!receipt.silkAccountRef.trim()) throw new Error("modern_work_receipt_silk_account_ref_required");
  if (!receipt.economicOwnerRef.trim()) throw new Error("modern_work_receipt_owner_ref_required");
  if (!receipt.finalEffectRef.trim()) throw new Error("modern_work_receipt_effect_ref_required");
  if (!receipt.finalEffectObservedStateRef.trim()) {
    throw new Error("modern_work_receipt_observed_state_required");
  }
  if (!Number.isFinite(Date.parse(receipt.completedAt))) {
    throw new Error("modern_work_receipt_invalid_completed_at");
  }
  if (new Set(receipt.requiredLegTypes).size !== receipt.requiredLegTypes.length) {
    throw new Error("modern_work_receipt_duplicate_required_leg_type");
  }
  if (new Set(receipt.legRefs).size !== receipt.legRefs.length) {
    throw new Error("modern_work_receipt_duplicate_leg_ref");
  }
  if (new Set(receipt.providerRefs).size !== receipt.providerRefs.length) {
    throw new Error("modern_work_receipt_duplicate_provider_ref");
  }
  if (!Number.isInteger(receipt.failureCount) || receipt.failureCount < 0) {
    throw new Error("modern_work_receipt_invalid_failure_count");
  }
  if (
    !Number.isInteger(receipt.outstandingObligationCount) ||
    receipt.outstandingObligationCount < 0
  ) {
    throw new Error("modern_work_receipt_invalid_obligation_count");
  }
  for (const total of receipt.monetaryTotals) {
    if (!total.currency.trim() || !Number.isFinite(total.amount) || total.amount < 0) {
      throw new Error("modern_work_receipt_invalid_monetary_total");
    }
  }
  for (const consumption of receipt.nativeConsumptions) {
    if (
      !consumption.legRef.trim() ||
      !consumption.providerRef.trim() ||
      !consumption.resourceRef.trim() ||
      !consumption.resourceOwnerRef.trim() ||
      !Number.isFinite(consumption.quantity) ||
      consumption.quantity <= 0 ||
      !consumption.unit.trim()
    ) {
      throw new Error("modern_work_receipt_invalid_native_consumption");
    }
  }

  const { receiptRef: _receiptRef, ...body } = receipt;
  const expected = modernWorkReceiptRefV1(body);
  if (receipt.receiptRef !== expected) throw new Error("modern_work_receipt_ref_mismatch");
}