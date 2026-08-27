import { describe, expect, it } from "vitest";

import { CandidateClaimEngineV1 } from "./claim-engine.ts";
import { MALL_OF_ASIA_PUBLIC_FIXTURE_V1 } from "./fixtures/mall-of-asia.public.ts";
import { reconcileCandidateClaimsV1 } from "./reconciliation.ts";
import { evaluateEvidenceRequirementsV1 } from "./requirement-engine.ts";
import {
  admitGenesisCandidateV1,
  computeAcquisitionReadinessV1,
} from "./readiness-engine.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";

function syntheticAdmissionAllow(targetRef: string): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:MOA-PUBLIC-ADMIT",
    requestRef: "REQUEST:MOA-PUBLIC-ADMIT",
    wardenRef: "WARDEN:ALPHA",
    decision: "ALLOW",
    action: "genesis.node_builder.admit",
    targetRef,
    reasonCodes: ["synthetic_test_allow"],
    constraints: ["PUBLIC_FIXTURE_ONLY"],
    decidedAt: "2026-08-28T03:00:00Z",
    correlationId: "CORR:MOA-PUBLIC-ADMIT",
    actionToken: "SYNTHETIC-ACTION-TOKEN",
  };
}

describe("GENESIS-REFERENCE-ASSET-MOA-001 public acquisition proof", () => {
  it("remains public, incomplete, conflict-aware and impossible to self-admit", () => {
    const fixture = MALL_OF_ASIA_PUBLIC_FIXTURE_V1;
    expect(fixture.referenceAssetRef).toBe("GENESIS-REFERENCE-ASSET-MOA-001");
    expect(fixture.referenceAssetStatus).toBe(
      "PUBLIC-EVIDENCE PROTOTYPE — NOT AUTHORITATIVE PROPERTY RECORD",
    );
    expect(fixture.evidence.every((item) => item.accessClass === "PUBLIC")).toBe(true);
    expect(fixture.claims.map((claim) => claim.claimState)).toEqual([
      "CORROBORATED_PUBLIC",
      "INFERRED",
    ]);

    const ledger = new CandidateClaimEngineV1();
    for (const evidence of fixture.evidence) ledger.ingestEvidenceV1(evidence);
    for (const claim of fixture.claims) ledger.ingestClaimV1(claim);

    const reconciliation = reconcileCandidateClaimsV1({
      candidateRef: fixture.candidate.candidateRef,
      claims: ledger.listClaimsV1(fixture.candidate.candidateRef),
      identities: fixture.identities,
    });
    expect(reconciliation.conflicts).toHaveLength(1);
    expect(reconciliation.conflicts[0]).toMatchObject({
      classification: "AREA_CONFLICT",
      severity: "REVIEW",
    });

    const requirements = evaluateEvidenceRequirementsV1({
      candidateRef: fixture.candidate.candidateRef,
      assetClass: fixture.candidate.assetClass,
      jurisdictionRef: fixture.candidate.jurisdictionRef,
      evidence: ledger.listEvidenceV1(fixture.candidate.candidateRef),
    });
    expect(requirements.find((item) => item.requirementClass === "TITLE_CHAIN_EVIDENCE")?.status)
      .toBe("MISSING");
    expect(
      requirements.find((item) => item.requirementClass === "PARCEL_BOUNDARY_EVIDENCE")?.status,
    ).toBe("MISSING");

    const readiness = computeAcquisitionReadinessV1({
      candidate: fixture.candidate,
      identities: fixture.identities,
      evidence: ledger.listEvidenceV1(fixture.candidate.candidateRef),
      requirements,
      conflicts: reconciliation.conflicts,
      computedAt: "2026-08-28T03:00:00Z",
    });
    expect(readiness.gate).toEqual({
      highestPassedGate: "G1",
      blockedAtGate: "G2",
      status: "BLOCKED",
    });

    expect(() =>
      admitGenesisCandidateV1({
        candidate: fixture.candidate,
        readiness,
        decision: syntheticAdmissionAllow(fixture.candidate.candidateRef),
      }),
    ).toThrow("CANDIDATE_NOT_ACQUISITION_READY");
  });
});
