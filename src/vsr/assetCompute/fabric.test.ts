import { describe, expect, it } from "vitest";
import { InMemoryEventLog } from "./eventLog.ts";
import { AssetComputeFabric } from "./fabric.ts";
import { InMemoryFundingLedger } from "./fundingLedger.ts";
import { DeterministicProviderAdapter } from "./providerAdapter.ts";

const source = {
  sourceId: "FS-ASSET-ALLOWANCE",
  principalId: "DM-ALPHA-001",
  kind: "ASSET_ALLOWANCE" as const,
  currency: "INR",
  available: 100,
};

describe("AssetComputeFabric", () => {
  it("executes the governed INR 100 -> reserve 50 -> settle 32 -> derived asset flow", async () => {
    const fundingLedger = new InMemoryFundingLedger([source]);
    const eventLog = new InMemoryEventLog();
    const provider = new DeterministicProviderAdapter({
      mode: "SUCCESS",
      actualCost: 32,
      outputRef: "artifact://alpha/derived-001",
    });

    const fabric = new AssetComputeFabric({
      fundingLedger,
      eventLog,
      provider,
      verifyEffect: async ({ executionId, outputRef }) => ({
        verified: true,
        effectReceiptId: `EFF:${executionId}`,
        outputRef,
      }),
    });

    const result = await fabric.execute({
      executionId: "EXEC-FABRIC-001",
      principalId: "DM-ALPHA-001",
      assetId: "AST-ALPHA-001",
      inputRef: "asset://AST-ALPHA-001",
      resolutionRefs: {
        principal: "GENESIS:DM-ALPHA-001",
        asset: "GENESIS:AST-ALPHA-001",
        entitlement: "GENESIS:RIGHT-ALPHA-001",
        routeQuote: "SYNNERGYZE:RQ-ALPHA-001",
      },
      reservationId: "RES-FABRIC-001",
      reserveAmount: 50,
      fundingPriority: ["ASSET_ALLOWANCE"],
      selectedRoute: "SIMULATED-PROVIDER-001",
      operations: ["EXECUTE", "DERIVE"],
      currency: "INR",
      requestedCostCeiling: 50,
      now: new Date("2026-08-23T05:15:00.000Z"),
      decision: {
        decisionId: "WD-FABRIC-001",
        executionId: "EXEC-FABRIC-001",
        principalId: "DM-ALPHA-001",
        outcome: "ALLOW",
        maxCost: 50,
        currency: "INR",
        expiresAt: "2026-08-23T06:00:00.000Z",
      },
    });

    expect(result.state).toBe("CLOSED");
    expect(result.settlement).toEqual({
      reservationId: "RES-FABRIC-001",
      amountReserved: 50,
      amountSettled: 32,
      amountReleased: 18,
      currency: "INR",
    });
    expect(result.derivedAsset).toEqual({
      assetId: "DERIVED:EXEC-FABRIC-001",
      parentAssetId: "AST-ALPHA-001",
      executionId: "EXEC-FABRIC-001",
      outputRef: "artifact://alpha/derived-001",
      effectReceiptId: "EFF:EXEC-FABRIC-001",
    });
    expect(fundingLedger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 68,
      reserved: 0,
      settled: 32,
      currency: "INR",
    });

    expect(eventLog.eventsFor("EXEC-FABRIC-001").map((event) => event.eventType)).toContain(
      "effect.verified",
    );
  });
});
