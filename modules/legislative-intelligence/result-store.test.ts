import { describe, expect, it } from "vitest";

import type { LegislativeIntelligenceResultV1 } from "./service.ts";
import { InMemoryLegislativeIntelligenceResultStoreV1 } from "./result-store.ts";

function fixture(
  signalRef: string,
  marker: string,
  observedAt = "2026-09-02T00:00:00.000Z",
): LegislativeIntelligenceResultV1 {
  return {
    event: {
      eventRef: `LEG-EVENT:${marker}`,
      normalizedAt: observedAt,
    },
    signal: {
      signalRef,
      legislativeEventRef: `LEG-EVENT:${marker}`,
    },
    brief: {
      briefRef: `PESTEL-BRIEF:${marker}`,
      signalRef,
      createdAt: observedAt,
    },
    registryCandidates: [{ candidateRef: `REGISTRY-IMPACT:${marker}` }],
    evidence: {
      evidenceRef: `RIVER-LEG-EVIDENCE:${marker}`,
      observedAt,
    },
    workCandidate: {
      workRef: `SYNNERGYZE-PESTEL-WORK:${marker}`,
      signalRef,
    },
  } as unknown as LegislativeIntelligenceResultV1;
}

describe("InMemoryLegislativeIntelligenceResultStoreV1", () => {
  it("is idempotent for the exact same result", async () => {
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();
    const result = fixture("PESTEL-SIGNAL:one", "same");
    await store.put(result);
    await store.put(result);
    expect(await store.getBySignalRef("PESTEL-SIGNAL:one")).toBe(result);
  });

  it("treats observation-time changes as the same stable result identity", async () => {
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();
    const first = fixture("PESTEL-SIGNAL:one", "same", "2026-09-02T00:00:00.000Z");
    const laterObservation = fixture("PESTEL-SIGNAL:one", "same", "2026-09-03T00:00:00.000Z");

    await store.put(first);
    await store.put(laterObservation);

    expect(await store.getBySignalRef("PESTEL-SIGNAL:one")).toBe(first);
  });

  it("fails closed with the canonical collision code for conflicting material", async () => {
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();
    await store.put(fixture("PESTEL-SIGNAL:one", "first"));
    await expect(store.put(fixture("PESTEL-SIGNAL:one", "conflict"))).rejects.toThrow(
      "RESULT_STORE_IDENTITY_COLLISION",
    );
  });
});
