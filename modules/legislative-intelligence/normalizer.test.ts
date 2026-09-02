import { describe, expect, it } from "vitest";

import type { CanonicalCongressBillBundle } from "./adapters/congress-gov/types.ts";
import { normalizeCongressBillEventV1 } from "./normalizer.ts";

function sourceBundle(): CanonicalCongressBillBundle {
  return {
    sourceRef: "CONGRESS-GOV:119-HR-1001",
    jurisdiction: "US-FEDERAL",
    objectType: "bill",
    objectId: "119-HR-1001",
    title: "Supply Chain Transparency Demonstration Act",
    sourceUpdatedAt: "2026-09-01",
    originChamber: "House",
    actions: [
      { actionDate: "2026-08-31", text: "Introduced in House" },
      {
        actionDate: "2026-09-01",
        text: "Referred to the House Committee on Energy and Commerce.",
      },
    ],
    subjects: ["Business records", "Commerce", "Supply chain management"],
    committees: ["House Energy and Commerce Committee"],
    actors: ["BIOGUIDE:E000001"],
    summary: "Requires a demonstration program for supply-chain transparency reporting.",
    evidenceRefs: [
      "CONGRESS-GOV:119-HR-1001",
      "CONGRESS-GOV:119-HR-1001:ACTIONS",
      "CONGRESS-GOV:119-HR-1001:COMMITTEES",
      "CONGRESS-GOV:119-HR-1001:SUBJECTS",
      "CONGRESS-GOV:119-HR-1001:SUMMARIES",
    ],
    completeness: {
      bill: true,
      actions: true,
      amendments: true,
      committees: true,
      subjects: true,
      summaries: true,
      law: false,
    },
  };
}

describe("normalizeCongressBillEventV1", () => {
  it("creates a proposal event without overstating missing law evidence", () => {
    const event = normalizeCongressBillEventV1(
      sourceBundle(),
      "2026-09-02T00:00:01.000Z",
    );

    expect(event.schemaVersion).toBe("LEG-EVENT:R0.1");
    expect(event.normalizerVersion).toBe("LEG-NORMALIZER:R0.1");
    expect(event.lifecycle).toBe("PROPOSAL");
    expect(event.objectId).toBe("119-HR-1001");
    expect(event.introducedAt).toBe("2026-08-31");
    expect(event.latestActionAt).toBe("2026-09-01");
    expect(event.effectiveDate).toBeUndefined();
    expect(event.sourceRefs).toEqual([...event.sourceRefs].sort());
    expect(event.evidenceRefs).toEqual([...event.evidenceRefs].sort());
    expect(event.actionRefs).toHaveLength(2);
    expect(event.actionRefs.every((ref) => ref.startsWith("LEG-ACTION:"))).toBe(true);
  });

  it("keeps event identity stable when only normalizedAt changes", () => {
    const first = normalizeCongressBillEventV1(
      sourceBundle(),
      "2026-09-02T00:00:01.000Z",
    );
    const second = normalizeCongressBillEventV1(
      sourceBundle(),
      "2026-09-02T01:00:01.000Z",
    );

    expect(second.eventRef).toBe(first.eventRef);
    expect(second.actionRefs).toEqual(first.actionRefs);
    expect(second.normalizedAt).not.toBe(first.normalizedAt);
  });

  it("changes identity when source legislative content changes", () => {
    const changed = sourceBundle();
    changed.actions = [...changed.actions, { actionDate: "2026-09-03", text: "Passed House" }];

    const first = normalizeCongressBillEventV1(sourceBundle(), "2026-09-02T00:00:01.000Z");
    const second = normalizeCongressBillEventV1(changed, "2026-09-03T00:00:01.000Z");

    expect(second.lifecycle).toBe("ADVANCING");
    expect(second.eventRef).not.toBe(first.eventRef);
  });
});
