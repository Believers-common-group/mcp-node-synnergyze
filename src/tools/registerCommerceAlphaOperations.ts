import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";

import { z } from "zod";

import type {
  CommerceEventObservationV1,
  CommerceSourceEventV1,
  CommerceSourcePolicyV1,
  CommerceTransitionResultV1,
} from "../../modules/commerce-events/contracts.ts";
import { normalizeCommerceEventV1 } from "../../modules/commerce-events/normalizer.ts";
import { evaluateCommerceTransitionV1 } from "../../modules/commerce-events/transition-integrity.ts";
import { bindCommerceObservationToHeaderBoardDraftV1 } from "../../modules/channels/commerce-binding.ts";
import { getCommerceProjectionProfileV1 } from "../../modules/channels/commerce-profiles.ts";
import type { HeaderBoardDraftV1 } from "../../modules/channels/contracts.ts";

const sourceOwnerSchema = z.enum([
  "LOGIC_ERP",
  "EASYCOM_OMS",
  "WOOQER",
  "CARRIER_FEED",
  "TALLY_ACCOUNTING",
  "POS",
  "WAREHOUSE_EXECUTION",
  "STORE_EXECUTION",
  "CRM",
  "SYNNERGYZE",
]);

const sourceRoleSchema = z.enum([
  "AUTHORITATIVE_ORIGIN",
  "EXECUTION_PROOF",
  "INTEGRATION_OBSERVER",
  "DERIVED_RECONCILIATION",
]);

const classificationSchema = z.enum([
  "PUBLIC",
  "CUSTOMER",
  "PARTNER",
  "WORKFORCE",
  "MANAGEMENT",
  "GOVERNED_INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
]);

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const sourceEventSchema = z
  .object({
    sourceOwner: sourceOwnerSchema,
    sourceRole: sourceRoleSchema,
    sourceSystemRef: z.string().min(1),
    sourceEventName: z.string().min(1),
    sourceRecordRef: z.string().min(1),
    sourceRecordVersionRef: z.string().min(1).optional(),
    evidenceRefs: z.array(z.string().min(1)).min(1),
    evidenceClasses: z.array(z.string().min(1)).min(1),
    subjectRef: z.string().min(1),
    placeRef: z.string().min(1).optional(),
    occurredAt: z.string().min(1),
    observedAt: z.string().min(1),
    correlationId: z.string().min(1),
    predecessorEventRefs: z.array(z.string().min(1)),
    admittedFields: z.record(jsonValueSchema),
    fieldClassifications: z.record(classificationSchema),
    schemaVersion: z.literal("1.0.0"),
  })
  .strict();

const projectionSchema = z
  .object({
    profileRef: z.string().min(1),
    headerBoardRef: z.string().min(1),
    publisherPrincipalRef: z.string().min(1),
    publisherCapacityRef: z.string().min(1),
    effectiveFrom: z.string().min(1),
  })
  .strict();

const toolInputSchema = z
  .object({
    sourceEvents: z.array(sourceEventSchema).min(1).max(25),
    projection: projectionSchema.optional(),
  })
  .strict();

export type CommerceAlphaOperationsToolInput = z.infer<typeof toolInputSchema>;

export const ALPHA_COMMERCE_SOURCE_POLICY: CommerceSourcePolicyV1 = Object.freeze({
  policyRef: "COMMERCE-SOURCE-POLICY:VOI:ALPHA-R0-3-1",
  version: 1,
  status: "ACTIVE",
  rules: [
    {
      eventType: "order_created",
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"],
    },
    {
      eventType: "inventory_reserved",
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"],
    },
    {
      eventType: "pick_task_created",
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"],
    },
    {
      eventType: "item_packed",
      sourceOwner: "WOOQER",
      sourceRole: "EXECUTION_PROOF",
      sourceSystemRefs: ["SYSTEM:VOI:WOOQER"],
    },
    {
      eventType: "shipment_dispatched",
      sourceOwner: "CARRIER_FEED",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:CARRIER"],
    },
    {
      eventType: "shipment_delivered",
      sourceOwner: "CARRIER_FEED",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:CARRIER"],
    },
    {
      eventType: "shipment_delivered",
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "INTEGRATION_OBSERVER",
      sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"],
    },
    {
      eventType: "invoice_created",
      sourceOwner: "LOGIC_ERP",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:LOGIC"],
    },
    {
      eventType: "return_created",
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"],
    },
  ] as const,
});

export interface CommerceAlphaOperationsResultV1 {
  policyRef: string;
  results: Array<{
    observation: CommerceEventObservationV1;
    transition: CommerceTransitionResultV1;
  }>;
  headerBoardDraft: HeaderBoardDraftV1 | null;
}

export function parseCommerceAlphaOperationsInput(input: unknown): CommerceAlphaOperationsToolInput {
  return toolInputSchema.parse(input);
}

export function evaluateCommerceAlphaOperations(input: unknown): CommerceAlphaOperationsResultV1 {
  const parsed = parseCommerceAlphaOperationsInput(input);
  const observations: CommerceEventObservationV1[] = [];
  const results: CommerceAlphaOperationsResultV1["results"] = [];

  for (const source of parsed.sourceEvents) {
    const observation = normalizeCommerceEventV1({
      source: source as CommerceSourceEventV1,
      policy: ALPHA_COMMERCE_SOURCE_POLICY,
    });
    const transition = evaluateCommerceTransitionV1(observation, observations);
    observations.push(observation);
    results.push({ observation, transition });
  }

  let headerBoardDraft: HeaderBoardDraftV1 | null = null;
  if (parsed.projection) {
    const final = results.at(-1);
    if (!final) throw new Error("COMMERCE_ALPHA_EMPTY_BATCH");
    if (final.transition.state === "ADMITTED") {
      headerBoardDraft = bindCommerceObservationToHeaderBoardDraftV1({
        observation: final.observation,
        transition: final.transition,
        profile: getCommerceProjectionProfileV1(parsed.projection.profileRef),
        headerBoardRef: parsed.projection.headerBoardRef,
        publisherPrincipalRef: parsed.projection.publisherPrincipalRef,
        publisherCapacityRef: parsed.projection.publisherCapacityRef,
        effectiveFrom: parsed.projection.effectiveFrom,
      });
    }
  }

  return {
    policyRef: ALPHA_COMMERCE_SOURCE_POLICY.policyRef,
    results,
    headerBoardDraft,
  };
}

export const operationId = "commerceEvaluateAlphaOperations";
export const description =
  "Normalize and assess bounded VOI commerce source events on Alpha and optionally prepare a Header Board draft. Read-only: no source mutation, publication authority, River reservation, or external connector effect.";
export const enableEnvironmentVariable = "VSR_COMMERCE_ALPHA_OPERATIONS";

const commerceAlphaSourceEventJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "sourceOwner",
    "sourceRole",
    "sourceSystemRef",
    "sourceEventName",
    "sourceRecordRef",
    "evidenceRefs",
    "evidenceClasses",
    "subjectRef",
    "occurredAt",
    "observedAt",
    "correlationId",
    "predecessorEventRefs",
    "admittedFields",
    "fieldClassifications",
    "schemaVersion",
  ],
  properties: {
    sourceOwner: { enum: sourceOwnerSchema.options },
    sourceRole: { enum: sourceRoleSchema.options },
    sourceSystemRef: { type: "string", minLength: 1 },
    sourceEventName: { type: "string", minLength: 1 },
    sourceRecordRef: { type: "string", minLength: 1 },
    sourceRecordVersionRef: { type: "string", minLength: 1 },
    evidenceRefs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    evidenceClasses: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    subjectRef: { type: "string", minLength: 1 },
    placeRef: { type: "string", minLength: 1 },
    occurredAt: { type: "string", minLength: 1 },
    observedAt: { type: "string", minLength: 1 },
    correlationId: { type: "string", minLength: 1 },
    predecessorEventRefs: { type: "array", items: { type: "string", minLength: 1 } },
    admittedFields: { type: "object", additionalProperties: true },
    fieldClassifications: {
      type: "object",
      additionalProperties: { enum: classificationSchema.options },
    },
    schemaVersion: { const: "1.0.0" },
  },
};

export const commerceAlphaOperationsInputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceEvents"],
  properties: {
    sourceEvents: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      items: commerceAlphaSourceEventJsonSchema,
    },
    projection: {
      type: "object",
      additionalProperties: false,
      required: [
        "profileRef",
        "headerBoardRef",
        "publisherPrincipalRef",
        "publisherCapacityRef",
        "effectiveFrom",
      ],
      properties: {
        profileRef: { type: "string", minLength: 1 },
        headerBoardRef: { type: "string", minLength: 1 },
        publisherPrincipalRef: { type: "string", minLength: 1 },
        publisherCapacityRef: { type: "string", minLength: 1 },
        effectiveFrom: { type: "string", minLength: 1 },
      },
    },
  },
};

export function registerCommerceAlphaOperations(server: CustomMcpServer): void {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true },
    inputSchema: commerceAlphaOperationsInputJsonSchema,
    cb: async (args) => JSON.stringify(evaluateCommerceAlphaOperations(args)),
  });
}

export function maybeRegisterCommerceAlphaOperations(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerCommerceAlphaOperations(server);
  return true;
}
