import { createHash } from "node:crypto";

export type TrustReceiptStatusV1 =
  | "CURRENT"
  | "SUPERSEDED"
  | "REVOKED"
  | "EXPIRED"
  | "SUSPENDED"
  | "DISPUTED"
  | "COMPROMISED"
  | "UNKNOWN";

export interface TrustReceiptStatusEventInputV1 {
  receiptRef: string;
  status: TrustReceiptStatusV1;
  reasonCode: string;
  authorityRef: string;
  verifierRef?: string;
  evidenceRefs: readonly string[];
  effectiveAt: string;
  observedAt: string;
  supersedingReceiptRef?: string;
  riverEventRef: string;
}

export interface TrustReceiptStatusEventV1 extends TrustReceiptStatusEventInputV1 {
  statusEventRef: string;
  evidenceRefs: readonly string[];
}

const statusValues = new Set<TrustReceiptStatusV1>([
  "CURRENT",
  "SUPERSEDED",
  "REVOKED",
  "EXPIRED",
  "SUSPENDED",
  "DISPUTED",
  "COMPROMISED",
  "UNKNOWN",
]);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireText(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function canonicalRefs(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

export function createTrustReceiptStatusEventV1(
  input: TrustReceiptStatusEventInputV1,
): TrustReceiptStatusEventV1 {
  const receiptRef = requireText(input.receiptRef, "trust_receipt_status_receipt_required");
  if (!statusValues.has(input.status)) throw new Error("trust_receipt_status_invalid");
  const reasonCode = requireText(input.reasonCode, "trust_receipt_status_reason_required");
  const authorityRef = requireText(input.authorityRef, "trust_receipt_status_authority_required");
  const riverEventRef = requireText(input.riverEventRef, "trust_receipt_status_river_event_required");
  const evidenceRefs = canonicalRefs(input.evidenceRefs);
  if (evidenceRefs.length === 0) throw new Error("trust_receipt_status_evidence_required");

  const effectiveAtMs = parseInstant(input.effectiveAt, "trust_receipt_status_effective_at_invalid");
  const observedAtMs = parseInstant(input.observedAt, "trust_receipt_status_observed_at_invalid");
  if (input.status !== "UNKNOWN" && observedAtMs < effectiveAtMs) {
    throw new Error("trust_receipt_status_observed_before_effective");
  }

  const supersedingReceiptRef = input.supersedingReceiptRef?.trim() || undefined;
  if (input.status === "SUPERSEDED") {
    if (!supersedingReceiptRef) {
      throw new Error("trust_receipt_status_superseding_receipt_required");
    }
    if (supersedingReceiptRef === receiptRef) {
      throw new Error("trust_receipt_status_superseding_receipt_must_be_distinct");
    }
  } else if (supersedingReceiptRef) {
    throw new Error("trust_receipt_status_superseding_receipt_only_for_supersession");
  }

  const verifierRef = input.verifierRef?.trim() || undefined;
  const canonicalIdentity = JSON.stringify({
    receiptRef,
    status: input.status,
    reasonCode,
    authorityRef,
    verifierRef: verifierRef ?? null,
    evidenceRefs,
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    supersedingReceiptRef: supersedingReceiptRef ?? null,
    riverEventRef,
  });
  const statusEventRef = `TRUST-RECEIPT-STATUS:${digest(canonicalIdentity).slice(0, 32)}`;

  return {
    statusEventRef,
    receiptRef,
    status: input.status,
    reasonCode,
    authorityRef,
    verifierRef,
    evidenceRefs,
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    supersedingReceiptRef,
    riverEventRef,
  };
}
