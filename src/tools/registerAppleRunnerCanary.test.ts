import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { CustomMcpServer } from "../CustomMcpServer.ts";
import {
  AppleRunnerOperationId,
  registerAppleRunnerCanary,
  type WardenCapabilityPayload,
} from "./registerAppleRunnerCanary.ts";

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

  registerAppleRunnerCanary(server);
  expect(tools).toHaveLength(1);
  return tools[0]!;
}

function makeToken(secret: string, overrides: Partial<WardenCapabilityPayload> = {}): string {
  const now = Date.now();
  const payload: WardenCapabilityPayload = {
    schema: "ALPHA-WARDEN-CAPABILITY-001",
    issuedBy: "WARDEN",
    status: "AUTHORIZED",
    capabilityId: "CAP-TEST-001",
    principal: "DM-TEST-001",
    workspaceRef: "ALPHA-NODE-001",
    tool: AppleRunnerOperationId,
    runnerRef: "APPLE-RUNNER-001",
    scopes: ["APPLE-RUNNER-001:METAL-CANARY"],
    nonce: `NONCE-TEST-${process.pid}`,
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    ...overrides,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${signature}`;
}

const originalSecret = process.env.ALPHA_WARDEN_HMAC_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.ALPHA_WARDEN_HMAC_SECRET;
  } else {
    process.env.ALPHA_WARDEN_HMAC_SECRET = originalSecret;
  }
});

describe("APPLE-RUNNER-001 canary", () => {
  it("registers exactly one fixed execution tool", () => {
    expect(captureTool().name).toBe(AppleRunnerOperationId);
  });

  it("refuses execution when the Warden verifier secret is not configured", async () => {
    delete process.env.ALPHA_WARDEN_HMAC_SECRET;
    const tool = captureTool();

    await expect(
      tool.cb({
        runnerRef: "APPLE-RUNNER-001",
        fixture: "vector-add-f32-v1",
        capabilityToken: "not-a-real-token",
      }),
    ).rejects.toThrow("WARDEN_AUTHORITY_VERIFIER_NOT_CONFIGURED");
  });

  it("rejects a capability signed for a different runner", async () => {
    const secret = "test-only-secret";
    process.env.ALPHA_WARDEN_HMAC_SECRET = secret;
    const tool = captureTool();

    await expect(
      tool.cb({
        runnerRef: "APPLE-RUNNER-001",
        fixture: "vector-add-f32-v1",
        capabilityToken: makeToken(secret, { runnerRef: "APPLE-RUNNER-999" }),
      }),
    ).rejects.toThrow("WARDEN_CAPABILITY_RUNNER_MISMATCH");
  });

  it(
    "physically executes the deterministic Metal fixture on macOS",
    async () => {
      const secret = "test-only-secret";
      process.env.ALPHA_WARDEN_HMAC_SECRET = secret;
      const tool = captureTool();
      const input = {
        runnerRef: "APPLE-RUNNER-001",
        fixture: "vector-add-f32-v1",
        capabilityToken: makeToken(secret),
      };

      if (process.platform !== "darwin") {
        await expect(tool.cb(input)).rejects.toThrow("APPLE_RUNNER_REQUIRES_MACOS");
        return;
      }

      const result = JSON.parse(await tool.cb(input));
      expect(result.schema).toBe("APPLE-RUNNER-EXECUTION-001");
      expect(result.runnerRef).toBe("APPLE-RUNNER-001");
      expect(result.commandPolicy.arbitraryCommandExecution).toBe(false);
      expect(result.evidence.schema).toBe("APPLE-RUNNER-METAL-EVIDENCE-001");
      expect(result.evidence.fixture).toBe("vector-add-f32-v1");
      expect(result.evidence.output).toEqual([11, 22, 33, 44]);
      expect(result.evidence.correct).toBe(true);
    },
    60_000,
  );
});
