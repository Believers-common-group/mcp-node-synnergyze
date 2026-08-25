import type { AssuranceVectorV1 } from "./resolver.ts";
import type {
  TrustReceiptStatusEventV1,
  TrustReceiptStatusV1,
} from "./trust-receipt-status.ts";
import type { TrustReceiptV1 } from "./trust-receipt.ts";

export type TrustReceiptRelianceStateV1 =
  | "USABLE"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "STATUS_UNCONFIRMED"
  | "STALE"
  | "POLICY_MISMATCH"
  | "ISSUER_NOT_ACCEPTED"
  | "VERIFIER_NOT_ACCEPTED"
  | Exclude<TrustReceiptStatusV1, "CURRENT">;

export interface TrustReceiptRelianceInputV1 {
  receipt: TrustReceiptV1;
  statusEvent?: TrustReceiptStatusEventV1;
  asOf: string;
  requiredPolicyRef?: string;
  maximumAgeSeconds?: number;
  acceptedIssuerRefs?: readonly string[];
  acceptedVerifierRefs?: readonly string[];
}

export interface TrustReceiptRelianceResultV1 {
  receiptRef: string;
  state: TrustReceiptRelianceStateV1;
  usable: boolean;
  ageSeconds?: number;
  assurance: AssuranceVectorV1;
  statusEventRef?: string;
  reasonCodes: readonly string[];
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function canonicalRefs(values: readonly string[] | undefined): readonly string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function result(
  receipt: TrustReceiptV1,
  state: TrustReceiptRelianceStateV1,
  reasonCode: string,
  ageSeconds?: number,
  statusEventRef?: string,
): TrustReceiptRelianceResultV1 {
  return {
    receiptRef: receipt.receiptRef,
    state,
    usable: state === "USABLE",
    ageSeconds,
    assurance: { ...receipt.assurance },
    statusEventRef,
    reasonCodes: [reasonCode],
  };
}

export function evaluateTrustReceiptRelianceV1(
  input: TrustReceiptRelianceInputV1,
): TrustReceiptRelianceResultV1 {
  const asOfMs = parseInstant(input.asOf, "trust_receipt_reliance_as_of_invalid");
  const issuedAtMs = parseInstant(
    input.receipt.issuedAt,
    "trust_receipt_reliance_issued_at_invalid",
  );
  const validFromMs = parseInstant(
    input.receipt.validFrom,
    "trust_receipt_reliance_valid_from_invalid",
  );
  const validUntilMs = input.receipt.validUntil
    ? parseInstant(input.receipt.validUntil, "trust_receipt_reliance_valid_until_invalid")
    : undefined;

  if (
    input.maximumAgeSeconds !== undefined &&
    (!Number.isFinite(input.maximumAgeSeconds) || input.maximumAgeSeconds < 0)
  ) {
    throw new Error("trust_receipt_reliance_maximum_age_invalid");
  }

  const requiredPolicyRef = input.requiredPolicyRef?.trim();
  if (requiredPolicyRef && input.receipt.policyRef !== requiredPolicyRef) {
    return result(input.receipt, "POLICY_MISMATCH", "receipt_policy_mismatch");
  }

  const acceptedIssuerRefs = canonicalRefs(input.acceptedIssuerRefs);
  if (
    acceptedIssuerRefs.length > 0 &&
    !acceptedIssuerRefs.includes(input.receipt.issuerRef)
  ) {
    return result(input.receipt, "ISSUER_NOT_ACCEPTED", "receipt_issuer_not_accepted");
  }

  const acceptedVerifierRefs = canonicalRefs(input.acceptedVerifierRefs);
  if (
    acceptedVerifierRefs.length > 0 &&
    !acceptedVerifierRefs.includes(input.receipt.verifierRef)
  ) {
    return result(input.receipt, "VERIFIER_NOT_ACCEPTED", "receipt_verifier_not_accepted");
  }

  if (asOfMs < validFromMs) {
    return result(input.receipt, "NOT_YET_VALID", "receipt_not_yet_valid");
  }
  if (validUntilMs !== undefined && asOfMs > validUntilMs) {
    return result(input.receipt, "EXPIRED", "receipt_expired");
  }

  const ageSeconds = Math.max(0, Math.floor((asOfMs - issuedAtMs) / 1000));
  const statusEvent = input.statusEvent;
  if (!statusEvent) {
    return result(
      input.receipt,
      "STATUS_UNCONFIRMED",
      "receipt_status_unconfirmed",
      ageSeconds,
    );
  }
  if (statusEvent.receiptRef !== input.receipt.receiptRef) {
    throw new Error("trust_receipt_reliance_status_receipt_mismatch");
  }

  const effectiveAtMs = parseInstant(
    statusEvent.effectiveAt,
    "trust_receipt_reliance_status_effective_at_invalid",
  );
  const observedAtMs = parseInstant(
    statusEvent.observedAt,
    "trust_receipt_reliance_status_observed_at_invalid",
  );
  if (effectiveAtMs > asOfMs || observedAtMs > asOfMs) {
    return result(
      input.receipt,
      "STATUS_UNCONFIRMED",
      "receipt_status_not_known_at_decision_time",
      ageSeconds,
    );
  }

  if (statusEvent.status !== "CURRENT") {
    return result(
      input.receipt,
      statusEvent.status,
      `receipt_status_${statusEvent.status.toLowerCase()}`,
      ageSeconds,
      statusEvent.statusEventRef,
    );
  }

  if (
    input.maximumAgeSeconds !== undefined &&
    ageSeconds > input.maximumAgeSeconds
  ) {
    return result(
      input.receipt,
      "STALE",
      "receipt_freshness_exceeded",
      ageSeconds,
      statusEvent.statusEventRef,
    );
  }

  return result(
    input.receipt,
    "USABLE",
    "receipt_current_and_in_scope",
    ageSeconds,
    statusEvent.statusEventRef,
  );
}
