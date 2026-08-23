import { createHash } from "node:crypto";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { Rc1EvidenceEntry } from "../../rc1/runtime.ts";
import { adaptRc1CausalTrace, adaptRc1EvidenceSeal } from "../../modules/river/rc1-adapter.ts";
import {
  EffectVerificationServiceV1,
  SyntheticServiceRequestObservationSourceV1,
  type PostExecutionObservationSourceV1,
} from "../../modules/synnergyze/effect-verification.ts";
import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import {
  enableEnvironmentVariable as wardenEnableEnvironmentVariable,
  parseWardenConformanceDecisionInput,
  wardenConformanceRequestJsonSchema,
} from "./registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnableEnvironmentVariable } from "./registerRiverWardenConformanceReservation.ts";
import {
  enableEnvironmentVariable as synnergyzeEnableEnvironmentVariable,
  WardenRiverSynnergyzeConformanceExecutionServiceV1,
} from "./registerWardenRiverSynnergyzeConformanceExecution.ts";

export const operationId = "riverVerifyAndSealWardenSynnergyzeConformanceEffect";
export const description =
  "Run the bounded Warden → River → Synnergyze conformance chain, observe and verify the synthetic post-execution effect, and emit a River evidence seal. Reconciliation and closure remain separate.";
export const enableEnvironmentVariable = "VSR_EFFECT_MCP_CONFORMANCE";

export type EffectConformanceClock = () => string;

type ExecutionResponse = ReturnType<WardenRiverSynnergyzeConformanceExecutionServiceV1["execute"]>;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalRefs(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function requestFingerprint(request: WardenDecisionRequestV1): string {
  return digest(
    JSON.stringify({
      ...request,
      authorityRefs: canonicalRefs(request.authorityRefs),
      policyRefs: canonicalRefs(request.policyRefs),
      representationSourceRefs: canonicalRefs(request.representationSourceRefs),
      deviceSecuritySourceRefs: canonicalRefs(request.deviceSecuritySourceRefs ?? []),
    }),
  );
}

function buildRc1ConformanceEntries(
  execution: ExecutionResponse,
  effectRef: string,
): readonly Rc1EvidenceEntry[] {
  if (!execution.reservation || !execution.executionReceipt) {
    throw new Error("effect_conformance_execution_reservation_required");
  }
  if (execution.executionReceipt.capabilityRef !== "service_request.create") {
    throw new Error("effect_conformance_capability_not_supported");
  }

  const capability = "service_request.create" as const;
  const correlationId = execution.executionReceipt.correlationId;
  const decisionRef = execution.executionReceipt.wardenDecisionRef;
  const sealEvidenceRef = `RIVER-EVIDENCE-SEALED:${digest(
    `${execution.reservation.reservationRef}|${effectRef}|${correlationId}`,
  ).slice(0, 24)}`;

  return [
    {
      evidenceRef: execution.reservation.reservationRef,
      correlationId,
      stage: "RESERVED",
      capability,
      decisionRef,
    },
    {
      evidenceRef: sealEvidenceRef,
      correlationId,
      stage: "SEALED",
      capability,
      decisionRef,
      effectRef,
    },
  ];
}

type EffectConformanceResponse = {
  execution: ExecutionResponse;
  observation: ReturnType<PostExecutionObservationSourceV1["observe"]> | null;
  verification: ReturnType<EffectVerificationServiceV1["verify"]> | null;
  seal: ReturnType<typeof adaptRc1EvidenceSeal> | null;
  causalTrace: ReturnType<typeof adaptRc1CausalTrace> | null;
  reconciliationState: "PENDING";
  idempotentReplay: boolean;
};

type StoredEffectConformance = {
  fingerprint: string;
  response: EffectConformanceResponse;
};

export class WardenRiverEffectConformanceServiceV1 {
  private readonly execution = new WardenRiverSynnergyzeConformanceExecutionServiceV1();
  private readonly verifier = new EffectVerificationServiceV1();
  private readonly byRequestRef = new Map<string, StoredEffectConformance>();

  constructor(
    private readonly observer: PostExecutionObservationSourceV1 =
      new SyntheticServiceRequestObservationSourceV1(),
  ) {}

  execute(input: unknown, now: string): EffectConformanceResponse {
    const parsed = parseWardenConformanceDecisionInput(input);
    const request = parsed.request as WardenDecisionRequestV1;
    const fingerprint = requestFingerprint(request);
    const existing = this.byRequestRef.get(request.requestRef);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("effect_conformance_request_replay_conflict");
      }
      return {
        ...structuredClone(existing.response),
        idempotentReplay: true,
      };
    }

    const execution = this.execution.execute(parsed, now);
    if (!execution.executionReceipt || !execution.reservation) {
      const response: EffectConformanceResponse = {
        execution,
        observation: null,
        verification: null,
        seal: null,
        causalTrace: null,
        reconciliationState: "PENDING",
        idempotentReplay: false,
      };
      this.byRequestRef.set(request.requestRef, {
        fingerprint,
        response: structuredClone(response),
      });
      return response;
    }

    const observation = this.observer.observe(execution.executionReceipt, now);
    const verification = this.verifier.verify({
      receipt: execution.executionReceipt,
      observation,
      verifiedAt: now,
    });

    if (verification.state !== "VERIFIED_EFFECT") {
      const response: EffectConformanceResponse = {
        execution,
        observation,
        verification,
        seal: null,
        causalTrace: null,
        reconciliationState: "PENDING",
        idempotentReplay: false,
      };
      this.byRequestRef.set(request.requestRef, {
        fingerprint,
        response: structuredClone(response),
      });
      return response;
    }

    const entries = buildRc1ConformanceEntries(execution, verification.effect.effectRef);
    const seal = adaptRc1EvidenceSeal(execution.reservation, verification.effect, entries);
    const causalTrace = adaptRc1CausalTrace(execution.executionReceipt.correlationId, entries);
    const response: EffectConformanceResponse = {
      execution,
      observation,
      verification,
      seal,
      causalTrace,
      reconciliationState: "PENDING",
      idempotentReplay: false,
    };
    this.byRequestRef.set(request.requestRef, {
      fingerprint,
      response: structuredClone(response),
    });
    return structuredClone(response);
  }
}

export function registerWardenRiverEffectConformance(
  server: CustomMcpServer,
  clock: EffectConformanceClock = () => new Date().toISOString(),
): void {
  const service = new WardenRiverEffectConformanceServiceV1();

  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["request"],
      properties: {
        request: wardenConformanceRequestJsonSchema,
      },
    },
    cb: async (args) => JSON.stringify(service.execute(args, clock())),
  });
}

/**
 * Five-way opt-in: Warden, River, Synnergyze and effect conformance switches
 * must all be enabled, and this exact composite tool must be allow-listed.
 */
export function maybeRegisterWardenRiverEffectConformance(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[wardenEnableEnvironmentVariable] !== "1") return false;
  if (env[riverEnableEnvironmentVariable] !== "1") return false;
  if (env[synnergyzeEnableEnvironmentVariable] !== "1") return false;
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerWardenRiverEffectConformance(server);
  return true;
}
