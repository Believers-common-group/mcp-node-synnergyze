import { createHash } from "node:crypto";

import type {
  CandidateClaimStateV1,
  CandidateClaimV1,
  CandidateEvidenceV1,
  ClaimSupersessionEventV1,
  ConfidenceBandV1,
} from "./contracts.ts";

export type EvidenceIngestResultV1 =
  | { state: "INGESTED"; evidence: CandidateEvidenceV1 }
  | { state: "REPLAY"; evidence: CandidateEvidenceV1 };

export type ClaimIngestResultV1 =
  | { state: "INGESTED"; claim: CandidateClaimV1 }
  | { state: "REPLAY"; claim: CandidateClaimV1 };

export interface SupersedeClaimInputV1 {
  priorClaimRef: string;
  claimRef: string;
  sourceEvidenceRefs: readonly string[];
  value: string;
  claimState: Exclude<CandidateClaimStateV1, "SUPERSEDED">;
  confidenceBand: ConfidenceBandV1;
  supersededAt: string;
  valueUnit?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

interface StoredEvidenceV1 {
  digest: string;
  evidence: CandidateEvidenceV1;
}

interface StoredClaimV1 {
  digest: string;
  claim: CandidateClaimV1;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function cloneEvidence(evidence: CandidateEvidenceV1): CandidateEvidenceV1 {
  return { ...evidence };
}

function cloneClaim(claim: CandidateClaimV1): CandidateClaimV1 {
  return { ...claim, sourceEvidenceRefs: [...claim.sourceEvidenceRefs] };
}

function cloneSupersessionEvent(event: ClaimSupersessionEventV1): ClaimSupersessionEventV1 {
  return { ...event };
}

function canonicalEvidence(evidence: CandidateEvidenceV1): string {
  return JSON.stringify({
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
  });
}

function normalizedClaim(claim: CandidateClaimV1): CandidateClaimV1 {
  return {
    ...claim,
    sourceEvidenceRefs: stableUnique(claim.sourceEvidenceRefs),
  };
}

function canonicalClaim(claim: CandidateClaimV1): string {
  const normalized = normalizedClaim(claim);
  return JSON.stringify({
    claimRef: normalized.claimRef,
    candidateRef: normalized.candidateRef,
    claimType: normalized.claimType,
    subjectRef: normalized.subjectRef,
    predicate: normalized.predicate,
    value: normalized.value,
    valueUnit: normalized.valueUnit ?? null,
    effectiveFrom: normalized.effectiveFrom ?? null,
    effectiveUntil: normalized.effectiveUntil ?? null,
    sourceEvidenceRefs: normalized.sourceEvidenceRefs,
    claimState: normalized.claimState,
    confidenceBand: normalized.confidenceBand,
    supersedesClaimRef: normalized.supersedesClaimRef ?? null,
  });
}

export class CandidateClaimEngineV1 {
  private readonly evidenceByRef = new Map<string, StoredEvidenceV1>();
  private readonly claimsByRef = new Map<string, StoredClaimV1>();
  private readonly supersessionByPriorClaimRef = new Map<string, ClaimSupersessionEventV1>();

  ingestEvidenceV1(input: CandidateEvidenceV1): EvidenceIngestResultV1 {
    const evidence = cloneEvidence(input);
    const digest = sha256(canonicalEvidence(evidence));
    const existing = this.evidenceByRef.get(evidence.evidenceRef);

    if (existing) {
      if (existing.digest !== digest) {
        throw new Error("EVIDENCE_IDEMPOTENCY_CONFLICT");
      }
      return { state: "REPLAY", evidence: cloneEvidence(existing.evidence) };
    }

    this.evidenceByRef.set(evidence.evidenceRef, { digest, evidence });
    return { state: "INGESTED", evidence: cloneEvidence(evidence) };
  }

  ingestClaimV1(input: CandidateClaimV1): ClaimIngestResultV1 {
    const claim = normalizedClaim(input);
    const digest = sha256(canonicalClaim(claim));
    const existing = this.claimsByRef.get(claim.claimRef);

    if (existing) {
      if (existing.digest !== digest) {
        throw new Error("CLAIM_IDEMPOTENCY_CONFLICT");
      }
      return { state: "REPLAY", claim: cloneClaim(existing.claim) };
    }

    this.claimsByRef.set(claim.claimRef, { digest, claim });
    return { state: "INGESTED", claim: cloneClaim(claim) };
  }

  supersedeClaimV1(input: SupersedeClaimInputV1): CandidateClaimV1 {
    const priorStored = this.claimsByRef.get(input.priorClaimRef);
    if (!priorStored) {
      throw new Error("PRIOR_CLAIM_NOT_FOUND");
    }
    if (this.supersessionByPriorClaimRef.has(input.priorClaimRef)) {
      throw new Error("PRIOR_CLAIM_ALREADY_SUPERSEDED");
    }
    if (this.claimsByRef.has(input.claimRef)) {
      throw new Error("SUPERSEDING_CLAIM_REF_EXISTS");
    }

    const nextClaim: CandidateClaimV1 = normalizedClaim({
      claimRef: input.claimRef,
      candidateRef: priorStored.claim.candidateRef,
      claimType: priorStored.claim.claimType,
      subjectRef: priorStored.claim.subjectRef,
      predicate: priorStored.claim.predicate,
      value: input.value,
      valueUnit: input.valueUnit ?? priorStored.claim.valueUnit,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil,
      sourceEvidenceRefs: input.sourceEvidenceRefs,
      claimState: input.claimState,
      confidenceBand: input.confidenceBand,
      supersedesClaimRef: priorStored.claim.claimRef,
    });
    this.claimsByRef.set(nextClaim.claimRef, {
      digest: sha256(canonicalClaim(nextClaim)),
      claim: nextClaim,
    });

    const sourceDigest = sha256(
      JSON.stringify({
        candidateRef: priorStored.claim.candidateRef,
        priorClaimRef: priorStored.claim.claimRef,
        supersedingClaimRef: nextClaim.claimRef,
        supersededAt: input.supersededAt,
      }),
    );
    const supersessionEvent: ClaimSupersessionEventV1 = {
      eventRef: `GENESIS-CLAIM-SUPERSESSION:${sourceDigest.slice(0, 24)}`,
      candidateRef: priorStored.claim.candidateRef,
      priorClaimRef: priorStored.claim.claimRef,
      supersedingClaimRef: nextClaim.claimRef,
      supersededAt: input.supersededAt,
      sourceDigest,
    };
    this.supersessionByPriorClaimRef.set(priorStored.claim.claimRef, supersessionEvent);

    return cloneClaim(nextClaim);
  }

  listClaimsV1(candidateRef: string): readonly CandidateClaimV1[] {
    return [...this.claimsByRef.values()]
      .map((stored) => stored.claim)
      .filter((claim) => claim.candidateRef === candidateRef)
      .sort((left, right) => left.claimRef.localeCompare(right.claimRef))
      .map((claim) =>
        this.supersessionByPriorClaimRef.has(claim.claimRef)
          ? cloneClaim({ ...claim, claimState: "SUPERSEDED" })
          : cloneClaim(claim),
      );
  }

  listSupersessionEventsV1(candidateRef: string): readonly ClaimSupersessionEventV1[] {
    return [...this.supersessionByPriorClaimRef.values()]
      .filter((event) => event.candidateRef === candidateRef)
      .sort((left, right) => left.eventRef.localeCompare(right.eventRef))
      .map(cloneSupersessionEvent);
  }

  listEvidenceV1(candidateRef: string): readonly CandidateEvidenceV1[] {
    return [...this.evidenceByRef.values()]
      .map((stored) => stored.evidence)
      .filter((evidence) => evidence.candidateRef === candidateRef)
      .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef))
      .map(cloneEvidence);
  }
}
