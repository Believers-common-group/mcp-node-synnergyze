import { createHash } from "node:crypto";

import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  AcquisitionGateV1,
  AcquisitionReadinessSnapshotV1,
  CandidateConflictV1,
  CandidateEvidenceV1,
  CandidateIdentityV1,
  EvidenceRequirementV1,
  GenesisCandidateV1,
} from "./contracts.ts";

export interface ComputeReadinessInputV1 {
  candidate: GenesisCandidateV1;
  identities: readonly CandidateIdentityV1[];
  evidence: readonly CandidateEvidenceV1[];
  requirements: readonly EvidenceRequirementV1[];
  conflicts: readonly CandidateConflictV1[];
  computedAt: string;
}

export interface AdmitCandidateInputV1 {
  candidate: GenesisCandidateV1;
  readiness: AcquisitionReadinessSnapshotV1;
  decision: WardenDecisionV1;
}

const gateRank: Readonly<Record<AcquisitionGateV1, number>> = {
  G0: 0,
  G1: 1,
  G2: 2,
  G3: 3,
  G4: 4,
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function requirementCovered(requirement: EvidenceRequirementV1): boolean {
  return requirement.status === "SATISFIED" || requirement.status === "WAIVED_BY_WARDEN";
}

function requirementsCoveredThrough(
  requirements: readonly EvidenceRequirementV1[],
  gate: Exclude<AcquisitionGateV1, "G4">,
): boolean {
  return requirements
    .filter((requirement) => requirement.status !== "NOT_APPLICABLE")
    .filter((requirement) => gateRank[requirement.mandatoryForGate] <= gateRank[gate])
    .every(requirementCovered);
}

function canonicalCandidate(candidate: GenesisCandidateV1) {
  return {
    ...candidate,
    sourceEvidenceRefs: stableUnique(candidate.sourceEvidenceRefs),
  };
}

function canonicalIdentity(identity: CandidateIdentityV1) {
  return {
    ...identity,
    sourceEvidenceRefs: stableUnique(identity.sourceEvidenceRefs),
  };
}

function canonicalEvidence(evidence: CandidateEvidenceV1) {
  return {
    evidenceRef: evidence.evidenceRef,
    candidateRef: evidence.candidateRef,
    evidenceClass: evidence.evidenceClass,
    sourceAuthorityRef: evidence.sourceAuthorityRef ?? null,
    sourceSystemRef: evidence.sourceSystemRef ?? null,
    documentRef: evidence.documentRef ?? null,
    retrievedAt: evidence.retrievedAt,
    effectiveAt: evidence.effectiveAt ?? null,
    evidenceState: evidence.evidenceState,
    contentDigest: evidence.contentDigest ?? null,
    accessClass: evidence.accessClass,
    sourceLocatorRef: evidence.sourceLocatorRef ?? null,
  };
}

function canonicalRequirement(requirement: EvidenceRequirementV1) {
  return {
    requirementRef: requirement.requirementRef,
    candidateRef: requirement.candidateRef,
    requirementClass: requirement.requirementClass,
    category: requirement.category,
    assetClass: requirement.assetClass,
    jurisdictionRef: requirement.jurisdictionRef,
    mandatoryForGate: requirement.mandatoryForGate,
    waivable: requirement.waivable,
    acceptableEvidenceClasses: [...requirement.acceptableEvidenceClasses].sort(),
    status: requirement.status,
    reasonCode: requirement.reasonCode,
    satisfiedByEvidenceRefs: stableUnique(requirement.satisfiedByEvidenceRefs),
    waiverDecisionRef: requirement.waiverDecisionRef ?? null,
  };
}

function canonicalConflict(conflict: CandidateConflictV1) {
  return {
    conflictRef: conflict.conflictRef,
    candidateRef: conflict.candidateRef,
    claimRefs: stableUnique(conflict.claimRefs),
    identityRefs: stableUnique(conflict.identityRefs ?? []),
    evidenceRefs: stableUnique(conflict.evidenceRefs),
    classification: conflict.classification,
    severity: conflict.severity,
    resolutionState: conflict.resolutionState,
    requiredReviewCapabilityRef: conflict.requiredReviewCapabilityRef,
  };
}

function assertCandidateLineage(input: ComputeReadinessInputV1): void {
  const candidateRef = input.candidate.candidateRef;
  if (input.identities.some((identity) => identity.candidateRef !== candidateRef)) {
    throw new Error("READINESS_IDENTITY_CANDIDATE_MISMATCH");
  }
  if (input.evidence.some((evidence) => evidence.candidateRef !== candidateRef)) {
    throw new Error("READINESS_EVIDENCE_CANDIDATE_MISMATCH");
  }
  if (input.requirements.some((requirement) => requirement.candidateRef !== candidateRef)) {
    throw new Error("READINESS_REQUIREMENT_CANDIDATE_MISMATCH");
  }
  if (input.conflicts.some((conflict) => conflict.candidateRef !== candidateRef)) {
    throw new Error("READINESS_CONFLICT_CANDIDATE_MISMATCH");
  }
}

export function computeAcquisitionReadinessV1(
  input: ComputeReadinessInputV1,
): AcquisitionReadinessSnapshotV1 {
  assertCandidateLineage(input);

  const applicableRequirements = input.requirements.filter(
    (requirement) => requirement.status !== "NOT_APPLICABLE",
  );
  const coveredRequirements = applicableRequirements.filter(requirementCovered);
  const evidenceCoverage =
    applicableRequirements.length === 0
      ? 0
      : coveredRequirements.length / applicableRequirements.length;

  const categoryNames = stableUnique(applicableRequirements.map((requirement) => requirement.category));
  const categoryScores: Record<string, number> = {};
  for (const category of categoryNames) {
    const categoryRequirements = applicableRequirements.filter(
      (requirement) => requirement.category === category,
    );
    const categoryCovered = categoryRequirements.filter(requirementCovered);
    categoryScores[category] =
      categoryRequirements.length === 0 ? 0 : categoryCovered.length / categoryRequirements.length;
  }

  const openBlockingConflicts = input.conflicts.filter(
    (conflict) => conflict.resolutionState === "OPEN" && conflict.severity === "BLOCKING",
  );
  const blockingIdentityConflict = openBlockingConflicts.some(
    (conflict) => conflict.classification === "IDENTITY_CONFLICT",
  );

  const g0 = input.identities.length > 0;
  const g1 =
    g0 &&
    Boolean(input.candidate.jurisdictionRef.trim()) &&
    requirementsCoveredThrough(input.requirements, "G1") &&
    !blockingIdentityConflict;
  const g2 = g1 && requirementsCoveredThrough(input.requirements, "G2");
  const g3 =
    g2 &&
    requirementsCoveredThrough(input.requirements, "G3") &&
    openBlockingConflicts.length === 0;

  const gate = (() => {
    if (!g0) {
      return { highestPassedGate: "NONE", blockedAtGate: "G0", status: "BLOCKED" } as const;
    }
    if (!g1) {
      return { highestPassedGate: "G0", blockedAtGate: "G1", status: "BLOCKED" } as const;
    }
    if (!g2) {
      return { highestPassedGate: "G1", blockedAtGate: "G2", status: "BLOCKED" } as const;
    }
    if (!g3) {
      return { highestPassedGate: "G2", blockedAtGate: "G3", status: "BLOCKED" } as const;
    }
    return { highestPassedGate: "G3", status: "PASS" } as const;
  })();

  const blockingRequirementRefs = stableUnique(
    applicableRequirements
      .filter((requirement) => gateRank[requirement.mandatoryForGate] <= gateRank.G3)
      .filter((requirement) => !requirementCovered(requirement))
      .map((requirement) => requirement.requirementRef),
  );
  const blockingConflictRefs = stableUnique(
    openBlockingConflicts.map((conflict) => conflict.conflictRef),
  );

  const sourceDigest = sha256(
    JSON.stringify({
      candidate: canonicalCandidate(input.candidate),
      identities: [...input.identities]
        .sort((left, right) => left.identityRef.localeCompare(right.identityRef))
        .map(canonicalIdentity),
      evidence: [...input.evidence]
        .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef))
        .map(canonicalEvidence),
      requirements: [...input.requirements]
        .sort((left, right) => left.requirementRef.localeCompare(right.requirementRef))
        .map(canonicalRequirement),
      conflicts: [...input.conflicts]
        .sort((left, right) => left.conflictRef.localeCompare(right.conflictRef))
        .map(canonicalConflict),
    }),
  );
  const snapshotRef = `GENESIS-READINESS:${sha256(
    JSON.stringify({
      candidateRef: input.candidate.candidateRef,
      sourceDigest,
      gate,
      blockingRequirementRefs,
      blockingConflictRefs,
      evidenceCoverage,
      categoryScores,
      computedAt: input.computedAt,
    }),
  ).slice(0, 24)}`;

  return {
    snapshotRef,
    candidateRef: input.candidate.candidateRef,
    gate,
    categoryScores,
    blockingRequirementRefs,
    blockingConflictRefs,
    evidenceCoverage,
    computedAt: input.computedAt,
    sourceDigest,
    projectionOnly: true,
  };
}

export function admitGenesisCandidateV1(input: AdmitCandidateInputV1): GenesisCandidateV1 {
  if (input.readiness.candidateRef !== input.candidate.candidateRef) {
    throw new Error("READINESS_CANDIDATE_MISMATCH");
  }
  if (
    input.readiness.gate.highestPassedGate !== "G3" ||
    input.readiness.gate.status !== "PASS"
  ) {
    throw new Error("CANDIDATE_NOT_ACQUISITION_READY");
  }
  if (input.decision.decision !== "ALLOW") {
    throw new Error("WARDEN_ADMISSION_NOT_ALLOWED");
  }
  if (input.decision.action !== "genesis.node_builder.admit") {
    throw new Error("WARDEN_ADMISSION_ACTION_MISMATCH");
  }
  if (input.decision.targetRef !== input.candidate.candidateRef) {
    throw new Error("WARDEN_ADMISSION_TARGET_MISMATCH");
  }

  return {
    ...input.candidate,
    sourceEvidenceRefs: [...input.candidate.sourceEvidenceRefs],
    lifecycle: "ADMITTED",
  };
}
