import { describe, expect, it, vi } from "vitest";
import type { MxcContainmentResult } from "./mxcContainmentHarness.js";
import { sha256Command } from "./mxcContainmentHarness.js";
import type { MxcAlphaSmokeCase } from "./mxcAlphaSmokePlan.js";
import type { MxcAlphaProcessContainerCapability } from "./mxcAlphaSmokeRunner.js";
import { runMxcAlphaCaseR01 } from "./mxcAlphaCaseExecutor.js";
import type {
  ExecutionValidationContext,
  WardenExecutionContractR01,
} from "./wardenExecutionContract.js";

const commandLine = `node -e "console.log('alpha-smoke')"`;

function smokeCase(
  testId: MxcAlphaSmokeCase["testId"] = "MXC-W-021",
  expectedEffect: MxcAlphaSmokeCase["expectedEffect"] = "ALLOWED",
): MxcAlphaSmokeCase {
  return {
    testId,
    status: "UNEXECUTED",
    expectedEffect,
    riverReservationId: `RR-${testId}`,
    genesisContext: {
      nodeId: "ALPHA-NODE-001",
      deviceId: "DESKTOP-M13TEPQ",
      workspaceId: "WARDEN-MXC-QUALIFICATION",
    },
    purpose: "Alpha physical containment qualification",
  };
}

function contract(test = smokeCase()): WardenExecutionContractR01 {
  const commandDigest = sha256Command(commandLine);
  return {
    contractVersion: "WARDEN-MXC-R0.1",
    executionId: `EXEC-${test.testId}`,
    authority: {
      wardenDecisionId: `WD-${test.testId}`,
      decisionHash: "sha256:decision",
      decision: "ALLOW",
      issuedAt: "2026-09-12T00:00:00.000Z",
      effectiveFrom: "2026-09-12T00:00:00.000Z",
      expiresAt: "2026-09-13T00:00:00.000Z",
    },
    principal: { principalId: "DM-FAIZ-ALPHA" },
    genesisContext: { ...test.genesisContext },
    workload: {
      workloadId: test.testId,
      artifactDigest: "sha256:artifact",
      commandDigest,
      purpose: test.purpose,
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
      riverReservationId: test.riverReservationId,
      receiptRequired: true,
      captureStdout: true,
      captureStderr: true,
    },
  };
}

function context(c: WardenExecutionContractR01): ExecutionValidationContext {
  return {
    now: new Date("2026-09-12T05:00:00.000Z"),
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

const capability: MxcAlphaProcessContainerCapability = {
  platform: "win32",
  provider: "MXC",
  backend: "processcontainer",
  isolationTier: "appcontainer-bfs",
};

function containmentResult(exitCode = 0): MxcContainmentResult {
  return {
    exitCode,
    stdout: "alpha-smoke\n",
    stderr: "",
    policyDigest: `sha256:${"1".repeat(64)}`,
    configDigest: `sha256:${"2".repeat(64)}`,
    executionConfigDigest: `sha256:${"3".repeat(64)}`,
    containmentIntent: "process",
  };
}

describe("Alpha MXC case evidence executor", () => {
  it("records a complete PASS receipt when an allowed effect is independently verified", async () => {
    const test = smokeCase("MXC-W-021", "ALLOWED");
    const c = contract(test);
    const execute = vi.fn(async () => containmentResult(0));
    const verifyEffect = vi.fn(async () => ({ observed: "ALLOWED" as const }));
    const times = [
      new Date("2026-09-12T05:01:00.000Z"),
      new Date("2026-09-12T05:01:01.000Z"),
    ];

    const evidence = await runMxcAlphaCaseR01(
      test,
      c,
      context(c),
      commandLine,
      capability,
      verifyEffect,
      { execute, now: () => times.shift()! },
    );

    expect(evidence).toMatchObject({
      testId: "MXC-W-021",
      verdict: "PASS",
      executionId: "EXEC-MXC-W-021",
      wardenDecisionId: "WD-MXC-W-021",
      riverReservationId: "RR-MXC-W-021",
      requestedContainment: "process",
      resolvedBackend: "processcontainer",
      isolationTier: "appcontainer-bfs",
      qualificationConfigDigest: `sha256:${"2".repeat(64)}`,
      executionConfigDigest: `sha256:${"3".repeat(64)}`,
      effect: { expected: "ALLOWED", observed: "ALLOWED", verified: true },
      startedAt: "2026-09-12T05:01:00.000Z",
      completedAt: "2026-09-12T05:01:01.000Z",
    });
  });

  it("records PASS for a denial case only when the blocked effect is independently verified", async () => {
    const test = smokeCase("MXC-W-017", "BLOCKED");
    const c = contract(test);

    const evidence = await runMxcAlphaCaseR01(
      test,
      c,
      context(c),
      commandLine,
      capability,
      async () => ({ observed: "BLOCKED" }),
      { execute: async () => containmentResult(1) },
    );

    expect(evidence.verdict).toBe("PASS");
    expect(evidence.effect).toEqual({ expected: "BLOCKED", observed: "BLOCKED", verified: true });
  });

  it("does not treat a non-zero process exit as proof that containment blocked the effect", async () => {
    const test = smokeCase("MXC-W-019", "BLOCKED");
    const c = contract(test);

    const evidence = await runMxcAlphaCaseR01(
      test,
      c,
      context(c),
      commandLine,
      capability,
      async () => ({ observed: "INCONCLUSIVE", reason: "network path was already unavailable" }),
      { execute: async () => containmentResult(1) },
    );

    expect(evidence.verdict).toBe("INCONCLUSIVE");
    expect(evidence.effect.verified).toBe(false);
    expect(evidence.reason).toBe("network path was already unavailable");
  });

  it("records FAIL when the observed effect contradicts the expected containment effect", async () => {
    const test = smokeCase("MXC-W-020", "BLOCKED");
    const c = contract(test);

    const evidence = await runMxcAlphaCaseR01(
      test,
      c,
      context(c),
      commandLine,
      capability,
      async () => ({ observed: "ALLOWED", reason: "host loopback request reached listener" }),
      { execute: async () => containmentResult(0) },
    );

    expect(evidence.verdict).toBe("FAIL");
    expect(evidence.effect).toEqual({ expected: "BLOCKED", observed: "ALLOWED", verified: false });
  });

  it("records an INCONCLUSIVE receipt when MXC execution itself fails", async () => {
    const test = smokeCase("MXC-W-018", "BLOCKED");
    const c = contract(test);

    const evidence = await runMxcAlphaCaseR01(
      test,
      c,
      context(c),
      commandLine,
      capability,
      async () => ({ observed: "BLOCKED" }),
      {
        execute: async () => {
          throw new Error("MXC spawn failed");
        },
      },
    );

    expect(evidence.verdict).toBe("INCONCLUSIVE");
    expect(evidence.effect).toEqual({ expected: "BLOCKED", observed: "INCONCLUSIVE", verified: false });
    expect(evidence.reason).toContain("MXC spawn failed");
  });
});
