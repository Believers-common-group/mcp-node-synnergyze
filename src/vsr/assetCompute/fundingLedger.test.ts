import { describe, expect, it } from "vitest";
import { InMemoryFundingLedger } from "./fundingLedger.ts";

const source = {
  sourceId: "FS-ASSET-ALLOWANCE",
  principalId: "DM-ALPHA-001",
  kind: "ASSET_ALLOWANCE" as const,
  currency: "INR",
  available: 100,
};

describe("InMemoryFundingLedger", () => {
  it("reserves a ceiling, settles actual cost, and releases unused funding", () => {
    const ledger = new InMemoryFundingLedger([source]);

    const reservation = ledger.reserve({
      reservationId: "RES-000001",
      executionId: "EXEC-000001",
      principalId: "DM-ALPHA-001",
      amount: 50,
      currency: "INR",
      sourcePriority: ["ASSET_ALLOWANCE"],
    });

    expect(reservation.amountReserved).toBe(50);
    expect(ledger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 50,
      reserved: 50,
      settled: 0,
      currency: "INR",
    });

    expect(ledger.settle("RES-000001", 32)).toEqual({
      reservationId: "RES-000001",
      amountReserved: 50,
      amountSettled: 32,
      amountReleased: 18,
      currency: "INR",
    });

    expect(ledger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 68,
      reserved: 0,
      settled: 32,
      currency: "INR",
    });
  });
});
