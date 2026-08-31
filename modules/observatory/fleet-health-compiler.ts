import type {
  EcosystemHealthSubjectTypeV1,
  HealthStateV1,
  SubjectHealthProfileV1,
} from "./contracts.ts";
import { evaluateEvidenceFreshnessV1 } from "./health-compiler.ts";

export interface FleetHealthInputV1 {
  aggregateRef: string;
  aggregateType: EcosystemHealthSubjectTypeV1;
  childProfiles: readonly SubjectHealthProfileV1[];
  evaluatedAt: string;
}

export interface FleetHealthResultV1 {
  version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.2";
  aggregateRef: string;
  aggregateType: EcosystemHealthSubjectTypeV1;
  state: HealthStateV1;
  children: readonly SubjectHealthProfileV1[];
  childStateCounts: Partial<Record<HealthStateV1, number>>;
  confidence: number;
  evidenceRefs: readonly string[];
  evaluatedAt: string;
  derived: true;
}

const STATE_PRIORITY: readonly HealthStateV1[] = [
  "CRITICAL",
  "ISOLATED",
  "DEGRADED",
  "STALE",
  "UNKNOWN",
  "WATCH",
  "RECOVERING",
  "MAINTENANCE",
  "HEALTHY",
  "NOT_APPLICABLE",
];

function aggregateStates(states: readonly HealthStateV1[]): HealthStateV1 {
  if (states.length === 0) return "UNKNOWN";
  const stateSet = new Set(states);
  return STATE_PRIORITY.find((state) => stateSet.has(state)) ?? "UNKNOWN";
}

function stateAtFleetEvaluation(
  child: SubjectHealthProfileV1,
  evaluatedAt: string,
): HealthStateV1 {
  if (child.dimensions.length === 0) return "UNKNOWN";

  const dimensionStates = child.dimensions.map((dimension): HealthStateV1 => {
    const observedAt = dimension.freshness.observedAt;
    if (!observedAt) return "UNKNOWN";

    const currentFreshness = evaluateEvidenceFreshnessV1(
      observedAt,
      evaluatedAt,
      dimension.freshness.expectedIntervalSeconds,
    );

    if (currentFreshness.state === "MISSING") return "UNKNOWN";
    if (currentFreshness.state === "STALE") return "STALE";
    if (currentFreshness.state === "AGING" && dimension.state === "HEALTHY") return "WATCH";
    return dimension.state;
  });

  return aggregateStates(dimensionStates);
}

export function compileFleetHealthV1(input: FleetHealthInputV1): FleetHealthResultV1 {
  const childStateCounts: Partial<Record<HealthStateV1, number>> = {};
  const evidenceRefs: string[] = [];
  const seenEvidenceRefs = new Set<string>();
  const childStates: HealthStateV1[] = [];

  for (const child of input.childProfiles) {
    const childState = stateAtFleetEvaluation(child, input.evaluatedAt);
    childStates.push(childState);
    childStateCounts[childState] = (childStateCounts[childState] ?? 0) + 1;
    for (const evidenceRef of child.evidenceRefs) {
      if (!seenEvidenceRefs.has(evidenceRef)) {
        seenEvidenceRefs.add(evidenceRef);
        evidenceRefs.push(evidenceRef);
      }
    }
  }

  return {
    version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.2",
    aggregateRef: input.aggregateRef,
    aggregateType: input.aggregateType,
    state: aggregateStates(childStates),
    children: input.childProfiles,
    childStateCounts,
    confidence: input.childProfiles.length === 0
      ? 0
      : Math.min(...input.childProfiles.map((child) => child.confidence)),
    evidenceRefs,
    evaluatedAt: input.evaluatedAt,
    derived: true,
  };
}
