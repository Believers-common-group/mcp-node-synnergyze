import type { PefEventV1 } from "../../packages/contracts/event.ts";
import { validateProducerEvent } from "./ingestion.ts";
import { eventFingerprint, makeOutboxId, type PefOutboxRecordV1 } from "./persistence.ts";

export interface SqlTransactionV1 {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface SqlDatabaseV1 extends SqlTransactionV1 {
  transaction<T>(work: (tx: SqlTransactionV1) => Promise<T>): Promise<T>;
}

export class PostgresPefEventStoreV1 {
  constructor(private readonly db: SqlDatabaseV1) {}

  async ingest(input: unknown): Promise<"INSERTED" | "DUPLICATE"> {
    const event = validateProducerEvent(input);

    return this.db.transaction(async (tx) => {
      const fingerprint = eventFingerprint(event);
      const existing = await tx.query<{ payload_hash: string }>(
        "SELECT payload_hash FROM pef_event WHERE event_id = $1",
        [event.event_id],
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0]?.payload_hash !== fingerprint) {
          throw new Error("PEF_EVENT_IDEMPOTENCY_CONFLICT");
        }
        return "DUPLICATE";
      }

      await tx.query(
        `INSERT INTO pef_event (
          event_id, event_type, assertion_type, assurance, occurred_at, recorded_at,
          producer_id, producer_type, payload, payload_hash, source_event_id, predecessor_event_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
        [
          event.event_id,
          event.event_type,
          event.assertion_type,
          event.assurance,
          event.occurred_at,
          event.recorded_at,
          event.producer.producer_id,
          event.producer.producer_type,
          JSON.stringify(event.payload),
          fingerprint,
          event.source_event_id ?? null,
          event.predecessor_event_id ?? null,
        ],
      );

      await tx.query(
        `INSERT INTO pef_outbox (outbox_id, event_id, topic, payload, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [
          makeOutboxId(event),
          event.event_id,
          "pef.v1.observation.received",
          JSON.stringify(event),
          event.recorded_at,
        ],
      );

      return "INSERTED";
    });
  }

  async withLockedUnpublished<T>(
    limit: number,
    work: (
      rows: readonly PefOutboxRecordV1[],
      markPublished: (outboxId: string, publishedAt: string) => Promise<void>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<PefOutboxRecordV1>(
        `SELECT outbox_id, event_id, topic, payload, created_at, published_at
         FROM pef_outbox
         WHERE published_at IS NULL
         ORDER BY created_at, outbox_id
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [limit],
      );

      return work(result.rows, async (outboxId, publishedAt) => {
        await tx.query(
          "UPDATE pef_outbox SET published_at = COALESCE(published_at, $2) WHERE outbox_id = $1",
          [outboxId, publishedAt],
        );
      });
    });
  }

  async checkpointExists(consumerName: string, eventId: string): Promise<boolean> {
    const result = await this.db.query(
      "SELECT 1 FROM pef_consumer_checkpoint WHERE consumer_name = $1 AND event_id = $2",
      [consumerName, eventId],
    );
    return result.rows.length > 0;
  }

  async checkpoint(consumerName: string, eventId: string, processedAt: string): Promise<void> {
    await this.db.query(
      `INSERT INTO pef_consumer_checkpoint (consumer_name, event_id, processed_at)
       VALUES ($1,$2,$3) ON CONFLICT (consumer_name, event_id) DO NOTHING`,
      [consumerName, eventId, processedAt],
    );
  }
}
