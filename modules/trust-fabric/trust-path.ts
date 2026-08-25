import { createHash } from "node:crypto";

import type { WardenTrustResolutionV1 } from "../warden/contracts.ts";
import type { TrustResolutionRequestV1 } from "./resolver.ts";

export interface TrustPathInputV1 {
  request: TrustResolutionRequestV1;
  resolution: WardenTrustResolutionV1;
  requirementSetRef?: string;
  selectedReceiptRefs: readonly string[];
  selectedAssuranceStatementRefs?: readonly string[];
  policyRef: string;
  resolvedAt: string;
  validUntil?: string;
  riverEventRef: string;
}

export interface TrustPathV1 {
  trustPathRef: string;
  resolutionRef: string;
  actionRef: string;
  intendedEffect: TrustResolutionRequestV1["intendedEffect"];
  requirementSetRef?: string;
  requiredAssurance: TrustResolutionRequestV1["requiredAssurance"];
  observedAssurance: TrustResolutionRequestV1["observedAssurance"];
  requiredMaxAgeSeconds: NonNullable<TrustResolutionRequestV1["requiredMaxAgeSeconds"]>;
  observedAgeSeconds: NonNullable<TrustResolutionRequestV1["observedAgeSeconds"]>;
  selectedReceiptRefs: readonly string[];
  selectedAssuranceStatementRefs: readonly string[];
  result: WardenTrustResolutionV1["result"];
  reasonCodes: readonly string[];
  material: boolean;
  irreversibleEffect: boolean;
  policyRef: string;
  resolvedAt: string;
  validUntil?: string;
  riverEventRef: string;
}

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
  throw new Error("trust_path_value_not_json_serializable");
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

export function createTrustPathV1(input: TrustPathInputV1): TrustPathV1 {
  const resolutionRef = requireText(input.request.resolutionRef, "trust_path_resolution_required");
  const actionRef = requireText(input.request.actionRef, "trust_path_action_required");
  const policyRef = requireText(input.policyRef, "trust_path_policy_required");
  const riverEventRef = requireText(input.riverEventRef, "trust_path_river_event_required");

  if (input.resolution.resolutionRef !== resolutionRef) {
    throw new Error("trust_path_resolution_mismatch");
  }
  if (input.resolution.irreversibleEffect !== input.request.intendedEffect.irreversible) {
    throw new Error("trust_path_irreversibility_mismatch");
  }

  const selectedReceiptRefs = canonicalRefs(input.selectedReceiptRefs);
  const selectedAssuranceStatementRefs = canonicalRefs(input.selectedAssuranceStatementRefs ?? []);
  if (
    input.resolution.result === "SATISFIED" &&
    selectedReceiptRefs.length === 0 &&
    selectedAssuranceStatementRefs.length === 0
  ) {
    throw new Error("trust_path_satisfied_without_support");
  }

  const resolvedAtMs = parseInstant(input.resolvedAt, "trust_path_resolved_at_invalid");
  const validUntilMs = input.validUntil
    ? parseInstant(input.validUntil, "trust_path_valid_until_invalid")
    : undefined;
  if (validUntilMs !== undefined && validUntilMs < resolvedAtMs) {
    throw new Error("trust_path_validity_regression");
  }

  const reasonCodes = canonicalRefs(input.resolution.reasonCodes ?? []);
  const requirementSetRef = input.requirementSetRef?.trim() || undefined;
  const requiredMaxAgeSeconds = { ...(input.request.requiredMaxAgeSeconds ?? {}) };
  const observedAgeSeconds = { ...(input.request.observedAgeSeconds ?? {}) };

  const canonicalIdentity = JSON.stringify(
    canonicalize({
      resolutionRef,
      actionRef,
      intendedEffect: input.request.intendedEffect,
      requirementSetRef: requirementSetRef ?? null,
      requiredAssurance: input.request.requiredAssurance,
      observedAssurance: input.request.observedAssurance,
      requiredMaxAgeSeconds,
      observedAgeSeconds,
      selectedReceiptRefs,
      selectedAssuranceStatementRefs,
      result: input.resolution.result,
      reasonCodes,
      material: input.resolution.material,
      irreversibleEffect: input.resolution.irreversibleEffect,
      policyRef,
      resolvedAt: input.resolvedAt,
      validUntil: input.validUntil ?? null,
      riverEventRef,
    }),
  );
  const trustPathRef = `TRUST-PATH:${digest(canonicalIdentity).slice(0, 32)}`;

  return {
    trustPathRef,
    resolutionRef,
    actionRef,
    intendedEffect: { ...input.request.intendedEffect },
    requirementSetRef,
    requiredAssurance: { ...input.request.requiredAssurance },
    observedAssurance: { ...input.request.observedAssurance },
    requiredMaxAgeSeconds,
    observedAgeSeconds,
    selectedReceiptRefs,
    selectedAssuranceStatementRefs,
    result: input.resolution.result,
    reasonCodes,
    material: input.resolution.material,
    irreversibleEffect: input.resolution.irreversibleEffect,
    policyRef,
    resolvedAt: input.resolvedAt,
    validUntil: input.validUntil,
    riverEventRef,
  };
}
