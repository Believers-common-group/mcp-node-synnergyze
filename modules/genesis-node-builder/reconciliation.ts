import { createHash } from "node:crypto";

import type {
  CandidateClaimV1,
  CandidateConflictClassificationV1,
  CandidateConflictV1,
  CandidateIdentityV1,
} from "./contracts.ts";

export interface ReconcileCandidateInputV1 {
  candidateRef: string;
  claims: readonly CandidateClaimV1[];
  identities: readonly CandidateIdentityV1[];
}

export interface CandidateReconciliationResultV1 {
  reconciliationRef: string;
  candidateRef: string;
  conflicts: readonly CandidateConflictV1[];
  reconciledClaimRefs: readonly string[];
  sourceDigest: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function classificationForPredicate(predicate: string): CandidateConflictClassificationV1 {
  const normalized = predicate.toLowerCase();
  if (normalized.includes("boundary")) return "BOUNDARY_CONFLICT";
  if (normalized.includes("area")) return "AREA_CONFLICT";
  if (normalized.includes("party") || normalized.includes("owner")) return "PARTY_CONFLICT";
  if (normalized.includes("approval")) return "APPROVAL_CONFLICT";
  if (normalized.includes("use")) return "USE_CONFLICT";
  return "EVIDENCE_INSUFFICIENT";
}

function canonicalClaim(claim: CandidateClaimV1) {
  return {
    claimRef: claim.claimRef,
    candidateRef: claim.candidateRef,
    claimType: claim.claimType,
    subjectRef: claim.subjectRef,
    predicate: claim.predicate,
    value: claim.value,
    valueUnit: claim.valueUnit ?? null,
    effectiveFrom: claim.effectiveFrom ?? null,
    effectiveUntil: claim.effectiveUntil ?? null,
    sourceEvidenceRefs: stableUnique(claim.sourceEvidenceRefs),
    claimState: claim.claimState,
    confidenceBand: claim.confidenceBand,
    supersedesClaimRef: claim.supersedesClaimRef ?? null,
  };
}

function canonicalIdentity(identity: CandidateIdentityV1) {
  return {
    identityRef: identity.identityRef,
    candidateRef: identity.candidateRef,
    kind: identity.kind,
    normalizedValue: identity.normalizedValue,
    sourceEvidenceRefs: stableUnique(identity.sourceEvidenceRefs),
    observedAt: identity.observedAt,
  };
}

export function reconcileCandidateClaimsV1(
  input: ReconcileCandidateInputV1,
): CandidateReconciliationResultV1 {
  for (const claim of input.claims) {
    if (claim.candidateRef !== input.candidateRef) {
      throw new Error("RECONCILIATION_CANDIDATE_MISMATCH");
    }
  }
  for (const identity of input.identities) {
    if (identity.candidateRef !== input.candidateRef) {
      throw new Error("RECONCILIATION_CANDIDATE_MISMATCH");
    }
  }

  const activeClaims = input.claims
    .filter((claim) => claim.claimState !== "SUPERSEDED" && claim.claimState !== "REJECTED")
    .sort((left, right) => left.claimRef.localeCompare(right.claimRef));
  const identities = [...input.identities].sort((left, right) =>
    left.identityRef.localeCompare(right.identityRef),
  );

  const sourceDigest = sha256(
    JSON.stringify({
      candidateRef: input.candidateRef,
      claims: activeClaims.map(canonicalClaim),
      identities: identities.map(canonicalIdentity),
    }),
  );

  const conflicts: CandidateConflictV1[] = [];
  const reconciledClaimRefs: string[] = [];
  const claimGroups = new Map<string, CandidateClaimV1[]>();

  for (const claim of activeClaims) {
    const key = `${claim.subjectRef}|${claim.predicate}`;
    const group = claimGroups.get(key) ?? [];
    group.push(claim);
    claimGroups.set(key, group);
  }

  for (const [key, group] of [...claimGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const values = stableUnique(group.map((claim) => claim.value));
    if (values.length <= 1) {
      reconciledClaimRefs.push(...group.map((claim) => claim.claimRef));
      continue;
    }

    const classification: CandidateConflictClassificationV1 = group.some(
      (claim) => claim.claimType === "IDENTITY",
    )
      ? "IDENTITY_CONFLICT"
      : classificationForPredicate(group[0].predicate);
    const authoritativeCount = group.filter(
      (claim) => claim.claimState === "AUTHORITATIVELY_VERIFIED",
    ).length;
    const claimRefs = stableUnique(group.map((claim) => claim.claimRef));
    const evidenceRefs = stableUnique(group.flatMap((claim) => claim.sourceEvidenceRefs));
    const severity =
      classification === "IDENTITY_CONFLICT" || authoritativeCount >= 2 ? "BLOCKING" : "REVIEW";
    const conflictSeed = JSON.stringify({
      candidateRef: input.candidateRef,
      key,
      classification,
      claimRefs,
      evidenceRefs,
      values,
      severity,
    });

    conflicts.push({
      conflictRef: `GENESIS-CONFLICT:${sha256(conflictSeed).slice(0, 24)}`,
      candidateRef: input.candidateRef,
      claimRefs,
      evidenceRefs,
      classification,
      severity,
      resolutionState: "OPEN",
      requiredReviewCapabilityRef: "genesis.node_builder.conflict.review",
    });
  }

  conflicts.sort((left, right) => left.conflictRef.localeCompare(right.conflictRef));
  const reconciliationRef = `GENESIS-RECONCILIATION:${sha256(
    JSON.stringify({
      candidateRef: input.candidateRef,
      sourceDigest,
      conflictRefs: conflicts.map((conflict) => conflict.conflictRef),
      reconciledClaimRefs: stableUnique(reconciledClaimRefs),
    }),
  ).slice(0, 24)}`;

  return {
    reconciliationRef,
    candidateRef: input.candidateRef,
    conflicts,
    reconciledClaimRefs: stableUnique(reconciledClaimRefs),
    sourceDigest,
  };
}
