import { describe, expect, it, vi } from "vitest";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import type { LegislativeIntelligenceResultV1 } from "../../modules/legislative-intelligence/service.ts";
import { InMemoryLegislativeIntelligenceResultStoreV1 } from "../../modules/legislative-intelligence/result-store.ts";
import {
  enableEnvironmentVariable,
  maybeRegisterPestelImpactBrief,
  operationId,
  registerPestelImpactBrief,
} from "./registerPestelImpactBrief.ts";

function fixture(): LegislativeIntelligenceResultV1 {
  return {
    event: { eventRef: "LEG-EVENT:test" },
    signal: {
      signalRef: "PESTEL-SIGNAL:test",
      legislativeEventRef: "LEG-EVENT:test",
    },
    brief: {
      briefRef: "PESTEL-BRIEF:test",
      signalRef: "PESTEL-SIGNAL:test",
      observedFacts: ["Lifecycle observed as PROPOSAL."],
      riskHypotheses: [],
      opportunityHypotheses: [],
    },
    registryCandidates: [{ candidateRef: "REGISTRY-IMPACT:test", relation: "MAY_AFFECT" }],
    evidence: { evidenceRef: "RIVER-LEG-EVIDENCE:test" },
    workCandidate: {
      workRef: "SYNNERGYZE-PESTEL-WORK:test",
      signalRef: "PESTEL-SIGNAL:test",
    },
    privateMarker: "sentinel-secret",
  } as unknown as LegislativeIntelligenceResultV1;
}

describe("pestel_impact_brief registration", () => {
  it("requires environment enablement and exact explicit allow-listing", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();

    expect(maybeRegisterPestelImpactBrief(server, {}, store, {})).toBe(false);
    expect(maybeRegisterPestelImpactBrief(server, { allowedTools: new Set(["all"]) }, store, { [enableEnvironmentVariable]: "1" })).toBe(false);
    expect(maybeRegisterPestelImpactBrief(server, { allowedTools: new Set([operationId]) }, store, { [enableEnvironmentVariable]: "1" })).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes only signalRef and no credential-shaped input", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    registerPestelImpactBrief(server, new InMemoryLegislativeIntelligenceResultStoreV1());
    const definition = tool.mock.calls[0]?.[0] as { annotations?: unknown; inputSchema?: { properties?: Record<string, unknown> } };
    expect(definition.annotations).toEqual({ readOnlyHint: true });
    expect(Object.keys(definition.inputSchema?.properties ?? {})).toEqual(["signalRef"]);
    expect(JSON.stringify(definition.inputSchema)).not.toMatch(/api.?key|secret|credential.?value|token/i);
  });

  it("returns the stored brief without serializing unrelated secret material", async () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();
    await store.put(fixture());
    registerPestelImpactBrief(server, store);
    const definition = tool.mock.calls[0]?.[0] as { cb: (args: unknown) => Promise<string> };
    const text = await definition.cb({ signalRef: "PESTEL-SIGNAL:test" });
    expect(text).not.toContain("sentinel-secret");
    expect(JSON.parse(text)).toMatchObject({ brief: { briefRef: "PESTEL-BRIEF:test" } });
  });

  it("fails with a bounded error for an unknown signal", async () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    registerPestelImpactBrief(server, new InMemoryLegislativeIntelligenceResultStoreV1());
    const definition = tool.mock.calls[0]?.[0] as { cb: (args: unknown) => Promise<string> };
    await expect(definition.cb({ signalRef: "PESTEL-SIGNAL:missing" })).rejects.toThrow("SIGNAL_NOT_FOUND");
  });
});
