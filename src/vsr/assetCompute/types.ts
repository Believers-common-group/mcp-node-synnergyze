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
