import { describe, expect, it } from "vitest";

import type { PestelSignalV1 } from "../pestel/contracts.ts";
import { mapRegistryImpactCandidatesV1 } from "./impact-graph.ts";

const signal: PestelSignalV1 = {
  schemaVersion: "PESTEL-SIGNAL:R0.1",
  signalRef: "PESTEL-SIGNAL:test",
  legislativeEventRef: "LEG-EVENT:test",
  vector: { political: 0.2, economic: 0.3, social: 0.2, technological: 0.5, environmental: 0, legal: 0.5 },
  riskScore: 0.25,
  opportunityScore: 0.33,
  obligationCandidate: false,
  confidence: 0.6,
  rationale: [
    {
      dimension: "legal",
      scoreContribution: 0.4,
      basis: "DETERMINISTIC_RULE",
      statement: "Matched privacy_data evidence (privacy, consumer data).",
      evidenceRefs: ["LEG-SOURCE:bill"],
      hypothesis: false,
    },
  ],
  classifierVersion: "PESTEL-CLASSIFIER:R0.1",
  evidenceRefs: ["LEG-SOURCE:bill"],
};

describe("mapRegistryImpactCandidatesV1", () => {
  it("emits relational Registry candidates only", () => {
    const candidates = mapRegistryImpactCandidatesV1(signal, [
      {
        registryEntityRef: "SECTOR:ELECTRONIC-COMMUNICATIONS",
        terms: ["electronic communications", "privacy"],
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      registryEntityRef: "SECTOR:ELECTRONIC-COMMUNICATIONS",
      relation: "MAY_AFFECT",
      matchedTerms: ["privacy"],
    });
    expect(candidates[0].confidence).toBeGreaterThan(0);
    expect(candidates[0].confidence).toBeLessThanOrEqual(1);
    expect(JSON.stringify(candidates[0])).not.toContain("write");
  });
});
