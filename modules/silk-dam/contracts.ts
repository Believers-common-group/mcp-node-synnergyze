export interface EconomicEffectInputV1 {
  economicEffectRef: string;
  verifiedEffectRef: string;
  riverEvidenceRef: string;
  economicObjectRef: string;
  policyRef: string;
  currency: string;
  correlationId: string;
}

export interface ModelledAmountV1 {
  amountMinor: bigint;
  currency: string;
}

export interface EconomicConsequenceDraftV1 {
  consequenceRef: string;
  economicEffectRef: string;
  policyRef: string;
  state: "DRAFT" | "REQUIRES_AUTHORIZATION";
  modelledAmounts: readonly ModelledAmountV1[];
  obligationRefs: readonly string[];
  settlementFinality: false;
  correlationId: string;
}
