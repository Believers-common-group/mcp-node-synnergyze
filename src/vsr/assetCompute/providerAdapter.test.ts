import { describe, expect, it } from "vitest";
import { DeterministicProviderAdapter } from "./providerAdapter.ts";

const capability = {
  capabilityId: "CAP-EXEC-PROVIDER-001",
  decisionId: "WD-ALLOW-PROVIDER-001",
  executionId: "EXEC-PROVIDER-001",
  principalId: "DM-ALPHA-001",
  assetId: "AST-ALPHA-001",
  operations: ["EXECUTE", "DERIVE"] as const,
  selectedRoute: "SIMULATED-PROVIDER-001",
  maxCost: 50,
  currency: "INR",
  expiresAt: "2026-08-23T06:00:00.000Z",
};

describe("DeterministicProviderAdapter", () => {
  it("returns provider receipt and output observation without declaring effect verified", async () => {
    const adapter = new DeterministicProviderAdapter({
      mode: "SUCCESS",
      actualCost: 32,
      outputRef: "artifact://alpha/output-001",
    });

    const result = await adapter.execute({
      executionId: "EXEC-PROVIDER-001",
      capability,
      inputRef: "asset://AST-ALPHA-001",
    });

    expect(result.receipt).toEqual({
      provider: "SIMULATED",
      providerExecutionId: "SIM-EXEC-PROVIDER-001",
      executionId: "EXEC-PROVIDER-001",
      status: "COMPLETED",
      actualCost: 32,
      currency: "INR",
    });
    expect(result.observation).toEqual({
      executionId: "EXEC-PROVIDER-001",
      outputRef: "artifact://alpha/output-001",
      observed: true,
    });
    expect("effectVerified" in result).toBe(false);
  });

  it("fails without fabricating output when the provider execution fails", async () => {
    const adapter = new DeterministicProviderAdapter({ mode: "PROVIDER_FAILURE" });

    await expect(
      adapter.execute({
        executionId: "EXEC-PROVIDER-001",
        capability,
        inputRef: "asset://AST-ALPHA-001",
      }),
    ).rejects.toThrowError("PROVIDER_EXECUTION_FAILED");
  });
});
