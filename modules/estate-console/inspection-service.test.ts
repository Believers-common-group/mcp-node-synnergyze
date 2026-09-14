import { describe, expect, it } from "vitest";

import {
  EstateConsoleInspectionServiceV1,
  type EstateProbeRegistryV1,
} from "./inspection-service.ts";

function registry(): EstateProbeRegistryV1 {
  return {
    estate: () => ({
      probeRef: "PROBE:ESTATE",
      resourceRef: "estate",
      health: "HEALTHY",
      observedAt: "2026-09-14T08:40:00.000Z",
      data: { gate: "G0" },
      sourceRefs: ["GENESIS:GCS-ESTATE-CONSOLE-001"],
    }),
    genesis: () => ({
      probeRef: "PROBE:GENESIS",
      resourceRef: "genesis",
      health: "HEALTHY",
      observedAt: "2026-09-14T08:40:00.000Z",
      data: { registry: "available" },
      sourceRefs: ["REGISTRY:TEST"],
    }),
    warden: () => ({
      probeRef: "PROBE:WARDEN",
      resourceRef: "warden",
      health: "DEGRADED",
      observedAt: "2026-09-14T08:40:00.000Z",
      data: { mode: "synthetic" },
      sourceRefs: ["WARDEN:TEST"],
    }),
    river: () => ({
      probeRef: "PROBE:RIVER",
      resourceRef: "river",
      health: "HEALTHY",
      observedAt: "2026-09-14T08:40:00.000Z",
      data: { receipts: 4 },
      sourceRefs: ["RIVER:TEST"],
    }),
    runtime: () => ({
      probeRef: "PROBE:RUNTIME",
      resourceRef: "runtime",
      health: "HEALTHY",
      observedAt: "2026-09-14T08:40:00.000Z",
      data: { version: "0.1" },
      sourceRefs: ["RUNTIME:TEST"],
    }),
  };
}

describe("Estate Console bounded inspection", () => {
  it("status aggregates only explicitly registered probes in deterministic order", () => {
    const service = new EstateConsoleInspectionServiceV1(registry());
    const result = service.status();

    expect(result.map(({ resourceRef }) => resourceRef)).toEqual([
      "estate",
      "genesis",
      "river",
      "runtime",
      "warden",
    ]);
  });

  it("health reports aggregate health without exposing a command surface", () => {
    const service = new EstateConsoleInspectionServiceV1(registry());

    expect(service.health()).toBe("DEGRADED");
    expect("runCommand" in service).toBe(false);
    expect("exec" in service).toBe(false);
  });

  it("inspect returns only the named bounded resource projection", () => {
    const service = new EstateConsoleInspectionServiceV1(registry());
    const result = service.inspect("river");

    expect(result.resourceRef).toBe("river");
    expect(result.data).toEqual({ receipts: 4 });
  });

  it("fails closed for an unexposed resource", () => {
    const service = new EstateConsoleInspectionServiceV1(registry());

    expect(() => service.inspect("docker")).toThrow("estate_console_resource_not_exposed");
    expect(() => service.inspect("kubernetes")).toThrow("estate_console_resource_not_exposed");
  });

  it("reports UNAVAILABLE when any registered probe throws", () => {
    const service = new EstateConsoleInspectionServiceV1({
      ...registry(),
      river: () => {
        throw new Error("offline");
      },
    });

    expect(service.health()).toBe("UNAVAILABLE");
    expect(service.inspect("river").health).toBe("UNAVAILABLE");
  });
});
