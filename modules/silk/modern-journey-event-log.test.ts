import { describe, expect, it } from "vitest";

import {
  ModernJourneyEventLogV1,
  type ModernJourneyEventTypeV1,
} from "./modern-journey-event-log.ts";

const TRANSACTION_REF = "TXN-00088";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-000001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";

function append(
  log: ModernJourneyEventLogV1,
  sequence: number,
  eventType: ModernJourneyEventTypeV1,
  payload: Record<string, unknown>,
) {
  return log.append({
    idempotencyKey: `${TRANSACTION_REF}:${sequence}:${eventType}`,
    transactionRef: TRANSACTION_REF,
    journeyRef: JOURNEY_REF,
    actorRef: ACTOR_REF,
    eventType,
    occurredAt: `2026-08-24T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    payload,
  });
}

describe("MODERN-JOURNEY-EVENT-LOG-001", () => {
  it("records the confluence fallback path as one append-only causal stream", () => {
    const log = new ModernJourneyEventLogV1();
    append(log, 1, "TRANSACTION_OPENED", { amount: 4800, currency: "INR" });
    append(log, 2, "RESOURCE_RESERVED", { resourceRef: "FUNDING:CORPORATE-CREDIT-001" });
    append(log, 3, "PROVIDER_EXECUTION_FAILED", {
      providerRef: "BANK-B",
      failureClass: "ISSUER_DECLINE",
    });
    append(log, 4, "RESOURCE_RELEASED", { resourceRef: "FUNDING:CORPORATE-CREDIT-001" });
    append(log, 5, "FALLBACK_AUTHORIZED", {
      providerRef: "BANK-A",
      capabilityRef: "payment.visa.authorize",
    });
    append(log, 6, "FALLBACK_RESOURCE_RESERVED", {
      resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
    });
    append(log, 7, "PROVIDER_EXECUTED_UNVERIFIED", { providerRef: "BANK-A" });
    append(log, 8, "RESOURCE_CONSUMED", {
      resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
    });
    append(log, 9, "ECONOMIC_EVENT_RECORDED", {
      economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
      actualPayerRef: ACTOR_REF,
    });
    append(log, 10, "OBLIGATION_CREATED", { type: "REIMBURSEMENT", amount: 4800 });
    append(log, 11, "EFFECT_VERIFIED", {
      observedStateRef: "ENGINEERING-SERVICE:DELIVERED",
    });
    append(log, 12, "TRANSACTION_CLOSED", { state: "CLOSED" });

    const stream = log.stream(TRANSACTION_REF);
    expect(stream).toHaveLength(12);
    expect(stream.map((event) => event.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(stream[0]?.predecessorEventRef).toBeUndefined();
    for (let index = 1; index < stream.length; index += 1) {
      expect(stream[index]?.predecessorEventRef).toBe(stream[index - 1]?.eventRef);
      expect(stream[index]?.correlationId).toBe(TRANSACTION_REF);
    }
    expect(log.latest(TRANSACTION_REF)?.eventType).toBe("TRANSACTION_CLOSED");
  });

  it("replays an identical append without minting a second event", () => {
    const log = new ModernJourneyEventLogV1();
    const input = {
      idempotencyKey: `${TRANSACTION_REF}:OPEN`,
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType: "TRANSACTION_OPENED" as const,
      occurredAt: "2026-08-24T00:00:01.000Z",
      payload: { currency: "INR", amount: 4800 },
    };

    const first = log.append(input);
    const replay = log.append({ ...input, payload: { amount: 4800, currency: "INR" } });

    expect(replay.eventRef).toBe(first.eventRef);
    expect(replay.idempotentReplay).toBe(true);
    expect(log.stream(TRANSACTION_REF)).toHaveLength(1);
  });

  it("rejects idempotency mutation and temporal regression", () => {
    const log = new ModernJourneyEventLogV1();
    const first = append(log, 2, "TRANSACTION_OPENED", { amount: 4800 });
    expect(first.sequence).toBe(1);

    expect(() =>
      log.append({
        idempotencyKey: `${TRANSACTION_REF}:2:TRANSACTION_OPENED`,
        transactionRef: TRANSACTION_REF,
        journeyRef: JOURNEY_REF,
        actorRef: ACTOR_REF,
        eventType: "TRANSACTION_OPENED",
        occurredAt: "2026-08-24T00:00:02.000Z",
        payload: { amount: 4900 },
      }),
    ).toThrow("modern_event_idempotency_conflict");

    expect(() =>
      log.append({
        idempotencyKey: `${TRANSACTION_REF}:TIME-REGRESSION`,
        transactionRef: TRANSACTION_REF,
        journeyRef: JOURNEY_REF,
        actorRef: ACTOR_REF,
        eventType: "RESOURCE_RESERVED",
        occurredAt: "2026-08-24T00:00:01.000Z",
        payload: { resourceRef: "FUNDING:CORPORATE-CREDIT-001" },
      }),
    ).toThrow("modern_event_time_regression");
  });

  it("rejects journey lineage drift within one parent transaction stream", () => {
    const log = new ModernJourneyEventLogV1();
    append(log, 1, "TRANSACTION_OPENED", { amount: 4800 });

    expect(() =>
      log.append({
        idempotencyKey: `${TRANSACTION_REF}:OTHER-JOURNEY`,
        transactionRef: TRANSACTION_REF,
        journeyRef: "MODERN-JOURNEY:OTHER",
        actorRef: ACTOR_REF,
        eventType: "RESOURCE_RESERVED",
        occurredAt: "2026-08-24T00:00:02.000Z",
        payload: { resourceRef: "FUNDING:CORPORATE-CREDIT-001" },
      }),
    ).toThrow("modern_event_journey_lineage_mismatch");
  });
});
