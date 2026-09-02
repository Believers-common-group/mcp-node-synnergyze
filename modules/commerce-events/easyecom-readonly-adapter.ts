import { createHash } from "node:crypto";
import { z } from "zod";

import type { CommerceSourceEventV1 } from "./contracts.ts";

const createOrderV2OrderSchema = z
  .object({
    order_id: z.union([z.number().int().nonnegative(), z.string().min(1)]),
    reference_code: z.string().nullable().optional(),
    marketplace: z.string().min(1),
    marketplace_id: z.union([z.number().int().nonnegative(), z.string().min(1)]),
    order_status: z.string().min(1),
    last_update_date: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const createOrderV2PayloadSchema = z.array(createOrderV2OrderSchema).min(1).max(100);
const updatedAfterSchema = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

function fingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 24);
}

export function adaptEasyEcomCreateOrderV2Payload(
  input: unknown,
  receivedAt: string,
): CommerceSourceEventV1[] {
  const parsedReceivedAt = Date.parse(receivedAt);
  if (!Number.isFinite(parsedReceivedAt)) throw new Error("EASYECOM_RECEIVED_AT_INVALID");

  const orders = createOrderV2PayloadSchema.parse(input);
  return orders.map((order) => {
    const orderId = String(order.order_id);
    const marketplaceId = String(order.marketplace_id);
    const versionSource = order.last_update_date ?? receivedAt;
    const orderRef = `ORDER:${orderId}`;
    const evidenceDigest = fingerprint([
      orderId,
      versionSource,
      order.reference_code ?? "",
      marketplaceId,
      order.order_status,
    ]);

    return {
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRef: "SYSTEM:VOI:EASYCOM",
      sourceEventName: "ecom_order_created",
      sourceRecordRef: `EASYCOM:ORDER:${orderId}`,
      sourceRecordVersionRef: `EASYCOM:UPDATED:${versionSource}`,
      evidenceRefs: [`EVIDENCE:EASYCOM:WEBHOOK:CREATE-ORDER-V2:${evidenceDigest}`],
      evidenceClasses: ["ORDER_RECORD"],
      subjectRef: orderRef,
      occurredAt: receivedAt,
      observedAt: receivedAt,
      correlationId: orderRef,
      predecessorEventRefs: [],
      admittedFields: {
        orderRef,
        marketplaceRef: `MARKETPLACE:EASYCOM:${marketplaceId}`,
        orderStatus: order.order_status,
      },
      fieldClassifications: {
        orderRef: "GOVERNED_INTERNAL",
        marketplaceRef: "PARTNER",
        orderStatus: "MANAGEMENT",
      },
      schemaVersion: "1.0.0",
    } satisfies CommerceSourceEventV1;
  });
}

export function buildEasyEcomGetAllOrdersV2Url(endpoint: string, updatedAfter: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("EASYECOM_BACKFILL_ENDPOINT_HTTPS_REQUIRED");
  updatedAfterSchema.parse(updatedAfter);
  url.searchParams.set("updated_after", updatedAfter);
  return url.toString();
}

export function adaptEasyEcomGetAllOrdersV2Payload(
  input: unknown,
  observedAt: string,
): CommerceSourceEventV1[] {
  return adaptEasyEcomCreateOrderV2Payload(input, observedAt).map((source) => ({
    ...source,
    evidenceRefs: source.evidenceRefs.map((ref) =>
      ref.replace(
        "EVIDENCE:EASYCOM:WEBHOOK:CREATE-ORDER-V2:",
        "EVIDENCE:EASYCOM:API:GET-ALL-ORDERS-V2:",
      ),
    ),
  }));
}
