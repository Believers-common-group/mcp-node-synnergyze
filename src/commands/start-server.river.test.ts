import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import {
  enableEnvironmentVariable as riverEnableEnvironmentVariable,
  operationId,
} from "../tools/registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as wardenEnableEnvironmentVariable } from "../tools/registerWardenConformanceDecision.ts";

const originalWardenEnable = process.env[wardenEnableEnvironmentVariable];
const originalRiverEnable = process.env[riverEnableEnvironmentVariable];

afterEach(() => {
  if (originalWardenEnable === undefined) delete process.env[wardenEnableEnvironmentVariable];
  else process.env[wardenEnableEnvironmentVariable] = originalWardenEnable;

  if (originalRiverEnable === undefined) delete process.env[riverEnableEnvironmentVariable];
  else process.env[riverEnableEnvironmentVariable] = originalRiverEnable;
});

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "RIVER-WARDEN-CONFORMANCE-NO-ALGOLIA-CALL",
      apiKey: "RIVER-WARDEN-CONFORMANCE-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "river-warden-assembly-test", version: "0.7.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("WARDEN-RIVER-MCP-CONFORMANCE-0.7 server assembly", () => {
  it("does not expose River binding when only the allow-tools entry is present", async () => {
    delete process.env[wardenEnableEnvironmentVariable];
    delete process.env[riverEnableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose River binding when only Warden conformance is enabled", async () => {
    process.env[wardenEnableEnvironmentVariable] = "1";
    delete process.env[riverEnableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose River binding when only River conformance is enabled", async () => {
    delete process.env[wardenEnableEnvironmentVariable];
    process.env[riverEnableEnvironmentVariable] = "1";
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose River binding when both switches are enabled without explicit allow-tools", async () => {
    process.env[wardenEnableEnvironmentVariable] = "1";
    process.env[riverEnableEnvironmentVariable] = "1";
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });

  it("exposes exactly the composite River binding when all three gates are present", async () => {
    process.env[wardenEnableEnvironmentVariable] = "1";
    process.env[riverEnableEnvironmentVariable] = "1";
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
