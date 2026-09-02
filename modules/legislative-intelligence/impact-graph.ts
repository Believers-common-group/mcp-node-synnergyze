import { sha256CanonicalV1 } from "./canonical.ts";
import type { PestelSignalV1 } from "../pestel/contracts.ts";

export const REGISTRY_IMPACT_MAPPING_POLICY_VERSION = "REGISTRY-IMPACT:R0.1";

export interface RegistrySubjectIndexEntryV1 {
  registryEntityRef: string;
  terms: readonly string[];
}

export interface RegistryImpactCandidateV1 {
  candidateRef: string;
  signalRef: string;
  registryEntityRef: string;
  relation: "AFFECTS" | "MAY_AFFECT" | "REGULATES" | "INCENTIVIZES" | "RESTRICTS";
  confidence: number;
  matchedTerms: readonly string[];
  evidenceRefs: readonly string[];
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

export function mapRegistryImpactCandidatesV1(
  signal: PestelSignalV1,
  index: readonly RegistrySubjectIndexEntryV1[],
): RegistryImpactCandidateV1[] {
  const searchable = signal.rationale
    .filter((item) => item.basis === "DETERMINISTIC_RULE")
    .map((item) => normalizeTerm(item.statement))
    .join("\n");
  const evidenceRefs = uniqueSorted(signal.evidenceRefs);

  return index
    .map((entry): RegistryImpactCandidateV1 | undefined => {
      const normalizedTerms = uniqueSorted(entry.terms.map(normalizeTerm));
      const matchedTerms = normalizedTerms.filter((term) => term.length > 0 && searchable.includes(term));
      if (matchedTerms.length === 0) return undefined;

      const coverage = matchedTerms.length / Math.max(1, normalizedTerms.length);
      const confidence = clamp(signal.confidence * (0.5 + 0.5 * coverage));
      const identity = {
        signalRef: signal.signalRef,
        registryEntityRef: entry.registryEntityRef,
        relation: "MAY_AFFECT" as const,
        confidence,
        matchedTerms,
        evidenceRefs,
        mappingPolicyVersion: REGISTRY_IMPACT_MAPPING_POLICY_VERSION,
      };

      return {
        candidateRef: `REGISTRY-IMPACT:${sha256CanonicalV1(identity)}`,
        signalRef: signal.signalRef,
        registryEntityRef: entry.registryEntityRef,
        relation: "MAY_AFFECT",
        confidence,
        matchedTerms,
        evidenceRefs,
      };
    })
    .filter((candidate): candidate is RegistryImpactCandidateV1 => candidate !== undefined)
    .sort((a, b) => a.registryEntityRef.localeCompare(b.registryEntityRef));
}
