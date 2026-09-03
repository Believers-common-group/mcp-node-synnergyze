import {
  bindRiverVerifiedOutcomeV01,
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelOperationalFrameV01,
  type QelRiverVerificationReceiptV01,
} from "./operational-contracts.ts";
import {
  buildQelPodPulseV01,
  type QelPodPulseV01,
} from "./pulse.ts";

export const QEL_FIXTURE_004_REF = "QEL-FIXTURE-004" as const;
export const QEL_RECOVERY_NODE_ADAPTER_REF = "QEL-ADAPTER-RECOVERY-NODE-001" as const;
export const QEL_RECOVERY_NODE_ADAPTER_VERSION = "0.1.0" as const;
export const QEL_RECOVERY_CUSTODY_CAPABILITY_REF = "inventory.transfer" as const;

export type RecoveryNodeStateV01 =
  | "READY"
  | "IDENTIFIED"
  | "ACCEPTED"
  | "CUSTODY_HELD"
  | "ASSESSMENT_PENDING"
  | "ASSESSED"
  | "ROUTING_PENDING"
  | "ROUTED"
  | "RELEASED"
  | "REJECTED"
  | "BLOCKED";

export type RecoveryRouteV01 =
  | "REUSE"
  | "REPAIR"
  | "REFURBISH"
  | "REMANUFACTURE"
  | "RECYCLE"
  | "RETURN_TO_OWNER"
  | "QUARANTINE";

export interface SyntheticRecoveryNodeSnapshotV01 {
  nodeRef: string;
  registryRef: string;
  locationRef: string;
  observedAt: string;
  correlationId: string;
  nodeState: RecoveryNodeStateV01;
  assetRef?: string;
  passportCycleRef?: string;
  custodyRef?: string;
  priorCustodianRef?: string;
  route?: RecoveryRouteV01;
  routeDestinationRef?: string;
  rejectionReason?: string;
  queueDepth: number;
  capacityUnits: number;
  evidenceSourceRefs: readonly string[];
  effectRef?: string;
  riverVerification?: QelRiverVerificationReceiptV01;
  synthetic: true;
}

export type RecoveryNodeValidationIssueV01 =
  | "node_ref_missing"
  | "registry_ref_missing"
  | "location_ref_missing"
  | "observed_at_invalid"
  | "correlation_id_missing"
  | "queue_depth_invalid"
  | "capacity_invalid"
  | "asset_required"
  | "passport_cycle_required"
  | "custody_ref_required"
  | "route_required"
  | "route_destination_required"
  | "rejection_reason_required";

export interface RecoveryNodeValidationResultV01 {
  ok: boolean;
  issues: readonly RecoveryNodeValidationIssueV01[];
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function hasAcceptedPhysicalAsset(state: RecoveryNodeStateV01): boolean {
  return [
    "ACCEPTED",
    "CUSTODY_HELD",
    "ASSESSMENT_PENDING",
    "ASSESSED",
    "ROUTING_PENDING",
    "ROUTED",
    "RELEASED",
  ].includes(state);
}

export function validateSyntheticRecoveryNodeSnapshotV01(
  snapshot: SyntheticRecoveryNodeSnapshotV01,
): RecoveryNodeValidationResultV01 {
  const issues: RecoveryNodeValidationIssueV01[] = [];

  if (!snapshot.nodeRef.trim()) issues.push("node_ref_missing");
  if (!snapshot.registryRef.trim()) issues.push("registry_ref_missing");
  if (!snapshot.locationRef.trim()) issues.push("location_ref_missing");
  if (!isIsoDate(snapshot.observedAt)) issues.push("observed_at_invalid");
  if (!snapshot.correlationId.trim()) issues.push("correlation_id_missing");
  if (!Number.isInteger(snapshot.queueDepth) || snapshot.queueDepth < 0) {
    issues.push("queue_depth_invalid");
  }
  if (!Number.isInteger(snapshot.capacityUnits) || snapshot.capacityUnits < 1) {
    issues.push("capacity_invalid");
  }

  if (snapshot.nodeState !== "READY" && snapshot.nodeState !== "BLOCKED" && snapshot.nodeState !== "REJECTED") {
    if (!snapshot.assetRef?.trim()) issues.push("asset_required");
    if (!snapshot.passportCycleRef?.trim()) issues.push("passport_cycle_required");
  }

  if (hasAcceptedPhysicalAsset(snapshot.nodeState) && !snapshot.custodyRef?.trim()) {
    issues.push("custody_ref_required");
  }

  if (snapshot.nodeState === "ROUTED" || snapshot.nodeState === "RELEASED") {
    if (!snapshot.route) issues.push("route_required");
    if (!snapshot.routeDestinationRef?.trim()) issues.push("route_destination_required");
  }

  if (snapshot.nodeState === "REJECTED" && !snapshot.rejectionReason?.trim()) {
    issues.push("rejection_reason_required");
  }

  return { ok: issues.length === 0, issues };
}

function utilization(snapshot: SyntheticRecoveryNodeSnapshotV01): number {
  if (snapshot.capacityUnits <= 0) return 1;
  return snapshot.queueDepth / snapshot.capacityUnits;
}

function mapState(snapshot: SyntheticRecoveryNodeSnapshotV01): QelOperationalFrameV01["state"] {
  switch (snapshot.nodeState) {
    case "READY":
    case "IDENTIFIED":
      return { value: "READY", kind: "FACT", confidence: 1 };
    case "ASSESSMENT_PENDING":
    case "ROUTING_PENDING":
      return { value: "WAITING", kind: "FACT", confidence: 1 };
    case "BLOCKED":
      return { value: "BLOCKED", kind: "FACT", confidence: 1 };
    case "REJECTED":
      return { value: "STOPPED", kind: "FACT", confidence: 1 };
    default:
      return { value: "ACTIVE", kind: "FACT", confidence: 1 };
  }
}

function mapHealth(
  snapshot: SyntheticRecoveryNodeSnapshotV01,
  validation: RecoveryNodeValidationResultV01,
): QelOperationalFrameV01["health"] {
  if (!validation.ok || snapshot.nodeState === "BLOCKED") {
    return { value: "ACT", kind: "DERIVED", confidence: 1 };
  }
  if (snapshot.nodeState === "REJECTED" || utilization(snapshot) >= 1) {
    return { value: "WATCH", kind: "DERIVED", confidence: 1 };
  }
  return { value: "GOOD", kind: "DERIVED", confidence: 1 };
}

function mapFlow(snapshot: SyntheticRecoveryNodeSnapshotV01): QelOperationalFrameV01["flow"] {
  let state: QelOperationalFrameV01["flow"]["state"] = "NONE";

  if (snapshot.nodeState === "IDENTIFIED" || snapshot.nodeState === "ACCEPTED") state = "STARTING";
  else if (["CUSTODY_HELD", "ASSESSED", "ROUTED"].includes(snapshot.nodeState)) state = "FLOWING";
  else if (["ASSESSMENT_PENDING", "ROUTING_PENDING"].includes(snapshot.nodeState)) state = "QUEUED";
  else if (snapshot.nodeState === "BLOCKED") state = "BLOCKED";
  else if (snapshot.nodeState === "RELEASED" || snapshot.nodeState === "REJECTED") state = "COMPLETE";

  return {
    state,
    value: snapshot.queueDepth,
    unit: "ASSETS_IN_RECOVERY_QUEUE",
    direction: "INTERNAL",
    trend: "UNKNOWN",
  };
}

function mapDemand(snapshot: SyntheticRecoveryNodeSnapshotV01): QelOperationalFrameV01["demand"] {
  if (snapshot.nodeState === "IDENTIFIED") {
    return { type: "APPROVAL", priority: "HIGH", target: "accept_recovery_custody" };
  }
  if (snapshot.nodeState === "ASSESSMENT_PENDING") {
    return { type: "SERVICE", priority: "HIGH", target: "assess_recovered_asset" };
  }
  if (snapshot.nodeState === "ROUTING_PENDING") {
    return { type: "APPROVAL", priority: "HIGH", target: "select_recovery_route" };
  }
  if (snapshot.nodeState === "BLOCKED") {
    return { type: "INFORMATION", priority: "HIGH", target: "resolve_recovery_exception" };
  }
  if (utilization(snapshot) >= 0.9) {
    return { type: "CAPACITY", priority: "MODERATE", target: "increase_recovery_capacity" };
  }
  return { type: "NONE", priority: "NONE" };
}

function mapRisk(
  snapshot: SyntheticRecoveryNodeSnapshotV01,
  validation: RecoveryNodeValidationResultV01,
): QelOperationalFrameV01["risk"] {
  if (!validation.ok) {
    return { type: "RECOVERY_CUSTODY_INVALID", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.nodeState === "BLOCKED") {
    return { type: "CUSTODY_EXCEPTION", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.nodeState === "REJECTED") {
    return { type: "RECOVERY_REJECTION", severity: "MODERATE", confidence: 1 };
  }
  if (utilization(snapshot) >= 1) {
    return { type: "RECOVERY_CAPACITY_EXCEEDED", severity: "HIGH", confidence: 1 };
  }
  if (utilization(snapshot) >= 0.9) {
    return { type: "RECOVERY_CAPACITY", severity: "MODERATE", confidence: 0.95 };
  }
  return { type: "NONE", severity: "NONE", confidence: 1 };
}

function mapOutcome(snapshot: SyntheticRecoveryNodeSnapshotV01): QelOperationalFrameV01["outcome"] {
  if (!snapshot.effectRef) return { state: "OBSERVED" };

  return bindRiverVerifiedOutcomeV01({
    correlationId: snapshot.correlationId,
    effectRef: snapshot.effectRef,
    observedAt: snapshot.observedAt,
    maximumReceiptAgeMs: 30_000,
    receipt: snapshot.riverVerification,
  }).outcome;
}

export function mapSyntheticRecoveryNodeToQelFrameV01(
  snapshot: SyntheticRecoveryNodeSnapshotV01,
): QelOperationalFrameV01 {
  const validation = validateSyntheticRecoveryNodeSnapshotV01(snapshot);
  const hasEvidence = snapshot.evidenceSourceRefs.length > 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_004_REF}:${snapshot.nodeRef}:${snapshot.correlationId}`,
    correlationId: snapshot.correlationId,
    observedAt: snapshot.observedAt,
    object: {
      id: snapshot.nodeRef,
      type: "RECOVERY_NODE",
      class: "CIRCULAR_RECOVERY_NODE",
      registryRef: snapshot.registryRef,
      locationRef: snapshot.locationRef,
    },
    state: mapState(snapshot),
    health: mapHealth(snapshot, validation),
    flow: mapFlow(snapshot),
    demand: mapDemand(snapshot),
    risk: mapRisk(snapshot, validation),
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: snapshot.nodeRef },
      {
        action: "IDENTIFY_ASSET",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.identify",
        targetRef: snapshot.assetRef,
      },
      {
        action: "ACCEPT_CUSTODY",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: QEL_RECOVERY_CUSTODY_CAPABILITY_REF,
        targetRef: snapshot.assetRef,
      },
      {
        action: "ASSESS",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.assess",
        targetRef: snapshot.assetRef,
      },
      {
        action: "ROUTE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.lifecycle.route",
        targetRef: snapshot.assetRef,
      },
      {
        action: "RELEASE_CUSTODY",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: QEL_RECOVERY_CUSTODY_CAPABILITY_REF,
        targetRef: snapshot.routeDestinationRef,
      },
    ],
    evidence: {
      status: hasEvidence ? "FRESH" : "MISSING",
      confidence: hasEvidence ? 1 : 0,
      freshness: {
        observedAt: snapshot.observedAt,
        ageMs: 0,
        status: hasEvidence ? "FRESH" : "MISSING",
        maximumValidAgeMs: 30_000,
      },
      sources: snapshot.evidenceSourceRefs.map((sourceRef) => ({
        sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: sourceRef,
      })),
      riverReceiptRef: snapshot.riverVerification?.receiptRef,
    },
    outcome: mapOutcome(snapshot),
    native: {
      provider: "SYNNERGYZE_RECOVERY_NODE_SIMULATOR",
      protocol: "SYNTHETIC_FIXTURE",
      sourceRef: snapshot.nodeRef,
      rawValue: {
        nodeState: snapshot.nodeState,
        assetRef: snapshot.assetRef,
        passportCycleRef: snapshot.passportCycleRef,
        custodyRef: snapshot.custodyRef,
        priorCustodianRef: snapshot.priorCustodianRef,
        route: snapshot.route,
        routeDestinationRef: snapshot.routeDestinationRef,
        rejectionReason: snapshot.rejectionReason,
        queueDepth: snapshot.queueDepth,
        capacityUnits: snapshot.capacityUnits,
        validationIssues: validation.issues,
        custodyCapabilityRef: QEL_RECOVERY_CUSTODY_CAPABILITY_REF,
        synthetic: true,
      },
      adapterRef: QEL_RECOVERY_NODE_ADAPTER_REF,
      adapterVersion: QEL_RECOVERY_NODE_ADAPTER_VERSION,
    },
  };
}

export function buildSyntheticRecoveryNodePodPulseV01(
  input: SyntheticRecoveryNodeSnapshotV01 & { podRef: string },
): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapSyntheticRecoveryNodeToQelFrameV01(input)],
  });
}

export function makeSyntheticRecoveryNodeSnapshotV01(
  overrides: Partial<SyntheticRecoveryNodeSnapshotV01> = {},
): SyntheticRecoveryNodeSnapshotV01 {
  return {
    nodeRef: "RECOVERY-NODE-BLR-001",
    registryRef: "GENESIS:RECOVERY-NODE-BLR-001",
    locationRef: "LOCATION-BLR-RECOVERY-001",
    observedAt: "2026-08-23T06:45:00.000Z",
    correlationId: "QEL-FIXTURE-004-CORR-001",
    nodeState: "READY",
    queueDepth: 4,
    capacityUnits: 100,
    evidenceSourceRefs: ["SIM-RECOVERY-REGISTRY-001"],
    synthetic: true,
    ...overrides,
  };
}
