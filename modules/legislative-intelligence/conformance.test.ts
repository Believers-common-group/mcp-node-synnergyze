import { describe, expect, it } from "vitest";

import type { LegislativeSourceAdapterV1 } from "./adapters/source-adapter.ts";
import type {
  LegislativeObjectRefV1,
  RelatedSourceBundleV1,
  SourceEnvelopeV1,
  SourceHealthV1,
} from "./contracts.ts";
import { LegislativeIntelligenceServiceV1 } from "./service.ts";

const sentinelSecret = "sentinel-secret";

function source(
  sourceObjectType: SourceEnvelopeV1["sourceObjectType"],
  sourceObjectId: string,
  body: unknown,
): SourceEnvelopeV1 {
  return {
    schemaVersion: "LEG-SOURCE:R0.1",
    sourceRef: `LEG-SOURCE:${sourceObjectId}`,
    sourceSystem: "congress.gov",
    sourceObjectId,
    sourceObjectType,
    sourcePath: `/synthetic/${sourceObjectType}/${sourceObjectId}`,
    retrievedAt: "2026-09-02T00:00:00.000Z",
    httpStatus: 200,
    rawSha256: "a".repeat(64),
    credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
    credentialFingerprintPrefix: "deadbeef",
    body,
  };
}

const related: RelatedSourceBundleV1 = {
  bill: source("bill", "119-HR-1001", {
    bill: {
      congress: 119,
      type: "HR",
      number: "1001",
      title: "Supply Chain Transparency Demonstration Act",
      sponsors: [{ bioguideId: "E000001" }],
      futureUnknownField: { transportSecret: sentinelSecret },
    },
  }),
  actions: [
    source("actions", "119-HR-1001:ACTIONS", {
      actions: [
        { actionDate: "2026-08-31", text: "Introduced in House" },
        { actionDate: "2026-09-01", text: "Passed House" },
      ],
    }),
  ],
  subjects: [
    source("subjects", "119-HR-1001:SUBJECTS", {
      subjects: {
        legislativeSubjects: [{ name: "Supply chain management" }, { name: "Business records" }],
        policyArea: { name: "Commerce" },
      },
    }),
  ],
  committees: [
    source("committees", "119-HR-1001:COMMITTEES", {
      committees: [{ name: "House Energy and Commerce Committee" }],
    }),
  ],
  amendments: [],
  summaries: [
    source("summaries", "119-HR-1001:SUMMARIES", {
      summaries: [{ text: "Requires supply chain transparency reporting and digital recordkeeping." }],
    }),
  ],
};

class FakeSource implements LegislativeSourceAdapterV1 {
  async getObject(): Promise<SourceEnvelopeV1> {
    return related.bill;
  }

  async getActions(): Promise<readonly SourceEnvelopeV1[]> {
    return related.actions;
  }

  async getRelated(): Promise<RelatedSourceBundleV1> {
    return related;
  }

  async health(): Promise<SourceHealthV1> {
    return {
      sourceSystem: "congress.gov",
      ok: true,
      checkedAt: "2026-09-02T00:00:00.000Z",
      credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
      credentialFingerprintPrefix: "deadbeef",
    };
  }
}

function collectForbiddenKeys(value: unknown, path = "$", matches: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectForbiddenKeys(child, `${path}[${index}]`, matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = `${path}.${key}`;
    if (/api.?key|secret|credential.?value|authorization.?token/i.test(key)) {
      matches.push(nextPath);
    }
    collectForbiddenKeys(child, nextPath, matches);
  }
  return matches;
}

describe("PESTEL legislative intelligence conformance", () => {
  it("replays deterministically without credential leakage", async () => {
    const service = new LegislativeIntelligenceServiceV1(new FakeSource());
    const ref: LegislativeObjectRefV1 = {
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      congress: 119,
      billType: "hr",
      number: 1001,
    };
    const options = {
      observedAt: "2026-09-02T00:00:00.000Z",
      registryIndex: [{ registryEntityRef: "SECTOR:SUPPLY-CHAIN", terms: ["supply chain"] }],
    };

    const first = await service.ingestBill(ref, options);
    const second = await service.ingestBill(ref, options);

    expect(first.event.eventRef).toBe(second.event.eventRef);
    expect(first.signal.signalRef).toBe(second.signal.signalRef);
    expect(first.brief.briefRef).toBe(second.brief.briefRef);
    expect(first.evidence.evidenceRef).toBe(second.evidence.evidenceRef);
    expect(first.workCandidate.workRef).toBe(second.workCandidate.workRef);

    const material = JSON.stringify([first, second]);
    expect(material).not.toContain(sentinelSecret);
    expect(collectForbiddenKeys([first, second])).toEqual([]);
  });

  it("keeps substantive identities stable when only observation time changes", async () => {
    const service = new LegislativeIntelligenceServiceV1(new FakeSource());
    const ref: LegislativeObjectRefV1 = {
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      congress: 119,
      billType: "hr",
      number: 1001,
    };
    const registryIndex = [{ registryEntityRef: "SECTOR:SUPPLY-CHAIN", terms: ["supply chain"] }];

    const first = await service.ingestBill(ref, {
      observedAt: "2026-09-02T00:00:00.000Z",
      registryIndex,
    });
    const second = await service.ingestBill(ref, {
      observedAt: "2026-09-03T00:00:00.000Z",
      registryIndex,
    });

    expect(first.event.eventRef).toBe(second.event.eventRef);
    expect(first.signal.signalRef).toBe(second.signal.signalRef);
    expect(first.brief.briefRef).toBe(second.brief.briefRef);
    expect(first.evidence.evidenceRef).toBe(second.evidence.evidenceRef);
    expect(first.workCandidate.workRef).toBe(second.workCandidate.workRef);
  });
});
