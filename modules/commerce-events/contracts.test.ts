import { describe, expect, it } from "vitest";
import type {
  CommerceEventObservationV1,
  CommerceSourceEventV1,
  CommerceSourceRoleV1,
} from "./contracts.ts";

const sourceRole: CommerceSourceRoleV1 = "AUTHORITATIVE_ORIGIN";

const source: CommerceSourceEventV1 = {
  sourceOwner: "EASYCOM_OMS",
  sourceRole,
  sourceSystemRef: "SYSTEM:VOI:EASYCOM",
  sourceEventName: "ecom_order_created",
  sourceRecordRef: "EASYCOM:ORDER:1001",
  evidenceRefs: ["EVIDENCE:EASYCOM:ORDER:1001"],
  evidenceClasses: ["ORDER_RECORD"],
  subjectRef: "ORDER:1001",
  placeRef: "NODE:VOI:ECOM",
  occurredAt: "2026-09-02T00:00:00Z",
  observedAt: "2026-09-02T00:00:01Z",
  correlationId: "ORDER:1001",
  predecessorEventRefs: [],
  admittedFields: { orderRef: "ORDER:1001", marketplaceRef: "MARKETPLACE:MYNTRA" },
  fieldClassifications: { orderRef: "GOVERNED_INTERNAL", marketplaceRef: "PARTNER" },
  schemaVersion: "1.0.0",
};

describe("VSR-COMMERCE-EVENT-001 contracts", () => {
  it("represents a source event separately from its normalized observation", () => {
    const observation: CommerceEventObservationV1 = {
      eventRef: "COMMERCE-EVENT:001",
      eventType: "order_created",
      ...source,
    };
    expect(observation.eventType).toBe("order_created");
    expect(observation.sourceEventName).toBe("ecom_order_created");
    expect(observation.sourceRole).toBe("AUTHORITATIVE_ORIGIN");
  });
});
