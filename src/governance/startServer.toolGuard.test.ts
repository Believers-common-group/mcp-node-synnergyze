import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { startServer } from "../commands/start-server.ts";
import { createDenyAllWardenGuard } from "./toolGuard.ts";

const outbound = vi.fn(() => HttpResponse.json({ from: "network" }));
const mswServer = setupServer(http.all(/\.algolia\.(net|com)\//, outbound));
beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => { outbound.mockClear(); mswServer.resetHandlers(); });
afterAll(() => mswServer.close());

describe("Real Synnergyze startServer transport preflight", () => {
  it.each(["getSettings", "setSettings"])("does not call provider I/O for rejected %s", async (name) => {
    const guard = vi.fn(createDenyAllWardenGuard());
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const [server] = await Promise.all([
      startServer({
        credentials: { applicationId: "testapp", apiKey: "synthetic" },
        allowTools: [name],
      }, serverTransport, { mode: "GOVERNED", guard }),
      client.connect(clientTransport),
    ]);
    try {
      const response = await client.callTool({
        name,
        arguments: name === "getSettings"
          ? { indexName: "test-index" }
          : { indexName: "test-index", requestBody: { searchableAttributes: ["title"] } },
      });
      expect(response.isError).toBe(true);
      expect(JSON.stringify(response)).toContain("WARDEN_AUTHORITY_NOT_ADMITTED");
      expect(outbound).not.toHaveBeenCalled();
      expect(guard).toHaveBeenCalledTimes(1);
      expect(guard.mock.calls[0][0].toolName).toBe(name);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
