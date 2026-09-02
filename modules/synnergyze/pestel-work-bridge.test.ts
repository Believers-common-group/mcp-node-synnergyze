import { describe, expect, it } from "vitest";

import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import type { RegistryImpactCandidateV1 } from "../legislative-intelligence/impact-graph.ts";
import type { ImpactBriefV1, PestelSignalV1 } from "../pestel/contracts.ts";
import { buildPestelReviewWorkCandidateV1 } from "./pestel-work-bridge.ts";

const event: NormalizedLegislativeEventV1 = {
  schemaVersion: "LEG-EVENT:R0.1", eventRef: "LEG-EVENT:test", sourceRefs: ["LEG-SOURCE:bill"], jurisdiction: "US-FEDERAL", objectType: "bill", objectId: "119-HR-1001", lifecycle: "PROPOSAL", subjects: [], committees: [], actors: [], actionRefs: [], evidenceRefs: ["LEG-SOURCE:bill"], normalizedAt: "2026-09-02T00:00:00.000Z", normalizerVersion: "LEG-NORMALIZER:R0.1",
};
const signal: PestelSignalV1 = {
  schemaVersion: "PESTEL-SIGNAL:R0.1", signalRef: "PESTEL-SIGNAL:test", legislativeEventRef: event.eventRef, vector: { political: 0, economic: 0, social: 0, technological: 0, environmental: 0, legal: 0 }, riskScore: 0, opportunityScore: 0, obligationCandidate: false, confidence: 0.3, rationale: [], classifierVersion: "PESTEL-CLASSIFIER:R0.1", evidenceRefs: event.evidenceRefs,
};
const brief: ImpactBriefV1 = {
  schemaVersion: "PESTEL-BRIEF:R0.1", briefRef: "PESTEL-BRIEF:test", signalRef: signal.signalRef, lifecycle: event.lifecycle, observedFacts: ["Lifecycle observed as PROPOSAL."], riskHypotheses: [], opportunityHypotheses: [], obligationCandidate: false, completeness: "DEGRADED", confidence: signal.confidence, evidenceRefs: event.evidenceRefs, createdAt: "2026-09-02T00:00:00.000Z",
};
const registryCandidates: RegistryImpactCandidateV1[] = [
  { candidateRef: "REGISTRY-IMPACT:test", signalRef: signal.signalRef, registryEntityRef: "SECTOR:COMMERCE", relation: "MAY_AFFECT", confidence: 0.4, matchedTerms: ["commerce"], evidenceRefs: event.evidenceRefs },
];

describe("buildPestelReviewWorkCandidateV1", () => {
  it("creates a non-authoritative review candidate", () => {
    const work = buildPestelReviewWorkCandidateV1({ event, signal, brief, registryCandidates });
    expect(work.state).toBe("REVIEW_CANDIDATE");
    expect(work.authorized).toBe(false);
    expect(work.registryCandidateRefs).toEqual(["REGISTRY-IMPACT:test"]);
    expect(work).not.toHaveProperty("actionToken");
  });
});
