import { describe, expect, it } from "vitest";

import { CandidateClaimEngineV1 } from "./claim-engine.ts";

describe("CandidateClaimEngineV1", () => {
  it("replays identical evidence and rejects changed content under one evidence ref", () => {
    const engine = new CandidateClaimEngineV1();
    const evidence = {
      evidenceRef: "EVIDENCE:PUBLIC:AREA:001",
      candidateRef: "GENESIS-CANDIDATE:MOA",
      evidenceClass: "PUBLIC_CORPORATE_DISCLOSURE",
      retrievedAt: "2026-08-28T00:00:00Z",
      evidenceState: "VALIDATED" as const,
      contentDigest: "sha256:aaa",
      accessClass: "PUBLIC" as const,
    };

    expect(engine.ingestEvidenceV1(evidence).state).toBe("INGESTED");
    expect(engine.ingestEvidenceV1(evidence).state).toBe("REPLAY");
    expect(() => engine.ingestEvidenceV1({ ...evidence, contentDigest: "sha256:bbb" })).toThrow(
      "EVIDENCE_IDEMPOTENCY_CONFLICT",
    );
  });

  it("replays identical claims and rejects mutation under one claim ref", () => {
    const engine = new CandidateClaimEngineV1();
    const claim = {
      claimRef: "CLAIM:AREA:PUBLIC",
      candidateRef: "GENESIS-CANDIDATE:MOA",
      claimType: "PROPERTY_ATTRIBUTE" as const,
      subjectRef: "GENESIS-CANDIDATE:MOA",
      predicate: "site_area_acres",
      value: "13",
      valueUnit: "acre",
      sourceEvidenceRefs: ["EVIDENCE:PUBLIC:AREA:001"],
      claimState: "CORROBORATED_PUBLIC" as const,
      confidenceBand: "MEDIUM" as const,
    };

    expect(engine.ingestClaimV1(claim).state).toBe("INGESTED");
    expect(engine.ingestClaimV1(claim).state).toBe("REPLAY");
    expect(() => engine.ingestClaimV1({ ...claim, value: "14" })).toThrow(
      "CLAIM_IDEMPOTENCY_CONFLICT",
    );
  });

  it("preserves immutable claim history and records supersession as an append-only event", () => {
    const engine = new CandidateClaimEngineV1();
    const originalClaim = {
      claimRef: "CLAIM:AREA:PUBLIC",
      candidateRef: "GENESIS-CANDIDATE:MOA",
      claimType: "PROPERTY_ATTRIBUTE" as const,
      subjectRef: "GENESIS-CANDIDATE:MOA",
      predicate: "site_area_acres",
      value: "13",
      valueUnit: "acre",
      sourceEvidenceRefs: ["EVIDENCE:PUBLIC:AREA:001"],
      claimState: "CORROBORATED_PUBLIC" as const,
      confidenceBand: "MEDIUM" as const,
    };
    engine.ingestClaimV1(originalClaim);

    const newClaim = engine.supersedeClaimV1({
      priorClaimRef: "CLAIM:AREA:PUBLIC",
      claimRef: "CLAIM:AREA:SURVEY",
      sourceEvidenceRefs: ["EVIDENCE:SURVEY:001"],
      value: "12.96",
      claimState: "AUTHORITATIVELY_VERIFIED",
      confidenceBand: "HIGH",
      supersededAt: "2026-08-28T02:00:00Z",
    });

    expect(engine.ingestClaimV1(originalClaim).state).toBe("REPLAY");

    const projectedClaims = engine.listClaimsV1("GENESIS-CANDIDATE:MOA");
    expect(
      projectedClaims.find((claim) => claim.claimRef === "CLAIM:AREA:PUBLIC")?.claimState,
    ).toBe("SUPERSEDED");
    expect(
      projectedClaims.find((claim) => claim.claimRef === "CLAIM:AREA:PUBLIC")?.sourceEvidenceRefs,
    ).toEqual(["EVIDENCE:PUBLIC:AREA:001"]);
    expect(newClaim.supersedesClaimRef).toBe("CLAIM:AREA:PUBLIC");
    expect(newClaim.subjectRef).toBe("GENESIS-CANDIDATE:MOA");
    expect(newClaim.predicate).toBe("site_area_acres");

    expect(engine.listSupersessionEventsV1("GENESIS-CANDIDATE:MOA")).toEqual([
      expect.objectContaining({
        priorClaimRef: "CLAIM:AREA:PUBLIC",
        supersedingClaimRef: "CLAIM:AREA:SURVEY",
        supersededAt: "2026-08-28T02:00:00Z",
      }),
    ]);
  });
});
