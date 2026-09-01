import { describe, expect, it } from "vitest";

import type { NormalizedLegislativeEventV1, SourceEnvelopeV1 } from "../legislative-intelligence/contracts.ts";
import type { ImpactBriefV1, PestelSignalV1 } from "../pestel/contracts.ts";
import { buildLegislativeEvidenceReceiptV1 } from "./legislative-evidence.ts";

const sources: SourceEnvelopeV1[] = [
  {
    schemaVersion: "LEG-SOURCE:R0.1",
    sourceRef: "LEG-SOURCE:bill",
    sourceSystem: "congress.gov",
    sourceObjectId: "119-HR-1001",
    sourceObjectType: "bill",
    sourcePath: "/bill/119/hr/1001",
    retrievedAt: "2026-09-02T00:00:00.000Z",
    httpStatus: 200,
    rateLimitLimit: 5000,
    rateLimitRemaining: 4999,
    rawSha256: "a".repeat(64),
    credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
    credentialFingerprintPrefix: "12345678",
    body: { synthetic: "sentinel-secret" },
  },
];

const event: NormalizedLegislativeEventV1 = {
  schemaVersion: "LEG-EVENT:R0.1",
  eventRef: "LEG-EVENT:test",
  sourceRefs: ["LEG-SOURCE:bill"],
  jurisdiction: "US-FEDERAL",
  objectType: "bill",
  objectId: "119-HR-1001",
  lifecycle: "PROPOSAL",
  title: "Synthetic Bill",
  subjects: ["Commerce"],
  committees: [],
  actors: [],
  actionRefs: [],
  evidenceRefs: ["LEG-SOURCE:bill"],
  normalizedAt: "2026-09-02T00:00:00.000Z",
  normalizerVersion: "LEG-NORMALIZER:R0.1",
};

const signal: PestelSignalV1 = {
  schemaVersion: "PESTEL-SIGNAL:R0.1",
  signalRef: "PESTEL-SIGNAL:test",
  legislativeEventRef: event.eventRef,
  vector: { political: 0, economic: 0.2, social: 0, technological: 0, environmental: 0, legal: 0.2 },
  riskScore: 0.1,
  opportunityScore: 0.1,
  obligationCandidate: false,
  confidence: 0.4,
  rationale: [],
  classifierVersion: "PESTEL-CLASSIFIER:R0.1",
  evidenceRefs: event.evidenceRefs,
};

const brief: ImpactBriefV1 = {
  schemaVersion: "PESTEL-BRIEF:R0.1",
  briefRef: "PESTEL-BRIEF:test",
  signalRef: signal.signalRef,
  lifecycle: event.lifecycle,
  observedFacts: ["Lifecycle observed as PROPOSAL."],
  riskHypotheses: [],
  opportunityHypotheses: [],
  obligationCandidate: false,
  completeness: "DEGRADED",
  confidence: signal.confidence,
  evidenceRefs: event.evidenceRefs,
  createdAt: "2026-09-02T00:00:00.000Z",
};

describe("buildLegislativeEvidenceReceiptV1", () => {
  it("preserves replay metadata without credential material", () => {
    const receipt = buildLegislativeEvidenceReceiptV1({
      runRef: "PESTEL-RUN:001",
      sources,
      event,
      signal,
      brief,
      observedAt: "2026-09-02T00:00:00.000Z",
    });

    const material = JSON.stringify(receipt);
    expect(material).not.toContain("sentinel-secret");
    expect(receipt.credentialAdmissionRef).toBe("CONGRESS-GOV-API-KEY-001");
    expect(receipt.persistenceState).toBe("LOCAL_DOMAIN_RECEIPT");
    expect(receipt.rawSourceDigests).toEqual(["a".repeat(64)]);
  });

  it("keeps evidence identity stable when only observedAt changes", () => {
    const first = buildLegislativeEvidenceReceiptV1({ runRef: "PESTEL-RUN:001", sources, event, signal, brief, observedAt: "2026-09-02T00:00:00.000Z" });
    const second = buildLegislativeEvidenceReceiptV1({ runRef: "PESTEL-RUN:001", sources, event, signal, brief, observedAt: "2026-09-03T00:00:00.000Z" });
    expect(first.evidenceRef).toBe(second.evidenceRef);
  });
});
