import { describe, expect, it } from "vitest";
import { createAuthenticatedMcpHealthProbe, type EndpointBinding, type HttpHealthDependencies } from "./awceAuthenticatedMcpHealth.ts";
import type { ExecutorRecord } from "./awceExecutionRouter.ts";

const RECORD: ExecutorRecord = {
  id: "synthetic-remote",
  capability: "read.synthetic",
  transport: "streamable-http",
  state: "ADMITTED",
  artifactDigest: "sha256:synthetic-artifact",
  fallbackEligible: false,
  priority: 1,
};
const BINDING: EndpointBinding = {
  executorId: RECORD.id,
  capability: RECORD.capability,
  artifactDigest: RECORD.artifactDigest,
  url: "https://mcp.estate.test/mcp",
  approvedOrigin: "https://mcp.estate.test",
};
const RESULT = {
  jsonrpc: "2.0",
  id: "awce-health-discover",
  result: {
    resultType: "complete",
    supportedVersions: ["2026-07-28"],
    capabilities: { tools: {} },
    _meta: { "io.modelcontextprotocol/serverInfo": { name: "example", version: "1.0" } },
  },
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function fixture() {
  let binding: EndpointBinding | null = { ...BINDING };
  let token = "synthetic-token";
  let response = json(RESULT);
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const deps: HttpHealthDependencies = {
    endpoints: { resolve: async () => binding },
    credentials: { bearerToken: async () => token },
    fetcher: async (url, init) => {
      sent.push({ url, init });
      return response;
    },
    clock: { now: () => 1000 },
  };
  const port = createAuthenticatedMcpHealthProbe(deps);
  return {
    port, sent,
    setBinding: (next: EndpointBinding | null) => { binding = next; },
    setToken: (next: string) => { token = next; },
    setResponse: (next: Response) => { response = next; },
  };
}

describe("AWCE authenticated MCP discovery probe R0.4", () => {
  it("uses stateless MCP discovery with exact origin, auth and bounded request", async () => {
    const x = fixture();
    expect(await x.port.inspect(RECORD, 500)).toBe(true);
    expect(x.sent).toHaveLength(1);
    expect(x.sent[0].url).toBe(BINDING.url);
    const request = x.sent[0].init;
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(request.cache).toBe("no-store");
    const headers = request.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer synthetic-token");
    expect(headers["MCP-Protocol-Version"]).toBe("2026-07-28");
    expect(headers["Mcp-Method"]).toBe("server/discover");
    const payload = JSON.parse(request.body as string) as { method: string; params: { _meta: Record<string, unknown> } };
    expect(payload.method).toBe("server/discover");
    expect(payload.params._meta["io.modelcontextprotocol/protocolVersion"]).toBe("2026-07-28");
  });

  it("refuses to probe an unadmitted executor", async () => {
    const x = fixture();
    expect(await x.port.inspect({ ...RECORD, state: "NOT_ADMITTED" }, 500)).toBe(false);
    expect(x.sent).toHaveLength(0);
  });

  it("rejects endpoint bindings for a different artifact or capability", async () => {
    const x = fixture();
    x.setBinding({ ...BINDING, artifactDigest: "sha256:other" });
    expect(await x.port.inspect(RECORD, 500)).toBe(false);
    x.setBinding({ ...BINDING, capability: "write.synthetic" });
    expect(await x.port.inspect(RECORD, 500)).toBe(false);
    expect(x.sent).toHaveLength(0);
  });

  it("rejects insecure, local, non-allowlisted, credential and redirected hosts", async () => {
    const urls = [
      "http://mcp.estate.test/mcp",
      "https://localhost/mcp",
      "https://mcp.estate.test.evil.test/mcp",
      "https://127.0.0.1/mcp",
      "https://user:pw@mcp.estate.test/mcp",
      "https://mcp.estate.test:444/mcp",
      "https://mcp.estate.test/mcp?token=bad",
      "https://mcp.estate.test/mcp#fragment",
      "https://mcp.internal/mcp",
    ];
    const x = fixture();
    for (const url of urls) {
      x.setBinding({ ...BINDING, url });
      expect(await x.port.inspect(RECORD, 500), url).toBe(false);
    }
    expect(x.sent).toHaveLength(0);
  });

  it("rejects absent or suspicious bearer credentials before any request", async () => {
    const x = fixture();
    for (const token of ["", "Bearer fake", "injected\r\nHeader: bad", "x".repeat(4097)]) {
      x.setToken(token);
      expect(await x.port.inspect(RECORD, 500)).toBe(false);
    }
    expect(x.sent).toHaveLength(0);
  });

  it("treats HTTP authentication, server failure and invalid media type as unhealthy", async () => {
    const x = fixture();
    for (const status of [401, 403, 404, 429, 500]) {
      x.setResponse(json(RESULT, status));
      expect(await x.port.inspect(RECORD, 500)).toBe(false);
    }
    x.setResponse(new Response(JSON.stringify(RESULT), {
      status: 200, headers: { "Content-Type": "text/event-stream" },
    }));
    expect(await x.port.inspect(RECORD, 500)).toBe(false);
  });

  it("rejects unrelated RPC replies, mismatched ID, JSON-RPC errors and old MCP versions", async () => {
    const x = fixture();
    for (const invalid of [
      { ...RESULT, id: "another-id" },
      { ...RESULT, jsonrpc: "1.0" },
      { ...RESULT, error: { code: -32601, message: "Method missing" } },
      { ...RESULT, result: { ...RESULT.result, supportedVersions: ["2025-11-25"] } },
      { ...RESULT, result: { ...RESULT.result, capabilities: null } },
      { ...RESULT, result: { ...RESULT.result, resultType: "input_required" } },
    ]) {
      x.setResponse(json(invalid));
      expect(await x.port.inspect(RECORD, 500)).toBe(false);
    }
  });

  it("rejects oversized or malformed JSON responses", async () => {
    const x = fixture();
    x.setResponse(json({ ...RESULT, padding: "x".repeat(9000) }));
    expect(await x.port.inspect(RECORD, 500)).toBe(false);
    x.setResponse(new Response("{ invalid JSON", {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    expect(await x.port.inspect(RECORD, 500)).toBe(false);
  });

  it("rejects invalid time budgets and never performs a request", async () => {
    const x = fixture();
    for (const ms of [0, -10, 3001, 1.5]) {
      expect(await x.port.inspect(RECORD, ms)).toBe(false);
    }
    expect(x.sent).toHaveLength(0);
  });

  it("fails closed when credential or endpoint resolution fails", async () => {
    const x = fixture();
    x.setBinding(null);
    expect(await x.port.inspect(RECORD, 500)).toBe(false);
    expect(x.sent).toHaveLength(0);
  });
});
