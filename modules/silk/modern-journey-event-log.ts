import { createHash } from "node:crypto";

import type { EventEnvelopeV1 } from "../river/contracts.ts";

export type ModernJourneyEventTypeV1 =
  | "TRANSACTION_OPENED"
  | "RESOURCE_RESERVED"
  | "PROVIDER_EXECUTION_FAILED"
  | "RESOURCE_RELEASED"
  | "FALLBACK_AUTHORIZED"
  | "FALLBACK_RESOURCE_RESERVED"
  | "PROVIDER_EXECUTED_UNVERIFIED"
  | "ECONOMIC_EVENT_RECORDED"
  | "OBLIGATION_CREATED"
  | "EFFECT_VERIFIED"
  | "TRANSACTION_CLOSED";

export interface ModernJourneyEventAppendV1 {
  idempotencyKey: string;
  transactionRef: string;
  journeyRef: string;
  actorRef: string;
  eventType: ModernJourneyEventTypeV1;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface ModernJourneyEventRecordV1 extends EventEnvelopeV1 {
  transactionRef: string;
  journeyRef: string;
  actorRef: string;
  idempotencyKey: string;
  payload: Readonly<Record<string, unknown>>;
  idempotentReplay: boolean;
}

interface StoredEventV1 {
  fingerprint: string;
  record: ModernJourneyEventRecordV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]);
    return Object.fromEntries(entries);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error("modern_event_payload_not_json_serializable");
}

function canonicalPayload(payload: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(canonicalize(payload));
}

function clonePayload(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return canonicalize(payload) as Readonly<Record<string, unknown>>;
}

function cloneRecord(record: ModernJourneyEventRecordV1, replay: boolean): ModernJourneyEventRecordV1 {
  return {
    ...record,
    payload: clonePayload(record.payload),
    idempotentReplay: replay,
  };
}

export class ModernJourneyEventLogV1 {
  private readonly byTransaction = new Map<string, StoredEventV1[]>();
  private readonly byIdempotencyKey = new Map<string, StoredEventV1>();

  append(input: ModernJourneyEventAppendV1): ModernJourneyEventRecordV1 {
    if (!input.idempotencyKey.trim()) throw new Error("modern_event_idempotency_key_required");
    if (!input.transactionRef.trim()) throw new Error("modern_event_transaction_ref_required");
    if (!input.journeyRef.trim()) throw new Error("modern_event_journey_ref_required");
    if (!input.actorRef.trim()) throw new Error("modern_event_actor_ref_required");
    const occurred = parseInstant(input.occurredAt, "modern_event_invalid_time");
    const payloadCanonical = canonicalPayload(input.payload);
    const payloadDigest = `sha256:${digest(payloadCanonical)}`;
    const fingerprint = digest(
      JSON.stringify({
        transactionRef: input.transactionRef,
        journeyRef: input.journeyRef,
        actorRef: input.actorRef,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        payloadDigest,
      }),
    );

    const replay = this.byIdempotencyKey.get(input.idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error("modern_event_idempotency_conflict");
      return cloneRecord(replay.record, true);
    }

    const stream = this.byTransaction.get(input.transactionRef) ?? [];
    const previous = stream.at(-1)?.record;
    if (previous) {
      if (previous.journeyRef !== input.journeyRef) {
        throw new Error("modern_event_journey_lineage_mismatch");
      }
      const previousOccurred = parseInstant(previous.occurredAt, "modern_event_previous_time_invalid");
      if (occurred < previousOccurred) throw new Error("modern_event_time_regression");
    }

    const sequence = (previous?.sequence ?? 0) + 1;
    const eventRef = `MODERN-JOURNEY-EVENT:${digest(
      `${input.transactionRef}|${sequence}|${input.eventType}|${payloadDigest}|${input.idempotencyKey}`,
    ).slice(0, 24)}`;
    const record: ModernJourneyEventRecordV1 = {
      eventRef,
      correlationId: input.transactionRef,
      sequence,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      payloadDigest,
      predecessorEventRef: previous?.eventRef,
      transactionRef: input.transactionRef,
      journeyRef: input.journeyRef,
      actorRef: input.actorRef,
      idempotencyKey: input.idempotencyKey,
      payload: clonePayload(input.payload),
      idempotentReplay: false,
    };
    const stored = { fingerprint, record };
    stream.push(stored);
    this.byTransaction.set(input.transactionRef, stream);
    this.byIdempotencyKey.set(input.idempotencyKey, stored);
    return cloneRecord(record, false);
  }

  stream(transactionRef: string): readonly ModernJourneyEventRecordV1[] {
    return (this.byTransaction.get(transactionRef) ?? []).map(({ record }) => cloneRecord(record, false));
  }

  latest(transactionRef: string): ModernJourneyEventRecordV1 | undefined {
    const record = this.byTransaction.get(transactionRef)?.at(-1)?.record;
    return record ? cloneRecord(record, false) : undefined;
  }
}
