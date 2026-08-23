import { describe, expect, it } from "vitest";

import {
  ModernJourneyEventLogV1,
  type ModernJourneyEventTypeV1,
} from "./modern-journey-event-log.ts";
import { projectModernJourneyTransactionV1 } from "./modern-journey-projection.ts";

const TRANSACTION_REF = "TXN-00088";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-000001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";

function buildClosedStream() {
  const log = new ModernJourneyEventLogV1();
  const append = (
    index: number,
    eventType: ModernJourneyEventTypeV1,
    payload: Record<string, unknown>,
  ) =>
    log.append({
      idempotencyKey: `${TRANSACTION_REF}:${index}:${eventType}`,
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType,
      occurredAt: `2026-08-24T00:00:${String(index).padStart(2, "0")}.000Z`,
      payload,
    });

  append(1, "TRANSACTION_OPENED", { amount: 4800, currency: "INR" });
  append(2, "RESOURCE_RESERVED", { resourceRef: "FUNDING:CORPORATE-CREDIT-001" });
  append(3, "PROVIDER_EXECUTION_FAILED", { providerRef: "BANK-B" });
  append(4, "RESOURCE_RELEASED", { resourceRef: "FUNDING:CORPORATE-CREDIT-001" });
  append(5, "FALLBACK_AUTHORIZED", { providerRef: "BANK-A" });
  append(6, "FALLBACK_RESOURCE_RESERVED", {
    resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001",
  });
  append(7, "PROVIDER_EXECUTED_UNVERIFIED", { providerRef: "BANK-A" });
  append(8, "RESOURCE_CONSUMED", { resourceRef: "FUNDING:PERSONAL-VISA-FALLBACK-001" });
  append(9, "ECONOMIC_EVENT_RECORDED", { economicEventRef: "ECO-1901" });
  append(10, "OBLIGATION_CREATED", { obligationRef: "OBL-551" });
  append(11, "EFFECT_VERIFIED", { effectRef: "EFF-909" });
  append(12, "TRANSACTION_CLOSED", { state: "CLOSED" });
  return log.stream(TRANSACTION_REF);
}

describe("MODERN-JOURNEY-PROJECTION-001", () => {
  it("rebuilds the closed transaction state entirely from append-only events", () => {
    const projection = projectModernJourneyTransactionV1(buildClosedStream());

    expect(projection).toMatchObject({
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      state: "CLOSED",
      sequence: 12,
      failedProviderCount: 1,
      currentProviderRef: "BANK-A",
      economicEventRecorded: true,
      obligationCount: 1,
      effectVerified: true,
    });
    expect(projection.activeResourceRefs).toEqual([]);
    expect(projection.consumedResourceRefs).toEqual(["FUNDING:PERSONAL-VISA-FALLBACK-001"]);
  });

  it("rejects transaction closure before effect verification", () => {
    const events = buildClosedStream().filter((event) => event.eventType !== "EFFECT_VERIFIED");
    const resequenced = events.map((event, index) => ({
      ...event,
      sequence: index + 1,
      predecessorEventRef: index === 0 ? undefined : events[index - 1]?.eventRef,
    }));

    expect(() => projectModernJourneyTransactionV1(resequenced)).toThrow(
      "modern_projection_close_requires_verified_effect",
    );
  });

  it("rejects transaction closure while a reservation is still active", () => {
    const events = buildClosedStream().filter((event) => event.eventType !== "RESOURCE_CONSUMED");
    const resequenced = events.map((event, index) => ({
      ...event,
      sequence: index + 1,
      predecessorEventRef: index === 0 ? undefined : events[index - 1]?.eventRef,
    }));

    expect(() => projectModernJourneyTransactionV1(resequenced)).toThrow(
      "modern_projection_close_with_active_resource",
    );
  });

  it("rejects sequence and predecessor corruption", () => {
    const stream = buildClosedStream();
    const sequenceDrift = stream.map((event, index) =>
      index === 5 ? { ...event, sequence: 99 } : event,
    );
    expect(() => projectModernJourneyTransactionV1(sequenceDrift)).toThrow(
      "modern_projection_sequence_gap",
    );

    const predecessorDrift = stream.map((event, index) =>
      index === 5 ? { ...event, predecessorEventRef: "MODERN-JOURNEY-EVENT:TAMPERED" } : event,
    );
    expect(() => projectModernJourneyTransactionV1(predecessorDrift)).toThrow(
      "modern_projection_predecessor_mismatch",
    );
  });

  it("rejects releasing a resource that was never reserved", () => {
    const log = new ModernJourneyEventLogV1();
    log.append({
      idempotencyKey: "OPEN",
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType: "TRANSACTION_OPENED",
      occurredAt: "2026-08-24T00:00:01.000Z",
      payload: {},
    });
    log.append({
      idempotencyKey: "FAIL",
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType: "PROVIDER_EXECUTION_FAILED",
      occurredAt: "2026-08-24T00:00:02.000Z",
      payload: { providerRef: "BANK-B" },
    });
    log.append({
      idempotencyKey: "RELEASE",
      transactionRef: TRANSACTION_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType: "RESOURCE_RELEASED",
      occurredAt: "2026-08-24T00:00:03.000Z",
      payload: { resourceRef: "FUNDING:NEVER-RESERVED" },
    });

    expect(() => projectModernJourneyTransactionV1(log.stream(TRANSACTION_REF))).toThrow(
      "modern_projection_release_resource_mismatch",
    );
  });
});
