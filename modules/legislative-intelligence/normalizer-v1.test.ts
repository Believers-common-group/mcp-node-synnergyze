import { describe, expect, it } from "vitest";

import type { RelatedSourceBundleV1, SourceEnvelopeV1 } from "./contracts.ts";
import { normalizeCongressGovBillV1 } from "./normalizer.ts";
import billDetail from "./adapters/congress-gov/fixtures/hr-6048/bill-detail.json" with { type: "json" };
import actions from "./adapters/congress-gov/fixtures/hr-6048/actions.json" with { type: "json" };
import amendments from "./adapters/congress-gov/fixtures/hr-6048/amendments.json" with { type: "json" };
import committees from "./adapters/congress-gov/fixtures/hr-6048/committees.json" with { type: "json" };
import subjects from "./adapters/congress-gov/fixtures/hr-6048/subjects.json" with { type: "json" };
import summaries from "./adapters/congress-gov/fixtures/hr-6048/summaries.json" with { type: "json" };

function source(type: SourceEnvelopeV1["sourceObjectType"], body: unknown): SourceEnvelopeV1 {
  return {
    schemaVersion: "LEG-SOURCE:R0.1",
    sourceRef: `LEG-SOURCE:${type}`,
    sourceSystem: "congress.gov",
    sourceObjectId: `119-hr-6048:${type}`,
    sourceObjectType: type,
    sourcePath: `/bill/119/hr/6048/${type}`,
    retrievedAt: "2026-09-02T00:00:00.000Z",
    httpStatus: 200,
    rawSha256: type.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/gi, "a").toLowerCase(),
    credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
    credentialFingerprintPrefix: "deadbeef",
    body,
  };
}

const bundle: RelatedSourceBundleV1 = {
  bill: source("bill", billDetail),
  actions: [source("actions", actions)],
  amendments: [source("amendments", amendments)],
  committees: [source("committees", committees)],
  subjects: [source("subjects", subjects)],
  summaries: [source("summaries", summaries)],
};

function minimalBundle(
  bill: Record<string, unknown>,
  actionItems: readonly Record<string, unknown>[],
  summaryItems: readonly Record<string, unknown>[] = [],
): RelatedSourceBundleV1 {
  return {
    bill: source("bill", { bill }),
    actions: [source("actions", { actions: actionItems })],
    amendments: [],
    committees: [],
    subjects: [],
    summaries: summaryItems.length > 0 ? [source("summaries", { summaries: summaryItems })] : [],
  };
}

describe("normalizeCongressGovBillV1", () => {
  it("normalizes the H.R.6048 source bundle deterministically without overstating House passage", () => {
    const first = normalizeCongressGovBillV1(bundle, "2026-09-02T00:00:00.000Z");
    const second = normalizeCongressGovBillV1(bundle, "2026-09-02T00:00:00.000Z");
    expect(first.eventRef).toBe(second.eventRef);
    expect(first.lifecycle).toBe("ADVANCING");
    expect(first.objectId).toBe("119-hr-6048");
    expect(first.subjects).toEqual([...first.subjects].sort());
    expect(first.sourceRefs).toEqual([...first.sourceRefs].sort());
  });

  it("uses authoritative bill introducedDate when action text omits introduction", () => {
    const event = normalizeCongressGovBillV1(
      minimalBundle(
        {
          congress: 119,
          type: "HR",
          number: "2000",
          title: "Synthetic Introduced Bill",
          introducedDate: "2026-08-30",
        },
        [{ actionDate: "2026-08-31", text: "Referred to the Committee on Rules." }],
      ),
      "2026-09-02T00:00:00.000Z",
    );

    expect(event.lifecycle).toBe("PROPOSAL");
    expect(event.introducedAt).toBe("2026-08-30");
  });

  it("selects the most recent action-associated CRS summary regardless of response order", () => {
    const event = normalizeCongressGovBillV1(
      minimalBundle(
        {
          congress: 119,
          type: "HR",
          number: "2001",
          title: "Synthetic Summary Bill",
          introducedDate: "2026-08-30",
        },
        [{ actionDate: "2026-08-30", text: "Introduced in House" }],
        [
          {
            actionDate: "2026-09-02",
            updateDate: "2026-09-02T12:00:00Z",
            actionDesc: "Passed House",
            text: "Latest action-associated summary.",
          },
          {
            actionDate: "2026-08-30",
            updateDate: "2026-08-31T12:00:00Z",
            actionDesc: "Introduced in House",
            text: "Earlier introduced summary.",
          },
        ],
      ),
      "2026-09-03T00:00:00.000Z",
    );

    expect(event.summary).toBe("Latest action-associated summary.");
  });
});
