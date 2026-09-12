import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import { enableEnvironmentVariable as wardenEnable } from "../tools/registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnable } from "../tools/registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as synnergyzeEnable } from "../tools/registerWardenRiverSynnergyzeConformanceExecution.ts";
import { enableEnvironmentVariable as effectEnable } from "../tools/registerWardenRiverEffectConformance.ts";
import {
  enableEnvironmentVariable as runtimeEnable,
  operationId,
} from "../tools/registerSynnergyzeRuntimeActivation.ts";

const original = {
  warden: process.env[wardenEnable],
  river: process.env[riverEnable],
  synnergyze: process.env[synnergyzeEnable],
  effect: process.env[effectEnable],
  runtime: process.env[runtimeEnable],
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore(wardenEnable, original.warden);
  restore(riverEnable, original.river);
  restore(synnergyzeEnable, original.synnergyze);
  restore(effectEnable, original.effect);
  restore(runtimeEnable, original.runtime);
});

function enableAll() {
  process.env[wardenEnable] = "1";
  process.env[riverEnable] = "1";
  process.env[synnergyzeEnable] = "1";
  process.env[effectEnable] = "1";
  process.env[runtimeEnable] = "1";
}

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "RUNTIME-ACTIVATION-NO-ALGOLIA-CALL",
      apiKey: "RUNTIME-ACTIVATION-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "runtime-activation-assembly-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("SYNNERGYZE-RUNTIME-ACTIVATION-R0.1 server assembly", () => {
  it("does not expose runtime activation with allow-tools alone", async () => {
    delete process.env[wardenEnable];
    delete process.env[riverEnable];
    delete process.env[synnergyzeEnable];
    delete process.env[effectEnable];
    delete process.env[runtimeEnable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose runtime activation when one prerequisite switch is missing", async () => {
    enableAll();
    delete process.env[effectEnable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("does not expose runtime activation without explicit allow-tools", async () => {
    enableAll();
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });

  it("exposes exactly the runtime activation tool when every gate is present", async () => {
    enableAll();
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
