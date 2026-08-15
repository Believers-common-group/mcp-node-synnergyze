export type WardenDecisionStatus = "ALLOW" | "ESCALATE" | "DENY";

export interface WardenDecisionRequestV1 {
  requestRef: string;
  actorRef: string;
  representedPrincipalRef: string;
  actingCapacityRef: string;
  contextRef: string;
  programRef: string;
  eventRef: string;
  action: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect?: string;
  executionDeviceRef?: string;
  deviceSecurityState?: "ACTIVE";
  deviceSecurityPolicyRef?: string;
  deviceSecuritySourceRefs?: readonly string[];
  deviceSecurityResolvedAt?: string;
  deviceSecurityValidUntil?: string;
  authorityRefs: readonly string[];
  policyRefs: readonly string[];
  representationSourceRefs: readonly string[];
  evidenceReadinessRef?: string;
  requestedAt: string;
  correlationId: string;
}

interface WardenDecisionBaseV1 {
  decisionRef: string;
  requestRef: string;
  wardenRef: string;
  action: string;
  targetRef: string;
  reasonCodes: readonly string[];
  constraints: readonly string[];
  decidedAt: string;
  validUntil?: string;
  correlationId: string;
}

export interface WardenAllowDecisionV1 extends WardenDecisionBaseV1 {
  decision: "ALLOW";
  actionToken: string;
}

export interface WardenNonAllowDecisionV1 extends WardenDecisionBaseV1 {
  decision: "ESCALATE" | "DENY";
  actionToken?: never;
}

export type WardenDecisionV1 = WardenAllowDecisionV1 | WardenNonAllowDecisionV1;

export type WardenExecutionCheckpointStateV1 =
  | "VALID"
  | "REVOKED"
  | "EXPIRED"
  | "SUPERSEDED";

export interface WardenExecutionCheckpointV1 {
  checkpointRef: string;
  decisionRef: string;
  wardenRef: string;
  correlationId: string;
  state: WardenExecutionCheckpointStateV1;
  checkedAt: string;
  reasonCodes: readonly string[];
}
