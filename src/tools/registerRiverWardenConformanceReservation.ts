import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../../modules/warden/contracts.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../../modules/river/reservation-service.ts";
import {
  enableEnvironmentVariable as wardenEnableEnvironmentVariable,
  evaluateWardenConformanceDecision,
  type WardenConformanceDecisionToolInput,
  wardenConformanceRequestJsonSchema,
} from "./registerWardenConformanceDecision.ts";

export const operationId = "riverReserveWardenConformanceAction";
export const description =
  "Evaluate the bounded Warden conformance request and reserve matching River evidence for ALLOW decisions. The raw Warden action token remains inside the server boundary.";
export const enableEnvironmentVariable = "VSR_RIVER_MCP_CONFORMANCE";

export type RiverWardenConformanceClock = () => string;

function publicDecision(decision: WardenDecisionV1) {
  return {
    decisionRef: decision.decisionRef,
    requestRef: decision.requestRef,
    wardenRef: decision.wardenRef,
    decision: decision.decision,
    action: decision.action,
    targetRef: decision.targetRef,
    reasonCodes: decision.reasonCodes,
    constraints: decision.constraints,
    decidedAt: decision.decidedAt,
    validUntil: decision.validUntil,
    correlationId: decision.correlationId,
  } as const;
}

export function reserveWardenConformanceAction(
  input: unknown,
  river: SyntheticRiverReservationServiceV1,
  decidedAndReservedAt: string,
) {
  const decision = evaluateWardenConformanceDecision(input, decidedAndReservedAt);
  const safeDecision = publicDecision(decision);

  if (decision.decision !== "ALLOW") {
    return {
      decision: safeDecision,
      actionRef: null,
      reservation: null,
    } as const;
  }

  // evaluateWardenConformanceDecision has already validated this shape.
  const request = (input as WardenConformanceDecisionToolInput).request as WardenDecisionRequestV1;
  const action = buildAuthorizedActionEnvelopeV1(request, decision);
  const reservation = river.reserve({
    request,
    decision,
    action,
    reservedAt: decidedAndReservedAt,
  });

  return {
    decision: safeDecision,
    actionRef: action.actionRef,
    reservation,
  } as const;
}

export function registerRiverWardenConformanceReservation(
  server: CustomMcpServer,
  clock: RiverWardenConformanceClock = () => new Date().toISOString(),
): void {
  const river = new SyntheticRiverReservationServiceV1();

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
    cb: async (args) => JSON.stringify(reserveWardenConformanceAction(args, river, clock())),
  });
}

/**
 * Triple opt-in gate. River binding is available only when both Warden and
 * River conformance switches are enabled and the composite capability is
 * named explicitly in --allow-tools. "all" intentionally does not expose it.
 */
export function maybeRegisterRiverWardenConformanceReservation(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[wardenEnableEnvironmentVariable] !== "1") return false;
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerRiverWardenConformanceReservation(server);
  return true;
}
