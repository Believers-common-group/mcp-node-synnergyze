import { createHash } from "node:crypto";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import {
  EffectExpectationServiceV1,
  SyntheticServiceRequestExpectationCompilerV1,
} from "../../modules/synnergyze/effect-expectation.ts";
import { ReconciliationFabricV1 } from "../../modules/synnergyze/reconciliation-fabric.ts";
import {
  enableEnvironmentVariable as wardenEnableEnvironmentVariable,
  parseWardenConformanceDecisionInput,
  wardenConformanceRequestJsonSchema,
} from "./registerWardenConformanceDecision.ts";
import {
  enableEnvironmentVariable as riverEnableEnvironmentVariable,
  RiverWardenConformanceBindingServiceV1,
} from "./registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as synnergyzeEnableEnvironmentVariable } from "./registerWardenRiverSynnergyzeConformanceExecution.ts";
import {
  enableEnvironmentVariable as effectEnableEnvironmentVariable,
  WardenRiverEffectConformanceServiceV1,
} from "./registerWardenRiverEffectConformance.ts";

export const operationId = "reconcileWardenRiverSynnergyzeConformanceEffect";
export const description =
  "Bind the expected effect before execution, run the governed conformance chain through River effect sealing, and reconcile expected versus observed reality. This conformance tool accepts service_request.create only with requestedEffect=service_request.created. Remedies remain unauthorized and require a fresh Warden decision.";
export const enableEnvironmentVariable = "VSR_RECONCILIATION_MCP_CONFORMANCE";

export type ReconciliationConformanceClock = () => string;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalRefs(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function requestFingerprint(request: WardenDecisionRequestV1): string {
  return digest(JSON.stringify({
    ...request,
    authorityRefs: canonicalRefs(request.authorityRefs),
    policyRefs: canonicalRefs(request.policyRefs),
    representationSourceRefs: canonicalRefs(request.representationSourceRefs),
    deviceSecuritySourceRefs: canonicalRefs(request.deviceSecuritySourceRefs ?? []),
  }));
}

const reconciliationRequestJsonSchema = {
  ...wardenConformanceRequestJsonSchema,
  required: [...wardenConformanceRequestJsonSchema.required, "requestedEffect"],
  properties: {
    ...wardenConformanceRequestJsonSchema.properties,
    requestedEffect: { const: "service_request.created" },
  },
};

export interface ReconciliationClosureReceiptV1 {
  version: "RECONCILIATION-CLOSURE-001";
  closureRef: string;
  reconciliationRef: string;
  executionReceiptRef: string;
  effectRef: string;
  sealRef: string;
  correlationId: string;
  state: "CLOSED";
  closedAt: string;
  synthetic: true;
  settlementFinality: false;
}

type EffectResponse = ReturnType<WardenRiverEffectConformanceServiceV1["execute"]>;
type ReconciliationResponse = {
  expectation: ReturnType<EffectExpectationServiceV1["compile"]> | null;
  effect: EffectResponse;
  reconciliation: ReturnType<ReconciliationFabricV1["reconcile"]> | null;
  closure: ReconciliationClosureReceiptV1 | null;
  state: "NOT_EXECUTED" | "RECONCILED_CLOSED" | "EXCEPTION_OPEN" | "REJECTED";
  idempotentReplay: boolean;
};

type StoredResponse = {
  fingerprint: string;
  response: ReconciliationResponse;
};

export class WardenReconciliationConformanceServiceV1 {
  private readonly binding = new RiverWardenConformanceBindingServiceV1();
  private readonly expectation = new EffectExpectationServiceV1([
    new SyntheticServiceRequestExpectationCompilerV1(),
  ]);
  private readonly fabric = new ReconciliationFabricV1();
  private readonly byRequestRef = new Map<string, StoredResponse>();

  constructor(
    private readonly effect: WardenRiverEffectConformanceServiceV1 =
      new WardenRiverEffectConformanceServiceV1(),
  ) {}

  execute(input: unknown, now: string): ReconciliationResponse {
    const parsed = parseWardenConformanceDecisionInput(input);
    const request = parsed.request as WardenDecisionRequestV1;
    const fingerprint = requestFingerprint(request);
    const existing = this.byRequestRef.get(request.requestRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("reconciliation_conformance_request_replay_conflict");
      }
      return { ...structuredClone(existing.response), idempotentReplay: true };
    }

    if (
      request.action === "service_request.create" ||
      request.capabilityRef === "service_request.create"
    ) {
      if (
        request.action !== "service_request.create" ||
        request.capabilityRef !== "service_request.create" ||
        request.requestedEffect !== "service_request.created"
      ) {
        throw new Error("reconciliation_conformance_requested_effect_invalid");
      }
    }

    // Preflight is deliberately completed before the effect path. It uses the
    // same deterministic Warden/River contracts to bind the expected effect to
    // the authorized action and reservation before Synnergyze execution.
    const preflight = this.binding.executeInternal(parsed, now);
    let expectation = null;
    if (preflight.decision.decision === "ALLOW" && preflight.action && preflight.reservation) {
      expectation = this.expectation.compile({
        action: preflight.action,
        reservation: preflight.reservation,
        compiledAt: now,
      });
    }

    const effect = this.effect.execute(parsed, now);
    if (!effect.execution.executionReceipt || !effect.execution.reservation) {
      const response: ReconciliationResponse = {
        expectation,
        effect,
        reconciliation: null,
        closure: null,
        state: "NOT_EXECUTED",
        idempotentReplay: false,
      };
      this.byRequestRef.set(request.requestRef, { fingerprint, response: structuredClone(response) });
      return structuredClone(response);
    }

    if (!expectation) {
      throw new Error("reconciliation_conformance_expectation_required_before_execution");
    }
    if (
      expectation.actionRef !== effect.execution.executionReceipt.actionRef ||
      expectation.reservationRef !== effect.execution.executionReceipt.reservationRef ||
      expectation.wardenDecisionRef !== effect.execution.executionReceipt.wardenDecisionRef
    ) {
      throw new Error("reconciliation_conformance_preflight_execution_mismatch");
    }
    if (!effect.verification) {
      throw new Error("reconciliation_conformance_verification_required");
    }

    const reconciliation = this.fabric.reconcile({
      expectation,
      receipt: effect.execution.executionReceipt,
      observation: effect.observation ?? undefined,
      verification: effect.verification,
      seal: effect.seal ?? undefined,
      causalTrace: effect.causalTrace ?? undefined,
      reconciledAt: now,
    });

    let closure: ReconciliationClosureReceiptV1 | null = null;
    let state: ReconciliationResponse["state"] = "REJECTED";
    if (reconciliation.state === "DETERMINED") {
      if (reconciliation.determination.closureEligible) {
        if (!reconciliation.determination.effectRef || !reconciliation.determination.sealRef) {
          throw new Error("reconciliation_conformance_closure_lineage_required");
        }
        closure = {
          version: "RECONCILIATION-CLOSURE-001",
          closureRef: `RECONCILIATION-CLOSURE:${digest(
            `${reconciliation.determination.reconciliationRef}|${reconciliation.determination.effectRef}|${reconciliation.determination.sealRef}`,
          ).slice(0, 24)}`,
          reconciliationRef: reconciliation.determination.reconciliationRef,
          executionReceiptRef: reconciliation.determination.executionReceiptRef,
          effectRef: reconciliation.determination.effectRef,
          sealRef: reconciliation.determination.sealRef,
          correlationId: reconciliation.determination.correlationId,
          state: "CLOSED",
          closedAt: now,
          synthetic: true,
          settlementFinality: false,
        };
        state = "RECONCILED_CLOSED";
      } else {
        state = "EXCEPTION_OPEN";
      }
    }

    const response: ReconciliationResponse = {
      expectation,
      effect,
      reconciliation,
      closure,
      state,
      idempotentReplay: false,
    };
    this.byRequestRef.set(request.requestRef, { fingerprint, response: structuredClone(response) });
    return structuredClone(response);
  }
}

export function registerWardenReconciliationConformance(
  server: CustomMcpServer,
  clock: ReconciliationConformanceClock = () => new Date().toISOString(),
): void {
  const service = new WardenReconciliationConformanceServiceV1();
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["request"],
      properties: { request: reconciliationRequestJsonSchema },
    },
    cb: async (args) => JSON.stringify(service.execute(args, clock())),
  });
}

/** Six-way opt-in; "all" never exposes this governed composite implicitly. */
export function maybeRegisterWardenReconciliationConformance(
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
  registerWardenReconciliationConformance(server);
  return true;
}
