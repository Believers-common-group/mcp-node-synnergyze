import type { IncomingMessage, ServerResponse } from "node:http";

import { resolveComputePlaneStatus, type ComputePlaneStatus } from "./compute-plane.ts";
import {
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelOperationalFrameV01,
  validateQelOperationalFrameV01,
} from "../modules/qel/operational-contracts.ts";
import {
  buildQelPodPulseV01,
  type QelPodPulseV01,
} from "../modules/qel/pulse.ts";

export const QEL_ALPHA_COMPUTE_API_FIXTURE_REF = "QEL-FIXTURE-001:COMPUTE-PLANE" as const;
export const QEL_ALPHA_COMPUTE_API_ADAPTER_REF = "QEL-ADAPTER-ALPHA-COMPUTE-PLANE-001" as const;

export interface AlphaComputeQelStatusV01 {
  ok: boolean;
  fixture_ref: typeof QEL_ALPHA_COMPUTE_API_FIXTURE_REF;
  frame: QelOperationalFrameV01;
  pulse: QelPodPulseV01;
  validation_issues: readonly string[];
}

function mapPlaneCondition(status: ComputePlaneStatus): {
  state: QelOperationalFrameV01["state"]["value"];
  health: QelOperationalFrameV01["health"]["value"];
  demand: QelOperationalFrameV01["demand"];
  risk: QelOperationalFrameV01["risk"];
} {
  if (!status.ok) {
    return {
      state: "BLOCKED",
      health: "ACT",
      demand: {
        type: "INFORMATION",
        priority: "HIGH",
        target: "restore_governed_compute_plane_defaults",
      },
      risk: {
        type: "COMPUTE_POLICY_CONFIGURATION",
        severity: "HIGH",
        confidence: 1,
      },
    };
  }

  if (status.apple_mpp.status === "MISCONFIGURED_FAIL_CLOSED") {
    return {
      state: "DEGRADED",
      health: "ACT",
      demand: {
        type: "SERVICE",
        priority: "HIGH",
        target: "configure_apple_mpp_runner_or_disable_provider",
      },
      risk: {
        type: "APPLE_MPP_CONFIGURATION",
        severity: "HIGH",
        confidence: 1,
      },
    };
  }

  if (status.apple_mpp.status === "CONFIGURED_AWAITING_WARDEN_PROOF") {
    return {
      state: "READY",
      health: "WATCH",
      demand: {
        type: "APPROVAL",
        priority: "MODERATE",
        target: "warden_compute_proof_required_before_execution",
      },
      risk: {
        type: "NONE",
        severity: "NONE",
        confidence: 1,
      },
    };
  }

  return {
    state: "READY",
    health: "GOOD",
    demand: { type: "NONE", priority: "NONE" },
    risk: { type: "NONE", severity: "NONE", confidence: 1 },
  };
}

export function mapComputePlaneStatusToQelFrameV01(input: {
  status: ComputePlaneStatus;
  observedAt: string;
  correlationId: string;
}): QelOperationalFrameV01 {
  const condition = mapPlaneCondition(input.status);

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_ALPHA_COMPUTE_API_FIXTURE_REF}:${input.correlationId}`,
    correlationId: input.correlationId,
    observedAt: input.observedAt,
    object: {
      id: input.status.registry_object,
      type: "COMPUTE_PLANE",
      class: input.status.mode,
      registryRef: input.status.registry_object,
      locationRef: input.status.node_id,
    },
    state: {
      value: condition.state,
      kind: "DERIVED",
      confidence: 1,
    },
    health: {
      value: condition.health,
      kind: "DERIVED",
      confidence: 1,
    },
    flow: {
      state: condition.state === "BLOCKED" ? "BLOCKED" : "NONE",
      direction: "INTERNAL",
      trend: "UNKNOWN",
    },
    demand: condition.demand,
    risk: condition.risk,
    moves: [
      {
        action: "VIEW",
        authority: "ALLOWED",
        targetRef: input.status.registry_object,
      },
      {
        action: "REQUEST_COMPUTE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "compute.gemm",
        targetRef: input.status.registry_object,
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
          sourceRef: "api/compute-plane",
          kind: "SYSTEM",
          nativeRef: input.status.registry_object,
        },
      ],
    },
    outcome: {
      state: "OBSERVED",
    },
    native: {
      provider: "SYNNERGYZE_COMPUTE_PLANE",
      protocol: "HTTP_STATUS",
      sourceRef: "api/compute-plane",
      rawValue: input.status,
      adapterRef: QEL_ALPHA_COMPUTE_API_ADAPTER_REF,
      adapterVersion: "0.1.0",
    },
  };
}

export function resolveAlphaComputeQelStatusV01(
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): AlphaComputeQelStatusV01 {
  const observedAt = now().toISOString();
  const status = resolveComputePlaneStatus(env);
  const correlationId = `QEL-COMPUTE-PLANE:${observedAt}`;
  const frame = mapComputePlaneStatusToQelFrameV01({ status, observedAt, correlationId });
  const validation = validateQelOperationalFrameV01(frame);
  const pulse = buildQelPodPulseV01({
    podRef: "POD-ALPHA-COMPUTE-001",
    observedAt,
    frames: [frame],
  });

  return {
    ok: validation.ok,
    fixture_ref: QEL_ALPHA_COMPUTE_API_FIXTURE_REF,
    frame,
    pulse,
    validation_issues: validation.issues,
  };
}

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  const result = resolveAlphaComputeQelStatusV01();
  response.statusCode = result.ok ? 200 : 500;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(result));
}
