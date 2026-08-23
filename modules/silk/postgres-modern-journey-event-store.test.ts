import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  PostgresQueryExecutorV1,
  PostgresQueryResultV1,
} from "../synnergyze/postgres-remedy-journal.ts";
import { ModernJourneyEventLogV1 } from "./modern-journey-event-log.ts";
import { PostgresModernJourneyEventStoreV1 } from "./postgres-modern-journey-event-store.ts";

interface PlannedResponse {
  match: RegExp;
  rows?: unknown[];
  rowCount?: number;
}

class ScriptedDb implements PostgresQueryExecutorV1 {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  constructor(private readonly plan: PlannedResponse[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<T>> {
    this.calls.push({ sql, params });
    const step = this.plan.shift();
    if (!step) throw new Error(`unexpected_query:${sql}`);
    if (!step.match.test(sql)) throw new Error(`query_mismatch:${step.match}:${sql}`);
    return {
      rows: (step.rows ?? []) as T[],
      rowCount: step.rowCount ?? step.rows?.length ?? 0,
    };
  }
}

function record() {
  return new ModernJourneyEventLogV1().append({
    idempotencyKey: "TXN-00088:OPEN",
    transactionRef: "TXN-00088",
    journeyRef: "MODERN-JOURNEY:MJ-000001",
    actorRef: "DIGITALME-CONFLUENCE-001",
    eventType: "TRANSACTION_OPENED",
    occurredAt: "2026-08-24T00:00:01.000Z",
    payload: { amount: 4800, currency: "INR" },
  });
}

function rowFor(event = record()) {
  return {
    event_ref: event.eventRef,
    transaction_ref: event.transactionRef,
    journey_ref: event.journeyRef,
    sequence: event.sequence,
    predecessor_event_ref: event.predecessorEventRef ?? null,
    correlation_id: event.correlationId,
    event_type: event.eventType,
    occurred_at: event.occurredAt,
    payload_digest: event.payloadDigest,
    idempotency_key: event.idempotencyKey,
    event_json: JSON.stringify(event),
  };
}

describe("PostgresModernJourneyEventStoreV1", () => {
  it("stores one append-only journey event", async () => {
    const event = record();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_modern_journey_events/, rows: [{ event_ref: event.eventRef }] },
    ]);

    await expect(
      new PostgresModernJourneyEventStoreV1(db).put(event, "2026-08-24T00:00:02.000Z"),
    ).resolves.toMatchObject({ state: "STORED", record: event });
    expect(db.calls[0]?.sql).toContain("ON CONFLICT DO NOTHING");
  });

  it("returns idempotent replay for the same event identity", async () => {
    const event = record();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_modern_journey_events/, rowCount: 0 },
      { match: /^SELECT event_ref, transaction_ref, journey_ref/, rows: [rowFor(event)] },
    ]);

    await expect(
      new PostgresModernJourneyEventStoreV1(db).put(event, "2026-08-24T00:00:02.000Z"),
    ).resolves.toMatchObject({ state: "IDEMPOTENT_REPLAY", record: event });
  });

  it("fails closed when an idempotency key resolves to different persisted lineage", async () => {
    const event = record();
    const conflicting = { ...rowFor(event), transaction_ref: "TXN-OTHER" };
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_modern_journey_events/, rowCount: 0 },
      { match: /^SELECT event_ref, transaction_ref, journey_ref/, rows: [conflicting] },
    ]);

    await expect(
      new PostgresModernJourneyEventStoreV1(db).put(event, "2026-08-24T00:00:02.000Z"),
    ).resolves.toEqual({ state: "CONFLICT" });
  });

  it("fails closed when persisted JSON mutates actor or occurrence identity", async () => {
    const event = record();
    const actorMutated = {
      ...rowFor(event),
      event_json: JSON.stringify({ ...event, actorRef: "DIGITALME-TAMPERED" }),
    };
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_modern_journey_events/, rowCount: 0 },
      { match: /^SELECT event_ref, transaction_ref, journey_ref/, rows: [actorMutated] },
    ]);

    await expect(
      new PostgresModernJourneyEventStoreV1(db).put(event, "2026-08-24T00:00:02.000Z"),
    ).resolves.toEqual({ state: "CONFLICT" });

    const timeMutated = {
      ...rowFor(event),
      event_json: JSON.stringify({ ...event, occurredAt: "2026-08-24T00:00:09.000Z" }),
    };
    const reloadDb = new ScriptedDb([
      { match: /^SELECT event_ref, transaction_ref, journey_ref/, rows: [timeMutated] },
    ]);
    await expect(new PostgresModernJourneyEventStoreV1(reloadDb).load("TXN-00088")).rejects.toThrow(
      "modern_event_store_persisted_identity_mismatch",
    );
  });

  it("reconstructs a persisted transaction event stream in sequence order", async () => {
    const log = new ModernJourneyEventLogV1();
    const opened = log.append({
      idempotencyKey: "TXN-00088:OPEN",
      transactionRef: "TXN-00088",
      journeyRef: "MODERN-JOURNEY:MJ-000001",
      actorRef: "DIGITALME-CONFLUENCE-001",
      eventType: "TRANSACTION_OPENED",
      occurredAt: "2026-08-24T00:00:01.000Z",
      payload: { amount: 4800 },
    });
    const reserved = log.append({
      idempotencyKey: "TXN-00088:RESERVE",
      transactionRef: "TXN-00088",
      journeyRef: "MODERN-JOURNEY:MJ-000001",
      actorRef: "DIGITALME-CONFLUENCE-001",
      eventType: "RESOURCE_RESERVED",
      occurredAt: "2026-08-24T00:00:02.000Z",
      payload: { resourceRef: "FUNDING:CORPORATE-CREDIT-001" },
    });
    const db = new ScriptedDb([
      {
        match: /^SELECT event_ref, transaction_ref, journey_ref/,
        rows: [rowFor(opened), rowFor(reserved)],
      },
    ]);

    const reloaded = await new PostgresModernJourneyEventStoreV1(db).load("TXN-00088");
    expect(reloaded.map((event) => event.eventRef)).toEqual([opened.eventRef, reserved.eventRef]);
    expect(reloaded[1]?.predecessorEventRef).toBe(opened.eventRef);
  });

  it("defines append-only identity, sequence, correlation, consumption, and predecessor constraints in SQL", () => {
    const migrationPath = fileURLToPath(
      new URL("../synnergyze/sql/005_modern_journey_event_store.sql", import.meta.url),
    );
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("event_ref text PRIMARY KEY");
    expect(migration).toContain("idempotency_key text NOT NULL UNIQUE");
    expect(migration).toContain("UNIQUE (transaction_ref, sequence)");
    expect(migration).toContain("CHECK (correlation_id = transaction_ref)");
    expect(migration).toContain("predecessor_event_ref text REFERENCES vsr_modern_journey_events(event_ref)");
    expect(migration).toContain("'RESOURCE_CONSUMED'");
    expect(migration).toContain("sequence > 1 AND predecessor_event_ref IS NOT NULL");
    expect(migration).toContain("'TRANSACTION_CLOSED'");
  });
});
