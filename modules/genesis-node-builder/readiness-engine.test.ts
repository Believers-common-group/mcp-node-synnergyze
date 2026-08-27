import { describe, expect, it } from "vitest";

import type {
  CandidateEvidenceV1,
  CandidateIdentityV1,
  GenesisCandidateV1,
} from "./contracts.ts";
import { evaluateEvidenceRequirementsV1 } from "./requirement-engine.ts";
import {
  admitGenesisCandidateV1,
  computeAcquisitionReadinessV1,
} from "./readiness-engine.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";

const candidate: GenesisCandidateV1 = {
  candidateRef: "GENESIS-CANDIDATE:MOA",
  candidateType: "PROPERTY",
  displayName: "Phoenix Mall of Asia",
  jurisdictionRef: "JURISDICTION:KA-BLR",
  assetClass: "MALL",
  lifecycle: "DISCOVERED",
  createdAt: "2026-08-28T00:00:00Z",
  sourceEvidenceRefs: [],
  correlationId: "CORR:MOA",
};

const identities: CandidateIdentityV1[] = [
  {
    identityRef: "IDENTITY:ADDRESS",
    candidateRef: candidate.candidateRef,
    kind: "ADDRESS",
    normalizedValue: "Byatarayanapura, Bengaluru, Karnataka",
    sourceEvidenceRefs: ["EVIDENCE:IDENTITY"],
    observedAt: "2026-08-28T00:00:00Z",
  },
];

function evidence(evidenceRef: string, evidenceClass: string): CandidateEvidenceV1 {
  return {
    evidenceRef,
    candidateRef: candidate.candidateRef,
    evidenceClass,
    retrievedAt: "2026-08-28T01:00:00Z",
    evidenceState: "VALIDATED",
    accessClass: "PUBLIC",
  };
}

const allEvidenceClasses = [
  "PROPERTY_IDENTITY_RECORD",
  "JURISDICTION_RECORD",
  "REGISTERED_DOCUMENT",
  "TITLE_CHAIN_DOCUMENT",
  "ENCUMBRANCE_RECORD",
  "AUTHORITATIVE_SURVEY",
  "MUNICIPAL_PROPERTY_RECORD",
  "SANCTIONED_BUILDING_PLAN",
  "ENGINEERING_AS_BUILT",
  "OCCUPANCY_CERTIFICATE",
  "FIRE_APPROVAL",
  "TENANT_REGISTER",
  "ENGINEERING_UTILITY_REGISTER",
] as const;

function evidenceSet(exclude: readonly string[] = []): CandidateEvidenceV1[] {
  return allEvidenceClasses
    .filter((evidenceClass) => !exclude.includes(evidenceClass))
    .map((evidenceClass, index) => evidence(`EVIDENCE:${index}:${evidenceClass}`, evidenceClass));
}

function requirementsFor(evidenceItems: readonly CandidateEvidenceV1[]) {
  return evaluateEvidenceRequirementsV1({
    candidateRef: candidate.candidateRef,
    assetClass: "MALL",
    jurisdictionRef: candidate.jurisdictionRef,
    evidence: evidenceItems,
  });
}

function allowAdmission(targetRef = candidate.candidateRef): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:ADMIT-001",
    requestRef: "REQUEST:ADMIT-001",
    wardenRef: "WARDEN:ALPHA",
    decision: "ALLOW",
    action: "genesis.node_builder.admit",
    targetRef,
    reasonCodes: ["bounded_policy_allow"],
    constraints: [],
    decidedAt: "2026-08-28T02:00:00Z",
    correlationId: "CORR:ADMIT-001",
    actionToken: "SYNTHETIC-ACTION-TOKEN",
  };
}

describe("Genesis acquisition readiness", () => {
  it("passes G0 from an identity clue but blocks G1 without jurisdiction evidence", () => {
    const snapshot = computeAcquisitionReadinessV1({
      candidate,
      identities,
      evidence: [],
      requirements: requirementsFor([]),
      conflicts: [],
      computedAt: "2026-08-28T02:00:00Z",
    });

    expect(snapshot.gate).toEqual({
      highestPassedGate: "G0",
      blockedAtGate: "G1",
      status: "BLOCKED",
    });
  });

  it("blocks G3 on one mandatory title gap even when evidence coverage exceeds 90 percent", () => {
    const evidenceItems = evidenceSet(["TITLE_CHAIN_DOCUMENT"]);
    const requirements = requirementsFor(evidenceItems);
    const snapshot = computeAcquisitionReadinessV1({
      candidate,
      identities,
      evidence: evidenceItems,
      requirements,
      conflicts: [],
      computedAt: "2026-08-28T02:00:00Z",
    });

    expect(snapshot.evidenceCoverage).toBeGreaterThan(0.9);
    expect(snapshot.gate).toEqual({
      highestPassedGate: "G2",
      blockedAtGate: "G3",
      status: "BLOCKED",
    });
    const titleRequirement = requirements.find(
      (item) => item.requirementClass === "TITLE_CHAIN_EVIDENCE",
    )!;
    expect(snapshot.blockingRequirementRefs).toContain(titleRequirement.requirementRef);
  });

  it("does not let a Warden allow override readiness below G3", () => {
    const evidenceItems = evidenceSet(["TITLE_CHAIN_DOCUMENT"]);
    const readiness = computeAcquisitionReadinessV1({
      candidate,
      identities,
      evidence: evidenceItems,
      requirements: requirementsFor(evidenceItems),
      conflicts: [],
      computedAt: "2026-08-28T02:00:00Z",
    });

    expect(() =>
      admitGenesisCandidateV1({ candidate, readiness, decision: allowAdmission() }),
    ).toThrow("CANDIDATE_NOT_ACQUISITION_READY");
  });

  it("requires a correctly targeted Warden allow to admit a G3-ready candidate", () => {
    const evidenceItems = evidenceSet();
    const readiness = computeAcquisitionReadinessV1({
      candidate,
      identities,
      evidence: evidenceItems,
      requirements: requirementsFor(evidenceItems),
      conflicts: [],
      computedAt: "2026-08-28T02:00:00Z",
    });
    expect(readiness.gate).toEqual({ highestPassedGate: "G3", status: "PASS" });

    const denied: WardenDecisionV1 = {
      decisionRef: "WARDEN-DECISION:DENY",
      requestRef: "REQUEST:DENY",
      wardenRef: "WARDEN:ALPHA",
      decision: "DENY",
      action: "genesis.node_builder.admit",
      targetRef: candidate.candidateRef,
      reasonCodes: ["not_allowed"],
      constraints: [],
      decidedAt: "2026-08-28T02:00:00Z",
      correlationId: "CORR:DENY",
    };

    expect(() => admitGenesisCandidateV1({ candidate, readiness, decision: denied })).toThrow(
      "WARDEN_ADMISSION_NOT_ALLOWED",
    );
    expect(() =>
      admitGenesisCandidateV1({
        candidate,
        readiness,
        decision: { ...allowAdmission(), action: "different.action" },
      }),
    ).toThrow("WARDEN_ADMISSION_ACTION_MISMATCH");
    expect(() =>
      admitGenesisCandidateV1({
        candidate,
        readiness,
        decision: allowAdmission("GENESIS-CANDIDATE:OTHER"),
      }),
    ).toThrow("WARDEN_ADMISSION_TARGET_MISMATCH");

    const admitted = admitGenesisCandidateV1({
      candidate,
      readiness,
      decision: allowAdmission(),
    });
    expect(admitted.lifecycle).toBe("ADMITTED");
    expect(candidate.lifecycle).toBe("DISCOVERED");
  });

  it("produces the same readiness digest regardless of input order", () => {
    const evidenceItems = evidenceSet();
    const requirements = requirementsFor(evidenceItems);
    const first = computeAcquisitionReadinessV1({
      candidate,
      identities,
      evidence: evidenceItems,
      requirements,
      conflicts: [],
      computedAt: "2026-08-28T02:00:00Z",
    });
    const reversed = computeAcquisitionReadinessV1({
      candidate,
      identities: [...identities].reverse(),
      evidence: [...evidenceItems].reverse(),
      requirements: [...requirements].reverse(),
      conflicts: [],
      computedAt: "2026-08-28T02:00:00Z",
    });

    expect(reversed.sourceDigest).toBe(first.sourceDigest);
    expect(reversed.snapshotRef).toBe(first.snapshotRef);
  });
});
