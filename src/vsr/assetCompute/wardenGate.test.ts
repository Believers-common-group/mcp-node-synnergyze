import { describe, expect, it } from "vitest";
import { issueExecutionCapability } from "./wardenGate.ts";

const now = new Date("2026-08-23T04:35:00.000Z");

const baseInput = {
  executionId: "EXEC-WARDEN-001",
  principalId: "DM-ALPHA-001",
  assetId: "AST-ALPHA-001",
  operations: ["EXECUTE", "DERIVE"] as const,
  selectedRoute: "SIMULATED-PROVIDER-001",
  requestedCostCeiling: 50,
  fundingReserved: 100,
  currency: "INR",
};

const allowedScope = {
  assetId: "AST-ALPHA-001",
  operations: ["EXECUTE", "DERIVE"] as const,
  selectedRoute: "SIMULATED-PROVIDER-001",
};

describe("issueExecutionCapability", () => {
  it("rejects execution even when funding is sufficient if Warden denies authority", () => {
    expect(() =>
      issueExecutionCapability({
        ...baseInput,
        decision: {
          decisionId: "WD-DENY-001",
          executionId: "EXEC-WARDEN-001",
          principalId: "DM-ALPHA-001",
          ...allowedScope,
          outcome: "DENY",
          maxCost: 50,
          currency: "INR",
          expiresAt: "2026-08-23T05:00:00.000Z",
        },
        now,
      }),
    ).toThrowError("WARDEN_NOT_AUTHORIZED");
  });

  it("rejects an expired Warden ALLOW decision", () => {
    expect(() =>
      issueExecutionCapability({
        ...baseInput,
        decision: {
          decisionId: "WD-ALLOW-EXPIRED-001",
          executionId: "EXEC-WARDEN-001",
          principalId: "DM-ALPHA-001",
          ...allowedScope,
          outcome: "ALLOW",
          maxCost: 50,
          currency: "INR",
          expiresAt: "2026-08-23T04:30:00.000Z",
        },
        now,
      }),
    ).toThrowError("WARDEN_DECISION_EXPIRED");
  });

  it("rejects a capability for a different asset than Warden authorized", () => {
    expect(() =>
      issueExecutionCapability({
        ...baseInput,
        assetId: "AST-DIFFERENT-001",
        decision: {
          decisionId: "WD-SCOPE-ASSET-001",
          executionId: "EXEC-WARDEN-001",
          principalId: "DM-ALPHA-001",
          ...allowedScope,
          outcome: "ALLOW",
          maxCost: 50,
          currency: "INR",
          expiresAt: "2026-08-23T05:00:00.000Z",
        },
        now,
      }),
    ).toThrowError("WARDEN_DECISION_ASSET_MISMATCH");
  });

  it("rejects operations beyond the Warden-authorized operation set", () => {
    expect(() =>
      issueExecutionCapability({
        ...baseInput,
        operations: ["EXECUTE", "DERIVE", "ADMINISTER"],
        decision: {
          decisionId: "WD-SCOPE-OPS-001",
          executionId: "EXEC-WARDEN-001",
          principalId: "DM-ALPHA-001",
          ...allowedScope,
          outcome: "ALLOW",
          maxCost: 50,
          currency: "INR",
          expiresAt: "2026-08-23T05:00:00.000Z",
        },
        now,
      }),
    ).toThrowError("WARDEN_DECISION_OPERATION_MISMATCH");
  });

  it("rejects a provider route other than the Warden-authorized route", () => {
    expect(() =>
      issueExecutionCapability({
        ...baseInput,
        selectedRoute: "SIMULATED-PROVIDER-OTHER",
        decision: {
          decisionId: "WD-SCOPE-ROUTE-001",
          executionId: "EXEC-WARDEN-001",
          principalId: "DM-ALPHA-001",
          ...allowedScope,
          outcome: "ALLOW",
          maxCost: 50,
          currency: "INR",
          expiresAt: "2026-08-23T05:00:00.000Z",
        },
        now,
      }),
    ).toThrowError("WARDEN_DECISION_ROUTE_MISMATCH");
  });
});
