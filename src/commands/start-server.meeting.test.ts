import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import {
  operationId,
  enableEnvironmentVariable,
} from "../tools/registerMeetingEvidenceQualification.ts";

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
      applicationId: "MEETING-OFFLINE-NO-REMOTE",
      apiKey: "MEETING-OFFLINE-NO-REMOTE",
    },
  });
  const client = new Client({ name: "meeting-assembly-test", version: "0.5.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("SYN-MEETING-CONCIERGE-001 R0.5 MCP server assembly", () => {
  it("does not expose the Meeting tool with only allow-tools", async () => {
    delete process.env[enableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });
  it("does not expose the Meeting tool with only env opt-in", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });
  it("exposes the Meeting tool with BOTH explicit opt-ins", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
