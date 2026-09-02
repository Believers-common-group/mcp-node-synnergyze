import { describe, expect, it } from "vitest";
import type { CommerceEventObservationV1, CommerceEventTypeV1 } from "./contracts.ts";
import {
  buildOrderClosedObservationV1,
  COURIER_DELIVERY_CLOSURE_PROFILE_V1,
  STORE_PICKUP_CLOSURE_PROFILE_V1,
} from "./order-closure.ts";

function observation(eventType: CommerceEventTypeV1, eventRef: string): CommerceEventObservationV1 {
  const sourceOwner = eventType === "shipment_delivered" ? "CARRIER_FEED" : eventType === "invoice_created" ? "LOGIC_ERP" : "EASYCOM_OMS";
  const sourceSystemRef = sourceOwner === "CARRIER_FEED" ? "SYSTEM:VOI:CARRIER" : sourceOwner === "LOGIC_ERP" ? "SYSTEM:VOI:LOGIC" : "SYSTEM:VOI:EASYCOM";
  return {
    eventRef,
    eventType,
    sourceOwner,
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef,
    sourceEventName: eventType,
    sourceRecordRef: `${eventType}:1001`,
    evidenceRefs: [`EVIDENCE:${eventType}:1001`],
    evidenceClasses: [eventType.toUpperCase()],
    subjectRef: "ORDER:1001",
    occurredAt: "2026-09-02T00:00:00Z",
    observedAt: "2026-09-02T00:00:01Z",
    correlationId: "ORDER:1001",
    predecessorEventRefs: [],
    admittedFields: { orderRef: "ORDER:1001" },
    fieldClassifications: { orderRef: "GOVERNED_INTERNAL" },
    schemaVersion: "1.0.0",
  };
}

const orderCreated = observation("order_created", "EVENT:ORDER-CREATED");
const delivered = observation("shipment_delivered", "EVENT:DELIVERED");
const invoiceCreated = observation("invoice_created", "EVENT:INVOICE");
const collected = observation("customer_collected", "EVENT:COLLECTED");

function baseInput() {
  return {
    orderRef: "ORDER:1001",
    profile: COURIER_DELIVERY_CLOSURE_PROFILE_V1,
    observations: [orderCreated, delivered, invoiceCreated],
    sourceSystemRef: "SYSTEM:SYNNERGYZE",
    evidenceRefs: ["EVIDENCE:RECONCILIATION:ORDER:1001"],
    unresolvedBlockerRefs: [] as string[],
    occurredAt: "2026-09-02T00:07:00Z",
    observedAt: "2026-09-02T00:07:01Z",
  };
}

describe("derived order closure", () => {
  it("builds courier order_closed only as Synnergyze derived reconciliation", () => {
    const closed = buildOrderClosedObservationV1(baseInput());
    expect(closed.eventType).toBe("order_closed");
    expect(closed.sourceOwner).toBe("SYNNERGYZE");
    expect(closed.sourceRole).toBe("DERIVED_RECONCILIATION");
    expect(closed.admittedFields).toEqual({
      orderRef: "ORDER:1001",
      closureKind: "COURIER_DELIVERY",
      closureStatus: "CLOSED",
    });
    expect(closed.predecessorEventRefs).toEqual([
      orderCreated.eventRef,
      delivered.eventRef,
      invoiceCreated.eventRef,
    ]);
  });

  it("requires invoice state before courier closure", () => {
    expect(() =>
      buildOrderClosedObservationV1({ ...baseInput(), observations: [orderCreated, delivered] }),
    ).toThrow("ORDER_CLOSURE_REQUIREMENTS_UNMET:invoice_created");
  });

  it("fails closed while any unresolved blocker remains", () => {
    expect(() =>
      buildOrderClosedObservationV1({ ...baseInput(), unresolvedBlockerRefs: ["EXCEPTION:RETURN:OPEN"] }),
    ).toThrow("ORDER_CLOSURE_BLOCKED:EXCEPTION:RETURN:OPEN");
  });

  it("supports the store pickup closure profile without courier delivery", () => {
    const closed = buildOrderClosedObservationV1({
      ...baseInput(),
      profile: STORE_PICKUP_CLOSURE_PROFILE_V1,
      observations: [orderCreated, collected, invoiceCreated],
    });
    expect(closed.admittedFields.closureKind).toBe("STORE_PICKUP");
    expect(closed.predecessorEventRefs).toContain(collected.eventRef);
  });

  it("requires reconciliation evidence", () => {
    expect(() => buildOrderClosedObservationV1({ ...baseInput(), evidenceRefs: [] })).toThrow(
      "ORDER_CLOSURE_EVIDENCE_REQUIRED",
    );
  });
});
