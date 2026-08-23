import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import {
  enableEnvironmentVariable as effectEnableEnvironmentVariable,
  operationId,
} from "../tools/registerWardenRiverEffectConformance.ts";
import { enableEnvironmentVariable as wardenEnableEnvironmentVariable } from "../tools/registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnableEnvironmentVariable } from "../tools/registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as synnergyzeEnableEnvironmentVariable } from "../tools/registerWardenRiverSynnergyzeConformanceExecution.ts";

const original = {
  warden: process.env[wardenEnableEnvironmentVariable],
  river: process.env[riverEnableEnvironmentVariable],
  synnergyze: process.env[synnergyzeEnableEnvironmentVariable],
  effect: process.env[effectEnableEnvironmentVariable],
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore(wardenEnableEnvironmentVariable, original.warden);
  restore(riverEnableEnvironmentVariable, original.river);
  restore(synnergyzeEnableEnvironmentVariable, original.synnergyze);
  restore(effectEnableEnvironmentVariable, original.effect);
});

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "EFFECT-CONFORMANCE-NO-ALGOLIA-CALL",
      apiKey: "EFFECT-CONFORMANCE-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "effect-assembly-test", version: "0.9.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

function enableAll() {
  process.env[wardenEnableEnvironmentVariable] = "1";
  process.env[riverEnableEnvironmentVariable] = "1";
  process.env[synnergyzeEnableEnvironmentVariable] = "1";
  process.env[effectEnableEnvironmentVariable] = "1";
}

describe("WARDEN-RIVER-EFFECT-CONFORMANCE-0.9 server assembly", () => {
  it("does not expose the effect capability with allow-tools alone", async () => {
    delete process.env[wardenEnableEnvironmentVariable];
    delete process.env[riverEnableEnvironmentVariable];
    delete process.env[synnergyzeEnableEnvironmentVariable];
    delete process.env[effectEnableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose the effect capability when one layer switch is missing", async () => {
    enableAll();
    delete process.env[effectEnableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose the effect capability without explicit allow-tools", async () => {
    enableAll();
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });

  it("exposes exactly the effect composite when all switches and allow-tools are present", async () => {
    enableAll();
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
