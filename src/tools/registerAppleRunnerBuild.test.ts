import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CustomMcpServer } from "../CustomMcpServer.ts";
import {
  AppleRunnerBuildOperationId,
  registerAppleRunnerBuild,
  type AppleBuildWardenCapabilityPayload,
} from "./registerAppleRunnerBuild.ts";

type CapturedTool = {
  name: string;
  cb: (...args: unknown[]) => string | Promise<string>;
};

function captureTool(): CapturedTool {
  const tools: CapturedTool[] = [];
  const server = {
    tool(definition: CapturedTool) {
      tools.push(definition);
    },
  } as unknown as CustomMcpServer;

  registerAppleRunnerBuild(server);
  expect(tools).toHaveLength(1);
  return tools[0]!;
}

function makeToken(
  secret: string,
  overrides: Partial<AppleBuildWardenCapabilityPayload> = {},
): string {
  const now = Date.now();
  const payload: AppleBuildWardenCapabilityPayload = {
    schema: "ALPHA-WARDEN-CAPABILITY-001",
    issuedBy: "WARDEN",
    status: "AUTHORIZED",
    capabilityId: `CAP-BUILD-${randomUUID()}`,
    principal: "DM-TEST-001",
    workspaceRef: "ALPHA-NODE-001",
    tool: AppleRunnerBuildOperationId,
    runnerRef: "APPLE-RUNNER-001",
    scopes: ["APPLE-RUNNER-001:SWIFT-BUILD"],
    nonce: `NONCE-${randomUUID()}`,
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
    ...overrides,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${signature}`;
}

const originalWardenSecret = process.env.ALPHA_WARDEN_HMAC_SECRET;
const originalArtifactSecret = process.env.ALPHA_ARTIFACT_HMAC_SECRET;
const originalReplayDir = process.env.ALPHA_WARDEN_REPLAY_DIR;
const originalArtifactDir = process.env.ALPHA_APPLE_ARTIFACT_DIR;

let replayDir: string | undefined;
let artifactDir: string | undefined;

beforeEach(async () => {
  replayDir = await mkdtemp(join(tmpdir(), "alpha-build-replay-test-"));
  artifactDir = await mkdtemp(join(tmpdir(), "alpha-build-artifact-test-"));
  process.env.ALPHA_WARDEN_HMAC_SECRET = "test-only-warden-secret";
  process.env.ALPHA_ARTIFACT_HMAC_SECRET = "test-only-artifact-secret";
  process.env.ALPHA_WARDEN_REPLAY_DIR = replayDir;
  process.env.ALPHA_APPLE_ARTIFACT_DIR = artifactDir;
});

afterEach(async () => {
  if (replayDir) {
    await rm(replayDir, { recursive: true, force: true });
  }
  if (artifactDir) {
    await rm(artifactDir, { recursive: true, force: true });
  }

  if (originalWardenSecret === undefined) delete process.env.ALPHA_WARDEN_HMAC_SECRET;
  else process.env.ALPHA_WARDEN_HMAC_SECRET = originalWardenSecret;

  if (originalArtifactSecret === undefined) delete process.env.ALPHA_ARTIFACT_HMAC_SECRET;
  else process.env.ALPHA_ARTIFACT_HMAC_SECRET = originalArtifactSecret;

  if (originalReplayDir === undefined) delete process.env.ALPHA_WARDEN_REPLAY_DIR;
  else process.env.ALPHA_WARDEN_REPLAY_DIR = originalReplayDir;

  if (originalArtifactDir === undefined) delete process.env.ALPHA_APPLE_ARTIFACT_DIR;
  else process.env.ALPHA_APPLE_ARTIFACT_DIR = originalArtifactDir;
});

describe("APPLE-RUNNER-001 governed build adapter", () => {
  it("registers exactly one fixed build tool", () => {
    expect(captureTool().name).toBe(AppleRunnerBuildOperationId);
  });

  it("refuses execution when Warden verification is not configured", async () => {
    delete process.env.ALPHA_WARDEN_HMAC_SECRET;
    const tool = captureTool();

    await expect(
      tool.cb({
        runnerRef: "APPLE-RUNNER-001",
        fixture: "metal-vector-add-package-v1",
        capabilityToken: "not-a-real-token",
      }),
    ).rejects.toThrow("WARDEN_AUTHORITY_VERIFIER_NOT_CONFIGURED");
  });

  it("refuses to build without a separate artifact signer", async () => {
    const wardenSecret = process.env.ALPHA_WARDEN_HMAC_SECRET!;
    delete process.env.ALPHA_ARTIFACT_HMAC_SECRET;
    const tool = captureTool();

    await expect(
      tool.cb({
        runnerRef: "APPLE-RUNNER-001",
        fixture: "metal-vector-add-package-v1",
        capabilityToken: makeToken(wardenSecret),
      }),
    ).rejects.toThrow("ARTIFACT_SIGNER_NOT_CONFIGURED");
  });

  it("rejects authority issued for another build runner", async () => {
    const wardenSecret = process.env.ALPHA_WARDEN_HMAC_SECRET!;
    const tool = captureTool();

    await expect(
      tool.cb({
        runnerRef: "APPLE-RUNNER-001",
        fixture: "metal-vector-add-package-v1",
        capabilityToken: makeToken(wardenSecret, { runnerRef: "APPLE-RUNNER-999" }),
      }),
    ).rejects.toThrow("WARDEN_CAPABILITY_RUNNER_MISMATCH");
  });

  it(
    "builds, tests, verifies and signs the fixed Swift/Metal artifact on macOS",
    async () => {
      const wardenSecret = process.env.ALPHA_WARDEN_HMAC_SECRET!;
      const tool = captureTool();
      const input = {
        runnerRef: "APPLE-RUNNER-001",
        fixture: "metal-vector-add-package-v1",
        capabilityToken: makeToken(wardenSecret),
      };

      if (process.platform !== "darwin") {
        await expect(tool.cb(input)).rejects.toThrow("APPLE_RUNNER_REQUIRES_MACOS");
        return;
      }

      const result = JSON.parse(await tool.cb(input));
      expect(result.schema).toBe("APPLE-RUNNER-BUILD-EXECUTION-001");
      expect(result.executionPolicy.arbitraryCommandExecution).toBe(false);
      expect(result.manifest.schema).toBe("APPLE-RUNNER-ARTIFACT-MANIFEST-001");
      expect(result.manifest.fixture).toBe("metal-vector-add-package-v1");
      expect(result.manifest.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.manifest.artifact.sizeBytes).toBeGreaterThan(0);
      expect(result.manifest.verification.testsPassed).toBe(true);
      expect(result.manifest.verification.artifactSelfTestPassed).toBe(true);
      expect(result.manifest.verification.evidence.output).toEqual([11, 22, 33, 44]);
      expect(result.manifest.verification.evidence.correct).toBe(true);
      expect(result.manifestSignature.algorithm).toBe("HMAC-SHA256");
      expect(result.manifestSignature.value).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.storage.artifactRef).toMatch(
        /^apple-runner:\/\/APPLE-RUNNER-001\/[a-f0-9]{24}\/alpha-metal-artifact$/,
      );
      expect(result.storage.durableStorageConfigured).toBe(true);
    },
    180_000,
  );
});
