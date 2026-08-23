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
  enableEnvironmentVariable as reconciliationEnable,
  operationId,
} from "../tools/registerWardenReconciliationConformance.ts";

const envKeys = [wardenEnable, riverEnable, synnergyzeEnable, effectEnable, reconciliationEnable] as const;
const original = new Map(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of envKeys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setAllEnabled(): void {
  for (const key of envKeys) process.env[key] = "1";
}

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "RECONCILIATION-CONFORMANCE-NO-ALGOLIA-CALL",
      apiKey: "RECONCILIATION-CONFORMANCE-NO-ALGOLIA-CALL",
    },
  });
  const client = new Client({ name: "reconciliation-assembly-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("WARDEN-RECONCILIATION-CONFORMANCE-1.0 server assembly", () => {
  it("does not expose reconciliation with explicit allow-tools alone", async () => {
    for (const key of envKeys) delete process.env[key];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });

  it("fails closed when any upstream conformance layer is disabled", async () => {
    for (const missing of envKeys) {
      setAllEnabled();
      delete process.env[missing];
      await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
    }
  });

  it("does not expose reconciliation when all switches are enabled without exact allow-tools", async () => {
    setAllEnabled();
    await expect(listedToolNames()).resolves.not.toContain(operationId);
    await expect(listedToolNames(["all"])).resolves.not.toContain(operationId);
  });

  it("exposes only reconciliation when every layer and the exact tool are opted in", async () => {
    setAllEnabled();
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
});
