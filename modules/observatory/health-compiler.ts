import type {
  DimensionHealthResultV1,
  EvidenceFreshnessV1,
  HealthDimensionV1,
  HealthEvidenceObservationV1,
  HealthStateV1,
} from "./contracts.ts";

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function evaluateEvidenceFreshnessV1(
  observedAt: string,
  evaluatedAt: string,
  expectedIntervalSeconds: number,
): EvidenceFreshnessV1 {
  const observed = parseInstant(observedAt);
  const evaluated = parseInstant(evaluatedAt);
  const interval = Number.isFinite(expectedIntervalSeconds) && expectedIntervalSeconds > 0
    ? expectedIntervalSeconds
    : 0;

  if (observed === null || evaluated === null || interval === 0 || observed > evaluated) {
    return {
      state: "MISSING",
      evaluatedAt,
      expectedIntervalSeconds,
      observedAt,
    };
  }

  const ageSeconds = (evaluated - observed) / 1000;
  const state = ageSeconds <= interval
    ? "FRESH"
    : ageSeconds <= interval * 2
      ? "AGING"
      : "STALE";

  return {
    state,
    evaluatedAt,
    expectedIntervalSeconds,
    observedAt,
    ageSeconds,
  };
}

function stateForFreshEvidence(evidence: HealthEvidenceObservationV1): HealthStateV1 {
  if (evidence.condition === "UNKNOWN") return "UNKNOWN";
  if (evidence.condition === "POSITIVE") return "HEALTHY";

  switch (evidence.severity) {
    case "CRITICAL":
      return "CRITICAL";
    case "DEGRADED":
      return "DEGRADED";
    case "WATCH":
      return "WATCH";
    case "NONE":
      return "WATCH";
  }
}

export function compileDimensionHealthV1(input: {
  subjectRef: string;
  dimension: HealthDimensionV1;
  evaluatedAt: string;
  expectedIntervalSeconds: number;
  evidence?: HealthEvidenceObservationV1;
}): DimensionHealthResultV1 {
  const { subjectRef, dimension, evaluatedAt, expectedIntervalSeconds, evidence } = input;

  if (!evidence) {
    return {
      version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1",
      subjectRef,
      dimension,
      state: "UNKNOWN",
      freshness: {
        state: "MISSING",
        evaluatedAt,
        expectedIntervalSeconds,
      },
      confidence: 0,
      evidenceRefs: [],
      evaluatedAt,
      derived: true,
    };
  }

  const freshness = evaluateEvidenceFreshnessV1(
    evidence.observedAt,
    evaluatedAt,
    expectedIntervalSeconds,
  );

  let state: HealthStateV1;
  if (freshness.state === "MISSING") {
    state = "UNKNOWN";
  } else if (freshness.state === "STALE") {
    state = "STALE";
  } else if (freshness.state === "AGING" && evidence.condition === "POSITIVE") {
    state = "WATCH";
  } else {
    state = stateForFreshEvidence(evidence);
  }

  return {
    version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1",
    subjectRef,
    dimension,
    state,
    freshness,
    confidence: clampConfidence(evidence.confidence),
    evidenceRefs: [...new Set(evidence.evidenceRefs.filter((ref) => ref.trim()))].sort(),
    observationRef: evidence.observationRef,
    evaluatedAt,
    derived: true,
  };
}
