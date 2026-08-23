import { createHash } from "node:crypto";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { WardenExecutionCheckpointV1 } from "../../modules/warden/contracts.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "../../modules/synnergyze/execution-gate.ts";
import {
  enableEnvironmentVariable as wardenEnableEnvironmentVariable,
  wardenConformanceRequestJsonSchema,
} from "./registerWardenConformanceDecision.ts";
import {
  enableEnvironmentVariable as riverEnableEnvironmentVariable,
  RiverWardenConformanceBindingServiceV1,
  type RiverWardenConformanceInternalV1,
} from "./registerRiverWardenConformanceReservation.ts";

export const operationId = "synnergyzeExecuteWardenRiverConformanceAction";
export const description =
  "Run the bounded Warden → River → Synnergyze conformance chain and return only an EXECUTED_UNVERIFIED synthetic execution receipt. No external effect is verified or sealed.";
export const enableEnvironmentVariable = "VSR_SYNNERGYZE_MCP_CONFORMANCE";

export type SynnergyzeConformanceClock = () => string;
export type SynnergyzeConformanceCheckpointFactory = (
  binding: RiverWardenConformanceInternalV1,
  checkedAt: string,
) => WardenExecutionCheckpointV1;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function defaultCheckpointFactory(
  binding: RiverWardenConformanceInternalV1,
  checkedAt: string,
): WardenExecutionCheckpointV1 {
  if (binding.decision.decision !== "ALLOW" || !binding.reservation) {
    throw new Error("synnergyze_conformance_allow_reservation_required");
  }

  return {
    checkpointRef: `WARDEN-EXEC-CHECK:${digest(
      [binding.decision.decisionRef, binding.reservation.reservationRef].join("|"),
    ).slice(0, 24)}`,
    decisionRef: binding.decision.decisionRef,
    wardenRef: binding.decision.wardenRef,
    correlationId: binding.decision.correlationId,
    state: "VALID",
    checkedAt,
    reasonCodes: ["synthetic_conformance_checkpoint_valid"],
  };
}

function publicCheckpoint(checkpoint: WardenExecutionCheckpointV1) {
  return {
    ...checkpoint,
    synthetic: true,
  } as const;
}

type ExecutionResponse = {
  decision: RiverWardenConformanceInternalV1["response"]["decision"];
  actionRef: string | null;
  reservation: RiverWardenConformanceInternalV1["response"]["reservation"];
  checkpoint: ReturnType<typeof publicCheckpoint> | null;
  executionReceipt: ReturnType<ControlledExecutionGateV1["execute"]> | null;
};

type StoredExecution = {
  fingerprint: string;
  checkpoint: WardenExecutionCheckpointV1 | null;
  executedAt: string | null;
  response: ExecutionResponse;
};

export class WardenRiverSynnergyzeConformanceExecutionServiceV1 {
  private readonly binding = new RiverWardenConformanceBindingServiceV1();
  private readonly adapter = new SyntheticServiceRequestCreateAdapterV1();
  private readonly gate = new ControlledExecutionGateV1([this.adapter]);
  private readonly byRequestRef = new Map<string, StoredExecution>();

  constructor(
    private readonly checkpointFactory: SynnergyzeConformanceCheckpointFactory =
      defaultCheckpointFactory,
  ) {}

  execute(input: unknown, now: string): ExecutionResponse {
    const binding = this.binding.executeInternal(input, now);
    const existing = this.byRequestRef.get(binding.request.requestRef);

    if (existing) {
      if (existing.fingerprint !== binding.requestFingerprint) {
        throw new Error("synnergyze_conformance_request_replay_conflict");
      }

      if (
        binding.decision.decision === "ALLOW" &&
        binding.action &&
        binding.reservation &&
        existing.checkpoint &&
        existing.executedAt
      ) {
        const replayReceipt = this.gate.execute({
          action: binding.action,
          reservation: binding.reservation,
          decision: binding.decision,
          checkpoint: existing.checkpoint,
          executedAt: existing.executedAt,
        });
        return {
          ...structuredClone(existing.response),
          executionReceipt: replayReceipt,
        };
      }

      return structuredClone(existing.response);
    }

    if (binding.decision.decision !== "ALLOW" || !binding.action || !binding.reservation) {
      const response: ExecutionResponse = {
        decision: binding.response.decision,
        actionRef: binding.response.actionRef,
        reservation: binding.response.reservation,
        checkpoint: null,
        executionReceipt: null,
      };
      this.byRequestRef.set(binding.request.requestRef, {
        fingerprint: binding.requestFingerprint,
        checkpoint: null,
        executedAt: null,
        response: structuredClone(response),
      });
      return response;
    }

    if (binding.action.executionDeviceRef) {
      throw new Error("synnergyze_conformance_execution_device_security_not_bound");
    }

    const checkpoint = this.checkpointFactory(binding, now);
    const executionReceipt = this.gate.execute({
      action: binding.action,
      reservation: binding.reservation,
      decision: binding.decision,
      checkpoint,
      executedAt: now,
    });

    const response: ExecutionResponse = {
      decision: binding.response.decision,
      actionRef: binding.action.actionRef,
      reservation: binding.reservation,
      checkpoint: publicCheckpoint(checkpoint),
      executionReceipt,
    };
    this.byRequestRef.set(binding.request.requestRef, {
      fingerprint: binding.requestFingerprint,
      checkpoint: structuredClone(checkpoint),
      executedAt: now,
      response: structuredClone(response),
    });
    return structuredClone(response);
  }

  executionCount(): number {
    return this.gate.executionCount();
  }

  adapterInvocationCount(): number {
    return this.adapter.invocationCount();
  }
}

export function registerWardenRiverSynnergyzeConformanceExecution(
  server: CustomMcpServer,
  clock: SynnergyzeConformanceClock = () => new Date().toISOString(),
): void {
  const service = new WardenRiverSynnergyzeConformanceExecutionServiceV1();

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
 * Four-way opt-in: all three conformance layers must be enabled and the exact
 * Synnergyze composite tool must be explicitly allow-listed.
 */
export function maybeRegisterWardenRiverSynnergyzeConformanceExecution(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[wardenEnableEnvironmentVariable] !== "1") return false;
  if (env[riverEnableEnvironmentVariable] !== "1") return false;
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerWardenRiverSynnergyzeConformanceExecution(server);
  return true;
}
