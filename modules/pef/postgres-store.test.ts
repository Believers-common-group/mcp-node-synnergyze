import { describe, expect, it } from "vitest";

import type { PefOutboxRecordV1 } from "./persistence.ts";
import {
  PostgresPefEventStoreV1,
  type SqlDatabaseV1,
  type SqlTransactionV1,
} from "./postgres-store.ts";

function fixtureEvent(assurance = "A0") {
  return {
    schema_version: "pef-event.v1",
    event_id: "evt-temp-a-1435",
    event_type: "physical.observation.temperature",
    assertion_type: "physical_observation",
    assurance,
    occurred_at: "2026-08-22T12:00:00Z",
    recorded_at: "2026-08-22T12:00:01Z",
    producer: { producer_id: "TEMP-A", producer_type: "sensor" },
    payload: { celsius: 9.1 },
  };
}

class FakeSqlDatabase implements SqlDatabaseV1 {
  readonly transactionQueries: string[] = [];
  readonly directQueries: string[] = [];
  transactionCount = 0;
  outboxRows: readonly PefOutboxRecordV1[] = [];

  async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
    this.directQueries.push(sql);
    return { rows: [] };
  }

  async transaction<T>(work: (tx: SqlTransactionV1) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const tx: SqlTransactionV1 = {
      query: async <TRow = Record<string, unknown>>(sql: string) => {
        this.transactionQueries.push(sql);
        if (sql.includes("FROM pef_outbox")) {
          return { rows: this.outboxRows.map((row) => row as TRow) };
        }
        return { rows: [] as TRow[] };
      },
    };
    return work(tx);
  }
}

describe("Postgres PEF-M2 adapter invariants", () => {
  it("rejects producer assurance promotion before opening a transaction", async () => {
    const db = new FakeSqlDatabase();
    const store = new PostgresPefEventStoreV1(db);

    await expect(store.ingest(fixtureEvent("A3"))).rejects.toThrow(
      "PRODUCER_ASSURANCE_FORBIDDEN",
    );
    expect(db.transactionCount).toBe(0);
  });

  it("persists event and outbox within one transaction", async () => {
    const db = new FakeSqlDatabase();
    const store = new PostgresPefEventStoreV1(db);

    await expect(store.ingest(fixtureEvent())).resolves.toBe("INSERTED");
    expect(db.transactionCount).toBe(1);
    expect(db.transactionQueries.some((sql) => sql.includes("INSERT INTO pef_event"))).toBe(true);
    expect(db.transactionQueries.some((sql) => sql.includes("INSERT INTO pef_outbox"))).toBe(true);
  });

  it("holds SKIP LOCKED selection and publish acknowledgement in the same transaction", async () => {
    const db = new FakeSqlDatabase();
    db.outboxRows = [
      {
        outbox_id: "PEF-OUTBOX:001",
        event_id: "evt-temp-a-1435",
        topic: "pef.v1.observation.received",
        payload: fixtureEvent() as never,
        created_at: "2026-08-22T12:00:01Z",
        published_at: null,
      },
    ];
    const store = new PostgresPefEventStoreV1(db);

    await store.withLockedUnpublished(100, async (rows, markPublished) => {
      expect(rows).toHaveLength(1);
      await markPublished("PEF-OUTBOX:001", "2026-08-22T12:01:00Z");
    });

    expect(db.transactionCount).toBe(1);
    expect(db.directQueries).toHaveLength(0);
    expect(db.transactionQueries.some((sql) => sql.includes("FOR UPDATE SKIP LOCKED"))).toBe(
      true,
    );
    expect(db.transactionQueries.some((sql) => sql.includes("UPDATE pef_outbox"))).toBe(true);
  });
});
