import { describe, expect, it } from "vitest";
import {
  ExecutionContractValidationError,
  type ExecutionValidationContext,
  type WardenExecutionContractR01,
  validateExecutionContractPreSpawn,
} from "./wardenExecutionContract.js";

const contract = (): WardenExecutionContractR01 => ({
  contractVersion: "WARDEN-MXC-R0.1",
  executionId: "EXEC-000001",
  authority: {
    wardenDecisionId: "WD-000001",
    decisionHash: "sha256:decision",
    decision: "ALLOW",
    issuedAt: "2026-09-11T00:00:00.000Z",
    effectiveFrom: "2026-09-11T00:00:00.000Z",
    expiresAt: "2026-09-12T00:00:00.000Z",
  },
  principal: { principalId: "DM-001" },
  genesisContext: {
    nodeId: "ALPHA-NODE-001",
    deviceId: "GENESIS-DEVICE-001",
    workspaceId: "WORKSPACE-001",
  },
  workload: {
    workloadId: "WORKLOAD-001",
    artifactDigest: "sha256:artifact",
    commandDigest: "sha256:command",
    purpose: "qualification-test",
  },
  permissions: {
    filesystemRead: ["C:\\VSR\\jobs\\JOB-001\\input"],
    filesystemWrite: ["C:\\VSR\\jobs\\JOB-001\\workspace"],
    networkEgress: [],
    networkIngress: [],
    hostLoopback: false,
    ui: "deny",
    timeoutMs: 30_000,
  },
  runtime: {
    provider: "MXC",
    mxcSchema: "0.8.0-alpha",
    containment: "process",
  },
  evidence: {
    riverReservationId: "RR-000001",
    receiptRequired: true,
    captureStdout: true,
    captureStderr: true,
  },
});

const context = (): ExecutionValidationContext => ({
  now: new Date("2026-09-11T12:00:00.000Z"),
  principalId: "DM-001",
  nodeId: "ALPHA-NODE-001",
  deviceId: "GENESIS-DEVICE-001",
  workspaceId: "WORKSPACE-001",
  artifactDigest: "sha256:artifact",
  commandDigest: "sha256:command",
  riverReservationId: "RR-000001",
  decisionIntegrityValid: true,
  mxcAvailable: true,
  supportedSchema: true,
  supportedContainment: true,
});

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ExecutionContractValidationError);
    expect((error as ExecutionContractValidationError).code).toBe(code);
  }
}

describe("WARDEN-MXC-R0.1 pre-spawn gate", () => {
  it("passes a bounded valid contract", () => {
    expect(() => validateExecutionContractPreSpawn(contract(), context())).not.toThrow();
  });

  it("MXC-W-003: rejects an expired Warden decision", () => {
    const c = contract();
    c.authority.expiresAt = "2026-09-11T11:59:59.000Z";
    expectCode(() => validateExecutionContractPreSpawn(c, context()), "DECISION_EXPIRED");
  });

  it("MXC-W-005: rejects failed Warden decision integrity", () => {
    const ctx = context();
    ctx.decisionIntegrityValid = false;
    expectCode(
      () => validateExecutionContractPreSpawn(contract(), ctx),
      "INVALID_DECISION_INTEGRITY",
    );
  });

  it("MXC-W-006: rejects principal mismatch", () => {
    const ctx = context();
    ctx.principalId = "DM-OTHER";
    expectCode(() => validateExecutionContractPreSpawn(contract(), ctx), "PRINCIPAL_MISMATCH");
  });

  it("MXC-W-007: rejects Genesis device mismatch", () => {
    const ctx = context();
    ctx.deviceId = "GENESIS-DEVICE-OTHER";
    expectCode(() => validateExecutionContractPreSpawn(contract(), ctx), "DEVICE_MISMATCH");
  });

  it("MXC-W-008: rejects workspace mismatch", () => {
    const ctx = context();
    ctx.workspaceId = "WORKSPACE-OTHER";
    expectCode(() => validateExecutionContractPreSpawn(contract(), ctx), "WORKSPACE_MISMATCH");
  });

  it("MXC-W-009: rejects artifact mutation", () => {
    const ctx = context();
    ctx.artifactDigest = "sha256:changed";
    expectCode(
      () => validateExecutionContractPreSpawn(contract(), ctx),
      "ARTIFACT_DIGEST_MISMATCH",
    );
  });

  it("MXC-W-009: rejects command mutation", () => {
    const ctx = context();
    ctx.commandDigest = "sha256:changed";
    expectCode(
      () => validateExecutionContractPreSpawn(contract(), ctx),
      "COMMAND_DIGEST_MISMATCH",
    );
  });

  it("MXC-W-013: rejects missing or mismatched River reservation", () => {
    const ctx = context();
    ctx.riverReservationId = "RR-OTHER";
    expectCode(
      () => validateExecutionContractPreSpawn(contract(), ctx),
      "RIVER_RESERVATION_MISMATCH",
    );
  });

  it("MXC-W-014: rejects when MXC is unavailable", () => {
    const ctx = context();
    ctx.mxcAvailable = false;
    expectCode(() => validateExecutionContractPreSpawn(contract(), ctx), "MXC_UNAVAILABLE");
  });

  it("MXC-W-016: rejects unsupported schema", () => {
    const ctx = context();
    ctx.supportedSchema = false;
    expectCode(
      () => validateExecutionContractPreSpawn(contract(), ctx),
      "UNSUPPORTED_MXC_SCHEMA",
    );
  });

  it("MXC-W-016: rejects unsupported containment", () => {
    const ctx = context();
    ctx.supportedContainment = false;
    expectCode(
      () => validateExecutionContractPreSpawn(contract(), ctx),
      "UNSUPPORTED_CONTAINMENT",
    );
  });

  it("keeps host loopback closed in R0.1", () => {
    const c = contract();
    c.permissions.hostLoopback = true;
    expectCode(
      () => validateExecutionContractPreSpawn(c, context()),
      "HOST_LOOPBACK_NOT_ALLOWED_R01",
    );
  });
});
