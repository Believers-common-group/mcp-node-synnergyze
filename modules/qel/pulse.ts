import type {
  QelAuthorityStateV01,
  QelEvidenceStateV01,
  QelHealthStateV01,
  QelOperationalFrameV01,
  QelRiskLevelV01,
} from "./operational-contracts.ts";

export const VSR_QEL_PULSE_CONTRACT_VERSION = "VSR-QEL-PULSE-001/0.1" as const;

export interface QelPulseNeedV01 {
  objectRef: string;
  type: string;
  priority: QelRiskLevelV01;
  target?: string;
}

export interface QelPulseRiskV01 {
  objectRef: string;
  type: string;
  severity: QelRiskLevelV01;
  confidence: number;
}

export interface QelPulseMoveV01 {
  objectRef: string;
  action: string;
  authority: QelAuthorityStateV01;
  targetRef?: string;
  capabilityRef?: string;
}

export interface QelPulseProofV01 {
  evidence: Record<QelEvidenceStateV01, number>;
  verifiedOutcomes: number;
  unresolvedOutcomes: number;
  riverBoundOutcomes: number;
}

export interface QelPodPulseV01 {
  contractVersion: typeof VSR_QEL_PULSE_CONTRACT_VERSION;
  podRef: string;
  observedAt: string;
  now: {
    objectCount: number;
    activeCount: number;
    blockedCount: number;
    criticalCount: number;
    health: QelHealthStateV01;
  };
  needs: readonly QelPulseNeedV01[];
  risks: readonly QelPulseRiskV01[];
  moves: readonly QelPulseMoveV01[];
  proof: QelPulseProofV01;
}

const HEALTH_RANK: Record<QelHealthStateV01, number> = {
  UNKNOWN: 0,
  GOOD: 1,
  WATCH: 2,
  ACT: 3,
  CRITICAL: 4,
};

const RISK_RANK: Record<QelRiskLevelV01, number> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function worstHealth(frames: readonly QelOperationalFrameV01[]): QelHealthStateV01 {
  return frames.reduce<QelHealthStateV01>((worst, frame) => {
    return HEALTH_RANK[frame.health.value] > HEALTH_RANK[worst] ? frame.health.value : worst;
  }, "UNKNOWN");
}

function makeEvidenceCounts(): Record<QelEvidenceStateV01, number> {
  return {
    FRESH: 0,
    AGING: 0,
    STALE: 0,
    MISSING: 0,
    CONFLICTING: 0,
  };
}

export function buildQelPodPulseV01(input: {
  podRef: string;
  observedAt: string;
  frames: readonly QelOperationalFrameV01[];
}): QelPodPulseV01 {
  const evidence = makeEvidenceCounts();
  const needs: QelPulseNeedV01[] = [];
  const risks: QelPulseRiskV01[] = [];
  const moves: QelPulseMoveV01[] = [];

  let verifiedOutcomes = 0;
  let unresolvedOutcomes = 0;
  let riverBoundOutcomes = 0;

  for (const frame of input.frames) {
    evidence[frame.evidence.status] += 1;

    if (frame.demand.type !== "NONE") {
      needs.push({
        objectRef: frame.object.id,
        type: frame.demand.type,
        priority: frame.demand.priority,
        target: frame.demand.target,
      });
    }

    if (frame.risk.severity !== "NONE") {
      risks.push({
        objectRef: frame.object.id,
        type: frame.risk.type,
        severity: frame.risk.severity,
        confidence: frame.risk.confidence,
      });
    }

    for (const move of frame.moves) {
      moves.push({
        objectRef: frame.object.id,
        action: move.action,
        authority: move.authority,
        targetRef: move.targetRef,
        capabilityRef: move.capabilityRef,
      });
    }

    if (frame.outcome.state === "VERIFIED") verifiedOutcomes += 1;
    if (frame.outcome.riverReceiptRef) riverBoundOutcomes += 1;
    if (["UNKNOWN", "CLAIMED", "EVIDENCE_BOUND", "OBSERVED", "UNKNOWN_FINAL_STATE"].includes(frame.outcome.state)) {
      unresolvedOutcomes += 1;
    }
  }

  needs.sort((a, b) => RISK_RANK[b.priority] - RISK_RANK[a.priority]);
  risks.sort((a, b) => RISK_RANK[b.severity] - RISK_RANK[a.severity]);

  return {
    contractVersion: VSR_QEL_PULSE_CONTRACT_VERSION,
    podRef: input.podRef,
    observedAt: input.observedAt,
    now: {
      objectCount: input.frames.length,
      activeCount: input.frames.filter((frame) => frame.state.value === "ACTIVE").length,
      blockedCount: input.frames.filter((frame) => frame.state.value === "BLOCKED").length,
      criticalCount: input.frames.filter(
        (frame) => frame.health.value === "CRITICAL" || frame.risk.severity === "CRITICAL",
      ).length,
      health: worstHealth(input.frames),
    },
    needs,
    risks,
    moves,
    proof: {
      evidence,
      verifiedOutcomes,
      unresolvedOutcomes,
      riverBoundOutcomes,
    },
  };
}
