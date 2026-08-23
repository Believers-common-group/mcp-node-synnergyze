import { describe, expect, it } from "vitest";
import { InMemoryEventLog } from "./eventLog.ts";
import { AssetComputeFabric } from "./fabric.ts";
import { InMemoryFundingLedger } from "./fundingLedger.ts";
import { DeterministicProviderAdapter } from "./providerAdapter.ts";
import type { AssetComputeExecutionInput, ProviderAdapter } from "./types.ts";

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

  it("releases reserved funding and records an exception when provider execution fails", async () => {
    const fundingLedger = new InMemoryFundingLedger([source]);
    const eventLog = new InMemoryEventLog();
    const provider = new DeterministicProviderAdapter({ mode: "PROVIDER_FAILURE" });

    const fabric = new AssetComputeFabric({
      fundingLedger,
      eventLog,
      provider,
      verifyEffect: async () => {
        throw new Error("EFFECT_VERIFIER_SHOULD_NOT_RUN");
      },
    });

    await expect(
      fabric.execute({
        executionId: "EXEC-FABRIC-FAIL-001",
        principalId: "DM-ALPHA-001",
        assetId: "AST-ALPHA-001",
        inputRef: "asset://AST-ALPHA-001",
        resolutionRefs: {
          principal: "GENESIS:DM-ALPHA-001",
          asset: "GENESIS:AST-ALPHA-001",
          entitlement: "GENESIS:RIGHT-ALPHA-001",
          routeQuote: "SYNNERGYZE:RQ-ALPHA-FAIL-001",
        },
        reservationId: "RES-FABRIC-FAIL-001",
        reserveAmount: 40,
        fundingPriority: ["ASSET_ALLOWANCE"],
        selectedRoute: "SIMULATED-PROVIDER-001",
        operations: ["EXECUTE", "DERIVE"],
        currency: "INR",
        requestedCostCeiling: 40,
        now: new Date("2026-08-23T05:20:00.000Z"),
        decision: {
          decisionId: "WD-FABRIC-FAIL-001",
          executionId: "EXEC-FABRIC-FAIL-001",
          principalId: "DM-ALPHA-001",
          outcome: "ALLOW",
          maxCost: 40,
          currency: "INR",
          expiresAt: "2026-08-23T06:00:00.000Z",
        },
      }),
    ).rejects.toThrowError("PROVIDER_EXECUTION_FAILED");

    expect(fundingLedger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 100,
      reserved: 0,
      settled: 0,
      currency: "INR",
    });

    const eventTypes = eventLog
      .eventsFor("EXEC-FABRIC-FAIL-001")
      .map((event) => event.eventType);
    expect(eventTypes).toContain("execution.exception");
    expect(eventTypes).not.toContain("asset.candidate_created");
  });

  it("records effect rejection and does not create or settle an asset when output fails verification", async () => {
    const fundingLedger = new InMemoryFundingLedger([source]);
    const eventLog = new InMemoryEventLog();
    const provider = new DeterministicProviderAdapter({
      mode: "SUCCESS",
      actualCost: 25,
      outputRef: "artifact://alpha/rejected-001",
    });

    const fabric = new AssetComputeFabric({
      fundingLedger,
      eventLog,
      provider,
      verifyEffect: async ({ executionId, outputRef }) => ({
        verified: false,
        effectReceiptId: `EFF-REJECTED:${executionId}`,
        outputRef,
      }),
    });

    await expect(
      fabric.execute({
        executionId: "EXEC-FABRIC-EFFECT-FAIL-001",
        principalId: "DM-ALPHA-001",
        assetId: "AST-ALPHA-001",
        inputRef: "asset://AST-ALPHA-001",
        resolutionRefs: {
          principal: "GENESIS:DM-ALPHA-001",
          asset: "GENESIS:AST-ALPHA-001",
          entitlement: "GENESIS:RIGHT-ALPHA-001",
          routeQuote: "SYNNERGYZE:RQ-EFFECT-FAIL-001",
        },
        reservationId: "RES-FABRIC-EFFECT-FAIL-001",
        reserveAmount: 40,
        fundingPriority: ["ASSET_ALLOWANCE"],
        selectedRoute: "SIMULATED-PROVIDER-001",
        operations: ["EXECUTE", "DERIVE"],
        currency: "INR",
        requestedCostCeiling: 40,
        now: new Date("2026-08-23T05:25:00.000Z"),
        decision: {
          decisionId: "WD-FABRIC-EFFECT-FAIL-001",
          executionId: "EXEC-FABRIC-EFFECT-FAIL-001",
          principalId: "DM-ALPHA-001",
          outcome: "ALLOW",
          maxCost: 40,
          currency: "INR",
          expiresAt: "2026-08-23T06:00:00.000Z",
        },
      }),
    ).rejects.toThrowError("EFFECT_NOT_VERIFIED");

    expect(fundingLedger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 100,
      reserved: 0,
      settled: 0,
      currency: "INR",
    });

    const eventTypes = eventLog
      .eventsFor("EXEC-FABRIC-EFFECT-FAIL-001")
      .map((event) => event.eventType);
    expect(eventTypes).toContain("provider.completed");
    expect(eventTypes).toContain("output.observed");
    expect(eventTypes).toContain("effect.rejected");
    expect(eventTypes).toContain("execution.exception");
    expect(eventTypes).not.toContain("effect.verified");
    expect(eventTypes).not.toContain("asset.candidate_created");
    expect(eventTypes).not.toContain("settlement.completed");
  });

  it("returns the completed result on exact replay without re-running provider or settlement", async () => {
    const fundingLedger = new InMemoryFundingLedger([source]);
    const eventLog = new InMemoryEventLog();
    const baseProvider = new DeterministicProviderAdapter({
      mode: "SUCCESS",
      actualCost: 32,
      outputRef: "artifact://alpha/replay-001",
    });
    let providerCalls = 0;
    const provider: ProviderAdapter = {
      execute: async (request) => {
        providerCalls += 1;
        return baseProvider.execute(request);
      },
    };
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
    const input: AssetComputeExecutionInput = {
      executionId: "EXEC-FABRIC-REPLAY-001",
      principalId: "DM-ALPHA-001",
      assetId: "AST-ALPHA-001",
      inputRef: "asset://AST-ALPHA-001",
      resolutionRefs: {
        principal: "GENESIS:DM-ALPHA-001",
        asset: "GENESIS:AST-ALPHA-001",
        entitlement: "GENESIS:RIGHT-ALPHA-001",
        routeQuote: "SYNNERGYZE:RQ-REPLAY-001",
      },
      reservationId: "RES-FABRIC-REPLAY-001",
      reserveAmount: 50,
      fundingPriority: ["ASSET_ALLOWANCE"],
      selectedRoute: "SIMULATED-PROVIDER-001",
      operations: ["EXECUTE", "DERIVE"],
      currency: "INR",
      requestedCostCeiling: 50,
      now: new Date("2026-08-23T05:30:00.000Z"),
      decision: {
        decisionId: "WD-FABRIC-REPLAY-001",
        executionId: "EXEC-FABRIC-REPLAY-001",
        principalId: "DM-ALPHA-001",
        outcome: "ALLOW",
        maxCost: 50,
        currency: "INR",
        expiresAt: "2026-08-23T06:00:00.000Z",
      },
    };

    const first = await fabric.execute(input);
    const eventCount = eventLog.eventsFor(input.executionId).length;
    const second = await fabric.execute(input);

    expect(second).toEqual(first);
    expect(providerCalls).toBe(1);
    expect(eventLog.eventsFor(input.executionId)).toHaveLength(eventCount);
    expect(fundingLedger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 68,
      reserved: 0,
      settled: 32,
      currency: "INR",
    });
  });

  it("fails closed on conflicting reuse of a completed execution id", async () => {
    const fundingLedger = new InMemoryFundingLedger([source]);
    const eventLog = new InMemoryEventLog();
    const baseProvider = new DeterministicProviderAdapter({
      mode: "SUCCESS",
      actualCost: 20,
      outputRef: "artifact://alpha/conflict-001",
    });
    let providerCalls = 0;
    const provider: ProviderAdapter = {
      execute: async (request) => {
        providerCalls += 1;
        return baseProvider.execute(request);
      },
    };
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
    const input: AssetComputeExecutionInput = {
      executionId: "EXEC-FABRIC-CONFLICT-001",
      principalId: "DM-ALPHA-001",
      assetId: "AST-ALPHA-001",
      inputRef: "asset://AST-ALPHA-001",
      resolutionRefs: {
        principal: "GENESIS:DM-ALPHA-001",
        asset: "GENESIS:AST-ALPHA-001",
        entitlement: "GENESIS:RIGHT-ALPHA-001",
        routeQuote: "SYNNERGYZE:RQ-CONFLICT-001",
      },
      reservationId: "RES-FABRIC-CONFLICT-001",
      reserveAmount: 40,
      fundingPriority: ["ASSET_ALLOWANCE"],
      selectedRoute: "SIMULATED-PROVIDER-001",
      operations: ["EXECUTE", "DERIVE"],
      currency: "INR",
      requestedCostCeiling: 40,
      now: new Date("2026-08-23T05:35:00.000Z"),
      decision: {
        decisionId: "WD-FABRIC-CONFLICT-001",
        executionId: "EXEC-FABRIC-CONFLICT-001",
        principalId: "DM-ALPHA-001",
        outcome: "ALLOW",
        maxCost: 40,
        currency: "INR",
        expiresAt: "2026-08-23T06:00:00.000Z",
      },
    };

    await fabric.execute(input);

    await expect(
      fabric.execute({
        ...input,
        assetId: "AST-DIFFERENT-001",
        inputRef: "asset://AST-DIFFERENT-001",
      }),
    ).rejects.toThrowError("EXECUTION_IDEMPOTENCY_CONFLICT");

    expect(providerCalls).toBe(1);
  });
});
