import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import {
  enableEnvironmentVariable,
  operationId,
} from "../tools/registerWardenConformanceDecision.ts";

const originalEnableValue = process.env[enableEnvironmentVariable];

afterEach(() => {
  if (originalEnableValue === undefined) {
    delete process.env[enableEnvironmentVariable];
  } else {
    process.env[enableEnvironmentVariable] = originalEnableValue;
  }
});

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "WARDEN-CONFORMANCE-NO-ALGOLIA-CALL",
      apiKey: "WARDEN-CONFORMANCE-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "warden-assembly-test", version: "0.6.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("WARDEN-MCP-CONFORMANCE-0.6 server assembly", () => {
  it("does not expose Warden when only the allow-tools entry is present", async () => {
    delete process.env[enableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose Warden when only the environment switch is present", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });

  it("exposes exactly the Warden conformance tool when both opt-ins are present", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
