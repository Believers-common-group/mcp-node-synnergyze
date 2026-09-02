import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import {
  enableEnvironmentVariable,
  operationId,
} from "../tools/registerCommerceAlphaOperations.ts";

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
      applicationId: "COMMERCE-ALPHA-NO-ALGOLIA-CALL",
      apiKey: "COMMERCE-ALPHA-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "commerce-alpha-assembly-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("R0.3.1 Commerce Alpha server assembly", () => {
  it("does not expose Commerce Alpha with only allow-tools", async () => {
    delete process.env[enableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose Commerce Alpha with only the environment switch", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });

  it("exposes exactly Commerce Alpha when both opt-ins are present", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
