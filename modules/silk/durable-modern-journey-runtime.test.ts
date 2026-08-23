import { describe, expect, it } from "vitest";

import type { SilkResourceReservationV1 } from "./confluence-reference.ts";
import {
  DurableModernJourneyTransactionRuntimeV1,
  type ModernJourneyDurableEventStoreV1,
} from "./durable-modern-journey-runtime.ts";
import type { ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import type { ModernJourneyEventStoreWriteResultV1 } from "./postgres-modern-journey-event-store.ts";

const TRANSACTION_REF = "TXN-DURABLE-001";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-DURABLE-001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";

class MemoryEventStore implements ModernJourneyDurableEventStoreV1 {
  private readonly byTransaction = new Map<string, ModernJourneyEventRecordV1[]>();

  constructor(private conflictSequence?: number) {}

  async put(
    record: ModernJourneyEventRecordV1,
    _recordedAt: string,
  ): Promise<ModernJourneyEventStoreWriteResultV1> {
    if (record.sequence === this.conflictSequence) return { state: "CONFLICT" };
    const stream = this.byTransaction.get(record.transactionRef) ?? [];
    const existing = stream.find(
      (candidate) =>
        candidate.eventRef === record.eventRef ||
        candidate.idempotencyKey === record.idempotencyKey,
    );
    if (existing) {
      if (existing.eventRef !== record.eventRef || existing.payloadDigest !== record.payloadDigest) {
        return { state: "CONFLICT" };
      }
      return {
        state: "IDEMPOTENT_REPLAY",
        record: { ...existing, payload: { ...existing.payload }, idempotentReplay: true },
      };
    }
    const stored = { ...record, payload: { ...record.payload }, idempotentReplay: false };
    stream.push(stored);
    this.byTransaction.set(record.transactionRef, stream);
    return { state: "STORED", record: { ...stored, payload: { ...stored.payload } } };
  }

  async load(transactionRef: string): Promise<readonly ModernJourneyEventRecordV1[]> {
    return (this.byTransaction.get(transactionRef) ?? [])
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }
}

function openInput() {
  return {
    transactionRef: TRANSACTION_REF,
    journeyRef: JOURNEY_REF,
    silkAccountRef: "SILK-ENT-042",
    economicOwnerRef: ENTERPRISE_REF,
    amount: 4800,
    currency: "INR",
    actorRef: ACTOR_REF,
    openedAt: "2026-08-24T00:00:01.000Z",
  };
}

function reservation(): SilkResourceReservationV1 {
  return {
    reservationRef: "SILK-RESERVATION:DURABLE-PRIMARY",
    journeyRef: JOURNEY_REF,
    silkAccountRef: "SILK-ENT-042",
    resourceRef: "FUNDING:CORPORATE-CREDIT-001",
    resourceOwnerRef: ENTERPRISE_REF,
    resourceType: "CREDIT",
    quantity: 4800,
    unit: "INR",
    wardenDecisionRef: "WARDEN-DECISION:DURABLE-PRIMARY",
    authorizationCorrelationId: `${TRANSACTION_REF}:MC`,
    correlationId: `${TRANSACTION_REF}:PRIMARY-RESOURCE`,
    reservedAt: "2026-08-24T00:00:02.000Z",
    capacity: 5000,
    state: "RESERVED",
    idempotentReplay: false,
  };
}

describe("DURABLE-MODERN-JOURNEY-RUNTIME-001", () => {
  it("persists automatic runtime events and reconstructs the last durable state", async () => {
    const store = new MemoryEventStore();
    const durable = new DurableModernJourneyTransactionRuntimeV1(store);

    const opened = await durable.open(openInput(), "2026-08-24T00:00:01.100Z");
    expect(opened.projection.sequence).toBe(1);
    const reserved = await durable.recordReservation(
      {
        transactionRef: TRANSACTION_REF,
        reservation: reservation(),
        actorRef: ACTOR_REF,
        occurredAt: "2026-08-24T00:00:02.500Z",
        fallback: false,
      },
      "2026-08-24T00:00:02.600Z",
    );
    expect(reserved.projection.sequence).toBe(2);

    const reconstructed = await durable.reconstruct(TRANSACTION_REF);
    expect(reconstructed.projection.sequence).toBe(2);
    expect(reconstructed.projection.activeResourceRefs).toEqual([
      "FUNDING:CORPORATE-CREDIT-001",
    ]);
    expect(reconstructed.transaction).toMatchObject({
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      state: "OPEN",
      amount: 4800,
      currency: "INR",
    });
  });

  it("accepts exact event replay from a fresh runtime instance without duplicating durable identity", async () => {
    const store = new MemoryEventStore();
    const first = new DurableModernJourneyTransactionRuntimeV1(store);
    await first.open(openInput(), "2026-08-24T00:00:01.100Z");

    const restarted = new DurableModernJourneyTransactionRuntimeV1(store);
    const replay = await restarted.open(openInput(), "2026-08-24T00:00:01.200Z");
    expect(replay.projection.sequence).toBe(1);
    expect((await store.load(TRANSACTION_REF))).toHaveLength(1);
    expect(restarted.isPoisoned(TRANSACTION_REF)).toBe(false);
  });

  it("poisons uncertain in-memory state on a persistence conflict and reconstructs only the durable prefix", async () => {
    const store = new MemoryEventStore(2);
    const durable = new DurableModernJourneyTransactionRuntimeV1(store);
    await durable.open(openInput(), "2026-08-24T00:00:01.100Z");

    await expect(
      durable.recordReservation(
        {
          transactionRef: TRANSACTION_REF,
          reservation: reservation(),
          actorRef: ACTOR_REF,
          occurredAt: "2026-08-24T00:00:02.500Z",
          fallback: false,
        },
        "2026-08-24T00:00:02.600Z",
      ),
    ).rejects.toThrow("modern_durable_runtime_reconstruction_required");

    expect(durable.isPoisoned(TRANSACTION_REF)).toBe(true);
    expect(() => durable.snapshot(TRANSACTION_REF)).toThrow(
      "modern_durable_runtime_reconstruction_required",
    );

    const reconstructed = await durable.reconstruct(TRANSACTION_REF);
    expect(reconstructed.projection.sequence).toBe(1);
    expect(reconstructed.projection.activeResourceRefs).toEqual([]);
    expect(reconstructed.transaction.state).toBe("OPEN");
  });
});