import { describe, expect, it } from "vitest";
import {
  type ExecutionValidationContext,
  type WardenExecutionContractR01,
} from "./wardenExecutionContract.js";
import {
  MxcPolicyCompilationError,
  compileMxcPolicyR08,
} from "./mxcPolicyCompiler.js";

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
    purpose: "compiler-test",
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

describe("WARDEN-MXC-R0.1 policy compiler", () => {
  it("compiles a bounded contract to explicit default-deny MXC 0.8 policy", () => {
    const policy = compileMxcPolicyR08(contract(), context());

    expect(policy).toEqual({
      version: "0.8.0-alpha",
      filesystem: {
        readonlyPaths: ["C:\\VSR\\jobs\\JOB-001\\input"],
        readwritePaths: ["C:\\VSR\\jobs\\JOB-001\\workspace"],
        clearPolicyOnExit: true,
      },
      network: {
        egress: { default: "deny" },
        ingress: { default: "deny", hostLoopback: "deny" },
      },
      ui: {
        allowWindows: false,
        clipboard: "none",
        allowInputInjection: false,
      },
      timeoutMs: 30_000,
    });
  });

  it("compiles only specifically authorized direct-egress rules", () => {
    const c = contract();
    const grant = { cidr: "192.0.2.0/24", protocol: "tcp" as const, port: 443 };
    c.permissions.networkEgress.push(grant);
    const ctx = context();
    ctx.authorizedPermissions = structuredClone(c.permissions);

    const policy = compileMxcPolicyR08(c, ctx);

    expect(policy.network.egress).toEqual({
      default: "deny",
      allow: [
        {
          to: [{ cidr: "192.0.2.0/24" }],
          ports: [{ protocol: "tcp", port: 443 }],
        },
      ],
    });
  });

  it("MXC-W-015: fails compilation rather than weakening unsupported ingress grants", () => {
    const c = contract();
    c.permissions.networkIngress.push({
      cidr: "10.0.0.0/24",
      protocol: "tcp",
      port: 8443,
    });
    const ctx = context();
    ctx.authorizedPermissions = structuredClone(c.permissions);

    expect(() => compileMxcPolicyR08(c, ctx)).toThrowError(MxcPolicyCompilationError);
    try {
      compileMxcPolicyR08(c, ctx);
    } catch (error) {
      expect((error as MxcPolicyCompilationError).code).toBe("UNSUPPORTED_INGRESS_GRANT_R01");
    }
  });

  it("MXC-W-027: never broadens filesystem permissions beyond the Warden contract", () => {
    const c = contract();
    c.permissions.filesystemRead = [];
    c.permissions.filesystemWrite = [];
    const ctx = context();
    ctx.authorizedPermissions = structuredClone(c.permissions);

    const policy = compileMxcPolicyR08(c, ctx);

    expect(policy.filesystem.readonlyPaths).toEqual([]);
    expect(policy.filesystem.readwritePaths).toEqual([]);
  });

  it("MXC-W-027: hardens restricted UI authority to deny in R0.1 rather than broadening it", () => {
    const c = contract();
    c.permissions.ui = "restricted";
    const ctx = context();
    ctx.authorizedPermissions = structuredClone(c.permissions);

    const policy = compileMxcPolicyR08(c, ctx);

    expect(policy.ui).toEqual({
      allowWindows: false,
      clipboard: "none",
      allowInputInjection: false,
    });
  });

  it("does not compile if pre-spawn authority validation fails", () => {
    const ctx = context();
    ctx.resolvedWardenDecisionId = "WD-OTHER";

    expect(() => compileMxcPolicyR08(contract(), ctx)).toThrow();
  });
});
