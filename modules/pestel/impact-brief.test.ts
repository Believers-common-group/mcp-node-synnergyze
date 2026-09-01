import { describe, expect, it } from "vitest";

import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import { classifyPestelV1 } from "./classifier.ts";
import { buildImpactBriefV1 } from "./impact-brief.ts";

const event: NormalizedLegislativeEventV1 = {
  schemaVersion: "LEG-EVENT:R0.1",
  eventRef: "LEG-EVENT:test-brief",
  sourceRefs: ["LEG-SOURCE:bill"],
  jurisdiction: "US-FEDERAL",
  objectType: "bill",
  objectId: "119-HR-1001",
  lifecycle: "PROPOSAL",
  title: "Supply Chain Transparency Demonstration Act",
  summary: "Requires a demonstration program for supply-chain transparency reporting.",
  subjects: ["Commerce", "Supply chain management"],
  committees: ["House Energy and Commerce Committee"],
  actors: [],
  actionRefs: ["LEG-ACTION:introduced"],
  evidenceRefs: ["LEG-SOURCE:bill"],
  normalizedAt: "2026-09-02T00:00:00.000Z",
  normalizerVersion: "LEG-NORMALIZER:R0.1",
};

const createdAt = "2026-09-02T00:00:00.000Z";

describe("buildImpactBriefV1", () => {
  it("separates observed facts from explicitly labeled hypotheses and preserves proposal status", async () => {
    const signal = await classifyPestelV1(event, { classifierVersion: "PESTEL:R0.1" });
    const brief = buildImpactBriefV1(event, signal, createdAt);

    expect(brief.schemaVersion).toBe("PESTEL-BRIEF:R0.1");
    expect(brief.signalRef).toBe(signal.signalRef);
    expect(brief.lifecycle).toBe("PROPOSAL");
    expect(brief.obligationCandidate).toBe(false);
    expect(brief.observedFacts.length).toBeGreaterThan(0);
    expect(brief.riskHypotheses.every((value) => value.startsWith("Hypothesis:"))).toBe(true);
    expect(brief.opportunityHypotheses.every((value) => value.startsWith("Hypothesis:"))).toBe(true);
    expect(brief.createdAt).toBe(createdAt);
    expect(brief.confidence).toBeLessThanOrEqual(signal.confidence);
    expect(JSON.stringify(brief)).not.toContain("ALLOW");
    expect(JSON.stringify(brief)).not.toContain("DENY");
  });
});
