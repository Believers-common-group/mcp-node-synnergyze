import { describe, expect, it } from "vitest";
import { InMemoryEventLog } from "./eventLog.ts";

const event = {
  eventId: "EV-000001",
  executionId: "EXEC-000001",
  eventType: "funding.reserved",
  timestamp: "2026-08-23T04:55:00.000Z",
  source: "asset-compute-alpha",
  payload: {
    reservationId: "RES-000001",
    amount: 50,
    currency: "INR",
  },
};

describe("InMemoryEventLog", () => {
  it("returns the existing event on an exact event replay", () => {
    const log = new InMemoryEventLog();

    const first = log.append(event);
    const replay = log.append({ ...event, payload: { ...event.payload } });

    expect(replay).toBe(first);
    expect(log.eventsFor("EXEC-000001")).toEqual([event]);
  });

  it("fails closed when an event id is reused with a different payload", () => {
    const log = new InMemoryEventLog();
    log.append(event);

    expect(() =>
      log.append({
        ...event,
        payload: {
          ...event.payload,
          amount: 51,
        },
      }),
    ).toThrowError("EVENT_IDEMPOTENCY_CONFLICT");
  });
});
