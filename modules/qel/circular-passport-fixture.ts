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

export const QEL_FIXTURE_003_REF = "QEL-FIXTURE-003" as const;
export const QEL_CIRCULAR_PASSPORT_ADAPTER_REF = "QEL-ADAPTER-CIRCULAR-PASSPORT-001" as const;
export const QEL_CIRCULAR_PASSPORT_ADAPTER_VERSION = "0.1.0" as const;

export type CircularPassportLifecycleStateV01 =
  | "CREATED"
  | "IN_PRODUCTION"
  | "RELEASED"
  | "IN_DISTRIBUTION"
  | "ACTIVE_USE"
  | "TRANSFERRED"
  | "RETURN_PENDING"
  | "RECOVERED"
  | "ASSESSED"
  | "REPAIR"
  | "REFURBISH"
  | "REUSE"
  | "REMANUFACTURE"
  | "RECYCLE"
  | "REENTERED"
  | "TRANSFORMED"
  | "DISPOSED"
  | "UNRESOLVED";

export interface SyntheticCircularPassportSnapshotV01 {
  assetRef: string;
  cycleRef: string;
  cycleSequence: number;
  registryRef: string;
  locationRef?: string;
  observedAt: string;
  correlationId: string;
  lifecycleState: CircularPassportLifecycleStateV01;
  predecessorCycleRef?: string;
  successorCycleRef?: string;
  successorAssetRefs: readonly string[];
  lineageRefs: readonly string[];
  terminalDispositionRef?: string;
  evidenceSourceRefs: readonly string[];
  effectRef?: string;
  riverVerification?: QelRiverVerificationReceiptV01;
  synthetic: true;
}

export type CircularPassportValidationIssueV01 =
  | "asset_ref_missing"
  | "cycle_ref_missing"
  | "cycle_sequence_invalid"
  | "registry_ref_missing"
  | "observed_at_invalid"
  | "correlation_id_missing"
  | "reentered_successor_cycle_missing"
  | "transformed_successor_asset_missing"
  | "disposed_terminal_disposition_missing";

export interface CircularPassportValidationResultV01 {
  ok: boolean;
  issues: readonly CircularPassportValidationIssueV01[];
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

export function validateSyntheticCircularPassportSnapshotV01(
  snapshot: SyntheticCircularPassportSnapshotV01,
): CircularPassportValidationResultV01 {
  const issues: CircularPassportValidationIssueV01[] = [];

  if (!snapshot.assetRef.trim()) issues.push("asset_ref_missing");
  if (!snapshot.cycleRef.trim()) issues.push("cycle_ref_missing");
  if (!Number.isInteger(snapshot.cycleSequence) || snapshot.cycleSequence < 1) {
    issues.push("cycle_sequence_invalid");
  }
  if (!snapshot.registryRef.trim()) issues.push("registry_ref_missing");
  if (!isIsoDate(snapshot.observedAt)) issues.push("observed_at_invalid");
  if (!snapshot.correlationId.trim()) issues.push("correlation_id_missing");
  if (snapshot.lifecycleState === "REENTERED" && !snapshot.successorCycleRef?.trim()) {
    issues.push("reentered_successor_cycle_missing");
  }
  if (snapshot.lifecycleState === "TRANSFORMED" && snapshot.successorAssetRefs.length === 0) {
    issues.push("transformed_successor_asset_missing");
  }
  if (snapshot.lifecycleState === "DISPOSED" && !snapshot.terminalDispositionRef?.trim()) {
    issues.push("disposed_terminal_disposition_missing");
  }

  return { ok: issues.length === 0, issues };
}

function mapState(snapshot: SyntheticCircularPassportSnapshotV01): QelOperationalFrameV01["state"] {
  const lifecycle = snapshot.lifecycleState;
  let value: QelOperationalFrameV01["state"]["value"] = "ACTIVE";

  if (lifecycle === "CREATED" || lifecycle === "RELEASED" || lifecycle === "ASSESSED") {
    value = "READY";
  } else if (lifecycle === "RETURN_PENDING") {
    value = "WAITING";
  } else if (lifecycle === "REENTERED") {
    value = "READY";
  } else if (lifecycle === "TRANSFORMED" || lifecycle === "DISPOSED") {
    value = "RETIRED";
  } else if (lifecycle === "UNRESOLVED") {
    value = "BLOCKED";
  }

  return { value, kind: "FACT", confidence: 1 };
}

function mapHealth(
  snapshot: SyntheticCircularPassportSnapshotV01,
  validation: CircularPassportValidationResultV01,
): QelOperationalFrameV01["health"] {
  if (!validation.ok || snapshot.lifecycleState === "UNRESOLVED") {
    return { value: "ACT", kind: "DERIVED", confidence: 1 };
  }
  if (snapshot.lifecycleState === "RETURN_PENDING") {
    return { value: "WATCH", kind: "DERIVED", confidence: 1 };
  }
  return { value: "GOOD", kind: "DERIVED", confidence: 1 };
}

function mapFlow(snapshot: SyntheticCircularPassportSnapshotV01): QelOperationalFrameV01["flow"] {
  const lifecycle = snapshot.lifecycleState;
  let state: QelOperationalFrameV01["flow"]["state"] = "FLOWING";

  if (lifecycle === "CREATED") state = "STARTING";
  else if (lifecycle === "RETURN_PENDING") state = "QUEUED";
  else if (lifecycle === "RECOVERED" || lifecycle === "ASSESSED") state = "RECOVERING";
  else if (lifecycle === "REENTERED" || lifecycle === "TRANSFORMED" || lifecycle === "DISPOSED") {
    state = "COMPLETE";
  } else if (lifecycle === "UNRESOLVED") {
    state = "BLOCKED";
  }

  return {
    state,
    value: snapshot.cycleSequence,
    unit: "LIFECYCLE_CYCLE",
    direction: "INTERNAL",
    trend: "UNKNOWN",
  };
}

function mapDemand(snapshot: SyntheticCircularPassportSnapshotV01): QelOperationalFrameV01["demand"] {
  switch (snapshot.lifecycleState) {
    case "RETURN_PENDING":
      return { type: "TRANSPORT", priority: "HIGH", target: "return_asset_to_network" };
    case "RECOVERED":
      return { type: "INFORMATION", priority: "MODERATE", target: "assess_recovered_asset" };
    case "ASSESSED":
      return { type: "APPROVAL", priority: "MODERATE", target: "select_next_lifecycle_route" };
    case "REPAIR":
    case "REFURBISH":
    case "REMANUFACTURE":
    case "RECYCLE":
      return { type: "SERVICE", priority: "MODERATE", target: "complete_circular_processing" };
    case "UNRESOLVED":
      return { type: "INFORMATION", priority: "HIGH", target: "resolve_lifecycle_state" };
    default:
      return { type: "NONE", priority: "NONE" };
  }
}

function mapRisk(
  snapshot: SyntheticCircularPassportSnapshotV01,
  validation: CircularPassportValidationResultV01,
): QelOperationalFrameV01["risk"] {
  if (!validation.ok) {
    return { type: "LIFECYCLE_LINEAGE_INVALID", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.lifecycleState === "UNRESOLVED") {
    return { type: "LIFECYCLE_LOSS", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.lifecycleState === "RETURN_PENDING") {
    return { type: "RECOVERY_DELAY", severity: "MODERATE", confidence: 0.9 };
  }
  return { type: "NONE", severity: "NONE", confidence: 1 };
}

function mapOutcome(snapshot: SyntheticCircularPassportSnapshotV01): QelOperationalFrameV01["outcome"] {
  if (!snapshot.effectRef) return { state: "OBSERVED" };

  return bindRiverVerifiedOutcomeV01({
    correlationId: snapshot.correlationId,
    effectRef: snapshot.effectRef,
    observedAt: snapshot.observedAt,
    maximumReceiptAgeMs: 30_000,
    receipt: snapshot.riverVerification,
  }).outcome;
}

export function mapSyntheticCircularPassportToQelFrameV01(
  snapshot: SyntheticCircularPassportSnapshotV01,
): QelOperationalFrameV01 {
  const validation = validateSyntheticCircularPassportSnapshotV01(snapshot);
  const hasEvidence = snapshot.evidenceSourceRefs.length > 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_003_REF}:${snapshot.assetRef}:${snapshot.cycleRef}:${snapshot.correlationId}`,
    correlationId: snapshot.correlationId,
    observedAt: snapshot.observedAt,
    object: {
      id: snapshot.assetRef,
      type: "PRODUCT_PASSPORT",
      class: "CIRCULAR_PRODUCT_PASSPORT",
      registryRef: snapshot.registryRef,
      locationRef: snapshot.locationRef,
    },
    state: mapState(snapshot),
    health: mapHealth(snapshot, validation),
    flow: mapFlow(snapshot),
    demand: mapDemand(snapshot),
    risk: mapRisk(snapshot, validation),
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: snapshot.assetRef },
      {
        action: "TRANSFER",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.transfer",
        targetRef: snapshot.assetRef,
      },
      {
        action: "RETURN",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.return",
        targetRef: snapshot.assetRef,
      },
      {
        action: "ASSESS",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.assess",
        targetRef: snapshot.assetRef,
      },
      {
        action: "ROUTE_NEXT_CYCLE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "passport.lifecycle.route",
        targetRef: snapshot.assetRef,
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
      provider: "SYNNERGYZE_CIRCULAR_PASSPORT_SIMULATOR",
      protocol: "SYNTHETIC_FIXTURE",
      sourceRef: snapshot.assetRef,
      rawValue: {
        assetRef: snapshot.assetRef,
        cycleRef: snapshot.cycleRef,
        cycleSequence: snapshot.cycleSequence,
        lifecycleState: snapshot.lifecycleState,
        predecessorCycleRef: snapshot.predecessorCycleRef,
        successorCycleRef: snapshot.successorCycleRef,
        successorAssetRefs: snapshot.successorAssetRefs,
        lineageRefs: snapshot.lineageRefs,
        terminalDispositionRef: snapshot.terminalDispositionRef,
        validationIssues: validation.issues,
        synthetic: true,
      },
      adapterRef: QEL_CIRCULAR_PASSPORT_ADAPTER_REF,
      adapterVersion: QEL_CIRCULAR_PASSPORT_ADAPTER_VERSION,
    },
  };
}

export function buildSyntheticCircularPassportPodPulseV01(
  input: SyntheticCircularPassportSnapshotV01 & { podRef: string },
): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapSyntheticCircularPassportToQelFrameV01(input)],
  });
}

export function makeSyntheticCircularPassportSnapshotV01(
  overrides: Partial<SyntheticCircularPassportSnapshotV01> = {},
): SyntheticCircularPassportSnapshotV01 {
  return {
    assetRef: "GARMENT-98F1",
    cycleRef: "GARMENT-98F1:CYCLE-01",
    cycleSequence: 1,
    registryRef: "GENESIS:GARMENT-98F1",
    locationRef: "FACTORY-BLR-001",
    observedAt: "2026-08-23T05:45:00.000Z",
    correlationId: "QEL-FIXTURE-003-CORR-001",
    lifecycleState: "ACTIVE_USE",
    successorAssetRefs: [],
    lineageRefs: ["MATERIAL-BATCH-DENIM-001"],
    evidenceSourceRefs: ["SIM-PASSPORT-REGISTRY-001"],
    synthetic: true,
    ...overrides,
  };
}
