import { createHash } from "node:crypto";

import type {
  CandidateIdentityKindV1,
  CandidateIdentityV1,
  GenesisAssetClassV1,
  GenesisCandidateV1,
} from "./contracts.ts";

export interface CreateCandidateInputV1 {
  displayName: string;
  jurisdictionRef: string;
  assetClass: GenesisAssetClassV1;
  createdAt: string;
  correlationId: string;
  sourceEvidenceRefs: readonly string[];
}

export type CandidateCreateResultV1 =
  | { state: "CREATED"; candidate: GenesisCandidateV1 }
  | { state: "REPLAY"; candidate: GenesisCandidateV1 };

export interface AddCandidateIdentityInputV1 {
  candidateRef: string;
  kind: CandidateIdentityKindV1;
  normalizedValue: string;
  sourceEvidenceRefs: readonly string[];
  observedAt: string;
}

export type CandidateIdentityResultV1 =
  | { state: "ADDED"; identity: CandidateIdentityV1 }
  | { state: "REPLAY"; identity: CandidateIdentityV1 };

interface StoredCandidateV1 {
  inputDigest: string;
  candidate: GenesisCandidateV1;
}

interface StoredIdentityV1 {
  inputDigest: string;
  identity: CandidateIdentityV1;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function cloneCandidate(candidate: GenesisCandidateV1): GenesisCandidateV1 {
  return { ...candidate, sourceEvidenceRefs: [...candidate.sourceEvidenceRefs] };
}

function cloneIdentity(identity: CandidateIdentityV1): CandidateIdentityV1 {
  return { ...identity, sourceEvidenceRefs: [...identity.sourceEvidenceRefs] };
}

export class GenesisCandidateStoreV1 {
  private readonly candidatesByRef = new Map<string, StoredCandidateV1>();
  private readonly candidateByCorrelationId = new Map<string, StoredCandidateV1>();
  private readonly identitiesByRef = new Map<string, StoredIdentityV1>();
  private readonly identityRefsByCandidate = new Map<string, Set<string>>();

  createCandidateV1(input: CreateCandidateInputV1): CandidateCreateResultV1 {
    const sourceEvidenceRefs = stableUnique(input.sourceEvidenceRefs);
    const canonicalInput = JSON.stringify({
      displayName: input.displayName.trim(),
      jurisdictionRef: input.jurisdictionRef.trim(),
      assetClass: input.assetClass,
      createdAt: input.createdAt,
      correlationId: input.correlationId.trim(),
      sourceEvidenceRefs,
    });
    const inputDigest = sha256(canonicalInput);
    const existing = this.candidateByCorrelationId.get(input.correlationId.trim());

    if (existing) {
      if (existing.inputDigest !== inputDigest) {
        throw new Error("CANDIDATE_IDEMPOTENCY_CONFLICT");
      }
      return { state: "REPLAY", candidate: cloneCandidate(existing.candidate) };
    }

    const candidate: GenesisCandidateV1 = {
      candidateRef: `GENESIS-CANDIDATE:${inputDigest.slice(0, 24)}`,
      candidateType: "PROPERTY",
      displayName: input.displayName.trim(),
      jurisdictionRef: input.jurisdictionRef.trim(),
      assetClass: input.assetClass,
      lifecycle: "DISCOVERED",
      createdAt: input.createdAt,
      sourceEvidenceRefs,
      correlationId: input.correlationId.trim(),
    };
    const stored = { inputDigest, candidate };
    this.candidatesByRef.set(candidate.candidateRef, stored);
    this.candidateByCorrelationId.set(candidate.correlationId, stored);
    return { state: "CREATED", candidate: cloneCandidate(candidate) };
  }

  addCandidateIdentityV1(input: AddCandidateIdentityInputV1): CandidateIdentityResultV1 {
    if (!this.candidatesByRef.has(input.candidateRef)) {
      throw new Error("CANDIDATE_NOT_FOUND");
    }

    const normalizedValue = input.normalizedValue.trim();
    if (!normalizedValue) {
      throw new Error("IDENTITY_VALUE_REQUIRED");
    }

    const sourceEvidenceRefs = stableUnique(input.sourceEvidenceRefs);
    const identitySeed = JSON.stringify({
      candidateRef: input.candidateRef,
      kind: input.kind,
      normalizedValue,
      sourceEvidenceRefs,
    });
    const identityRef = `GENESIS-IDENTITY:${sha256(identitySeed).slice(0, 24)}`;
    const canonicalInput = JSON.stringify({
      candidateRef: input.candidateRef,
      kind: input.kind,
      normalizedValue,
      sourceEvidenceRefs,
      observedAt: input.observedAt,
    });
    const inputDigest = sha256(canonicalInput);
    const existing = this.identitiesByRef.get(identityRef);

    if (existing) {
      if (existing.inputDigest !== inputDigest) {
        throw new Error("IDENTITY_IDEMPOTENCY_CONFLICT");
      }
      return { state: "REPLAY", identity: cloneIdentity(existing.identity) };
    }

    const identity: CandidateIdentityV1 = {
      identityRef,
      candidateRef: input.candidateRef,
      kind: input.kind,
      normalizedValue,
      sourceEvidenceRefs,
      observedAt: input.observedAt,
    };
    this.identitiesByRef.set(identityRef, { inputDigest, identity });
    const refs = this.identityRefsByCandidate.get(input.candidateRef) ?? new Set<string>();
    refs.add(identityRef);
    this.identityRefsByCandidate.set(input.candidateRef, refs);
    return { state: "ADDED", identity: cloneIdentity(identity) };
  }

  getCandidateV1(candidateRef: string): GenesisCandidateV1 | undefined {
    const stored = this.candidatesByRef.get(candidateRef);
    return stored ? cloneCandidate(stored.candidate) : undefined;
  }

  listCandidateIdentitiesV1(candidateRef: string): readonly CandidateIdentityV1[] {
    const refs = [...(this.identityRefsByCandidate.get(candidateRef) ?? [])].sort();
    return refs.map((ref) => cloneIdentity(this.identitiesByRef.get(ref)!.identity));
  }
}
