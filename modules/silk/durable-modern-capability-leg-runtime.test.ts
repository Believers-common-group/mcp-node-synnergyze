import { describe, expect, it } from "vitest";

import type { SilkResourceReservationV1 } from "./confluence-reference.ts";
import {
  DurableModernCapabilityLegRuntimeV1,
} from "./durable-modern-capability-leg-runtime.ts";
import type { ModernJourneyDurableEventStoreV1 } from "./durable-modern-journey-runtime.ts";
import type { ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";

const LEG_REF = "MODERN-CAPABILITY-LEG:DURABLE-CONNECTIVITY-001";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-DURABLE-CAPABILITY-001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";

class MemoryEventStore implements ModernJourneyDurableEventStoreV1 {
  private readonly byTransaction = new Map<string, ModernJourneyEventRecordV1[]>();

  constructor(private readonly conflictSequence?: number) {}

  async put(record: ModernJourneyEventRecordV1) {
    if (record.sequence === this.conflictSequence) return { state: "CONFLICT" as const };
    const stream = this.byTransaction.get(record.transactionRef) ?? [];
    const existing = stream.find(
      (candidate) =>
        candidate.eventRef === record.eventRef || candidate.idempotencyKey === record.idempotencyKey,
    );
    if (existing) {
      return {
        state: "IDEMPOTENT_REPLAY" as const,
        record: { ...existing, payload: { ...existing.payload }, idempotentReplay: true },
      };
    }
    const stored = { ...record, payload: { ...record.payload }, idempotentReplay: false };
    stream.push(stored);
    this.byTransaction.set(record.transactionRef, stream);
    return { state: "STORED" as const, record: { ...stored, payload: { ...stored.payload } } };
  }

  async load(transactionRef: string): Promise<readonly ModernJourneyEventRecordV1[]> {
    return (this.byTransaction.get(transactionRef) ?? [])
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }
}

function openInput() {
  return {
    legRef: LEG_REF,
    journeyRef: JOURNEY_REF,
    silkAccountRef: "SILK-ENT-042",
    economicOwnerRef: ENTERPRISE_REF,
    capabilityType: "CONNECTIVITY" as const,
    resourceType: "NETWORK" as const,
    quantity: 5,
    unit: "GB",
    actorRef: ACTOR_REF,
    openedAt: "2026-08-24T02:00:01.000Z",
  };
}

function reservation(): SilkResourceReservationV1 {
  return {
    reservationRef: "SILK-RESERVATION:DURABLE-NETWORK",
    journeyRef: JOURNEY_REF,
    silkAccountRef: "SILK-ENT-042",
    resourceRef: "NETWORK:ENTERPRISE-MOBILE-001",
    resourceOwnerRef: ENTERPRISE_REF,
    resourceType: "NETWORK",
    quantity: 5,
    unit: "GB",
    wardenDecisionRef: "WARDEN-DECISION:DURABLE-NETWORK",
    authorizationCorrelationId: `${LEG_REF}:NETWORK`,
    correlationId: `${LEG_REF}:RESOURCE`,
    reservedAt: "2026-08-24T02:00:02.000Z",
    capacity: 20,
    state: "RESERVED",
    idempotentReplay: false,
  };
}

describe("DURABLE-MODERN-CAPABILITY-LEG-001", () => {
  it("persists a connectivity leg and reconstructs the durable native-resource state", async () => {
    const store = new MemoryEventStore();
    const durable = new DurableModernCapabilityLegRuntimeV1(store);

    await durable.open(openInput(), "2026-08-24T02:00:01.100Z");
    await durable.recordReservation(
      {
        legRef: LEG_REF,
        reservation: reservation(),
        actorRef: ACTOR_REF,
        occurredAt: "2026-08-24T02:00:02.100Z",
        fallback: false,
      },
      "2026-08-24T02:00:02.200Z",
    );

    const rebuilt = await durable.reconstruct(LEG_REF);
    expect(rebuilt.leg).toMatchObject({
      legRef: LEG_REF,
      journeyRef: JOURNEY_REF,
      capabilityType: "CONNECTIVITY",
      resourceType: "NETWORK",
      quantity: 5,
      unit: "GB",
      state: "OPEN",
    });
    expect(rebuilt.projection.activeResourceRefs).toEqual(["NETWORK:ENTERPRISE-MOBILE-001"]);
  });

  it("poisons an uncertain capability leg on persistence conflict and reconstructs only its durable prefix", async () => {
    const store = new MemoryEventStore(2);
    const durable = new DurableModernCapabilityLegRuntimeV1(store);
    await durable.open(openInput(), "2026-08-24T02:00:01.100Z");

    await expect(
      durable.recordReservation(
        {
          legRef: LEG_REF,
          reservation: reservation(),
          actorRef: ACTOR_REF,
          occurredAt: "2026-08-24T02:00:02.100Z",
          fallback: false,
        },
        "2026-08-24T02:00:02.200Z",
      ),
    ).rejects.toThrow("modern_durable_capability_leg_reconstruction_required");

    expect(durable.isPoisoned(LEG_REF)).toBe(true);
    expect(() => durable.snapshot(LEG_REF)).toThrow(
      "modern_durable_capability_leg_reconstruction_required",
    );

    const rebuilt = await durable.reconstruct(LEG_REF);
    expect(rebuilt.projection.sequence).toBe(1);
    expect(rebuilt.projection.activeResourceRefs).toEqual([]);
    expect(rebuilt.leg.state).toBe("OPEN");
  });
});