import { createHash } from "node:crypto";

import type {
  GovernedEvidenceArtifactTypeV1,
  GovernedEvidenceArtifactV1,
} from "./contracts.ts";

export interface GovernedEvidenceArtifactInputV1 {
  artifactType: GovernedEvidenceArtifactTypeV1;
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  contentDigest: string;
  observedAt?: string;
  derivedAt?: string;
  issuedAt?: string;
  validUntil?: string;
  correlationId: string;
  supersedesArtifactRef?: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function assertTimestamp(value: string | undefined): void {
  if (value === undefined) return;
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("governed evidence timestamp is invalid");
  }
}

export function buildGovernedEvidenceArtifactV1(
  input: GovernedEvidenceArtifactInputV1,
): GovernedEvidenceArtifactV1 {
  const sourceRefs = stableUnique(input.sourceRefs);
  const evidenceRefs = stableUnique(input.evidenceRefs);
  if (sourceRefs.length === 0) {
    throw new Error("governed evidence source refs are required");
  }
  if (evidenceRefs.length === 0) {
    throw new Error("governed evidence evidence refs are required");
  }
  if (!input.contentDigest.trim()) {
    throw new Error("governed evidence content digest is required");
  }
  if (!input.correlationId.trim()) {
    throw new Error("governed evidence correlation id is required");
  }

  assertTimestamp(input.observedAt);
  assertTimestamp(input.derivedAt);
  assertTimestamp(input.issuedAt);
  assertTimestamp(input.validUntil);

  const canonical = {
    artifactType: input.artifactType,
    sourceRefs,
    evidenceRefs,
    contentDigest: input.contentDigest,
    observedAt: input.observedAt ?? null,
    derivedAt: input.derivedAt ?? null,
    issuedAt: input.issuedAt ?? null,
    validUntil: input.validUntil ?? null,
    correlationId: input.correlationId,
    supersedesArtifactRef: input.supersedesArtifactRef ?? null,
  };
  const artifactRef = `RIVER-GOVERNED-EVIDENCE:${sha256(JSON.stringify(canonical)).slice(0, 24)}`;

  return {
    artifactRef,
    artifactType: input.artifactType,
    sourceRefs,
    evidenceRefs,
    contentDigest: input.contentDigest,
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    ...(input.derivedAt ? { derivedAt: input.derivedAt } : {}),
    ...(input.issuedAt ? { issuedAt: input.issuedAt } : {}),
    ...(input.validUntil ? { validUntil: input.validUntil } : {}),
    correlationId: input.correlationId,
    ...(input.supersedesArtifactRef
      ? { supersedesArtifactRef: input.supersedesArtifactRef }
      : {}),
  };
}
