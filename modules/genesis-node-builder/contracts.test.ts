import { describe, expect, it } from "vitest";

import type {
  AcquisitionReadinessSnapshotV1,
  CandidateClaimV1,
  GenesisCandidateV1,
} from "./contracts.ts";

const candidate: GenesisCandidateV1 = {
  candidateRef: "GENESIS-CANDIDATE:MOA-001",
  candidateType: "PROPERTY",
  displayName: "Phoenix Mall of Asia",
  jurisdictionRef: "JURISDICTION:KA-BLR",
  assetClass: "MALL",
  lifecycle: "DISCOVERED",
  createdAt: "2026-08-28T00:00:00Z",
  sourceEvidenceRefs: [],
  correlationId: "CORR:MOA-001",
};

const publicClaim: CandidateClaimV1 = {
  claimRef: "CLAIM:MOA:SITE-AREA:PUBLIC",
  candidateRef: candidate.candidateRef,
  claimType: "PROPERTY_ATTRIBUTE",
  subjectRef: candidate.candidateRef,
  predicate: "site_area_acres",
  value: "13",
  valueUnit: "acre",
  sourceEvidenceRefs: ["EVIDENCE:PUBLIC:001"],
  claimState: "CORROBORATED_PUBLIC",
  confidenceBand: "MEDIUM",
};

const readiness: AcquisitionReadinessSnapshotV1 = {
  snapshotRef: "READINESS:MOA:001",
  candidateRef: candidate.candidateRef,
  gate: { highestPassedGate: "G0", blockedAtGate: "G1", status: "BLOCKED" },
  categoryScores: { identity: 1, jurisdiction: 0 },
  blockingRequirementRefs: ["REQ:JURISDICTION"],
  blockingConflictRefs: [],
  evidenceCoverage: 0.5,
  computedAt: "2026-08-28T00:01:00Z",
  sourceDigest: "sha256:test",
  projectionOnly: true,
};

const invalidAuthoritySnapshot: AcquisitionReadinessSnapshotV1 = {
  ...readiness,
  // @ts-expect-error Node Builder snapshots are projections and can never be authority.
  projectionOnly: false,
};
void invalidAuthoritySnapshot;

describe("Genesis Node Builder contracts", () => {
  it("keeps public corroboration below authoritative verification", () => {
    expect(publicClaim.claimState).toBe("CORROBORATED_PUBLIC");
    expect(readiness.projectionOnly).toBe(true);
  });
});
