export type PestelDimensionV1 =
  | "political"
  | "economic"
  | "social"
  | "technological"
  | "environmental"
  | "legal";

export interface PestelRationaleV1 {
  dimension: PestelDimensionV1;
  scoreContribution: number;
  basis: "DETERMINISTIC_RULE" | "MODEL_ASSIST";
  statement: string;
  evidenceRefs: readonly string[];
  hypothesis: boolean;
}

export interface PestelSignalV1 {
  schemaVersion: "PESTEL-SIGNAL:R0.1";
  signalRef: string;
  legislativeEventRef: string;
  vector: Record<PestelDimensionV1, number>;
  riskScore: number;
  opportunityScore: number;
  obligationCandidate: boolean;
  confidence: number;
  rationale: readonly PestelRationaleV1[];
  classifierVersion: string;
  evidenceRefs: readonly string[];
}

export interface PestelClassifierAssistV1 {
  classify(event: import("../legislative-intelligence/contracts.ts").NormalizedLegislativeEventV1): Promise<{
    vector: Partial<Record<PestelDimensionV1, number>>;
    rationale: readonly PestelRationaleV1[];
    confidence: number;
  }>;
}

export interface ImpactBriefV1 {
  schemaVersion: "PESTEL-BRIEF:R0.1";
  briefRef: string;
  signalRef: string;
  lifecycle: string;
  observedFacts: readonly string[];
  riskHypotheses: readonly string[];
  opportunityHypotheses: readonly string[];
  obligationCandidate: boolean;
  completeness: "COMPLETE" | "DEGRADED";
  confidence: number;
  evidenceRefs: readonly string[];
}
