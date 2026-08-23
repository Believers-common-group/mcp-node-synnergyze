import { createHash } from "node:crypto";

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
  parseWardenConformanceDecisionInput,
  wardenConformanceRequestJsonSchema,
} from "./registerWardenConformanceDecision.ts";

export const operationId = "riverReserveWardenConformanceAction";
export const description =
  "Evaluate the bounded Warden conformance request and reserve matching River evidence for ALLOW decisions. The raw Warden action token remains inside the server boundary.";
export const enableEnvironmentVariable = "VSR_RIVER_MCP_CONFORMANCE";

export type RiverWardenConformanceClock = () => string;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

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

function requestFingerprint(request: WardenDecisionRequestV1): string {
  return digest(
    JSON.stringify({
      ...request,
      authorityRefs: [...request.authorityRefs].sort(),
      policyRefs: [...request.policyRefs].sort(),
      representationSourceRefs: [...request.representationSourceRefs].sort(),
      deviceSecuritySourceRefs: [...(request.deviceSecuritySourceRefs ?? [])].sort(),
    }),
  );
}

type BindingResponse = {
  decision: ReturnType<typeof publicDecision>;
  actionRef: string | null;
  reservation: ReturnType<SyntheticRiverReservationServiceV1["reserve"]> | null;
};

type StoredBindingResponse = {
  fingerprint: string;
  response: BindingResponse;
};

export class RiverWardenConformanceBindingServiceV1 {
  private readonly river = new SyntheticRiverReservationServiceV1();
  private readonly byRequestRef = new Map<string, StoredBindingResponse>();

  execute(input: unknown, decidedAndReservedAt: string): BindingResponse {
    const parsed = parseWardenConformanceDecisionInput(input);
    const request = parsed.request as WardenDecisionRequestV1;
    const fingerprint = requestFingerprint(request);
    const existing = this.byRequestRef.get(request.requestRef);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("warden_river_request_replay_conflict");
      }
      return structuredClone(existing.response);
    }

    const decision = evaluateWardenConformanceDecision(parsed, decidedAndReservedAt);
    const safeDecision = publicDecision(decision);
    let response: BindingResponse;

    if (decision.decision !== "ALLOW") {
      response = {
        decision: safeDecision,
        actionRef: null,
        reservation: null,
      };
    } else {
      const action = buildAuthorizedActionEnvelopeV1(request, decision);
      const reservation = this.river.reserve({
        request,
        decision,
        action,
        reservedAt: decidedAndReservedAt,
      });
      response = {
        decision: safeDecision,
        actionRef: action.actionRef,
        reservation,
      };
    }

    this.byRequestRef.set(request.requestRef, {
      fingerprint,
      response: structuredClone(response),
    });
    return structuredClone(response);
  }
}

export function registerRiverWardenConformanceReservation(
  server: CustomMcpServer,
  clock: RiverWardenConformanceClock = () => new Date().toISOString(),
): void {
  const binding = new RiverWardenConformanceBindingServiceV1();

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
    cb: async (args) => JSON.stringify(binding.execute(args, clock())),
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
