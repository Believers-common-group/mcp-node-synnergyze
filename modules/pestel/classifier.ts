import { sha256CanonicalV1 } from "../legislative-intelligence/canonical.ts";
import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import type {
  PestelClassifierAssistV1,
  PestelDimensionV1,
  PestelRationaleV1,
  PestelSignalV1,
} from "./contracts.ts";
import { applyDeterministicPestelRulesV1 } from "./rules.ts";

export const PESTEL_CLASSIFIER_VERSION = "PESTEL-CLASSIFIER:R0.1";

export interface ClassifyPestelOptionsV1 {
  classifierVersion?: string;
  assist?: PestelClassifierAssistV1;
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

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function validateAssist(
  event: NormalizedLegislativeEventV1,
  vector: Partial<Record<PestelDimensionV1, number>>,
  rationale: readonly PestelRationaleV1[],
  confidence: number,
): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("pestel_assist_confidence_invalid");
  }
  const evidence = new Set(event.evidenceRefs);
  for (const [dimension, score] of Object.entries(vector) as Array<[PestelDimensionV1, number]>) {
    if (!dimensions.includes(dimension) || !Number.isFinite(score) || score < 0 || score > 1) {
      throw new Error("pestel_assist_score_invalid");
    }
    if (!rationale.some((item) => item.dimension === dimension && item.basis === "MODEL_ASSIST")) {
      throw new Error("pestel_assist_score_unexplained");
    }
  }
  for (const item of rationale) {
    if (item.basis !== "MODEL_ASSIST") throw new Error("pestel_assist_basis_invalid");
    if (!dimensions.includes(item.dimension)) throw new Error("pestel_assist_dimension_invalid");
    if (!Number.isFinite(item.scoreContribution) || item.scoreContribution < 0 || item.scoreContribution > 1) {
      throw new Error("pestel_assist_contribution_invalid");
    }
    if (item.evidenceRefs.length === 0 || item.evidenceRefs.some((ref) => !evidence.has(ref))) {
      throw new Error("pestel_assist_evidence_invalid");
    }
  }
}

export async function classifyPestelV1(
  event: NormalizedLegislativeEventV1,
  options: ClassifyPestelOptionsV1 = {},
): Promise<PestelSignalV1> {
  const deterministic = applyDeterministicPestelRulesV1(event);
  let vector = { ...deterministic.vector };
  let rationale = [...deterministic.rationale];
  let confidence = deterministic.confidence;

  if (options.assist) {
    const assisted = await options.assist.classify(event);
    validateAssist(event, assisted.vector, assisted.rationale, assisted.confidence);
    for (const dimension of dimensions) {
      const assistedScore = assisted.vector[dimension];
      if (assistedScore !== undefined) vector[dimension] = average([vector[dimension], assistedScore]);
    }
    rationale = [...rationale, ...assisted.rationale].sort((a, b) =>
      `${a.dimension}:${a.basis}:${a.statement}`.localeCompare(`${b.dimension}:${b.basis}:${b.statement}`),
    );
    confidence = average([confidence, assisted.confidence]);
  }

  const obligationEvidence = deterministic.matchedGroups.some((group) =>
    ["reporting", "enforcement", "courts"].includes(group),
  );
  const obligationCandidate =
    ["ADOPTED", "EFFECTIVE", "ENFORCED"].includes(event.lifecycle) && obligationEvidence;

  const riskScore = average([
    vector.legal,
    vector.economic,
    vector.social,
    vector.environmental,
  ]);
  const opportunityScore = average([
    vector.economic,
    vector.technological,
    vector.political,
  ]);
  const evidenceRefs = [...new Set(event.evidenceRefs)].sort((a, b) => a.localeCompare(b));
  const classifierVersion = options.classifierVersion ?? PESTEL_CLASSIFIER_VERSION;

  const identity = {
    schemaVersion: "PESTEL-SIGNAL:R0.1" as const,
    legislativeEventRef: event.eventRef,
    vector,
    riskScore,
    opportunityScore,
    obligationCandidate,
    confidence,
    rationale,
    classifierVersion,
    evidenceRefs,
  };

  return {
    schemaVersion: "PESTEL-SIGNAL:R0.1",
    signalRef: `PESTEL-SIGNAL:${sha256CanonicalV1(identity)}`,
    ...identity,
  };
}
