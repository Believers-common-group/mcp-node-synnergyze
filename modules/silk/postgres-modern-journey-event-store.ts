import type { PostgresQueryExecutorV1 } from "../synnergyze/postgres-remedy-journal.ts";
import {
  validateModernJourneyEventRecordV1,
  type ModernJourneyEventRecordV1,
} from "./modern-journey-event-log.ts";

export type ModernJourneyEventStoreWriteStateV1 = "STORED" | "IDEMPOTENT_REPLAY" | "CONFLICT";

export interface ModernJourneyEventStoreWriteResultV1 {
  state: ModernJourneyEventStoreWriteStateV1;
  record?: ModernJourneyEventRecordV1;
}

interface EventRowV1 {
  event_ref: string;
  transaction_ref: string;
  journey_ref: string;
  sequence: number;
  predecessor_event_ref: string | null;
  correlation_id: string;
  event_type: string;
  occurred_at: string;
  payload_digest: string;
  idempotency_key: string;
  event_json: ModernJourneyEventRecordV1 | string;
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function cloneRecord(record: ModernJourneyEventRecordV1): ModernJourneyEventRecordV1 {
  return {
    ...record,
    payload: JSON.parse(JSON.stringify(record.payload)) as Record<string, unknown>,
    idempotentReplay: record.idempotentReplay,
  };
}

function assertPersistable(record: ModernJourneyEventRecordV1): void {
  validateModernJourneyEventRecordV1(record);
}

function sameInstant(left: string, right: string): boolean {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function sameIdentity(row: EventRowV1, record: ModernJourneyEventRecordV1): boolean {
  const persisted = parseJson(row.event_json);
  try {
    validateModernJourneyEventRecordV1(persisted);
  } catch {
    return false;
  }
  return (
    row.event_ref === record.eventRef &&
    row.transaction_ref === record.transactionRef &&
    row.journey_ref === record.journeyRef &&
    row.sequence === record.sequence &&
    (row.predecessor_event_ref ?? undefined) === record.predecessorEventRef &&
    row.correlation_id === record.correlationId &&
    row.event_type === record.eventType &&
    sameInstant(row.occurred_at, record.occurredAt) &&
    row.payload_digest === record.payloadDigest &&
    row.idempotency_key === record.idempotencyKey &&
    persisted.eventRef === record.eventRef &&
    persisted.transactionRef === record.transactionRef &&
    persisted.journeyRef === record.journeyRef &&
    persisted.actorRef === record.actorRef &&
    persisted.sequence === record.sequence &&
    persisted.predecessorEventRef === record.predecessorEventRef &&
    persisted.correlationId === record.correlationId &&
    persisted.eventType === record.eventType &&
    sameInstant(persisted.occurredAt, record.occurredAt) &&
    persisted.payloadDigest === record.payloadDigest &&
    persisted.idempotencyKey === record.idempotencyKey
  );
}

function recordFromRow(row: EventRowV1): ModernJourneyEventRecordV1 {
  const record = parseJson(row.event_json);
  assertPersistable(record);
  if (!sameIdentity(row, record)) throw new Error("modern_event_store_persisted_identity_mismatch");
  return cloneRecord(record);
}

export class PostgresModernJourneyEventStoreV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async put(
    record: ModernJourneyEventRecordV1,
    recordedAt: string,
  ): Promise<ModernJourneyEventStoreWriteResultV1> {
    assertPersistable(record);
    if (!Number.isFinite(Date.parse(recordedAt))) {
      throw new Error("modern_event_store_invalid_recorded_at");
    }

    const inserted = await this.db.query<{ event_ref: string }>(
      `INSERT INTO vsr_modern_journey_events
        (event_ref, transaction_ref, journey_ref, sequence, predecessor_event_ref,
         correlation_id, event_type, occurred_at, payload_digest, idempotency_key,
         event_json, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11::jsonb, $12::timestamptz)
       ON CONFLICT DO NOTHING
       RETURNING event_ref`,
      [
        record.eventRef,
        record.transactionRef,
        record.journeyRef,
        record.sequence,
        record.predecessorEventRef ?? null,
        record.correlationId,
        record.eventType,
        record.occurredAt,
        record.payloadDigest,
        record.idempotencyKey,
        JSON.stringify(record),
        recordedAt,
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", record: cloneRecord(record) };

    const selected = await this.db.query<EventRowV1>(
      `SELECT event_ref, transaction_ref, journey_ref, sequence, predecessor_event_ref,
              correlation_id, event_type, occurred_at, payload_digest, idempotency_key, event_json
       FROM vsr_modern_journey_events
       WHERE event_ref = $1 OR idempotency_key = $2
       ORDER BY CASE WHEN event_ref = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [record.eventRef, record.idempotencyKey],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("modern_event_store_race_missing_row");
    if (!sameIdentity(row, record)) return { state: "CONFLICT" };
    return { state: "IDEMPOTENT_REPLAY", record: recordFromRow(row) };
  }

  async load(transactionRef: string): Promise<readonly ModernJourneyEventRecordV1[]> {
    if (!transactionRef.trim()) throw new Error("modern_event_store_transaction_ref_required");
    const selected = await this.db.query<EventRowV1>(
      `SELECT event_ref, transaction_ref, journey_ref, sequence, predecessor_event_ref,
              correlation_id, event_type, occurred_at, payload_digest, idempotency_key, event_json
       FROM vsr_modern_journey_events
       WHERE transaction_ref = $1
       ORDER BY sequence ASC`,
      [transactionRef],
    );
    return selected.rows.map(recordFromRow);
  }
}
