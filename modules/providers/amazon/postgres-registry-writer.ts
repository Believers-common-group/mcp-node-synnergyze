import { createHash } from "node:crypto";

import type {
  AmazonOrderRegistryProjectionV1,
  AmazonRegistryProjectionWriteResultV1,
  AmazonRegistryProjectionWriterV1,
} from "./governed-orders-runtime.ts";

export interface AmazonPostgresQueryResultV1<T> {
  rows: T[];
  rowCount: number;
}

export interface AmazonPostgresQueryExecutorV1 {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<AmazonPostgresQueryResultV1<T>>;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function revisionFor(projections: readonly AmazonOrderRegistryProjectionV1[]): string {
  const canonical = [...projections]
    .sort((left, right) => left.orderRef.localeCompare(right.orderRef))
    .map((projection) => ({
      orderRef: projection.orderRef,
      providerOrderId: projection.providerOrderId,
      lastUpdatedTime: projection.lastUpdatedTime ?? null,
      providerResponseDigest: projection.providerResponseDigest,
      providerEvidenceRef: projection.providerEvidenceRef,
      observedAt: projection.observedAt,
    }));
  return `REGISTRY-REVISION:AMAZON:${digest(JSON.stringify(canonical)).slice(0, 24)}`;
}

function assertSafeProjection(projection: AmazonOrderRegistryProjectionV1): void {
  if (projection.piiProjected !== false) {
    throw new Error("amazon_registry_pii_projection_forbidden");
  }
  if (projection.providerRef !== "PROVIDER-AMAZON-001") {
    throw new Error("amazon_registry_provider_ref_mismatch");
  }
  if (!projection.orderRef || !projection.providerOrderId) {
    throw new Error("amazon_registry_order_identity_required");
  }
  if (!projection.providerEvidenceRef || !projection.providerResponseDigest) {
    throw new Error("amazon_registry_provider_evidence_required");
  }
}

export class PostgresAmazonRegistryProjectionWriterV1
  implements AmazonRegistryProjectionWriterV1
{
  constructor(private readonly db: AmazonPostgresQueryExecutorV1) {}

  async writeBatch(
    projections: readonly AmazonOrderRegistryProjectionV1[],
  ): Promise<AmazonRegistryProjectionWriteResultV1> {
    for (const projection of projections) assertSafeProjection(projection);

    const registryRevisionRef = revisionFor(projections);
    const orderRefs = projections.map((projection) => projection.orderRef);
    const evidenceRefs = [...new Set(projections.map((projection) => projection.providerEvidenceRef))];
    const correlationRefs = [...new Set(projections.map((projection) => projection.correlationId))];
    const observedTimes = projections.map((projection) => projection.observedAt).sort();

    await this.db.query("BEGIN");
    try {
      for (const projection of projections) {
        await this.db.query(
          `INSERT INTO uoe_master.amazon_order_projection (
             provider_order_id,
             order_ref,
             provider_ref,
             marketplace_id,
             marketplace_name,
             channel_name,
             created_time,
             last_updated_time,
             fulfillment_status,
             fulfilled_by,
             quantity_fulfilled,
             quantity_unfulfilled,
             proceeds_amount,
             proceeds_currency,
             provider_response_digest,
             provider_evidence_ref,
             correlation_id,
             observed_at,
             pii_projected,
             registry_revision_ref,
             updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz,
             $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::timestamptz,
             $19, $20, now()
           )
           ON CONFLICT (provider_order_id) DO UPDATE SET
             order_ref = EXCLUDED.order_ref,
             provider_ref = EXCLUDED.provider_ref,
             marketplace_id = EXCLUDED.marketplace_id,
             marketplace_name = EXCLUDED.marketplace_name,
             channel_name = EXCLUDED.channel_name,
             created_time = EXCLUDED.created_time,
             last_updated_time = EXCLUDED.last_updated_time,
             fulfillment_status = EXCLUDED.fulfillment_status,
             fulfilled_by = EXCLUDED.fulfilled_by,
             quantity_fulfilled = EXCLUDED.quantity_fulfilled,
             quantity_unfulfilled = EXCLUDED.quantity_unfulfilled,
             proceeds_amount = EXCLUDED.proceeds_amount,
             proceeds_currency = EXCLUDED.proceeds_currency,
             provider_response_digest = EXCLUDED.provider_response_digest,
             provider_evidence_ref = EXCLUDED.provider_evidence_ref,
             correlation_id = EXCLUDED.correlation_id,
             observed_at = EXCLUDED.observed_at,
             pii_projected = EXCLUDED.pii_projected,
             registry_revision_ref = EXCLUDED.registry_revision_ref,
             updated_at = now()`,
          [
            projection.providerOrderId,
            projection.orderRef,
            projection.providerRef,
            projection.marketplaceId ?? null,
            projection.marketplaceName ?? null,
            projection.channelName ?? null,
            projection.createdTime ?? null,
            projection.lastUpdatedTime ?? null,
            projection.fulfillmentStatus ?? null,
            projection.fulfilledBy ?? null,
            projection.quantityFulfilled ?? null,
            projection.quantityUnfulfilled ?? null,
            projection.proceedsAmount ?? null,
            projection.proceedsCurrency ?? null,
            projection.providerResponseDigest,
            projection.providerEvidenceRef,
            projection.correlationId,
            projection.observedAt,
            projection.piiProjected,
            registryRevisionRef,
          ],
        );
      }

      await this.db.query(
        `INSERT INTO uoe_master.amazon_order_projection_revision (
           registry_revision_ref,
           provider_ref,
           order_refs,
           provider_evidence_refs,
           correlation_refs,
           observed_from,
           observed_to,
           created_at
         ) VALUES (
           $1, 'PROVIDER-AMAZON-001', $2::jsonb, $3::jsonb, $4::jsonb,
           $5::timestamptz, $6::timestamptz, now()
         )
         ON CONFLICT (registry_revision_ref) DO NOTHING`,
        [
          registryRevisionRef,
          JSON.stringify(orderRefs),
          JSON.stringify(evidenceRefs),
          JSON.stringify(correlationRefs),
          observedTimes[0] ?? null,
          observedTimes.at(-1) ?? null,
        ],
      );

      await this.db.query("COMMIT");
      return { registryRevisionRef, orderRefs };
    } catch (error) {
      try {
        await this.db.query("ROLLBACK");
      } catch {
        // Preserve the primary Registry write failure. A broken rollback is a connection-level fault.
      }
      throw error;
    }
  }
}
