export interface SettlementIntentV1 {
  settlementIntentRef: string;
  obligationRef: string;
  financialAuthorityRef: string;
  riverEvidenceRef: string;
  providerAdapterRef: string;
  amountMinor: bigint;
  currency: string;
  requestedAt: string;
  idempotencyKey: string;
  correlationId: string;
}

interface SettlementStateBaseV1 {
  settlementIntentRef: string;
  obligationRef: string;
  correlationId: string;
  updatedAt: string;
}

export interface SettlementNonFinalStateV1 extends SettlementStateBaseV1 {
  state: "PREPARED" | "SUBMITTED" | "UNCERTAIN" | "RECONCILED";
  settlementFinality: false;
  providerReceiptRef?: string;
  reconciliationRef?: string;
  finalityEvidenceRef?: never;
}

export interface SettlementFinalStateV1 extends SettlementStateBaseV1 {
  state: "FINAL";
  settlementFinality: true;
  providerReceiptRef: string;
  reconciliationRef: string;
  finalityEvidenceRef: string;
}

export type SettlementStateV1 = SettlementNonFinalStateV1 | SettlementFinalStateV1;
