import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { CustomMcpServer } from "../CustomMcpServer.ts";
import {
  enableEnvironmentVariable,
  maybeRegisterCommerceAlphaOperations,
  operationId,
  registerCommerceAlphaOperations,
} from "./registerCommerceAlphaOperations.ts";

function orderInput() {
  return {
    sourceEvents: [
      {
        sourceOwner: "EASYCOM_OMS",
        sourceRole: "AUTHORITATIVE_ORIGIN",
        sourceSystemRef: "SYSTEM:VOI:EASYCOM",
        sourceEventName: "ecom_order_created",
        sourceRecordRef: "EASYCOM:ORDER:3001",
        sourceRecordVersionRef: "VERSION:1",
        evidenceRefs: ["EVIDENCE:EASYCOM:ORDER:3001"],
        evidenceClasses: ["ORDER_RECORD"],
        subjectRef: "ORDER:3001",
        occurredAt: "2026-09-02T06:30:00Z",
        observedAt: "2026-09-02T06:30:01Z",
        correlationId: "ORDER:3001",
        predecessorEventRefs: [],
        admittedFields: {
          orderRef: "ORDER:3001",
          marketplaceRef: "MARKETPLACE:MYNTRA",
          orderStatus: "CREATED",
        },
        fieldClassifications: {
          orderRef: "GOVERNED_INTERNAL",
          marketplaceRef: "PARTNER",
          orderStatus: "MANAGEMENT",
        },
        schemaVersion: "1.0.0",
      },
    ],
    projection: {
      profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
      headerBoardRef: "HEADER:ALPHA:ORDER:3001",
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      effectiveFrom: "2026-09-02T06:30:02Z",
    },
  };
}

describe("R0.3.1 Commerce Alpha MCP registration", () => {
  it("requires both environment switch and explicit allow-tools entry", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const allowed = { allowedTools: new Set([operationId]) };

    expect(maybeRegisterCommerceAlphaOperations(server, allowed, {})).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(
      maybeRegisterCommerceAlphaOperations(server, {}, { [enableEnvironmentVariable]: "1" }),
    ).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(
      maybeRegisterCommerceAlphaOperations(
        server,
        allowed,
        { [enableEnvironmentVariable]: "1" },
      ),
    ).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes a read-only tool with no caller policy or publication authority inputs", async () => {
    const server = new CustomMcpServer({ name: "commerce-alpha-test", version: "0.1.0" });
    const client = new Client({ name: "commerce-alpha-client", version: "0.1.0" });
    registerCommerceAlphaOperations(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      const tool = listed.tools.find((candidate) => candidate.name === operationId);
      expect(tool).toBeDefined();
      expect(tool?.annotations).toEqual({ readOnlyHint: true });
      expect(tool?.inputSchema.properties).not.toHaveProperty("policy");
      expect(tool?.inputSchema.properties).not.toHaveProperty("wardenDecision");
      expect(tool?.inputSchema.properties).not.toHaveProperty("riverReservation");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("invokes the verified commerce rail through MCP without an external effect", async () => {
    const server = new CustomMcpServer({ name: "commerce-alpha-test", version: "0.1.0" });
    const client = new Client({ name: "commerce-alpha-client", version: "0.1.0" });
    registerCommerceAlphaOperations(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const result = await client.request(
        {
          method: "tools/call",
          params: { name: operationId, arguments: orderInput() },
        },
        CallToolResultSchema,
      );
      expect(result.isError).not.toBe(true);
      const first = result.content[0];
      if (!first || first.type !== "text") throw new Error("commerce_alpha_text_result_required");
      const parsed = JSON.parse(first.text) as {
        results: Array<{ transition: { state: string } }>;
        headerBoardDraft: { channelRef: string } | null;
      };
      expect(parsed.results[0].transition.state).toBe("ADMITTED");
      expect(parsed.headerBoardDraft?.channelRef).toBe("VSR-CHANNEL:COMMERCE:ORDERS");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
