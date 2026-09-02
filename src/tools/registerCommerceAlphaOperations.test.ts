import { describe, expect, it } from "vitest";

import {
  ALPHA_COMMERCE_SOURCE_POLICY,
  evaluateCommerceAlphaOperations,
  parseCommerceAlphaOperationsInput,
} from "./registerCommerceAlphaOperations.ts";

function orderCreated() {
  return {
    sourceOwner: "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:EASYCOM",
    sourceEventName: "ecom_order_created",
    sourceRecordRef: "EASYCOM:ORDER:2001",
    sourceRecordVersionRef: "VERSION:1",
    evidenceRefs: ["EVIDENCE:EASYCOM:ORDER:2001"],
    evidenceClasses: ["ORDER_RECORD"],
    subjectRef: "ORDER:2001",
    placeRef: "NODE:VOI:ECOM",
    occurredAt: "2026-09-02T06:00:00Z",
    observedAt: "2026-09-02T06:00:01Z",
    correlationId: "ORDER:2001",
    predecessorEventRefs: [],
    admittedFields: {
      orderRef: "ORDER:2001",
      marketplaceRef: "MARKETPLACE:MYNTRA",
      orderStatus: "CREATED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      marketplaceRef: "PARTNER",
      orderStatus: "MANAGEMENT",
    },
    schemaVersion: "1.0.0",
  } as const;
}

function carrierDeliveredAsEasycomAuthority() {
  return {
    sourceOwner: "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:EASYCOM",
    sourceEventName: "shipment_delivered",
    sourceRecordRef: "EASYCOM:DELIVERY:2001",
    sourceRecordVersionRef: "VERSION:1",
    evidenceRefs: ["EVIDENCE:EASYCOM:DELIVERY:2001"],
    evidenceClasses: ["DELIVERY_PROOF"],
    subjectRef: "ORDER:2001",
    placeRef: "NODE:VOI:ECOM",
    occurredAt: "2026-09-02T06:05:00Z",
    observedAt: "2026-09-02T06:05:01Z",
    correlationId: "ORDER:2001",
    predecessorEventRefs: [],
    admittedFields: {
      orderRef: "ORDER:2001",
      deliveryStatus: "DELIVERED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      deliveryStatus: "CUSTOMER",
    },
    schemaVersion: "1.0.0",
  } as const;
}

function carrierDeliveredWithoutHistory() {
  return {
    sourceOwner: "CARRIER_FEED",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:CARRIER",
    sourceEventName: "shipment_delivered",
    sourceRecordRef: "CARRIER:DELIVERY:2001",
    sourceRecordVersionRef: "VERSION:1",
    evidenceRefs: ["EVIDENCE:CARRIER:DELIVERY:2001"],
    evidenceClasses: ["DELIVERY_PROOF"],
    subjectRef: "ORDER:2001",
    placeRef: "NODE:VOI:ECOM",
    occurredAt: "2026-09-02T06:05:00Z",
    observedAt: "2026-09-02T06:05:01Z",
    correlationId: "ORDER:2001",
    predecessorEventRefs: [],
    admittedFields: {
      orderRef: "ORDER:2001",
      deliveryStatus: "DELIVERED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      deliveryStatus: "CUSTOMER",
    },
    schemaVersion: "1.0.0",
  } as const;
}

describe("R0.3.1 Commerce Alpha Operations gateway", () => {
  it("uses a fixed server-owned source policy", () => {
    expect(ALPHA_COMMERCE_SOURCE_POLICY.policyRef).toBe("COMMERCE-SOURCE-POLICY:VOI:ALPHA-R0-3-1");
    expect(ALPHA_COMMERCE_SOURCE_POLICY.status).toBe("ACTIVE");
  });

  it("normalizes, admits, and prepares an order Header Board draft", () => {
    const result = evaluateCommerceAlphaOperations({
      sourceEvents: [orderCreated()],
      projection: {
        profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
        headerBoardRef: "HEADER:ALPHA:ORDER:2001",
        publisherPrincipalRef: "DIGITALME:VOI:OPS",
        publisherCapacityRef: "CAPACITY:VOI:OPS",
        effectiveFrom: "2026-09-02T06:00:02Z",
      },
    });

    expect(result.policyRef).toBe(ALPHA_COMMERCE_SOURCE_POLICY.policyRef);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].observation.eventType).toBe("order_created");
    expect(result.results[0].transition.state).toBe("ADMITTED");
    expect(result.headerBoardDraft?.channelRef).toBe("VSR-CHANNEL:COMMERCE:ORDERS");
    expect(result.headerBoardDraft?.sourceEventRefs).toEqual([
      result.results[0].observation.eventRef,
    ]);
  });

  it("retains an out-of-order delivery as reconciliation-required and produces no draft", () => {
    const result = evaluateCommerceAlphaOperations({
      sourceEvents: [carrierDeliveredWithoutHistory()],
      projection: {
        profileRef: "PROFILE:COMMERCE:LOGISTICS:DELIVERED",
        headerBoardRef: "HEADER:ALPHA:DELIVERY:2001",
        publisherPrincipalRef: "DIGITALME:VOI:OPS",
        publisherCapacityRef: "CAPACITY:VOI:OPS",
        effectiveFrom: "2026-09-02T06:05:02Z",
      },
    });

    expect(result.results[0].transition.state).toBe("RECONCILIATION_REQUIRED");
    expect(result.results[0].transition.reasonCodes).toContain(
      "PREDECESSOR_REQUIRED:shipment_dispatched",
    );
    expect(result.headerBoardDraft).toBeNull();
  });

  it("rejects source-role elevation before transition evaluation", () => {
    expect(() =>
      evaluateCommerceAlphaOperations({ sourceEvents: [carrierDeliveredAsEasycomAuthority()] }),
    ).toThrow("SOURCE_ROLE_NOT_PERMITTED");
  });

  it("rejects caller-supplied authority policy fields", () => {
    expect(() =>
      parseCommerceAlphaOperationsInput({
        sourceEvents: [orderCreated()],
        policy: { status: "ACTIVE", rules: [] },
      }),
    ).toThrow();
  });
});
