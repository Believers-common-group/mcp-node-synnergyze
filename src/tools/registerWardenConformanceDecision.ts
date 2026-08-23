import { z } from "zod";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../../modules/warden/decision-service.ts";

export const operationId = "wardenEvaluateConformanceDecision";
export const description =
  "Evaluate the bounded synthetic Warden conformance policy. This tool does not perform an external effect and is disabled unless explicitly enabled.";
export const enableEnvironmentVariable = "VSR_WARDEN_MCP_CONFORMANCE";

const requestSchema = z
  .object({
    requestRef: z.string().min(1),
    actorRef: z.string().min(1),
    representedPrincipalRef: z.string().min(1),
    actingCapacityRef: z.string().min(1),
    contextRef: z.string().min(1),
    programRef: z.string().min(1),
    eventRef: z.string().min(1),
    action: z.string().min(1),
    capabilityRef: z.string().min(1),
    targetRef: z.string().min(1),
    requestedEffect: z.string().min(1).optional(),
    executionDeviceRef: z.string().min(1).optional(),
    deviceSecurityState: z.literal("ACTIVE").optional(),
    deviceSecurityPolicyRef: z.string().min(1).optional(),
    deviceSecuritySourceRefs: z.array(z.string().min(1)).optional(),
    deviceSecurityResolvedAt: z.string().min(1).optional(),
    deviceSecurityValidUntil: z.string().min(1).optional(),
    authorityRefs: z.array(z.string().min(1)),
    policyRefs: z.array(z.string().min(1)),
    representationSourceRefs: z.array(z.string().min(1)),
    evidenceReadinessRef: z.string().min(1).optional(),
    requestedAt: z.string().min(1),
    correlationId: z.string().min(1),
  })
  .strict();

const toolInputSchema = z.object({ request: requestSchema }).strict();

export type WardenConformanceDecisionToolInput = z.infer<typeof toolInputSchema>;
export type WardenConformanceClock = () => string;

/**
 * Fixed, non-production policy for transport conformance only.
 * Callers cannot supply or widen this policy through the MCP request.
 */
export const WARDEN_CONFORMANCE_POLICY: SyntheticWardenDecisionPolicyV1 = {
  policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:MCP-CONFORMANCE-001",
  wardenRef: "WARDEN-MCP-CONFORMANCE-001",
  lifecycle: "ACTIVE",
  validFrom: "2026-08-01T00:00:00.000Z",
  validUntil: "2026-12-31T23:59:59.999Z",
  actorRef: "DIGITALME-ALPHA-TEST-001",
  representedPrincipalRef: "LAB-COMPANY-001",
  actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
  contextRef: "ALPHA-NODE-001",
  programRef: "SYNNERGYZE-PROGRAM:001",
  requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
  requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
  allowedCapabilityRefs: ["service_request.create"],
  manualReviewCapabilityRefs: ["contract.execute"],
  constraints: ["MCP_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
};

export const wardenConformanceRequestJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "requestRef",
    "actorRef",
    "representedPrincipalRef",
    "actingCapacityRef",
    "contextRef",
    "programRef",
    "eventRef",
    "action",
    "capabilityRef",
    "targetRef",
    "authorityRefs",
    "policyRefs",
    "representationSourceRefs",
    "requestedAt",
    "correlationId",
  ],
  properties: {
    requestRef: { type: "string", minLength: 1 },
    actorRef: { type: "string", minLength: 1 },
    representedPrincipalRef: { type: "string", minLength: 1 },
    actingCapacityRef: { type: "string", minLength: 1 },
    contextRef: { type: "string", minLength: 1 },
    programRef: { type: "string", minLength: 1 },
    eventRef: { type: "string", minLength: 1 },
    action: { type: "string", minLength: 1 },
    capabilityRef: { type: "string", minLength: 1 },
    targetRef: { type: "string", minLength: 1 },
    requestedEffect: { type: "string", minLength: 1 },
    executionDeviceRef: { type: "string", minLength: 1 },
    deviceSecurityState: { const: "ACTIVE" },
    deviceSecurityPolicyRef: { type: "string", minLength: 1 },
    deviceSecuritySourceRefs: { type: "array", items: { type: "string", minLength: 1 } },
    deviceSecurityResolvedAt: { type: "string", minLength: 1 },
    deviceSecurityValidUntil: { type: "string", minLength: 1 },
    authorityRefs: { type: "array", items: { type: "string", minLength: 1 } },
    policyRefs: { type: "array", items: { type: "string", minLength: 1 } },
    representationSourceRefs: { type: "array", items: { type: "string", minLength: 1 } },
    evidenceReadinessRef: { type: "string", minLength: 1 },
    requestedAt: { type: "string", minLength: 1 },
    correlationId: { type: "string", minLength: 1 },
  },
};

export function evaluateWardenConformanceDecision(
  input: unknown,
  decidedAt = new Date().toISOString(),
) {
  const parsed = toolInputSchema.parse(input);
  return evaluateSyntheticWardenDecisionV1({
    request: parsed.request as WardenDecisionRequestV1,
    policy: WARDEN_CONFORMANCE_POLICY,
    decidedAt,
  });
}

export function registerWardenConformanceDecision(
  server: CustomMcpServer,
  clock: WardenConformanceClock = () => new Date().toISOString(),
): void {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["request"],
      properties: {
        request: wardenConformanceRequestJsonSchema,
      },
    },
    cb: async (args) => JSON.stringify(evaluateWardenConformanceDecision(args, clock())),
  });
}

/**
 * Dual opt-in gate: the environment switch must be enabled and the tool must
 * be named explicitly in --allow-tools. "all" intentionally does not expose it.
 */
export function maybeRegisterWardenConformanceDecision(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerWardenConformanceDecision(server);
  return true;
}
