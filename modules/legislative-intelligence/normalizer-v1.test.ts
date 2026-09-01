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
});
