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
