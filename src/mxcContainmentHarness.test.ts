import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { ContainerConfig } from "@microsoft/mxc-sdk";
import {
  executeQualifiedMxcCommandR01,
  MxcContainmentHarnessError,
  sha256Command,
  type MxcSpawnedProcess,
} from "./mxcContainmentHarness.js";
import {
  ExecutionContractValidationError,
  type ExecutionValidationContext,
  type WardenExecutionContractR01,
} from "./wardenExecutionContract.js";

const commandLine = 'node -e "console.log(\"warden-mxc-ok\")"';

function contract(): WardenExecutionContractR01 {
  const commandDigest = sha256Command(commandLine);
  return {
    contractVersion: "WARDEN-MXC-R0.1",
    executionId: "MXC-SMOKE-001",
    authority: {
      wardenDecisionId: "WD-SMOKE-001",
      decisionHash: "sha256:decision",
      decision: "ALLOW",
      issuedAt: "2026-09-11T00:00:00.000Z",
      effectiveFrom: "2026-09-11T00:00:00.000Z",
      expiresAt: "2026-09-13T00:00:00.000Z",
    },
    principal: { principalId: "DM-001" },
    genesisContext: {
      nodeId: "ALPHA-NODE-001",
      deviceId: "GENESIS-DEVICE-001",
      workspaceId: "WORKSPACE-001",
    },
    workload: {
      workloadId: "MXC-SMOKE-001",
      artifactDigest: "sha256:artifact",
      commandDigest,
      purpose: "containment qualification",
    },
    permissions: {
      filesystemRead: [],
      filesystemWrite: [],
      networkEgress: [],
      networkIngress: [],
      hostLoopback: false,
      ui: "deny",
      timeoutMs: 10_000,
    },
    runtime: {
      provider: "MXC",
      mxcSchema: "0.8.0-alpha",
      containment: "process",
    },
    evidence: {
      riverReservationId: "RR-SMOKE-001",
      receiptRequired: true,
      captureStdout: true,
      captureStderr: true,
    },
  };
}

function context(c = contract()): ExecutionValidationContext {
  return {
    now: new Date("2026-09-12T00:00:00.000Z"),
    principalId: c.principal.principalId,
    nodeId: c.genesisContext.nodeId,
    deviceId: c.genesisContext.deviceId,
    workspaceId: c.genesisContext.workspaceId,
    artifactDigest: c.workload.artifactDigest,
    commandDigest: c.workload.commandDigest,
    riverReservationId: c.evidence.riverReservationId,
    decisionIntegrityValid: true,
    mxcAvailable: true,
    supportedSchema: true,
    supportedContainment: true,
    resolvedWardenDecisionId: c.authority.wardenDecisionId,
    authorizedPermissions: structuredClone(c.permissions),
  };
}

function successfulChild(stdoutText = "warden-mxc-ok\n"): MxcSpawnedProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const listeners = new Map<string, (value: never) => void>();
  const child: MxcSpawnedProcess = {
    stdout,
    stderr,
    once(event: "close" | "error", listener: (value: never) => void) {
      listeners.set(event, listener);
      return child;
    },
  };
  queueMicrotask(() => {
    stdout.end(stdoutText);
    stderr.end("");
    listeners.get("close")?.(0 as never);
  });
  return child;
}

describe("MXC R0.1 containment spawn gate", () => {
  it("does not call MXC spawn when River reservation is mismatched", async () => {
    const c = contract();
    const ctx = context(c);
    ctx.riverReservationId = "RR-WRONG";
    const spawn = vi.fn(() => successfulChild());

    await expect(executeQualifiedMxcCommandR01(c, ctx, commandLine, { spawn })).rejects.toMatchObject({
      code: "RIVER_RESERVATION_MISMATCH",
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does not call MXC spawn when the Warden decision has expired", async () => {
    const c = contract();
    const ctx = context(c);
    ctx.now = new Date("2026-09-14T00:00:00.000Z");
    const spawn = vi.fn(() => successfulChild());

    await expect(executeQualifiedMxcCommandR01(c, ctx, commandLine, { spawn })).rejects.toBeInstanceOf(
      ExecutionContractValidationError,
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does not call MXC spawn when actual command bytes differ from the authorized digest", async () => {
    const c = contract();
    const ctx = context(c);
    const spawn = vi.fn(() => successfulChild());

    await expect(
      executeQualifiedMxcCommandR01(c, ctx, 'node -e "console.log(\"changed\")"', { spawn }),
    ).rejects.toMatchObject({ code: "COMMAND_DIGEST_MISMATCH" });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("uses only spawnSandboxFromConfig semantics after all pre-spawn gates pass", async () => {
    const c = contract();
    const ctx = context(c);
    const spawn = vi.fn((config: ContainerConfig) => {
      expect(config.process?.commandLine).toBe(commandLine);
      expect(config.network?.egress).toEqual({ default: "deny" });
      expect(config.network?.ingress).toEqual({ default: "deny", hostLoopback: "deny" });
      return successfulChild();
    });

    const result = await executeQualifiedMxcCommandR01(c, ctx, commandLine, { spawn });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("warden-mxc-ok\n");
    expect(result.policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.configDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("fails closed when MXC spawn throws and never substitutes a native process", async () => {
    const c = contract();
    const ctx = context(c);
    const spawn = vi.fn(() => {
      throw new Error("mxc unavailable at spawn");
    });

    await expect(executeQualifiedMxcCommandR01(c, ctx, commandLine, { spawn })).rejects.toMatchObject({
      code: "SPAWN_FAILED",
    } satisfies Partial<MxcContainmentHarnessError>);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
