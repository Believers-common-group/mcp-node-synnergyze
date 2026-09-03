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

export const QEL_FIXTURE_002_REF = "QEL-FIXTURE-002" as const;
export const QEL_FACTORY_LINE_ADAPTER_REF = "QEL-ADAPTER-FACTORY-LINE-001" as const;
export const QEL_FACTORY_LINE_ADAPTER_VERSION = "0.1.0" as const;

export type FactoryLineNativeStateV01 = "RUNNING" | "IDLE" | "STARVED" | "FAULT" | "STOPPED";

export interface SyntheticFactoryLineSnapshotV01 {
  lineRef: string;
  registryRef: string;
  locationRef: string;
  observedAt: string;
  correlationId: string;
  nativeState: FactoryLineNativeStateV01;
  outputRatePerHour: number;
  targetRatePerHour: number;
  queueUnits: number;
  materialCoverMinutes: number;
  serviceRequired: boolean;
  evidenceSourceRefs: readonly string[];
  effectRef?: string;
  riverVerification?: QelRiverVerificationReceiptV01;
  synthetic: true;
}

function performanceRatio(snapshot: SyntheticFactoryLineSnapshotV01): number {
  if (snapshot.targetRatePerHour <= 0) return 0;
  return snapshot.outputRatePerHour / snapshot.targetRatePerHour;
}

function mapState(snapshot: SyntheticFactoryLineSnapshotV01): QelOperationalFrameV01["state"] {
  const value: QelOperationalFrameV01["state"]["value"] =
    snapshot.nativeState === "RUNNING"
      ? "ACTIVE"
      : snapshot.nativeState === "IDLE"
        ? "IDLE"
        : snapshot.nativeState === "STARVED"
          ? "WAITING"
          : snapshot.nativeState === "FAULT"
            ? "BLOCKED"
            : "STOPPED";

  return { value, kind: "FACT", confidence: 1 };
}

function mapHealth(snapshot: SyntheticFactoryLineSnapshotV01): QelOperationalFrameV01["health"] {
  const ratio = performanceRatio(snapshot);
  let value: QelOperationalFrameV01["health"]["value"] = "GOOD";

  if (snapshot.nativeState === "FAULT") value = "ACT";
  else if (snapshot.nativeState === "STARVED" || snapshot.serviceRequired) value = "WATCH";
  else if (snapshot.nativeState === "RUNNING" && ratio < 0.75) value = "ACT";
  else if (snapshot.nativeState === "RUNNING" && ratio < 0.9) value = "WATCH";

  return { value, kind: "DERIVED", confidence: 1 };
}

function mapFlow(snapshot: SyntheticFactoryLineSnapshotV01): QelOperationalFrameV01["flow"] {
  const ratio = performanceRatio(snapshot);
  let state: QelOperationalFrameV01["flow"]["state"] = "NONE";

  if (snapshot.nativeState === "FAULT") state = "BLOCKED";
  else if (snapshot.nativeState === "STARVED") state = "QUEUED";
  else if (snapshot.nativeState === "RUNNING") state = ratio < 0.9 ? "SLOWING" : "FLOWING";

  return {
    state,
    value: snapshot.outputRatePerHour,
    unit: "PCS_PER_HOUR",
    direction: "OUTPUT",
    trend: state === "SLOWING" ? "FALLING" : "UNKNOWN",
  };
}

function mapDemand(snapshot: SyntheticFactoryLineSnapshotV01): QelOperationalFrameV01["demand"] {
  if (snapshot.targetRatePerHour <= 0) {
    return { type: "INFORMATION", priority: "HIGH", target: "target_rate_required" };
  }
  if (snapshot.nativeState === "FAULT" || snapshot.serviceRequired) {
    return { type: "SERVICE", priority: "HIGH", target: "line_service_required" };
  }
  if (snapshot.nativeState === "STARVED") {
    return { type: "MATERIAL", priority: "HIGH", target: "restore_material_flow" };
  }
  if (snapshot.materialCoverMinutes < 30) {
    return { type: "MATERIAL", priority: "MODERATE", target: "replenish_material" };
  }
  return { type: "NONE", priority: "NONE" };
}

function mapRisk(snapshot: SyntheticFactoryLineSnapshotV01): QelOperationalFrameV01["risk"] {
  const ratio = performanceRatio(snapshot);

  if (snapshot.targetRatePerHour <= 0) {
    return { type: "TARGET_RATE_INVALID", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.nativeState === "FAULT") {
    return { type: "PRODUCTION_INTERRUPTION", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.nativeState === "STARVED") {
    return { type: "MATERIAL_STARVATION", severity: "HIGH", confidence: 1 };
  }
  if (snapshot.materialCoverMinutes < 30) {
    return { type: "MATERIAL_STARVATION", severity: "MODERATE", confidence: 0.95 };
  }
  if (snapshot.nativeState === "RUNNING" && ratio < 0.75) {
    return { type: "THROUGHPUT_LOSS", severity: "HIGH", confidence: 0.95 };
  }
  if (snapshot.nativeState === "RUNNING" && ratio < 0.9) {
    return { type: "THROUGHPUT_LOSS", severity: "MODERATE", confidence: 0.9 };
  }

  return { type: "NONE", severity: "NONE", confidence: 1 };
}

function mapOutcome(snapshot: SyntheticFactoryLineSnapshotV01): QelOperationalFrameV01["outcome"] {
  if (!snapshot.effectRef) return { state: "OBSERVED" };

  return bindRiverVerifiedOutcomeV01({
    correlationId: snapshot.correlationId,
    effectRef: snapshot.effectRef,
    observedAt: snapshot.observedAt,
    maximumReceiptAgeMs: 30_000,
    receipt: snapshot.riverVerification,
  }).outcome;
}

export function mapSyntheticFactoryLineToQelFrameV01(
  snapshot: SyntheticFactoryLineSnapshotV01,
): QelOperationalFrameV01 {
  const hasEvidence = snapshot.evidenceSourceRefs.length > 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_002_REF}:${snapshot.lineRef}:${snapshot.correlationId}`,
    correlationId: snapshot.correlationId,
    observedAt: snapshot.observedAt,
    object: {
      id: snapshot.lineRef,
      type: "PRODUCTION_LINE",
      class: "SYNTHETIC_FACTORY_LINE",
      registryRef: snapshot.registryRef,
      locationRef: snapshot.locationRef,
    },
    state: mapState(snapshot),
    health: mapHealth(snapshot),
    flow: mapFlow(snapshot),
    demand: mapDemand(snapshot),
    risk: mapRisk(snapshot),
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: snapshot.lineRef },
      {
        action: "INSPECT",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "factory.line.inspect",
        targetRef: snapshot.lineRef,
      },
      {
        action: "REROUTE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "factory.flow.reroute",
        targetRef: snapshot.lineRef,
      },
      {
        action: "STOP",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "factory.line.stop",
        targetRef: snapshot.lineRef,
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
      provider: "SYNNERGYZE_FACTORY_LINE_SIMULATOR",
      protocol: "SYNTHETIC_FIXTURE",
      sourceRef: snapshot.lineRef,
      rawValue: {
        nativeState: snapshot.nativeState,
        outputRatePerHour: snapshot.outputRatePerHour,
        targetRatePerHour: snapshot.targetRatePerHour,
        queueUnits: snapshot.queueUnits,
        materialCoverMinutes: snapshot.materialCoverMinutes,
        serviceRequired: snapshot.serviceRequired,
        synthetic: true,
      },
      adapterRef: QEL_FACTORY_LINE_ADAPTER_REF,
      adapterVersion: QEL_FACTORY_LINE_ADAPTER_VERSION,
    },
  };
}

export function buildSyntheticFactoryLinePodPulseV01(
  input: SyntheticFactoryLineSnapshotV01 & { podRef: string },
): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapSyntheticFactoryLineToQelFrameV01(input)],
  });
}

export function makeSyntheticFactoryLineSnapshotV01(
  overrides: Partial<SyntheticFactoryLineSnapshotV01> = {},
): SyntheticFactoryLineSnapshotV01 {
  return {
    lineRef: "FACTORY-LINE-03",
    registryRef: "GENESIS:FACTORY-LINE-03",
    locationRef: "FACTORY-BLR-001",
    observedAt: "2026-08-21T09:30:00.000Z",
    correlationId: "QEL-FIXTURE-002-CORR-001",
    nativeState: "RUNNING",
    outputRatePerHour: 100,
    targetRatePerHour: 100,
    queueUnits: 40,
    materialCoverMinutes: 90,
    serviceRequired: false,
    evidenceSourceRefs: ["SIM-PLC-LINE-03", "SIM-MES-LINE-03"],
    synthetic: true,
    ...overrides,
  };
}
