import { evaluateTrustReceiptRelianceV1 } from "./trust-receipt-reliance.ts";
import type {
  TrustReceiptRelianceInputV1,
  TrustReceiptRelianceResultV1,
} from "./trust-receipt-reliance.ts";
import type { TrustReceiptStatusEventV1 } from "./trust-receipt-status.ts";
import type { TrustReceiptV1 } from "./trust-receipt.ts";

export interface TrustReceiptRelianceStoreV1 {
  getReceipt(receiptRef: string): Promise<TrustReceiptV1 | undefined>;
  getEffectiveReceiptStatus(
    receiptRef: string,
    asOf: string,
  ): Promise<TrustReceiptStatusEventV1 | undefined>;
}

export interface TrustReceiptStoreResolutionInputV1 {
  store: TrustReceiptRelianceStoreV1;
  receiptRef: string;
  asOf: string;
  requiredPolicyRef?: string;
  maximumAgeSeconds?: number;
  acceptedIssuerRefs?: readonly string[];
  acceptedVerifierRefs?: readonly string[];
}

export interface TrustReceiptNotFoundV1 {
  receiptRef: string;
  state: "RECEIPT_NOT_FOUND";
  usable: false;
  reasonCodes: readonly ["receipt_not_found"];
}

export type TrustReceiptStoreResolutionResultV1 =
  | TrustReceiptRelianceResultV1
  | TrustReceiptNotFoundV1;

export async function resolveTrustReceiptRelianceFromStoreV1(
  input: TrustReceiptStoreResolutionInputV1,
): Promise<TrustReceiptStoreResolutionResultV1> {
  const receiptRef = input.receiptRef.trim();
  if (!receiptRef) throw new Error("trust_receipt_store_resolution_receipt_required");

  const receipt = await input.store.getReceipt(receiptRef);
  if (!receipt) {
    return {
      receiptRef,
      state: "RECEIPT_NOT_FOUND",
      usable: false,
      reasonCodes: ["receipt_not_found"],
    };
  }

  const statusEvent = await input.store.getEffectiveReceiptStatus(receiptRef, input.asOf);
  const relianceInput: TrustReceiptRelianceInputV1 = {
    receipt,
    statusEvent,
    asOf: input.asOf,
    requiredPolicyRef: input.requiredPolicyRef,
    maximumAgeSeconds: input.maximumAgeSeconds,
    acceptedIssuerRefs: input.acceptedIssuerRefs,
    acceptedVerifierRefs: input.acceptedVerifierRefs,
  };

  return evaluateTrustReceiptRelianceV1(relianceInput);
}
