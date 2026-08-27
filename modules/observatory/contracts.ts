export type EcosystemHealthSubjectTypeV1 =
  | "HOST"
  | "DEVICE"
  | "SERVICE"
  | "APPLICATION"
  | "DATABASE"
  | "REPOSITORY"
  | "LOCATION"
  | "FACTORY"
  | "NETWORK"
  | "PROGRAMME"
  | "WORKFLOW"
  | "CAPABILITY"
  | "INFRASTRUCTURE_CLUSTER";

export type HealthDimensionV1 =
  | "AVAILABILITY"
  | "PERFORMANCE"
  | "CAPACITY"
  | "CONFIGURATION_INTEGRITY"
  | "SECURITY_POSTURE"
  | "SOFTWARE_CURRENCY"
  | "DEPENDENCY_HEALTH"
  | "EVIDENCE_FRESHNESS"
  | "RESILIENCE"
  | "MAINTENANCE_CONDITION"
  | "OPERATIONAL_RELIABILITY"
  | "RECOVERY_READINESS";

export type HealthStateV1 =
  | "HEALTHY"
  | "WATCH"
  | "DEGRADED"
  | "CRITICAL"
  | "RECOVERING"
  | "MAINTENANCE"
  | "ISOLATED"
  | "UNKNOWN"
  | "STALE"
  | "NOT_APPLICABLE";

export type EvidenceFreshnessStateV1 = "FRESH" | "AGING" | "STALE" | "MISSING";

export type HealthObservationConditionV1 = "POSITIVE" | "NEGATIVE" | "UNKNOWN";
export type HealthObservationSeverityV1 = "NONE" | "WATCH" | "DEGRADED" | "CRITICAL";

export interface EcosystemHealthSubjectV1 {
  subjectRef: string;
  subjectType: EcosystemHealthSubjectTypeV1;
  genesisIdentityRef: string;
  affiliationRefs: readonly string[];
  dependencyRefs: readonly string[];
  criticalityClass?: string;
}

export interface HealthEvidenceObservationV1 {
  observationRef: string;
  observedAt: string;
  evidenceRefs: readonly string[];
  condition: HealthObservationConditionV1;
  severity: HealthObservationSeverityV1;
  confidence: number;
}

export interface EvidenceFreshnessV1 {
  state: EvidenceFreshnessStateV1;
  evaluatedAt: string;
  expectedIntervalSeconds: number;
  observedAt?: string;
  ageSeconds?: number;
}

export interface DimensionHealthInputV1 {
  dimension: HealthDimensionV1;
  expectedIntervalSeconds: number;
  evidence?: HealthEvidenceObservationV1;
}

export interface DimensionHealthResultV1 {
  version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1";
  subjectRef: string;
  dimension: HealthDimensionV1;
  state: HealthStateV1;
  freshness: EvidenceFreshnessV1;
  confidence: number;
  evidenceRefs: readonly string[];
  observationRef?: string;
  evaluatedAt: string;
  derived: true;
}

export interface SubjectHealthProfileV1 {
  version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1";
  subject: EcosystemHealthSubjectV1;
  state: HealthStateV1;
  dimensions: readonly DimensionHealthResultV1[];
  confidence: number;
  evidenceRefs: readonly string[];
  evaluatedAt: string;
  derived: true;
}
