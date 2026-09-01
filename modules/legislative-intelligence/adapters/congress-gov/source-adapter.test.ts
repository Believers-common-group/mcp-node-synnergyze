import { describe, expect, it } from "vitest";

import type { LegislativeObjectRefV1, SourceEnvelopeV1, SourceHealthV1 } from "../../contracts.ts";
import type { CongressGovClientV1 } from "./client.ts";
import { CongressGovSourceAdapterV1 } from "./source-adapter.ts";
import billDetail from "./fixtures/hr-6048/bill-detail.json" with { type: "json" };
import actions from "./fixtures/hr-6048/actions.json" with { type: "json" };
import amendments from "./fixtures/hr-6048/amendments.json" with { type: "json" };
import committees from "./fixtures/hr-6048/committees.json" with { type: "json" };
import subjects from "./fixtures/hr-6048/subjects.json" with { type: "json" };
import summaries from "./fixtures/hr-6048/summaries.json" with { type: "json" };

const ref: LegislativeObjectRefV1 = {
  jurisdiction: "US-FEDERAL",
  objectType: "bill",
  congress: 119,
  billType: "hr",
  number: 6048,
};

function envelope(path: string, type: SourceEnvelopeV1["sourceObjectType"], body: unknown): SourceEnvelopeV1 {
  return {
    schemaVersion: "LEG-SOURCE:R0.1",
    sourceRef: `LEG-SOURCE:${path}`,
    sourceSystem: "congress.gov",
    sourceObjectId: `119-hr-6048:${type}`,
    sourceObjectType: type,
    sourcePath: path,
    retrievedAt: "2026-09-02T00:00:00.000Z",
    httpStatus: 200,
    rawSha256: "a".repeat(64),
    credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
    credentialFingerprintPrefix: "deadbeef",
    body,
  };
}

class FakeClient {
  readonly paths: string[] = [];
  billBody: unknown = billDetail;
  pageNext = false;

  async getJson(path: string, type: SourceEnvelopeV1["sourceObjectType"]): Promise<SourceEnvelopeV1> {
    this.paths.push(path);
    if (path === "/bill/119/hr/6048") return envelope(path, "bill", this.billBody);
    if (path === "/bill/119/hr/6048/actions") {
      return envelope(path, "actions", this.pageNext ? { ...actions, pagination: { next: "https://api.congress.gov/v3/bill/119/hr/6048/actions?offset=20" } } : actions);
    }
    if (path === "/bill/119/hr/6048/actions?offset=20") return envelope(path, "actions", { actions: [] });
    if (path === "/bill/119/hr/6048/amendments") return envelope(path, "amendments", amendments);
    if (path === "/bill/119/hr/6048/committees") return envelope(path, "committees", committees);
    if (path === "/bill/119/hr/6048/subjects") return envelope(path, "subjects", subjects);
    if (path === "/bill/119/hr/6048/summaries") return envelope(path, "summaries", summaries);
    if (path === "/law/119/public/12") return envelope(path, "law", { law: { type: "Public Law", number: "12" } });
    throw new Error(`unexpected_path:${path}`);
  }

  async health(): Promise<SourceHealthV1> {
    return { sourceSystem: "congress.gov", ok: true, checkedAt: "2026-09-02T00:00:00.000Z", credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001" };
  }
}

describe("CongressGovSourceAdapterV1", () => {
  it("retrieves the six minimum Congress.gov bill resources", async () => {
    const client = new FakeClient();
    const adapter = new CongressGovSourceAdapterV1(client as unknown as CongressGovClientV1);
    const bundle = await adapter.getRelated(ref);
    expect(client.paths).toEqual([
      "/bill/119/hr/6048",
      "/bill/119/hr/6048/actions",
      "/bill/119/hr/6048/amendments",
      "/bill/119/hr/6048/committees",
      "/bill/119/hr/6048/subjects",
      "/bill/119/hr/6048/summaries",
    ]);
    expect(bundle.bill.sourceObjectType).toBe("bill");
    expect(bundle.law).toBeUndefined();
  });

  it("follows safe pagination in observed order", async () => {
    const client = new FakeClient();
    client.pageNext = true;
    const adapter = new CongressGovSourceAdapterV1(client as unknown as CongressGovClientV1);
    const pages = await adapter.getActions(ref);
    expect(pages).toHaveLength(2);
    expect(client.paths).toEqual([
      "/bill/119/hr/6048/actions",
      "/bill/119/hr/6048/actions?offset=20",
    ]);
  });

  it("retrieves official same-base law detail when a law is declared", async () => {
    const client = new FakeClient();
    client.billBody = {
      ...(billDetail as object),
      bill: {
        ...billDetail.bill,
        laws: [{ type: "Public Law", number: "12", url: "https://api.congress.gov/v3/law/119/public/12" }],
      },
    };
    const adapter = new CongressGovSourceAdapterV1(client as unknown as CongressGovClientV1);
    const bundle = await adapter.getRelated(ref);
    expect(bundle.law?.sourceObjectType).toBe("law");
    expect(client.paths).toContain("/law/119/public/12");
  });

  it("fails closed when declared law detail cannot be resolved to the Congress.gov API base", async () => {
    const client = new FakeClient();
    client.billBody = {
      ...(billDetail as object),
      bill: { ...billDetail.bill, laws: [{ type: "Public Law", number: "12", url: "https://example.com/law/12" }] },
    };
    const adapter = new CongressGovSourceAdapterV1(client as unknown as CongressGovClientV1);
    await expect(adapter.getRelated(ref)).rejects.toThrow("LAW_DETAIL_UNRESOLVABLE");
  });
});
