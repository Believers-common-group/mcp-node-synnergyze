import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import { enableEnvironmentVariable as wardenEnable } from "../tools/registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnable } from "../tools/registerRiverWardenConformanceReservation.ts";
import {
  enableEnvironmentVariable as synnergyzeEnable,
  operationId,
} from "../tools/registerWardenRiverSynnergyzeConformanceExecution.ts";

const originals = {
  warden: process.env[wardenEnable],
  river: process.env[riverEnable],
  synnergyze: process.env[synnergyzeEnable],
};

afterEach(() => {
  for (const [key, value] of [
    [wardenEnable, originals.warden],
    [riverEnable, originals.river],
    [synnergyzeEnable, originals.synnergyze],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "SYN-CONTROLLED-EXEC-NO-ALGOLIA-CALL",
      apiKey: "SYN-CONTROLLED-EXEC-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "synnergyze-assembly-test", version: "0.8.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("WARDEN-RIVER-SYNNERGYZE-MCP-CONFORMANCE-0.8 server assembly", () => {
  it("does not expose controlled execution unless all three switches are enabled", async () => {
    process.env[wardenEnable] = "1";
    process.env[riverEnable] = "1";
    delete process.env[synnergyzeEnable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose controlled execution without the explicit tool allow-list", async () => {
    process.env[wardenEnable] = "1";
    process.env[riverEnable] = "1";
    process.env[synnergyzeEnable] = "1";
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });

  it("exposes exactly controlled execution when all four gates are present", async () => {
    process.env[wardenEnable] = "1";
    process.env[riverEnable] = "1";
    process.env[synnergyzeEnable] = "1";
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
