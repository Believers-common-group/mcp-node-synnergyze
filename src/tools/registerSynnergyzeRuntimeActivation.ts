import { z } from "zod";

import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import type { ResolvedDeviceSecurityContextV1 } from "../../modules/synnergyze/contracts.ts";
import { SynnergyzeRuntimeActivationServiceV1 } from "../../modules/synnergyze/runtime-activation.ts";
import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import {
  WARDEN_CONFORMANCE_POLICY,
  enableEnvironmentVariable as wardenEnableEnvironmentVariable,
  parseWardenConformanceDecisionInput,
  wardenConformanceRequestJsonSchema,
} from "./registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnableEnvironmentVariable } from "./registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as synnergyzeEnableEnvironmentVariable } from "./registerWardenRiverSynnergyzeConformanceExecution.ts";
import { enableEnvironmentVariable as effectEnableEnvironmentVariable } from "./registerWardenRiverEffectConformance.ts";

export const operationId = "synnergyzeActivateControlledRuntimeR01";
export const description =
  "Run the device-bound synthetic Genesis → Warden → River → Synnergyze → River controlled runtime proof chain. External effects, settlement finality and Registry truth promotion remain disabled.";
export const enableEnvironmentVariable = "VSR_SYNNERGYZE_RUNTIME_ACTIVATION_R01";

export type SynnergyzeRuntimeActivationClock = () => string;

const executionDeviceSecuritySchema = z
  .object({
    resolutionRef: z.string().min(1),
    deviceRef: z.string().min(1),
    state: z.enum([
      "ACTIVE",
      "BAG_LOCK_REQUESTED",
      "SEALED",
      "SEALED_ALERT",
      "UNSEAL_PENDING",
      "WARDEN_REAUTH",
      "CONTROLLED_RECONNECT",
      "RECOVERY_REQUIRED",
    ]),
    policyRef: z.string().min(1).optional(),
    evidenceRef: z.string().min(1),
    assuranceLevel: z.enum(["L0", "L1", "L2", "L3", "L4"]).optional(),
    resolvedAt: z.string().min(1),
    validUntil: z.string().min(1).optional(),
  })
  .strict();

const toolInputSchema = z
  .object({
    request: z.unknown(),
    executionDeviceSecurity: executionDeviceSecuritySchema,
    groupScopeRef: z.string().min(1),
  })
  .strict();

export class SynnergyzeRuntimeActivationToolServiceV1 {
  private readonly runtime = new SynnergyzeRuntimeActivationServiceV1();

  execute(input: unknown, now: string) {
    const parsed = toolInputSchema.parse(input);
    const wardenInput = parseWardenConformanceDecisionInput({ request: parsed.request });
    const request = wardenInput.request as WardenDecisionRequestV1;

    if (!request.executionDeviceRef) {
      throw new Error("runtime_activation_tool_execution_device_required");
    }
    if (!request.genesisDevice) {
      throw new Error("runtime_activation_tool_genesis_device_required");
    }

    return this.runtime.execute({
      request,
      policy: WARDEN_CONFORMANCE_POLICY,
      executionDeviceSecurity: parsed.executionDeviceSecurity as ResolvedDeviceSecurityContextV1,
      estateScopeRef: request.genesisDevice.estateRef,
      groupScopeRef: parsed.groupScopeRef,
      timeline: {
        decidedAt: now,
        reservedAt: now,
        checkedAt: now,
        executedAt: now,
        observedAt: now,
        verifiedAt: now,
      },
    });
  }
}

export function registerSynnergyzeRuntimeActivation(
  server: CustomMcpServer,
  clock: SynnergyzeRuntimeActivationClock = () => new Date().toISOString(),
): void {
  const service = new SynnergyzeRuntimeActivationToolServiceV1();
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["request", "executionDeviceSecurity", "groupScopeRef"],
      properties: {
        request: wardenConformanceRequestJsonSchema,
        executionDeviceSecurity: {
          type: "object",
          additionalProperties: false,
          required: ["resolutionRef", "deviceRef", "state", "evidenceRef", "resolvedAt"],
          properties: {
            resolutionRef: { type: "string", minLength: 1 },
            deviceRef: { type: "string", minLength: 1 },
            state: {
              enum: [
                "ACTIVE",
                "BAG_LOCK_REQUESTED",
                "SEALED",
                "SEALED_ALERT",
                "UNSEAL_PENDING",
                "WARDEN_REAUTH",
                "CONTROLLED_RECONNECT",
                "RECOVERY_REQUIRED",
              ],
            },
            policyRef: { type: "string", minLength: 1 },
            evidenceRef: { type: "string", minLength: 1 },
            assuranceLevel: { enum: ["L0", "L1", "L2", "L3", "L4"] },
            resolvedAt: { type: "string", minLength: 1 },
            validUntil: { type: "string", minLength: 1 },
          },
        },
        groupScopeRef: { type: "string", minLength: 1 },
      },
    },
    cb: async (args) => JSON.stringify(service.execute(args, clock())),
  });
}

export function maybeRegisterSynnergyzeRuntimeActivation(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[wardenEnableEnvironmentVariable] !== "1") return false;
  if (env[riverEnableEnvironmentVariable] !== "1") return false;
  if (env[synnergyzeEnableEnvironmentVariable] !== "1") return false;
  if (env[effectEnableEnvironmentVariable] !== "1") return false;
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerSynnergyzeRuntimeActivation(server);
  return true;
}
