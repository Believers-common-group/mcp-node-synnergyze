import type { HealthStateV1, SubjectHealthProfileV1 } from "./contracts.ts";

export type HealthDependencyCriticalityV1 = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface HealthDependencyV1 {
  dependencyRef: string;
  upstreamSubjectRef: string;
  downstreamSubjectRef: string;
  dependencyType: string;
  criticality: HealthDependencyCriticalityV1;
  redundancyGroup?: string;
}

export interface DependencyImpactProjectionV1 {
  version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1";
  dependencyRef: string;
  upstreamSubjectRef: string;
  downstreamSubjectRef: string;
  upstreamState: HealthStateV1;
  downstreamProjectedState: HealthStateV1;
  classification: "DERIVED";
  rootCauseStatus: "SUSPECTED";
  sourceEvidenceRefs: readonly string[];
  evaluatedAt: string;
}

function projectedState(
  upstreamState: HealthStateV1,
  criticality: HealthDependencyCriticalityV1,
): HealthStateV1 {
  switch (upstreamState) {
    case "CRITICAL":
    case "ISOLATED":
      return criticality === "LOW" ? "WATCH" : "DEGRADED";
    case "DEGRADED":
      return criticality === "CRITICAL" ? "DEGRADED" : "WATCH";
    case "WATCH":
    case "RECOVERING":
    case "MAINTENANCE":
      return "WATCH";
    case "STALE":
    case "UNKNOWN":
    case "NOT_APPLICABLE":
      return "UNKNOWN";
    case "HEALTHY":
      return "HEALTHY";
  }
}

export function projectDependencyImpactV1(
  upstreamProfile: SubjectHealthProfileV1,
  dependency: HealthDependencyV1,
  evaluatedAt: string,
): DependencyImpactProjectionV1 {
  if (upstreamProfile.subject.subjectRef !== dependency.upstreamSubjectRef) {
    throw new Error("dependency_upstream_subject_mismatch");
  }

  return {
    version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1",
    dependencyRef: dependency.dependencyRef,
    upstreamSubjectRef: dependency.upstreamSubjectRef,
    downstreamSubjectRef: dependency.downstreamSubjectRef,
    upstreamState: upstreamProfile.state,
    downstreamProjectedState: projectedState(upstreamProfile.state, dependency.criticality),
    classification: "DERIVED",
    rootCauseStatus: "SUSPECTED",
    sourceEvidenceRefs: [...upstreamProfile.evidenceRefs],
    evaluatedAt,
  };
}
