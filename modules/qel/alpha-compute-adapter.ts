import type {
  ComputeAttemptResult,
  RunnerRegistration,
} from "../../compute/runtime.ts";
import {
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelOperationalFrameV01,
} from "./operational-contracts.ts";
import {
  buildQelPodPulseV01,
  type QelPodPulseV01,
} from "./pulse.ts";

export const QEL_FIXTURE_001_REF = "QEL-FIXTURE-001" as const;
export const QEL_ALPHA_COMPUTE_ADAPTER_REF = "QEL-ADAPTER-ALPHA-COMPUTE-001" as const;
export const QEL_ALPHA_COMPUTE_ADAPTER_VERSION = "0.1.0" as const;

export interface AlphaComputeQelInputV01 {
  registration: RunnerRegistration;
  observedAt: string;
  correlationId: string;
  attempt?: ComputeAttemptResult;
}

function mapAttemptOutcome(attempt: ComputeAttemptResult | undefined): QelOperationalFrameV01["outcome"] {
  if (!attempt) return { state: "UNKNOWN" };

  if (attempt.status === "VERIFIED") {
    return {
      state: "EVIDENCE_BOUND",
      effectRef: attempt.evidenceRef,
    };
  }

  if (attempt.status === "DENIED" || attempt.status === "BLOCKED_REQUIREMENT") {
    return {
      state: "FAILED",
      effectRef: attempt.evidenceRef,
    };
  }

  return {
    state: "UNKNOWN_FINAL_STATE",
    effectRef: attempt.evidenceRef,
  };
}

function demandFromAttempt(
  attempt: ComputeAttemptResult | undefined,
): QelOperationalFrameV01["demand"] {
  if (!attempt) return { type: "NONE", priority: "NONE" };

  if (attempt.status === "BLOCKED_REQUIREMENT") {
    return {
      type: attempt.reason === "warden_compute_grant_missing" ? "APPROVAL" : "INFORMATION",
      priority: "HIGH",
      target: attempt.reason,
    };
  }

  if (attempt.status === "UNAVAILABLE") {
    return {
      type: "SERVICE",
      priority: "HIGH",
      target: attempt.reason,
    };
  }

  return { type: "NONE", priority: "NONE" };
}

export function mapAlphaComputeRunnerToQelFrameV01(
  input: AlphaComputeQelInputV01,
): QelOperationalFrameV01 {
  const { registration, attempt } = input;
  const revoked = registration.status === "REVOKED";
  const blocked = attempt?.status === "BLOCKED_REQUIREMENT" || attempt?.status === "DENIED";
  const unavailable = attempt?.status === "UNAVAILABLE";
  const ready = registration.attested && registration.toolchainStatus !== undefined && !revoked;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_001_REF}:${registration.runnerId}:${input.correlationId}`,
    correlationId: input.correlationId,
    observedAt: input.observedAt,
    object: {
      id: registration.runnerId,
      type: "COMPUTE_SERVICE",
      class: registration.provider,
      registryRef: registration.runnerId,
      locationRef: registration.nodeId,
    },
    state: {
      value: revoked ? "STOPPED" : blocked || unavailable ? "BLOCKED" : ready ? "READY" : "DEGRADED",
      kind: "FACT",
      confidence: 1,
    },
    health: {
      value: revoked ? "ACT" : unavailable ? "ACT" : blocked ? "WATCH" : ready ? "GOOD" : "WATCH",
      kind: "DERIVED",
      confidence: 1,
    },
    flow: {
      state: attempt?.status === "VERIFIED" ? "COMPLETE" : blocked || unavailable ? "BLOCKED" : "NONE",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: demandFromAttempt(attempt),
    risk: {
      type: revoked
        ? "RUNNER_REVOKED"
        : unavailable
          ? "COMPUTE_UNAVAILABLE"
          : blocked
            ? "COMPUTE_ACTION_BLOCKED"
            : "NONE",
      severity: revoked || unavailable ? "HIGH" : blocked ? "MODERATE" : "NONE",
      confidence: 1,
    },
    moves: [
      {
        action: "VIEW",
        authority: "ALLOWED",
        targetRef: registration.runnerId,
      },
      {
        action: "RUN_COMPUTE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "compute.gemm",
        targetRef: registration.runnerId,
      },
    ],
    evidence: {
      status: "FRESH",
      confidence: 1,
      freshness: {
        observedAt: input.observedAt,
        ageMs: 0,
        status: "FRESH",
        maximumValidAgeMs: 30_000,
      },
      sources: [
        {
          sourceRef: registration.runnerId,
          kind: "SYSTEM",
          nativeRef: registration.provider,
        },
      ],
    },
    outcome: mapAttemptOutcome(attempt),
    native: {
      provider: "SYNNERGYZE_COMPUTE_RUNTIME",
      protocol: "LOCAL_RUNTIME",
      sourceRef: registration.runnerId,
      rawValue: {
        status: registration.status,
        attested: registration.attested,
        toolchainStatus: registration.toolchainStatus,
        hardwareClass: registration.hardwareClass,
        provider: registration.provider,
        synthetic: registration.synthetic,
      },
      adapterRef: QEL_ALPHA_COMPUTE_ADAPTER_REF,
      adapterVersion: QEL_ALPHA_COMPUTE_ADAPTER_VERSION,
    },
  };
}

export function buildAlphaComputePodPulseV01(
  input: AlphaComputeQelInputV01 & { podRef: string },
): QelPodPulseV01 {
  const frame = mapAlphaComputeRunnerToQelFrameV01(input);
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [frame],
  });
}
