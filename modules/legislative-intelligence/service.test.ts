import { describe, expect, it } from "vitest";

import type {
  LegislativeObjectRefV1,
  RelatedSourceBundleV1,
  SourceEnvelopeV1,
  SourceHealthV1,
} from "./contracts.ts";
import type { LegislativeSourceAdapterV1 } from "./adapters/source-adapter.ts";
import { LegislativeIntelligenceServiceV1 } from "./service.ts";

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
    rawSha256: sourceObjectId.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/gi, "a").toLowerCase(),
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
    };
  }
}

describe("LegislativeIntelligenceServiceV1", () => {
  it("builds one linked, non-authoritative legislative-intelligence result", async () => {
    const service = new LegislativeIntelligenceServiceV1(new FakeSource());
    const ref: LegislativeObjectRefV1 = {
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      congress: 119,
      billType: "hr",
      number: 1001,
    };

    const result = await service.ingestBill(ref, {
      observedAt: "2026-09-02T00:00:00.000Z",
      registryIndex: [{ registryEntityRef: "SECTOR:SUPPLY-CHAIN", terms: ["supply chain"] }],
    });

    expect(result.event.lifecycle).toBe("ADVANCING");
    expect(result.signal.legislativeEventRef).toBe(result.event.eventRef);
    expect(result.brief.signalRef).toBe(result.signal.signalRef);
    expect(result.evidence.persistenceState).toBe("LOCAL_DOMAIN_RECEIPT");
    expect(result.workCandidate.authorized).toBe(false);
    expect(result.registryCandidates[0]?.relation).toBe("MAY_AFFECT");
  });
});
