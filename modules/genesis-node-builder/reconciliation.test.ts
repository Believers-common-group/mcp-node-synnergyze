import { describe, expect, it } from "vitest";

import type { CandidateClaimV1, CandidateIdentityV1 } from "./contracts.ts";
import { reconcileCandidateClaimsV1 } from "./reconciliation.ts";

const candidateRef = "GENESIS-CANDIDATE:MOA";

function publicAreaClaim(claimRef: string, value: string, evidenceRef: string): CandidateClaimV1 {
  return {
    claimRef,
    candidateRef,
    claimType: "PROPERTY_ATTRIBUTE",
    subjectRef: candidateRef,
    predicate: "site_area_acres",
    value,
    valueUnit: "acre",
    sourceEvidenceRefs: [evidenceRef],
    claimState: "CORROBORATED_PUBLIC",
    confidenceBand: "MEDIUM",
  };
}

describe("reconcileCandidateClaimsV1", () => {
  it("classifies differing public area claims for review without guessing", () => {
    const result = reconcileCandidateClaimsV1({
      candidateRef,
      claims: [
        publicAreaClaim("CLAIM:AREA:A", "13", "EVIDENCE:AREA:A"),
        publicAreaClaim("CLAIM:AREA:B", "12.8", "EVIDENCE:AREA:B"),
      ],
      identities: [],
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      classification: "AREA_CONFLICT",
      severity: "REVIEW",
      resolutionState: "OPEN",
      requiredReviewCapabilityRef: "genesis.node_builder.conflict.review",
    });
  });

  it("blocks conflicting authoritative parcel boundaries", () => {
    const claims: CandidateClaimV1[] = [
      {
        claimRef: "CLAIM:BOUNDARY:A",
        candidateRef,
        claimType: "GEOMETRY",
        subjectRef: candidateRef,
        predicate: "parcel_boundary_digest",
        value: "sha256:boundary-a",
        sourceEvidenceRefs: ["EVIDENCE:SURVEY:A"],
        claimState: "AUTHORITATIVELY_VERIFIED",
        confidenceBand: "HIGH",
      },
      {
        claimRef: "CLAIM:BOUNDARY:B",
        candidateRef,
        claimType: "GEOMETRY",
        subjectRef: candidateRef,
        predicate: "parcel_boundary_digest",
        value: "sha256:boundary-b",
        sourceEvidenceRefs: ["EVIDENCE:SURVEY:B"],
        claimState: "AUTHORITATIVELY_VERIFIED",
        confidenceBand: "HIGH",
      },
    ];

    const result = reconcileCandidateClaimsV1({ candidateRef, claims, identities: [] });
    expect(result.conflicts[0]).toMatchObject({
      classification: "BOUNDARY_CONFLICT",
      severity: "BLOCKING",
    });
  });

  it("turns competing unresolved identity clues into a blocking identity conflict", () => {
    const identities: CandidateIdentityV1[] = [
      {
        identityRef: "IDENTITY:SURVEY:239",
        candidateRef,
        kind: "SURVEY_NUMBER",
        normalizedValue: "239",
        sourceEvidenceRefs: ["EVIDENCE:SURVEY:239"],
        observedAt: "2026-08-28T00:00:00Z",
      },
      {
        identityRef: "IDENTITY:SURVEY:240",
        candidateRef,
        kind: "SURVEY_NUMBER",
        normalizedValue: "240",
        sourceEvidenceRefs: ["EVIDENCE:SURVEY:240"],
        observedAt: "2026-08-28T00:01:00Z",
      },
    ];

    const result = reconcileCandidateClaimsV1({ candidateRef, claims: [], identities });
    expect(result.conflicts[0]).toMatchObject({
      classification: "IDENTITY_CONFLICT",
      severity: "BLOCKING",
    });
  });

  it("is deterministic when claim and identity input order changes", () => {
    const claims = [
      publicAreaClaim("CLAIM:AREA:A", "13", "EVIDENCE:AREA:A"),
      publicAreaClaim("CLAIM:AREA:B", "12.8", "EVIDENCE:AREA:B"),
    ];
    const identities: CandidateIdentityV1[] = [
      {
        identityRef: "IDENTITY:ADDRESS",
        candidateRef,
        kind: "ADDRESS",
        normalizedValue: "Byatarayanapura, Bengaluru, Karnataka",
        sourceEvidenceRefs: ["EVIDENCE:ADDRESS"],
        observedAt: "2026-08-28T00:00:00Z",
      },
    ];

    const first = reconcileCandidateClaimsV1({ candidateRef, claims, identities });
    const reversed = reconcileCandidateClaimsV1({
      candidateRef,
      claims: [...claims].reverse(),
      identities: [...identities].reverse(),
    });

    expect(reversed.reconciliationRef).toBe(first.reconciliationRef);
    expect(reversed.sourceDigest).toBe(first.sourceDigest);
    expect(reversed.conflicts.map((conflict) => conflict.conflictRef)).toEqual(
      first.conflicts.map((conflict) => conflict.conflictRef),
    );
  });
});
