import { describe, expect, it } from "vitest";

import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import { classifyPestelV1 } from "./classifier.ts";

function event(lifecycle: NormalizedLegislativeEventV1["lifecycle"] = "PROPOSAL"): NormalizedLegislativeEventV1 {
  return {
    schemaVersion: "LEG-EVENT:R0.1",
    eventRef: "LEG-EVENT:test",
    sourceRefs: ["LEG-SOURCE:bill", "LEG-SOURCE:actions"],
    jurisdiction: "US-FEDERAL",
    objectType: "bill",
    objectId: "119-HR-1001",
    lifecycle,
    title: "Supply Chain Transparency Demonstration Act",
    summary: "Requires a public program for supply chain reporting and digital recordkeeping compliance.",
    introducedAt: "2026-08-31",
    latestActionAt: "2026-09-01",
    subjects: ["Commerce", "Supply chain management", "Business records"],
    committees: ["House Energy and Commerce Committee"],
    actors: ["BIOGUIDE:E000001"],
    actionRefs: ["LEG-ACTION:introduced"],
    evidenceRefs: ["LEG-SOURCE:actions", "LEG-SOURCE:bill"],
    normalizedAt: "2026-09-02T00:00:00.000Z",
    normalizerVersion: "LEG-NORMALIZER:R0.1",
  };
}

describe("classifyPestelV1", () => {
  it("emits all six bounded dimensions with evidence-backed rationale", async () => {
    const signal = await classifyPestelV1(event(), { classifierVersion: "PESTEL:R0.1" });

    expect(Object.keys(signal.vector).sort()).toEqual([
      "economic",
      "environmental",
      "legal",
      "political",
      "social",
      "technological",
    ]);
    for (const score of Object.values(signal.vector)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    expect(signal.confidence).toBeLessThanOrEqual(0.75);
    expect(signal.rationale.length).toBeGreaterThan(0);
    for (const rationale of signal.rationale) {
      expect(rationale.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of rationale.evidenceRefs) {
        expect(event().evidenceRefs).toContain(ref);
      }
    }
  });

  it("never treats a proposal as a legal obligation", async () => {
    const signal = await classifyPestelV1(event("PROPOSAL"), { classifierVersion: "PESTEL:R0.1" });
    expect(signal.obligationCandidate).toBe(false);
  });

  it("keeps deterministic signal identity stable across normalization timestamps", async () => {
    const first = event();
    const second = { ...first, normalizedAt: "2026-09-03T00:00:00.000Z" };
    const a = await classifyPestelV1(first, { classifierVersion: "PESTEL:R0.1" });
    const b = await classifyPestelV1(second, { classifierVersion: "PESTEL:R0.1" });
    expect(a.signalRef).toBe(b.signalRef);
  });
});
