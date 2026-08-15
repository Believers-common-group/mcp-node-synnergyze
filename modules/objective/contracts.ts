export type ObjectiveLifecycleStateV1 =
  | "DRAFT"
  | "PROPOSED"
  | "AUTHORITY_PENDING"
  | "AUTHORIZED"
  | "ACTIVE"
  | "ACCEPTANCE_PENDING"
  | "ACCEPTED"
  | "FAILED"
  | "CANCELLED"
  | "SUPERSEDED"
  | "CLOSED";

export interface ObjectiveRefV1 {
  objectiveRef: string;
  principalRef: string;
  statementRef: string;
  desiredStateRef: string;
  successConditionRefs: readonly string[];
  constraintRefs: readonly string[];
  authorityRequirementRefs: readonly string[];
  acceptanceProfileRef: string;
  validFrom: string;
  validUntil: string;
  version: string;
  status: ObjectiveLifecycleStateV1;
  supersedesRef?: string;
}

export interface ObjectiveAuthorityEnvelopeV1 {
  authorityRef: string;
  objectiveRef: string;
  principalRef: string;
  actorRef: string;
  actingCapacityRef: string;
  contextRef: string;
  wardenRef: string;
  wardenDecisionRef: string;
  decision: "ALLOW" | "ESCALATE" | "DENY";
  state: "ACTIVE" | "EXPIRED" | "REVOKED" | "SUPERSEDED";
  allowedCapabilityRefs: readonly string[];
  resourceRefs: readonly string[];
  evidenceRequirementRefs: readonly string[];
  validFrom: string;
  validUntil: string;
  constraintRefs: readonly string[];
}

export interface InventoryTransferSpecV1 {
  sourceLocationRef: string;
  destinationLocationRef: string;
  skuRef: string;
  quantity: number;
}

export interface ObjectiveProgramV1 {
  programRef: string;
  objectiveRef: string;
  objectiveVersion: string;
  purposeLineageRef: string;
  principalRef: string;
  actorRef: string;
  authorityRef: string;
  correlationId: string;
  eventRefs: readonly string[];
  transfer: InventoryTransferSpecV1;
}

export interface ObjectiveEventV1 {
  eventRef: string;
  eventType:
    | "RESOLVE_OBJECTIVE"
    | "RESOLVE_RESOURCES"
    | "PREPARE_TRANSFER"
    | "WARDEN_ALLOW"
    | "RESERVE_EVIDENCE"
    | "DISPATCH"
    | "VERIFY_DISPATCH"
    | "RECEIVE"
    | "VERIFY_RECEIPT"
    | "SEAL_EVIDENCE"
    | "RECORD_EFFECTS"
    | "ACCEPTANCE_CHECK"
    | "RECONCILE_PROJECTIONS"
    | "CLOSE_OBJECTIVE";
  sequence: number;
  objectiveRef: string;
  programRef: string;
  authorityRef: string;
  correlationId: string;
  idempotencyKey: string;
  capabilityRef?: string;
  targetRef?: string;
  expectedEffectRefs: readonly string[];
  requiredEvidenceRefs: readonly string[];
}

export interface ObjectiveProgramBundleV1 {
  program: ObjectiveProgramV1;
  events: readonly ObjectiveEventV1[];
}

export interface ObjectiveEffectV1 {
  effectRef: string;
  objectiveRef: string;
  programRef: string;
  eventRef: string;
  subjectRef: string;
  observedDeltaOrStateRef: string;
  evidenceRef: string;
  verifiedEffectRef: string;
  classification: "intended" | "unintended" | "neutral" | "adverse";
  acceptanceRelevance: "REQUIRED" | "SUPPORTING" | "NONE";
  observedAt: string;
}

export interface ObjectiveProjectionV1 {
  objectiveRef: string;
  status: ObjectiveLifecycleStateV1;
  programRef: string;
  authorityRef: string;
  effectRefs: readonly string[];
  evidenceRefs: readonly string[];
  sourceQuantity: number;
  destinationQuantity: number;
}

export interface AcceptanceResultV1 {
  objectiveRef: string;
  profileRef: string;
  result: "PASS" | "FAIL" | "PARTIAL" | "ESCALATE";
  checkedEffectRefs: readonly string[];
  checkedEvidenceRefs: readonly string[];
  checkedAt: string;
  reasonCodes: readonly string[];
}

export interface InventoryTransferProofV1 {
  objective: ObjectiveRefV1;
  authority: ObjectiveAuthorityEnvelopeV1;
  bundle: ObjectiveProgramBundleV1;
  verifiedEffectRef: string;
  riverSealRef: string;
  effects: readonly ObjectiveEffectV1[];
  frontProjection: ObjectiveProjectionV1;
  backProjection: ObjectiveProjectionV1;
  acceptance: AcceptanceResultV1;
  closedObjective: ObjectiveRefV1;
}
