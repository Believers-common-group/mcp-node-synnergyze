import { describe, expect, it, vi } from "vitest";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import type { LegislativeIntelligenceResultV1, LegislativeIntelligenceServiceV1 } from "../../modules/legislative-intelligence/service.ts";
import { InMemoryLegislativeIntelligenceResultStoreV1 } from "../../modules/legislative-intelligence/result-store.ts";
import {
  enableEnvironmentVariable,
  maybeRegisterPestelLegislativeIngest,
  operationId,
  registerPestelLegislativeIngest,
} from "./registerPestelLegislativeIngest.ts";

function fixture(): LegislativeIntelligenceResultV1 {
  return {
    event: { lifecycle: "PROPOSAL", sourceRefs: ["LEG-SOURCE:test"] },
    signal: { signalRef: "PESTEL-SIGNAL:test", evidenceRefs: ["LEG-SOURCE:test"] },
    brief: { briefRef: "PESTEL-BRIEF:test" },
    registryCandidates: [{ candidateRef: "REGISTRY-IMPACT:test" }],
    evidence: { evidenceRef: "RIVER-LEG-EVIDENCE:test" },
    workCandidate: { workRef: "SYNNERGYZE-PESTEL-WORK:test", authorized: false },
    privateMarker: "sentinel-secret",
  } as unknown as LegislativeIntelligenceResultV1;
}

function fakeService(result = fixture()): LegislativeIntelligenceServiceV1 {
  return { ingestBill: vi.fn(async () => result) } as unknown as LegislativeIntelligenceServiceV1;
}

describe("pestel_legislative_ingest registration", () => {
  it("requires environment enablement and exact explicit allow-listing", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const service = fakeService();
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();

    expect(maybeRegisterPestelLegislativeIngest(server, {}, service, store, {})).toBe(false);
    expect(maybeRegisterPestelLegislativeIngest(server, { allowedTools: new Set(["all"]) }, service, store, { [enableEnvironmentVariable]: "1" })).toBe(false);
    expect(maybeRegisterPestelLegislativeIngest(server, { allowedTools: new Set([operationId]) }, service, store, { [enableEnvironmentVariable]: "1" })).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes a read-only, credential-free input schema", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    registerPestelLegislativeIngest(server, fakeService(), new InMemoryLegislativeIntelligenceResultStoreV1());
    const definition = tool.mock.calls[0]?.[0] as { annotations?: unknown; inputSchema?: unknown };
    expect(definition.annotations).toEqual({ readOnlyHint: true });
    const schema = JSON.stringify(definition.inputSchema);
    expect(schema).not.toMatch(/api.?key|secret|credential.?value|token/i);
  });

  it("stores the immutable result and returns only bounded non-secret references", async () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();
    registerPestelLegislativeIngest(server, fakeService(), store, () => "2026-09-02T00:00:00.000Z");
    const definition = tool.mock.calls[0]?.[0] as { cb: (args: unknown) => Promise<string> };
    const text = await definition.cb({
      congress: 119,
      billType: "hr",
      number: 6048,
      registryIndex: [{ registryEntityRef: "SECTOR:LAW", terms: ["law"] }],
    });
    expect(text).not.toContain("sentinel-secret");
    const result = JSON.parse(text) as Record<string, unknown>;
    expect(result.signalRef).toBe("PESTEL-SIGNAL:test");
    expect(await store.getBySignalRef("PESTEL-SIGNAL:test")).toBeDefined();
  });
});
