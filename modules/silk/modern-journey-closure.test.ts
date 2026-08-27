import { describe, expect, it } from "vitest";

import type { ModernJourneyDurableEventStoreV1 } from "./durable-modern-journey-runtime.ts";
import type { ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import {
  buildModernJourneyClosureEventsV1,
  loadModernJourneyClosureV1,
  persistModernJourneyClosureV1,
} from "./modern-journey-closure.ts";
import type {
  ModernJourneyConfluenceV1,
  ModernWorkReceiptV1,
} from "./modern-journey-confluence.ts";
import {
  modernWorkReceiptRefV1,
  validateModernWorkReceiptV1,
} from "./modern-work-receipt.ts";

const JOURNEY_REF = "MODERN-JOURNEY:MJ-CLOSURE-001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";
const ENTERPRISE_REF = "ENTERPRISE-CONFLUENCE-001";
const EFFECT_REF = "VERIFIED-EFFECT:FINAL-001";

class MemoryEventStore implements ModernJourneyDurableEventStoreV1 {
  private readonly byTransaction = new Map<string, ModernJourneyEventRecordV1[]>();

  constructor(private conflictSequence?: number) {}

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

function receipt(): ModernWorkReceiptV1 {
  const body: Omit<ModernWorkReceiptV1, "receiptRef"> = {
    journeyRef: JOURNEY_REF,
    objectiveRef: "OBJECTIVE:ENGINEERING-SUBMISSION-001",
    digitalMeRef: ACTOR_REF,
    silkAccountRef: "SILK-ENT-042",
    economicOwnerRef: ENTERPRISE_REF,
    requiredLegTypes: ["PAYMENT", "CONNECTIVITY", "COMPUTE"],
    legRefs: ["LEG:COMPUTE", "LEG:CONNECTIVITY", "TXN:PAYMENT"],
    providerRefs: ["BANK-A", "BANK-B", "ESIM-B", "PUBLIC-CLOUD-B"],
    failureCount: 3,
    monetaryTotals: [{ currency: "INR", amount: 5040 }],
    nativeConsumptions: [
      {
        legRef: "LEG:COMPUTE",
        legType: "COMPUTE",
        providerRef: "PUBLIC-CLOUD-B",
        resourceRef: "COMPUTE:PUBLIC-GPU-001",
        resourceOwnerRef: ENTERPRISE_REF,
        resourceType: "COMPUTE",
        quantity: 2,
        unit: "GPU_HOUR",
      },
      {
        legRef: "LEG:CONNECTIVITY",
        legType: "CONNECTIVITY",
        providerRef: "ESIM-B",
        resourceRef: "NETWORK:ESIM-FALLBACK-001",
        resourceOwnerRef: ACTOR_REF,
        resourceType: "NETWORK",
        quantity: 5,
        unit: "GB",
      },
    ],
    outstandingObligationCount: 1,
    finalEffectRef: EFFECT_REF,
    finalEffectObservedStateRef: "ENGINEERING-SUBMISSION:ACCEPTED",
    completedAt: "2026-08-24T04:00:00.000Z",
    synthetic: true,
  };
  return { receiptRef: modernWorkReceiptRefV1(body), ...body };
}

function confluence(): ModernJourneyConfluenceV1 {
  const workReceipt = receipt();
  return {
    journeyRef: JOURNEY_REF,
    objectiveRef: workReceipt.objectiveRef,
    digitalMeRef: workReceipt.digitalMeRef,
    silkAccountRef: workReceipt.silkAccountRef,
    economicOwnerRef: workReceipt.economicOwnerRef,
    requiredLegTypes: ["PAYMENT", "CONNECTIVITY", "COMPUTE"],
    state: "CLOSED",
    legs: [
      {
        legRef: "TXN:PAYMENT",
        legType: "PAYMENT",
        journeyRef: JOURNEY_REF,
        silkAccountRef: workReceipt.silkAccountRef,
        economicOwnerRef: ENTERPRISE_REF,
        state: "CLOSED",
        effectRef: "EFFECT:PAYMENT",
        providerRefs: ["BANK-A", "BANK-B"],
        failureCount: 1,
        monetaryValue: 4800,
        currency: "INR",
        outstandingObligationCount: 1,
      },
      {
        legRef: "LEG:CONNECTIVITY",
        legType: "CONNECTIVITY",
        journeyRef: JOURNEY_REF,
        silkAccountRef: workReceipt.silkAccountRef,
        economicOwnerRef: ENTERPRISE_REF,
        state: "CLOSED",
        effectRef: "EFFECT:CONNECTIVITY",
        providerRefs: ["ESIM-B"],
        failureCount: 1,
        nativeConsumption: {
          legRef: "LEG:CONNECTIVITY",
          legType: "CONNECTIVITY",
          providerRef: "ESIM-B",
          resourceRef: "NETWORK:ESIM-FALLBACK-001",
          resourceOwnerRef: ACTOR_REF,
          resourceType: "NETWORK",
          quantity: 5,
          unit: "GB",
        },
        outstandingObligationCount: 0,
      },
      {
        legRef: "LEG:COMPUTE",
        legType: "COMPUTE",
        journeyRef: JOURNEY_REF,
        silkAccountRef: workReceipt.silkAccountRef,
        economicOwnerRef: ENTERPRISE_REF,
        state: "CLOSED",
        effectRef: "EFFECT:COMPUTE",
        providerRefs: ["PUBLIC-CLOUD-B"],
        failureCount: 1,
        monetaryValue: 240,
        currency: "INR",
        nativeConsumption: {
          legRef: "LEG:COMPUTE",
          legType: "COMPUTE",
          providerRef: "PUBLIC-CLOUD-B",
          resourceRef: "COMPUTE:PUBLIC-GPU-001",
          resourceOwnerRef: ENTERPRISE_REF,
          resourceType: "COMPUTE",
          quantity: 2,
          unit: "GPU_HOUR",
        },
        outstandingObligationCount: 0,
      },
    ],
    missingLegTypes: [],
    finalEffectRef: EFFECT_REF,
    workReceipt,
  };
}

describe("MODERN-JOURNEY-CLOSURE-001", () => {
  it("validates Work Receipt identity and builds a three-fact append-only parent closure stream", () => {
    const closed = confluence();
    expect(() => validateModernWorkReceiptV1(closed.workReceipt!)).not.toThrow();

    const events = buildModernJourneyClosureEventsV1({ confluence: closed, actorRef: ACTOR_REF });
    expect(events.map((event) => event.eventType)).toEqual([
      "TRANSACTION_OPENED",
      "EFFECT_VERIFIED",
      "TRANSACTION_CLOSED",
    ]);
    expect(events[1]?.predecessorEventRef).toBe(events[0]?.eventRef);
    expect(events[2]?.predecessorEventRef).toBe(events[1]?.eventRef);
  });

  it("persists and reloads the exact closed Work Receipt through the shared durable event store", async () => {
    const store = new MemoryEventStore();
    const persisted = await persistModernJourneyClosureV1({
      store,
      confluence: confluence(),
      actorRef: ACTOR_REF,
      recordedAt: "2026-08-24T04:00:01.000Z",
    });
    expect(persisted.workReceipt.receiptRef).toBe(receipt().receiptRef);

    const loaded = await loadModernJourneyClosureV1({ store, journeyRef: JOURNEY_REF });
    expect(loaded.finalEffectRef).toBe(EFFECT_REF);
    expect(loaded.workReceipt).toEqual(persisted.workReceipt);
    expect(loaded.events).toHaveLength(3);
  });

  it("fails closed on persistence conflict rather than claiming a Work Receipt was durably issued", async () => {
    const store = new MemoryEventStore(2);
    await expect(
      persistModernJourneyClosureV1({
        store,
        confluence: confluence(),
        actorRef: ACTOR_REF,
        recordedAt: "2026-08-24T04:00:01.000Z",
      }),
    ).rejects.toThrow("modern_journey_closure_reconstruction_required");
  });

  it("rejects a Work Receipt whose deterministic reference no longer matches its contents", () => {
    const closed = confluence();
    if (!closed.workReceipt) throw new Error("expected_work_receipt");
    const mutated: ModernJourneyConfluenceV1 = {
      ...closed,
      workReceipt: {
        ...closed.workReceipt,
        monetaryTotals: [{ currency: "INR", amount: 5041 }],
      },
    };
    expect(() => buildModernJourneyClosureEventsV1({ confluence: mutated, actorRef: ACTOR_REF })).toThrow(
      "modern_work_receipt_ref_mismatch",
    );
  });
});