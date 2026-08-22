import { describe, expect, it } from "vitest";

import { consumeIdempotentlyV1, publishOutboxBatchV1 } from "./outbox-worker.ts";
import { SyntheticRiverStoreV1 } from "./persistence.ts";

function fixtureEvent() {
  return {
    schema_version: "pef-event.v1",
    event_id: "evt-temp-a-1435",
    event_type: "physical.observation.temperature",
    assertion_type: "physical_observation",
    assurance: "A0",
    occurred_at: "2026-08-22T12:00:00Z",
    recorded_at: "2026-08-22T12:00:01Z",
    producer: { producer_id: "TEMP-A", producer_type: "sensor" },
    payload: { celsius: 9.1 },
  } as const;
}

describe("PEF-M2 River persistence acceptance", () => {
  it("PEF-ACC-001 valid event persisted", () => {
    const store = new SyntheticRiverStoreV1();
    store.ingest(fixtureEvent());
    expect(store.getEvent("evt-temp-a-1435")).toEqual(fixtureEvent());
    expect(store.eventCount()).toBe(1);
  });

  it("PEF-ACC-002 duplicate ingestion harmless", () => {
    const store = new SyntheticRiverStoreV1();
    expect(store.ingest(fixtureEvent()).duplicate).toBe(false);
    expect(store.ingest(fixtureEvent()).duplicate).toBe(true);
    expect(store.eventCount()).toBe(1);
    expect(store.outboxCount()).toBe(1);
  });

  it("PEF-ACC-003 event update prohibited", () => {
    const store = new SyntheticRiverStoreV1();
    store.ingest(fixtureEvent());
    expect(() => store.updateEvent()).toThrow("PEF_EVENT_APPEND_ONLY_UPDATE_FORBIDDEN");
  });

  it("PEF-ACC-004 event deletion prohibited", () => {
    const store = new SyntheticRiverStoreV1();
    store.ingest(fixtureEvent());
    expect(() => store.deleteEvent()).toThrow("PEF_EVENT_APPEND_ONLY_DELETE_FORBIDDEN");
  });

  it("PEF-ACC-005 outbox survives publisher crash", async () => {
    const store = new SyntheticRiverStoreV1();
    store.ingest(fixtureEvent());
    let publishAttempts = 0;

    await expect(
      publishOutboxBatchV1(
        store,
        {
          publish: async () => {
            publishAttempts += 1;
            throw new Error("SIMULATED_PUBLISHER_CRASH");
          },
        },
        "2026-08-22T12:01:00Z",
      ),
    ).rejects.toThrow("SIMULATED_PUBLISHER_CRASH");

    expect(publishAttempts).toBe(1);
    expect(store.getEvent("evt-temp-a-1435")).toBeDefined();
    expect(store.unpublishedOutbox()).toHaveLength(1);
  });

  it("PEF-ACC-006 consumer survives duplicate delivery", async () => {
    const store = new SyntheticRiverStoreV1();
    const event = store.ingest(fixtureEvent()).event;
    let effects = 0;
    const checkpoint = {
      exists: async (consumerName: string, eventId: string) =>
        store.checkpointExists(consumerName, eventId),
      commit: async (consumerName: string, eventId: string) =>
        store.checkpoint(consumerName, eventId),
    };
    const consequence = async () => {
      effects += 1;
    };

    expect(
      await consumeIdempotentlyV1(
        "fixture-consumer",
        event,
        checkpoint,
        consequence,
        "2026-08-22T12:01:00Z",
      ),
    ).toBe("PROCESSED");
    expect(
      await consumeIdempotentlyV1(
        "fixture-consumer",
        event,
        checkpoint,
        consequence,
        "2026-08-22T12:01:01Z",
      ),
    ).toBe("DUPLICATE");
    expect(effects).toBe(1);
  });

  it("prevents two outbox workers from holding the same unpublished row", async () => {
    const store = new SyntheticRiverStoreV1();
    store.ingest(fixtureEvent());

    let releaseFirst = () => {};
    let signalFirstStarted = () => {};
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = store.withLockedUnpublished(100, async (rows) => {
      expect(rows).toHaveLength(1);
      signalFirstStarted();
      await holdFirst;
      return rows.length;
    });

    await firstStarted;
    const second = await store.withLockedUnpublished(100, async (rows) => rows.length);
    expect(second).toBe(0);
    releaseFirst();
    await expect(first).resolves.toBe(1);
  });

  it("rejects conflicting reuse of an event id", () => {
    const store = new SyntheticRiverStoreV1();
    store.ingest(fixtureEvent());
    expect(() => store.ingest({ ...fixtureEvent(), payload: { celsius: 10.4 } })).toThrow(
      "PEF_EVENT_IDEMPOTENCY_CONFLICT",
    );
  });
});
