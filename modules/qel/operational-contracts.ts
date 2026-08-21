export const VSR_QEL_CORE_CONTRACT_VERSION = "VSR-QEL-CORE-001/0.1" as const;

export const QEL_OBJECT_STATES = [
  "UNKNOWN",
  "READY",
  "ACTIVE",
  "IDLE",
  "WAITING",
  "BLOCKED",
  "DEGRADED",
  "STOPPED",
  "RETIRED",
] as const;

export const QEL_HEALTH_STATES = ["UNKNOWN", "GOOD", "WATCH", "ACT", "CRITICAL"] as const;
export const QEL_FLOW_STATES = [
  "NONE",
  "STARTING",
  "FLOWING",
  "SLOWING",
  "QUEUED",
  "BLOCKED",
  "RECOVERING",
  "COMPLETE",
] as const;
export const QEL_DEMAND_TYPES = [
  "NONE",
  "MATERIAL",
  "ENERGY",
  "PEOPLE",
  "CAPACITY",
  "SERVICE",
  "INFORMATION",
  "APPROVAL",
  "TRANSPORT",
  "STORAGE",
  "SETTLEMENT",
] as const;
export const QEL_RISK_LEVELS = ["NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export const QEL_AUTHORITY_STATES = [
  "ALLOWED",
  "APPROVAL_REQUIRED",
  "DENIED",
  "UNRESOLVED",
] as const;
export const QEL_EVIDENCE_STATES = [
  "FRESH",
  "AGING",
  "STALE",
  "MISSING",
  "CONFLICTING",
] as const;
export const QEL_OUTCOME_STATES = [
  "UNKNOWN",
  "CLAIMED",
  "EVIDENCE_BOUND",
  "OBSERVED",
  "VERIFIED",
  "FAILED",
  "CONFLICTING_EVIDENCE",
  "UNKNOWN_FINAL_STATE",
] as const;
export const QEL_ASSERTION_KINDS = ["FACT", "DERIVED", "INFERRED"] as const;

export type QelObjectStateV01 = (typeof QEL_OBJECT_STATES)[number];
export type QelHealthStateV01 = (typeof QEL_HEALTH_STATES)[number];
export type QelFlowStateV01 = (typeof QEL_FLOW_STATES)[number];
export type QelDemandTypeV01 = (typeof QEL_DEMAND_TYPES)[number];
export type QelRiskLevelV01 = (typeof QEL_RISK_LEVELS)[number];
export type QelAuthorityStateV01 = (typeof QEL_AUTHORITY_STATES)[number];
export type QelEvidenceStateV01 = (typeof QEL_EVIDENCE_STATES)[number];
export type QelOutcomeStateV01 = (typeof QEL_OUTCOME_STATES)[number];
export type QelAssertionKindV01 = (typeof QEL_ASSERTION_KINDS)[number];

export interface QelAssertionV01<T> {
  value: T;
  kind: QelAssertionKindV01;
  confidence: number;
}

export interface QelObjectIdentityV01 {
  id: string;
  type: string;
  class?: string;
  registryRef: string;
  locationRef?: string;
}

export interface QelFlowV01 {
  state: QelFlowStateV01;
  value?: number;
  unit?: string;
  direction?: "INPUT" | "OUTPUT" | "INTERNAL";
  trend?: "RISING" | "STABLE" | "FALLING" | "UNKNOWN";
}

export interface QelDemandV01 {
  type: QelDemandTypeV01;
  priority: QelRiskLevelV01;
  target?: string;
}

export interface QelRiskV01 {
  type: string;
  severity: QelRiskLevelV01;
  confidence: number;
}

export interface QelMoveV01 {
  action: string;
  authority: QelAuthorityStateV01;
  capabilityRef?: string;
  targetRef?: string;
}

export interface QelFreshnessV01 {
  observedAt: string;
  ageMs: number;
  status: QelEvidenceStateV01;
  maximumValidAgeMs: number;
}

export interface QelEvidenceSourceV01 {
  sourceRef: string;
  kind: "SENSOR" | "CONTROLLER" | "SYSTEM" | "HUMAN" | "DOCUMENT" | "OTHER";
  nativeRef?: string;
}

export interface QelEvidenceV01 {
  status: QelEvidenceStateV01;
  confidence: number;
  freshness: QelFreshnessV01;
  sources: readonly QelEvidenceSourceV01[];
  riverReceiptRef?: string;
}

export interface QelNativeBindingV01 {
  provider: string;
  protocol?: string;
  sourceRef: string;
  rawValue?: unknown;
  rawUnit?: string;
  adapterRef: string;
  adapterVersion: string;
}

export interface QelOutcomeV01 {
  state: QelOutcomeStateV01;
  effectRef?: string;
  riverReceiptRef?: string;
}

export interface QelOperationalFrameV01 {
  contractVersion: typeof VSR_QEL_CORE_CONTRACT_VERSION;
  frameRef: string;
  correlationId: string;
  observedAt: string;
  object: QelObjectIdentityV01;
  state: QelAssertionV01<QelObjectStateV01>;
  health: QelAssertionV01<QelHealthStateV01>;
  flow: QelFlowV01;
  demand: QelDemandV01;
  risk: QelRiskV01;
  moves: readonly QelMoveV01[];
  evidence: QelEvidenceV01;
  outcome: QelOutcomeV01;
  native?: QelNativeBindingV01;
}

export interface QelFrameValidationResultV01 {
  ok: boolean;
  issues: readonly string[];
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function isConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateQelOperationalFrameV01(
  frame: QelOperationalFrameV01,
): QelFrameValidationResultV01 {
  const issues: string[] = [];

  if (frame.contractVersion !== VSR_QEL_CORE_CONTRACT_VERSION) issues.push("contract_version_invalid");
  if (!frame.frameRef) issues.push("frame_ref_missing");
  if (!frame.correlationId) issues.push("correlation_id_missing");
  if (!isIsoDate(frame.observedAt)) issues.push("observed_at_invalid");
  if (!frame.object.id) issues.push("object_id_missing");
  if (!frame.object.type) issues.push("object_type_missing");
  if (!frame.object.registryRef) issues.push("registry_ref_missing");
  if (!isConfidence(frame.state.confidence)) issues.push("state_confidence_invalid");
  if (!isConfidence(frame.health.confidence)) issues.push("health_confidence_invalid");
  if (!isConfidence(frame.risk.confidence)) issues.push("risk_confidence_invalid");
  if (!isConfidence(frame.evidence.confidence)) issues.push("evidence_confidence_invalid");
  if (!isIsoDate(frame.evidence.freshness.observedAt)) issues.push("freshness_observed_at_invalid");
  if (frame.evidence.freshness.ageMs < 0) issues.push("freshness_age_invalid");
  if (frame.evidence.freshness.maximumValidAgeMs < 0) issues.push("freshness_maximum_age_invalid");
  if (frame.moves.some((move) => !move.action)) issues.push("move_action_missing");
  if (frame.outcome.state === "VERIFIED" && !frame.outcome.riverReceiptRef) {
    issues.push("verified_outcome_requires_river_receipt");
  }
  if (frame.evidence.status === "MISSING" && frame.evidence.confidence !== 0) {
    issues.push("missing_evidence_must_have_zero_confidence");
  }
  if (frame.native && (!frame.native.sourceRef || !frame.native.adapterRef || !frame.native.adapterVersion)) {
    issues.push("native_binding_incomplete");
  }

  return { ok: issues.length === 0, issues };
}
