import type {
  EcosystemHealthSubjectTypeV1,
  HealthStateV1,
  SubjectHealthProfileV1,
} from "./contracts.ts";

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

function aggregateState(children: readonly SubjectHealthProfileV1[]): HealthStateV1 {
  if (children.length === 0) return "UNKNOWN";
  const states = new Set(children.map((child) => child.state));
  return STATE_PRIORITY.find((state) => states.has(state)) ?? "UNKNOWN";
}

export function compileFleetHealthV1(input: FleetHealthInputV1): FleetHealthResultV1 {
  const childStateCounts: Partial<Record<HealthStateV1, number>> = {};
  const evidenceRefs: string[] = [];
  const seenEvidenceRefs = new Set<string>();

  for (const child of input.childProfiles) {
    childStateCounts[child.state] = (childStateCounts[child.state] ?? 0) + 1;
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
    state: aggregateState(input.childProfiles),
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
