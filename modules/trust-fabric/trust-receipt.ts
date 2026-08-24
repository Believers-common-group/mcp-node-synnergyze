import { createHash } from "node:crypto";

import type { AssuranceVectorV1 } from "./resolver.ts";

export interface TrustReceiptInputV1 {
  receiptType: string;
  subjectRef: string;
  objectRef?: string;
  relationshipRef?: string;
  issuerRef: string;
  verifierRef: string;
  claim: Readonly<Record<string, unknown>>;
  assurance: AssuranceVectorV1;
  policyRef: string;
  evidenceRefs: readonly string[];
  issuedAt: string;
  validFrom: string;
  validUntil?: string;
  supersedesReceiptRef?: string;
  disclosurePolicyRef?: string;
  riverEventRef: string;
}

export interface TrustReceiptV1 extends TrustReceiptInputV1 {
  receiptRef: string;
  evidenceRefs: readonly string[];
  claim: Readonly<Record<string, unknown>>;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]);
    return Object.fromEntries(entries);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error("trust_receipt_claim_not_json_serializable");
}

function canonicalRefs(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function requireRef(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

export function createTrustReceiptV1(input: TrustReceiptInputV1): TrustReceiptV1 {
  const receiptType = requireRef(input.receiptType, "trust_receipt_type_required");
  const subjectRef = requireRef(input.subjectRef, "trust_receipt_subject_required");
  const issuerRef = requireRef(input.issuerRef, "trust_receipt_issuer_required");
  const verifierRef = requireRef(input.verifierRef, "trust_receipt_verifier_required");
  const policyRef = requireRef(input.policyRef, "trust_receipt_policy_required");
  const riverEventRef = requireRef(input.riverEventRef, "trust_receipt_river_event_required");
  const evidenceRefs = canonicalRefs(input.evidenceRefs);
  if (evidenceRefs.length === 0) throw new Error("trust_receipt_evidence_required");

  const issuedAtMs = parseInstant(input.issuedAt, "trust_receipt_issued_at_invalid");
  const validFromMs = parseInstant(input.validFrom, "trust_receipt_valid_from_invalid");
  const validUntilMs = input.validUntil
    ? parseInstant(input.validUntil, "trust_receipt_valid_until_invalid")
    : undefined;
  if (validUntilMs !== undefined && validUntilMs < validFromMs) {
    throw new Error("trust_receipt_validity_regression");
  }
  if (issuedAtMs > validFromMs && validUntilMs !== undefined && issuedAtMs > validUntilMs) {
    throw new Error("trust_receipt_issued_after_expiry");
  }

  const claim = canonicalize(input.claim) as Readonly<Record<string, unknown>>;
  const canonicalIdentity = JSON.stringify(
    canonicalize({
      receiptType,
      subjectRef,
      objectRef: input.objectRef?.trim() || null,
      relationshipRef: input.relationshipRef?.trim() || null,
      issuerRef,
      verifierRef,
      claim,
      assurance: input.assurance,
      policyRef,
      evidenceRefs,
      issuedAt: input.issuedAt,
      validFrom: input.validFrom,
      validUntil: input.validUntil ?? null,
      supersedesReceiptRef: input.supersedesReceiptRef?.trim() || null,
      disclosurePolicyRef: input.disclosurePolicyRef?.trim() || null,
      riverEventRef,
    }),
  );
  const receiptRef = `TRUST-RECEIPT:${digest(canonicalIdentity).slice(0, 32)}`;

  if (input.supersedesReceiptRef?.trim() === receiptRef) {
    throw new Error("trust_receipt_self_supersession_forbidden");
  }

  return {
    receiptRef,
    receiptType,
    subjectRef,
    objectRef: input.objectRef?.trim() || undefined,
    relationshipRef: input.relationshipRef?.trim() || undefined,
    issuerRef,
    verifierRef,
    claim,
    assurance: { ...input.assurance },
    policyRef,
    evidenceRefs,
    issuedAt: input.issuedAt,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    supersedesReceiptRef: input.supersedesReceiptRef?.trim() || undefined,
    disclosurePolicyRef: input.disclosurePolicyRef?.trim() || undefined,
    riverEventRef,
  };
}
