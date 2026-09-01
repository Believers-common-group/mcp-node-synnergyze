import classificationPolicy from "../../config/pestel/classification-policy.json" with { type: "json" };

import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import type { PestelDimensionV1, PestelRationaleV1 } from "./contracts.ts";

export const DETERMINISTIC_CONFIDENCE_CAP = classificationPolicy.deterministicConfidenceCap;

type TermGroup = keyof typeof classificationPolicy.termGroups;

const groupDimensions: Record<TermGroup, readonly PestelDimensionV1[]> = {
  tax: ["economic", "legal"],
  subsidy: ["economic", "political"],
  trade: ["economic", "political"],
  labour: ["social", "economic", "legal"],
  reporting: ["legal", "technological"],
  technology: ["technological", "economic"],
  privacy_data: ["technological", "legal", "social"],
  environment: ["environmental", "legal"],
  health_safety: ["social", "legal"],
  infrastructure: ["political", "economic", "technological"],
  enforcement: ["legal", "political"],
  courts: ["legal", "political"],
  public_administration: ["political", "legal"],
};

export interface DeterministicPestelResultV1 {
  vector: Record<PestelDimensionV1, number>;
  rationale: PestelRationaleV1[];
  matchedGroups: TermGroup[];
  confidence: number;
}

const dimensions: readonly PestelDimensionV1[] = [
  "political",
  "economic",
  "social",
  "technological",
  "environmental",
  "legal",
];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function canonicalEvidence(event: NormalizedLegislativeEventV1): string[] {
  return [...new Set(event.evidenceRefs)].sort((a, b) => a.localeCompare(b));
}

export function applyDeterministicPestelRulesV1(
  event: NormalizedLegislativeEventV1,
): DeterministicPestelResultV1 {
  const vector = Object.fromEntries(dimensions.map((dimension) => [dimension, 0])) as Record<
    PestelDimensionV1,
    number
  >;
  const evidenceRefs = canonicalEvidence(event);
  const searchable = [
    event.title,
    event.summary,
    ...event.subjects,
    ...event.committees,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLowerCase();

  const rationale: PestelRationaleV1[] = [];
  const matchedGroups: TermGroup[] = [];

  for (const [group, terms] of Object.entries(classificationPolicy.termGroups) as Array<
    [TermGroup, readonly string[]]
  >) {
    const matchedTerms = terms.filter((term) => searchable.includes(term.toLowerCase()));
    if (matchedTerms.length === 0) continue;
    matchedGroups.push(group);

    for (const dimension of groupDimensions[group]) {
      const contribution = clamp(0.18 + Math.min(0.12, (matchedTerms.length - 1) * 0.04));
      vector[dimension] = clamp(vector[dimension] + contribution);
      rationale.push({
        dimension,
        scoreContribution: contribution,
        basis: "DETERMINISTIC_RULE",
        statement: `Matched ${group} evidence (${matchedTerms.sort().join(", ")}).`,
        evidenceRefs,
        hypothesis: false,
      });
    }
  }

  const confidence = clamp(
    Math.min(DETERMINISTIC_CONFIDENCE_CAP, 0.3 + Math.min(0.45, matchedGroups.length * 0.06)),
  );

  return {
    vector,
    rationale: rationale.sort((a, b) =>
      `${a.dimension}:${a.statement}`.localeCompare(`${b.dimension}:${b.statement}`),
    ),
    matchedGroups: [...new Set(matchedGroups)].sort(),
    confidence,
  };
}
