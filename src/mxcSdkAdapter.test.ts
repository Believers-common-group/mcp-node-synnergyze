import { describe, expect, it } from "vitest";
import type { ExecutionValidationContext, WardenExecutionContractR01 } from "./wardenExecutionContract.js";
import { MxcSdkAdapterError, prepareMxcExecutionConfigR01 } from "./mxcSdkAdapter.js";

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
    purpose: "sdk-adapter-test",
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
  resolvedWardenDecisionId: "WD-000001",
  authorizedPermissions: structuredClone(contract().permissions),
});

describe("WARDEN-MXC-R0.1 SDK adapter", () => {
  it("generates a real MXC ContainerConfig from the qualified policy without spawning", () => {
    const prepared = prepareMxcExecutionConfigR01(contract(), context());

    expect(prepared.containmentIntent).toBe("process");
    expect(prepared.config.version).toBe("0.8.0-alpha");
    expect(prepared.config.containment).toBe("process");
    expect(prepared.config.process?.commandLine).toBe("");
    expect(prepared.config.process?.timeout).toBe(30_000);
    expect(prepared.config.lifecycle).toEqual({ destroyOnExit: true, preservePolicy: false });
    expect(prepared.config.filesystem?.readonlyPaths).toEqual([
      "C:\\VSR\\jobs\\JOB-001\\input",
    ]);
    expect(prepared.config.filesystem?.readwritePaths).toEqual([
      "C:\\VSR\\jobs\\JOB-001\\workspace",
    ]);
    expect(prepared.config.network?.egress).toEqual({ default: "deny" });
    expect(prepared.config.network?.ingress).toEqual({
      default: "deny",
      hostLoopback: "deny",
    });
    expect(prepared.config.ui).toEqual({
      disable: true,
      clipboard: "none",
      injection: false,
    });
  });

  it("uses deterministic container identity and evidence digests for the same execution contract", () => {
    const first = prepareMxcExecutionConfigR01(contract(), context());
    const second = prepareMxcExecutionConfigR01(contract(), context());

    expect(first.config.containerId).toBe(second.config.containerId);
    expect(first.policyDigest).toBe(second.policyDigest);
    expect(first.configDigest).toBe(second.configDigest);
    expect(first.policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.configDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("MXC-W-015: wraps SDK config-generation failure as a fail-closed adapter error", () => {
    const failingFactory = () => {
      throw new Error("synthetic SDK generation failure");
    };

    expect(() =>
      prepareMxcExecutionConfigR01(contract(), context(), {
        createConfigFromPolicy: failingFactory,
      }),
    ).toThrowError(MxcSdkAdapterError);

    try {
      prepareMxcExecutionConfigR01(contract(), context(), {
        createConfigFromPolicy: failingFactory,
      });
    } catch (error) {
      expect((error as MxcSdkAdapterError).code).toBe("MXC_CONFIG_GENERATION_FAILED");
    }
  });

  it("preserves Warden validation errors instead of relabeling them as SDK failures", () => {
    const ctx = context();
    ctx.resolvedWardenDecisionId = "WD-OTHER";
    expect(() => prepareMxcExecutionConfigR01(contract(), ctx)).toThrowError(
      /Warden decision/,
    );
  });

  it("never populates a command line during qualification", () => {
    const prepared = prepareMxcExecutionConfigR01(contract(), context());
    expect(prepared.config.process?.commandLine).toBe("");
  });
});
