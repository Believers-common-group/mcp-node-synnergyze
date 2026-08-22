import { createHash } from "node:crypto";

import type { PefEventV1 } from "../../packages/contracts/event.ts";
import { validateProducerEvent } from "./ingestion.ts";

export interface PefOutboxRecordV1 {
  outbox_id: string;
  event_id: string;
  topic: string;
  payload: PefEventV1;
  created_at: string;
  published_at?: string;
}

export interface PefConsumerCheckpointV1 {
  consumer_name: string;
  event_id: string;
  processed_at: string;
}

export interface PefIngestResultV1 {
  event: PefEventV1;
  outbox: PefOutboxRecordV1;
  duplicate: boolean;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function eventFingerprint(event: PefEventV1): string {
  return sha256(event);
}

export function makeOutboxId(event: PefEventV1): string {
  return `PEF-OUTBOX:${sha256({ event_id: event.event_id, topic: "pef.v1.observation.received" }).slice(0, 24)}`;
}

interface StoredEvent {
  event: PefEventV1;
  fingerprint: string;
}

/**
 * Deterministic reference implementation for local acceptance semantics.
 * Production persistence uses the SQL migration in modules/pef/sql and the
 * same event/outbox/checkpoint invariants.
 */
export class SyntheticRiverStoreV1 {
  private readonly events = new Map<string, StoredEvent>();
  private readonly outbox = new Map<string, PefOutboxRecordV1>();
  private readonly checkpoints = new Set<string>();

  ingest(input: unknown): PefIngestResultV1 {
    const event = validateProducerEvent(input);
    const fingerprint = eventFingerprint(event);
    const existing = this.events.get(event.event_id);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("PEF_EVENT_IDEMPOTENCY_CONFLICT");
      }
      const outbox = this.outbox.get(makeOutboxId(event));
      if (!outbox) throw new Error("PEF_OUTBOX_INVARIANT_BROKEN");
      return { event: structuredClone(existing.event), outbox: structuredClone(outbox), duplicate: true };
    }

    const storedEvent = structuredClone(event);
    const outbox: PefOutboxRecordV1 = {
      outbox_id: makeOutboxId(event),
      event_id: event.event_id,
      topic: "pef.v1.observation.received",
      payload: structuredClone(event),
      created_at: event.recorded_at,
    };

    // One logical atomic boundary: both maps are committed together.
    this.events.set(event.event_id, { event: storedEvent, fingerprint });
    this.outbox.set(outbox.outbox_id, outbox);
    return { event: structuredClone(storedEvent), outbox: structuredClone(outbox), duplicate: false };
  }

  getEvent(eventId: string): PefEventV1 | undefined {
    const value = this.events.get(eventId)?.event;
    return value ? structuredClone(value) : undefined;
  }

  updateEvent(): never {
    throw new Error("PEF_EVENT_APPEND_ONLY_UPDATE_FORBIDDEN");
  }

  deleteEvent(): never {
    throw new Error("PEF_EVENT_APPEND_ONLY_DELETE_FORBIDDEN");
  }

  unpublishedOutbox(limit = 100): readonly PefOutboxRecordV1[] {
    return [...this.outbox.values()]
      .filter((row) => !row.published_at)
      .slice(0, limit)
      .map((row) => structuredClone(row));
  }

  markPublished(outboxId: string, publishedAt: string): void {
    const row = this.outbox.get(outboxId);
    if (!row) throw new Error("PEF_OUTBOX_NOT_FOUND");
    if (!row.published_at) row.published_at = publishedAt;
  }

  checkpointExists(consumerName: string, eventId: string): boolean {
    return this.checkpoints.has(`${consumerName}:${eventId}`);
  }

  checkpoint(consumerName: string, eventId: string): void {
    this.checkpoints.add(`${consumerName}:${eventId}`);
  }

  eventCount(): number {
    return this.events.size;
  }

  outboxCount(): number {
    return this.outbox.size;
  }
}
