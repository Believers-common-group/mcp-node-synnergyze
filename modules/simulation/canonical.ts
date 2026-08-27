import { createHash } from "node:crypto";

import type { RealityAdmissionRequestV1 } from "./contracts.ts";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalSha256V1(value: unknown): string {
  const encoded = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}

export function canonicalReferenceSetV1(refs: readonly string[]): readonly string[] {
  return [...new Set(refs)].sort((left, right) => left.localeCompare(right));
}

export function canonicalReferenceSetHashV1(refs: readonly string[]): string {
  return canonicalSha256V1(canonicalReferenceSetV1(refs));
}

export function realityAdmissionRequestHashV1(
  request: Omit<RealityAdmissionRequestV1, "envelopeHash">,
): string {
  return canonicalSha256V1(request);
}
