import { describe, expect, it } from "vitest";

import type { RelatedSourceBundle, SourceEnvelope } from "../../contracts.ts";
import { mapCongressBillBundle } from "./mapper.ts";
import billDetail from "./fixtures/bill-detail.json" with { type: "json" };
import actions from "./fixtures/actions.json" with { type: "json" };
import subjects from "./fixtures/subjects.json" with { type: "json" };
import committees from "./fixtures/committees.json" with { type: "json" };
import amendments from "./fixtures/amendments.json" with { type: "json" };
import summaries from "./fixtures/summaries.json" with { type: "json" };

function envelope<T>(id: string, payload: T, sourceObjectType: "bill" | "amendment" = "bill"): SourceEnvelope<T> {
  return {
    sourceRecord: {
      sourceId: `CONGRESS-GOV:${id}`,
      sourceSystem: "congress.gov",
      jurisdiction: "US-FEDERAL",
      sourceObjectType,
      sourceObjectId: id,
      retrievedAt: "2026-09-02T00:00:00.000Z",
      rawSha256: `sha256:${id}`,
      requestReceiptId: "CREDENTIAL-RECEIPT:TEST",
    },
    payload,
    httpStatus: 200,
  };
}

function bundle(): RelatedSourceBundle {
  return {
    bill: envelope("119-HR-1001", billDetail),
    actions: [envelope("119-HR-1001:ACTIONS", actions)],
    amendments: [envelope("119-HR-1001:AMENDMENTS", amendments, "amendment")],
    committees: [envelope("119-HR-1001:COMMITTEES", committees)],
    subjects: [envelope("119-HR-1001:SUBJECTS", subjects)],
    summaries: [envelope("119-HR-1001:SUMMARIES", summaries)],
  };
}

describe("mapCongressBillBundle", () => {
  it("maps source observations without inventing missing fields", () => {
    const mapped = mapCongressBillBundle(bundle());

    expect(mapped.objectId).toBe("119-HR-1001");
    expect(mapped.title).toBe("Supply Chain Transparency Demonstration Act");
    expect(mapped.actions).toEqual([
      { actionDate: "2026-08-31", text: "Introduced in House" },
      { actionDate: "2026-09-01", text: "Referred to the House Committee on Energy and Commerce." },
    ]);
    expect(mapped.subjects).toEqual(["Business records", "Commerce", "Supply chain management"]);
    expect(mapped.committees).toEqual(["House Energy and Commerce Committee"]);
    expect(mapped.actors).toEqual(["BIOGUIDE:E000001"]);
    expect(mapped.summary).toBe("Requires a demonstration program for supply-chain transparency reporting.");
    expect(mapped.lawState).toBeUndefined();
    expect(mapped.completeness.law).toBe(false);
    expect(mapped.evidenceRefs).toEqual([...mapped.evidenceRefs].sort());
  });

  it("ignores unknown API fields when deriving canonical output", () => {
    const first = mapCongressBillBundle(bundle());
    const changed = bundle();
    changed.bill.payload = { ...(changed.bill.payload as object), futureUnknownField: { value: 123 } };
    const second = mapCongressBillBundle(changed);

    expect(second).toEqual(first);
  });
});
