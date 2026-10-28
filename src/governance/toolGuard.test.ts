import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CustomMcpServer } from "../CustomMcpServer.ts";
import {
  canInvokeGovernedTool,
  createDenyAllWardenGuard,
  isReservedGovernedTool,
  type ToolInvocationGuard,
  type ToolInvocation,
} from "./toolGuard.ts";

function makeServer(guard?: ToolInvocationGuard) {
  return new CustomMcpServer(
    { name: "warden-guard-synthetic-test", version: "0.3.0" },
    undefined,
    { mode: "GOVERNED", guard: guard ?? createDenyAllWardenGuard() },
  );
}

async function pair(server: CustomMcpServer) {
  const client = new Client({ name: "synthetic-client", version: "1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

const mockAllowed = {
  decision: "ALLOW" as const,
  reasonCode: "SYNTHETIC_ONLY",
  authoritative: true,
  externalEffects: false,
  wardenDecisionRef: "TEST-DECISION-001",
  riverReceiptRef: "TEST-RIVER-001",
};

describe("Governed MCP callback dispatch", () => {
  it("denies all unless a server-side guard is installed", () => {
    expect(() => new CustomMcpServer({ name: "test", version: "1" }, undefined,
      { mode: "GOVERNED", guard: undefined as unknown as ToolInvocationGuard },
    )).toThrow("WARDEN_GUARD_REQUIRED");
  });

  it("reserves telecom and Warden namespaces from legacy runtime registration", () => {
    const server = new CustomMcpServer({ name: "legacy", version: "1" });
    expect(() => server.tool({
      name: "warden.telco.authority_verify",
      inputSchema: undefined,
      cb: async () => "unsafe",
    })).toThrow("WARDEN_GUARD_REQUIRED_FOR_GOVERNED_TOOL");
    expect(() => server.tool({
      name: "normalButFlagged",
      inputSchema: undefined,
      governed: true,
      cb: async () => "unsafe",
    })).toThrow("WARDEN_GUARD_REQUIRED_FOR_GOVERNED_TOOL");
    expect(isReservedGovernedTool("telco.location")).toBe(true);
  });

  it("denies schema-based tool before callback or side effects", async () => {
    const cb = vi.fn(async () => "should-not-run");
    const server = makeServer();
    server.tool({
      name: "warden.telco.location_quality",
      inputSchema: { type: "object", properties: { caseRef: { type: "string" } }, required: ["caseRef"] },
      cb,
    });
    const { client, close } = await pair(server);
    try {
      const result = await client.callTool({
        name: "warden.telco.location_quality", arguments: { caseRef: "SYNTHETIC" },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("WARDEN_AUTHORITY_NOT_ADMITTED");
      expect(cb).not.toHaveBeenCalled();
    } finally { await close(); }
  });

  it("denies no-schema callback before execution", async () => {
    const cb = vi.fn(async () => "should-not-run");
    const server = makeServer();
    server.tool({ name: "warden.telco.classify", inputSchema: undefined, cb });
    const { client, close } = await pair(server);
    try {
      const result = await client.callTool({ name: "warden.telco.classify" });
      expect(result.isError).toBe(true);
      expect(cb).not.toHaveBeenCalled();
    } finally { await close(); }
  });

  it("throws no data on guard failure and never invokes callback", async () => {
    const cb = vi.fn(async () => "not-run");
    const server = makeServer(async () => { throw new Error("private token details"); });
    server.tool({ name: "warden.telco.classify", inputSchema: undefined, cb });
    const { client, close } = await pair(server);
    try {
      const result = await client.callTool({ name: "warden.telco.classify" });
      expect(JSON.stringify(result)).toContain("WARDEN_GUARD_UNAVAILABLE");
      expect(JSON.stringify(result)).not.toContain("private token details");
      expect(cb).not.toHaveBeenCalled();
    } finally { await close(); }
  });

  it("never forwards caller-owned authority assertions as trusted context", async () => {
    const guard = vi.fn((_invocation: ToolInvocation) => ({ decision: "DENY" as const, reasonCode: "NO_AUTHORITY" }));
    const cb = vi.fn(async () => "not-run");
    const server = makeServer(guard);
    server.tool({
      name: "warden.telco.test",
      inputSchema: { type: "object", properties: { request: { type: "string" } }, additionalProperties: true },
      cb,
    });
    const { client, close } = await pair(server);
    try {
      await client.callTool({
        name: "warden.telco.test",
        arguments: { request: "synthetic", authoritative: true, riverReceiptRef: "fake", trusted: true },
      });
      expect(guard).toHaveBeenCalledTimes(1);
      expect(guard.mock.calls[0][0].toolName).toBe("warden.telco.test");
      expect(cb).not.toHaveBeenCalled();
    } finally { await close(); }
  });

  it("requires every authorization and receipt field", () => {
    expect(canInvokeGovernedTool({ decision: "ALLOW", reasonCode: "claimed" })).toBe(false);
    expect(canInvokeGovernedTool({ ...mockAllowed, externalEffects: true })).toBe(false);
    expect(canInvokeGovernedTool({ ...mockAllowed, riverReceiptRef: "" })).toBe(false);
    expect(canInvokeGovernedTool({ ...mockAllowed, authoritative: false })).toBe(false);
    expect(canInvokeGovernedTool({ ...mockAllowed, decision: "HOLD" })).toBe(false);
  });

  it("a synthetic trusted server mock can exercise the allowed callback path", async () => {
    const cb = vi.fn(async () => "synthetic-result");
    const guard = vi.fn(() => mockAllowed);
    const server = makeServer(guard);
    server.tool({ name: "warden.telco.classify", inputSchema: undefined, cb });
    const { client, close } = await pair(server);
    try {
      const result = await client.callTool({ name: "warden.telco.classify" });
      expect(result.content[0]).toMatchObject({ type: "text", text: "synthetic-result" });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(guard).toHaveBeenCalledTimes(1);
    } finally { await close(); }
  });

  it("legacy non-sensitive tools remain backward compatible", async () => {
    const server = new CustomMcpServer({ name: "legacy", version: "1" });
    const cb = vi.fn(async () => "existing");
    server.tool({ name: "getApplications", inputSchema: undefined, cb });
    const { client, close } = await pair(server);
    try {
      const result = await client.callTool({ name: "getApplications" });
      expect(result.content[0]).toMatchObject({ text: "existing" });
      expect(cb).toHaveBeenCalledTimes(1);
    } finally { await close(); }
  });
});
