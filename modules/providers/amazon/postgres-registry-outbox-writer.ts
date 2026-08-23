import { createHash } from "node:crypto";

import type {
  AmazonOrderRegistryProjectionV1,
  AmazonRegistryProjectionWriteResultV1,
  AmazonRegistryProjectionWriterV1,
} from "./governed-orders-runtime.ts";
import type { AmazonPostgresQueryExecutorV1 } from "./postgres-registry-writer.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertBatch(projections: readonly AmazonOrderRegistryProjectionV1[]): void {
  for (const projection of projections) {
    if (projection.piiProjected !== false) throw new Error("amazon_registry_pii_projection_forbidden");
    if (projection.providerRef !== "PROVIDER-AMAZON-001") throw new Error("amazon_registry_provider_ref_mismatch");
    if (!projection.orderRef || !projection.providerOrderId) throw new Error("amazon_registry_order_identity_required");
    if (!projection.providerEvidenceRef || !projection.providerResponseDigest) {
      throw new Error("amazon_registry_provider_evidence_required");
    }
  }

  if (projections.length === 0) return;
  if (new Set(projections.map((value) => value.providerEvidenceRef)).size !== 1) {
    throw new Error("amazon_registry_batch_requires_single_provider_evidence_ref");
  }
  if (new Set(projections.map((value) => value.correlationId)).size !== 1) {
    throw new Error("amazon_registry_batch_requires_single_correlation_ref");
  }
}

function revisionFor(projections: readonly AmazonOrderRegistryProjectionV1[]): string {
  const canonical = [...projections]
    .sort((a, b) => a.orderRef.localeCompare(b.orderRef))
    .map((p) => [p.orderRef, p.providerOrderId, p.lastUpdatedTime ?? null, p.providerResponseDigest, p.providerEvidenceRef, p.observedAt]);
  return `REGISTRY-REVISION:AMAZON:${digest(JSON.stringify(canonical)).slice(0, 24)}`;
}

export class PostgresAmazonRegistryOutboxWriterV1 implements AmazonRegistryProjectionWriterV1 {
  constructor(private readonly db: AmazonPostgresQueryExecutorV1) {}

  async writeBatch(
    projections: readonly AmazonOrderRegistryProjectionV1[],
  ): Promise<AmazonRegistryProjectionWriteResultV1> {
    assertBatch(projections);
    const registryRevisionRef = revisionFor(projections);
    const orderRefs = projections.map((value) => value.orderRef);
    const evidenceRefs = [...new Set(projections.map((value) => value.providerEvidenceRef))];
    const correlationRefs = [...new Set(projections.map((value) => value.correlationId))];
    const observedTimes = projections.map((value) => value.observedAt).sort();

    await this.db.query("BEGIN");
    try {
      for (const p of projections) {
        await this.db.query(
          `INSERT INTO uoe_master.amazon_order_projection (
             provider_order_id, order_ref, provider_ref, marketplace_id, marketplace_name,
             channel_name, created_time, last_updated_time, fulfillment_status, fulfilled_by,
             quantity_fulfilled, quantity_unfulfilled, proceeds_amount, proceeds_currency,
             provider_response_digest, provider_evidence_ref, correlation_id, observed_at,
             pii_projected, registry_revision_ref, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,
             $11,$12,$13,$14,$15,$16,$17,$18::timestamptz,$19,$20,now()
           )
           ON CONFLICT (provider_order_id) DO UPDATE SET
             order_ref=EXCLUDED.order_ref, provider_ref=EXCLUDED.provider_ref,
             marketplace_id=EXCLUDED.marketplace_id, marketplace_name=EXCLUDED.marketplace_name,
             channel_name=EXCLUDED.channel_name, created_time=EXCLUDED.created_time,
             last_updated_time=EXCLUDED.last_updated_time, fulfillment_status=EXCLUDED.fulfillment_status,
             fulfilled_by=EXCLUDED.fulfilled_by, quantity_fulfilled=EXCLUDED.quantity_fulfilled,
             quantity_unfulfilled=EXCLUDED.quantity_unfulfilled, proceeds_amount=EXCLUDED.proceeds_amount,
             proceeds_currency=EXCLUDED.proceeds_currency, provider_response_digest=EXCLUDED.provider_response_digest,
             provider_evidence_ref=EXCLUDED.provider_evidence_ref, correlation_id=EXCLUDED.correlation_id,
             observed_at=EXCLUDED.observed_at, pii_projected=EXCLUDED.pii_projected,
             registry_revision_ref=EXCLUDED.registry_revision_ref, updated_at=now()`,
          [
            p.providerOrderId, p.orderRef, p.providerRef, p.marketplaceId ?? null,
            p.marketplaceName ?? null, p.channelName ?? null, p.createdTime ?? null,
            p.lastUpdatedTime ?? null, p.fulfillmentStatus ?? null, p.fulfilledBy ?? null,
            p.quantityFulfilled ?? null, p.quantityUnfulfilled ?? null, p.proceedsAmount ?? null,
            p.proceedsCurrency ?? null, p.providerResponseDigest, p.providerEvidenceRef,
            p.correlationId, p.observedAt, p.piiProjected, registryRevisionRef,
          ],
        );
      }

      await this.db.query(
        `INSERT INTO uoe_master.amazon_order_projection_revision (
           registry_revision_ref, provider_ref, order_refs, provider_evidence_refs,
           correlation_refs, observed_from, observed_to, created_at
         ) VALUES ($1,'PROVIDER-AMAZON-001',$2::jsonb,$3::jsonb,$4::jsonb,$5::timestamptz,$6::timestamptz,now())
         ON CONFLICT (registry_revision_ref) DO NOTHING`,
        [
          registryRevisionRef, JSON.stringify(orderRefs), JSON.stringify(evidenceRefs),
          JSON.stringify(correlationRefs), observedTimes[0] ?? null, observedTimes.at(-1) ?? null,
        ],
      );

      if (projections.length > 0) {
        const providerEvidenceRef = evidenceRefs[0];
        const correlationRef = correlationRefs[0];
        if (!providerEvidenceRef || !correlationRef) throw new Error("amazon_registry_outbox_context_missing");
        const eventReference = `REGISTRY-EVENT:AMAZON:${digest(`${registryRevisionRef}|${providerEvidenceRef}|${correlationRef}`).slice(0, 24)}`;
        const payload = JSON.stringify({
          providerRef: "PROVIDER-AMAZON-001",
          registryRevisionRef,
          orderRefs,
          providerEvidenceRefs: evidenceRefs,
          correlationRefs,
          piiProjected: false,
        });
        await this.db.query(
          `INSERT INTO uoe_master.registry_outbox (
             event_reference, source_node_code, change_code, event_code, object_type, object_code,
             registry_revision_ref, payload, evidence_reference, occurred_at, attempt_count,
             delivery_state, available_at, last_error
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::timestamptz,0,$11,now(),NULL)
           ON CONFLICT DO NOTHING`,
          [
            eventReference, "CWR-REGISTRY", "UPSERT", "AMAZON_ORDER_PROJECTION_UPDATED",
            "amazon_order_projection_batch", registryRevisionRef, registryRevisionRef,
            payload, providerEvidenceRef, observedTimes.at(-1) ?? null, "pending",
          ],
        );
      }

      await this.db.query("COMMIT");
      return { registryRevisionRef, orderRefs };
    } catch (error) {
      try {
        await this.db.query("ROLLBACK");
      } catch {
        // Preserve the primary failure; the connection owner must treat rollback failure as fatal.
      }
      throw error;
    }
  }
}
