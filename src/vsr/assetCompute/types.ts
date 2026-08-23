export type FundingKind = "ASSET_ALLOWANCE" | "ASSET_YIELD" | "PREPAID";

export interface FundingSource {
  sourceId: string;
  principalId: string;
  kind: FundingKind;
  currency: string;
  available: number;
}

export interface FundingBalance {
  available: number;
  reserved: number;
  settled: number;
  currency: string;
}

export interface ReserveFundingInput {
  reservationId: string;
  executionId: string;
  principalId: string;
  amount: number;
  currency: string;
  sourcePriority: FundingKind[];
}

export interface FundingReservation {
  reservationId: string;
  executionId: string;
  principalId: string;
  sourceId: string;
  amountReserved: number;
  currency: string;
  status: "RESERVED" | "SETTLED" | "RELEASED";
}

export interface FundingSettlement {
  reservationId: string;
  amountReserved: number;
  amountSettled: number;
  amountReleased: number;
  currency: string;
}

export type WardenOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_EVIDENCE";

export interface WardenDecision {
  decisionId: string;
  executionId: string;
  principalId: string;
  assetId: string;
  operations: readonly string[];
  selectedRoute: string;
  outcome: WardenOutcome;
  maxCost: number;
  currency: string;
  expiresAt: string;
}

export interface IssueExecutionCapabilityInput {
  executionId: string;
  principalId: string;
  assetId: string;
  operations: readonly string[];
  selectedRoute: string;
  requestedCostCeiling: number;
  fundingReserved: number;
  currency: string;
  decision: WardenDecision;
  now: Date;
}

export interface CapabilityGrant {
  capabilityId: string;
  decisionId: string;
  executionId: string;
  principalId: string;
  assetId: string;
  operations: readonly string[];
  selectedRoute: string;
  maxCost: number;
  currency: string;
  expiresAt: string;
}

export type ExecutionState =
  | "REQUESTED"
  | "PRINCIPAL_RESOLVED"
  | "ASSET_RESOLVED"
  | "ENTITLEMENT_RESOLVED"
  | "ROUTE_QUOTED"
  | "WARDEN_PENDING"
  | "AUTHORIZED"
  | "FUNDS_RESERVED"
  | "CAPABILITY_ISSUED"
  | "DISPATCHED"
  | "RUNNING"
  | "METERING"
  | "OUTPUT_OBSERVED"
  | "EFFECT_VERIFIED"
  | "ASSET_REGISTERED"
  | "SETTLED"
  | "EXCEPTION"
  | "RECONCILIATION"
  | "RECOVERY"
  | "COMPENSATION"
  | "CLOSED";

export interface RiverEvent {
  eventId: string;
  executionId: string;
  eventType: string;
  timestamp: string;
  source: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface ProviderExecutionRequest {
  executionId: string;
  capability: CapabilityGrant;
  inputRef: string;
}

export interface ProviderReceipt {
  provider: string;
  providerExecutionId: string;
  executionId: string;
  status: "COMPLETED";
  actualCost: number;
  currency: string;
}

export interface ProviderObservation {
  executionId: string;
  outputRef: string;
  observed: true;
}

export interface ProviderExecutionResult {
  receipt: ProviderReceipt;
  observation: ProviderObservation;
}

export interface ProviderAdapter {
  execute(input: ProviderExecutionRequest): Promise<ProviderExecutionResult>;
}

export interface AssetComputeResolutionRefs {
  principal: string;
  asset: string;
  entitlement: string;
  routeQuote: string;
}

export interface EffectVerificationInput {
  executionId: string;
  outputRef: string;
  providerReceipt: ProviderReceipt;
}

export interface EffectVerificationResult {
  verified: boolean;
  effectReceiptId: string;
  outputRef: string;
}

export type EffectVerifier = (
  input: EffectVerificationInput,
) => Promise<EffectVerificationResult>;

export interface AssetComputeExecutionInput {
  executionId: string;
  principalId: string;
  assetId: string;
  inputRef: string;
  resolutionRefs: AssetComputeResolutionRefs;
  reservationId: string;
  reserveAmount: number;
  fundingPriority: FundingKind[];
  selectedRoute: string;
  operations: readonly string[];
  currency: string;
  requestedCostCeiling: number;
  now: Date;
  decision: WardenDecision;
}

export interface DerivedAssetCandidate {
  assetId: string;
  parentAssetId: string;
  executionId: string;
  outputRef: string;
  effectReceiptId: string;
}

export interface AssetComputeExecutionResult {
  executionId: string;
  state: "CLOSED";
  settlement: FundingSettlement;
  derivedAsset: DerivedAssetCandidate;
  capability: CapabilityGrant;
  providerReceipt: ProviderReceipt;
  effectReceiptId: string;
}
