import { describe, expect, it } from "vitest";

import type { LegislativeIntelligenceResultV1 } from "./service.ts";
import { InMemoryLegislativeIntelligenceResultStoreV1 } from "./result-store.ts";

function fixture(signalRef: string, marker: string): LegislativeIntelligenceResultV1 {
  return {
    signal: { signalRef },
    marker,
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

  it("fails closed on conflicting material for the same signalRef", async () => {
    const store = new InMemoryLegislativeIntelligenceResultStoreV1();
    await store.put(fixture("PESTEL-SIGNAL:one", "first"));
    await expect(store.put(fixture("PESTEL-SIGNAL:one", "conflict"))).rejects.toThrow(
      "legislative_result_store_conflict",
    );
  });
});
