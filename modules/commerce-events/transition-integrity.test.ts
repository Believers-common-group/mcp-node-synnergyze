import { describe, expect, it } from "vitest";
import type { CommerceEventObservationV1, CommerceEventTypeV1 } from "./contracts.ts";
import { evaluateCommerceTransitionV1 } from "./transition-integrity.ts";

function observation(
  eventType: CommerceEventTypeV1,
  eventRef: string,
  predecessorEventRefs: readonly string[] = [],
  correlationId = "ORDER:1001",
): CommerceEventObservationV1 {
  return {
    eventRef,
    eventType,
    sourceOwner: eventType.startsWith("shipment_") ? "CARRIER_FEED" : "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: eventType.startsWith("shipment_") ? "SYSTEM:VOI:CARRIER" : "SYSTEM:VOI:EASYCOM",
    sourceEventName: eventType,
    sourceRecordRef: `${eventType}:1001`,
    evidenceRefs: [`EVIDENCE:${eventType}:1001`],
    evidenceClasses: [eventType.toUpperCase()],
    subjectRef: "ORDER:1001",
    occurredAt: "2026-09-02T00:00:00Z",
    observedAt: "2026-09-02T00:00:01Z",
    correlationId,
    predecessorEventRefs,
    admittedFields: { orderRef: correlationId },
    fieldClassifications: { orderRef: "GOVERNED_INTERNAL" },
    schemaVersion: "1.0.0",
  };
}

describe("commerce transition integrity", () => {
  it("admits shipment_delivered only when correlated shipment_dispatched exists", () => {
    const dispatched = observation("shipment_dispatched", "EVENT:DISPATCHED");
    const delivered = observation("shipment_delivered", "EVENT:DELIVERED", [dispatched.eventRef]);
    const result = evaluateCommerceTransitionV1(delivered, [dispatched]);
    expect(result.state).toBe("ADMITTED");
    expect(result.satisfiedPredecessorEventRefs).toEqual([dispatched.eventRef]);
  });

  it("retains an out-of-order delivered observation as reconciliation-required", () => {
    const pickTask = observation("pick_task_created", "EVENT:PICK");
    const delivered = observation("shipment_delivered", "EVENT:DELIVERED", [pickTask.eventRef]);
    const result = evaluateCommerceTransitionV1(delivered, [pickTask]);
    expect(result.state).toBe("RECONCILIATION_REQUIRED");
    expect(result.reasonCodes).toContain("PREDECESSOR_REQUIRED:shipment_dispatched");
  });

  it("does not satisfy a predecessor from another order correlation", () => {
    const dispatched = observation("shipment_dispatched", "EVENT:DISPATCHED", [], "ORDER:OTHER");
    const delivered = observation("shipment_delivered", "EVENT:DELIVERED", [dispatched.eventRef]);
    const result = evaluateCommerceTransitionV1(delivered, [dispatched]);
    expect(result.state).toBe("RECONCILIATION_REQUIRED");
    expect(result.reasonCodes).toContain("PREDECESSOR_REQUIRED:shipment_dispatched");
  });

  it("requires an explicitly declared predecessor ref when predecessor refs are present", () => {
    const dispatched = observation("shipment_dispatched", "EVENT:DISPATCHED");
    const delivered = observation("shipment_delivered", "EVENT:DELIVERED", ["EVENT:OTHER"]);
    const result = evaluateCommerceTransitionV1(delivered, [dispatched]);
    expect(result.state).toBe("RECONCILIATION_REQUIRED");
    expect(result.reasonCodes).toContain("PREDECESSOR_MISMATCH:shipment_dispatched");
  });

  it("rejects a direct self predecessor", () => {
    const delivered = observation("shipment_delivered", "EVENT:DELIVERED", ["EVENT:DELIVERED"]);
    const result = evaluateCommerceTransitionV1(delivered, []);
    expect(result.state).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SELF_PREDECESSOR_FORBIDDEN");
  });

  it("rejects a duplicate event ref conflict", () => {
    const delivered = observation("shipment_delivered", "EVENT:DELIVERED");
    const duplicate = observation("shipment_dispatched", "EVENT:DELIVERED");
    const result = evaluateCommerceTransitionV1(delivered, [duplicate]);
    expect(result.state).toBe("REJECTED");
    expect(result.reasonCodes).toContain("DUPLICATE_EVENT_REF_CONFLICT");
  });
});
