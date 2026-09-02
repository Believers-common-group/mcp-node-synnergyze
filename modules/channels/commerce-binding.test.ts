import { describe, expect, it } from "vitest";
import type {
  CommerceEventObservationV1,
  CommerceTransitionResultV1,
} from "../commerce-events/contracts.ts";
import { bindCommerceObservationToHeaderBoardDraftV1 } from "./commerce-binding.ts";
import {
  getCommerceProjectionProfileV1,
  type CommerceProjectionProfileV1,
} from "./commerce-profiles.ts";

function orderCreated(overrides: Partial<CommerceEventObservationV1> = {}): CommerceEventObservationV1 {
  return {
    eventRef: "COMMERCE-EVENT:ORDER-1001",
    eventType: "order_created",
    sourceOwner: "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:EASYCOM",
    sourceEventName: "ecom_order_created",
    sourceRecordRef: "EASYCOM:ORDER:1001",
    evidenceRefs: ["EVIDENCE:EASYCOM:ORDER:1001"],
    evidenceClasses: ["ORDER_RECORD"],
    subjectRef: "ORDER:1001",
    occurredAt: "2026-09-02T00:00:00Z",
    observedAt: "2026-09-02T00:00:01Z",
    correlationId: "ORDER:1001",
    predecessorEventRefs: [],
    admittedFields: {
      orderRef: "ORDER:1001",
      marketplaceRef: "MARKETPLACE:MYNTRA",
      orderStatus: "CREATED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      marketplaceRef: "PARTNER",
      orderStatus: "MANAGEMENT",
    },
    schemaVersion: "1.0.0",
    ...overrides,
  };
}

function shipment(overrides: Partial<CommerceEventObservationV1> = {}): CommerceEventObservationV1 {
  return {
    eventRef: "COMMERCE-EVENT:SHIPMENT-1001",
    eventType: "shipment_dispatched",
    sourceOwner: "CARRIER_FEED",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:CARRIER",
    sourceEventName: "shipment_dispatched",
    sourceRecordRef: "CARRIER:SHIPMENT:1001",
    evidenceRefs: ["EVIDENCE:CARRIER:HANDOVER:1001"],
    evidenceClasses: ["HANDOVER_PROOF"],
    subjectRef: "ORDER:1001",
    occurredAt: "2026-09-02T00:04:00Z",
    observedAt: "2026-09-02T00:04:01Z",
    correlationId: "ORDER:1001",
    predecessorEventRefs: ["COMMERCE-EVENT:PACKED-1001"],
    admittedFields: {
      orderRef: "ORDER:1001",
      marketplaceRef: "MARKETPLACE:MYNTRA",
      shipmentStatus: "DISPATCHED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      marketplaceRef: "PARTNER",
      shipmentStatus: "GOVERNED_INTERNAL",
    },
    schemaVersion: "1.0.0",
    ...overrides,
  };
}

function admitted(observation: CommerceEventObservationV1): CommerceTransitionResultV1 {
  return {
    state: "ADMITTED",
    observationRef: observation.eventRef,
    reasonCodes: [],
    satisfiedPredecessorEventRefs: [...observation.predecessorEventRefs],
  };
}

function bindingInput(
  observation: CommerceEventObservationV1,
  profile: CommerceProjectionProfileV1,
) {
  return {
    observation,
    transition: admitted(observation),
    profile,
    headerBoardRef: `HEADER:${observation.eventRef}`,
    publisherPrincipalRef: "DIGITALME:VOI:OPS",
    publisherCapacityRef: "CAPACITY:VOI:OPS",
    effectiveFrom: "2026-09-02T00:00:02Z",
  };
}

describe("commerce observation to Header Board binding", () => {
  it("binds an admitted Easycom order observation to the Orders Channel", () => {
    const observation = orderCreated();
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    const draft = bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile));
    expect(draft.channelRef).toBe("VSR-CHANNEL:COMMERCE:ORDERS");
    expect(draft.sourceEventRefs).toEqual([observation.eventRef]);
    expect(draft.correlationId).toBe("ORDER:1001");
    expect(draft.fields).toEqual({
      orderRef: { value: "ORDER:1001", classification: "GOVERNED_INTERNAL" },
      marketplaceRef: { value: "MARKETPLACE:MYNTRA", classification: "PARTNER" },
      orderStatus: { value: "CREATED", classification: "MANAGEMENT" },
    });
  });

  it("rejects a transition reference mismatch", () => {
    const observation = orderCreated();
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    expect(() =>
      bindCommerceObservationToHeaderBoardDraftV1({
        ...bindingInput(observation, profile),
        transition: { ...admitted(observation), observationRef: "COMMERCE-EVENT:OTHER" },
      }),
    ).toThrow("COMMERCE_TRANSITION_REFERENCE_MISMATCH");
  });

  it("rejects a transition that is not admitted", () => {
    const observation = orderCreated();
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    expect(() =>
      bindCommerceObservationToHeaderBoardDraftV1({
        ...bindingInput(observation, profile),
        transition: {
          state: "RECONCILIATION_REQUIRED",
          observationRef: observation.eventRef,
          reasonCodes: ["PREDECESSOR_REQUIRED:order_created"],
          satisfiedPredecessorEventRefs: [],
        },
      }),
    ).toThrow("COMMERCE_TRANSITION_NOT_ADMITTED");
  });

  it("rejects an inactive profile", () => {
    const observation = orderCreated();
    const profile = {
      ...getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED"),
      status: "INACTIVE" as const,
    };
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "PROFILE_INACTIVE",
    );
  });

  it("rejects an event sent through the wrong semantic profile", () => {
    const observation = orderCreated();
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:LOGISTICS:DELIVERED");
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "CHANNEL_EVENT_PROFILE_MISMATCH",
    );
  });

  it("rejects a required source field missing from the observation", () => {
    const observation = orderCreated({
      admittedFields: { orderRef: "ORDER:1001", marketplaceRef: "MARKETPLACE:MYNTRA" },
      fieldClassifications: { orderRef: "GOVERNED_INTERNAL", marketplaceRef: "PARTNER" },
    });
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "REQUIRED_SOURCE_FIELD_MISSING:orderStatus",
    );
  });

  it("rejects a required evidence class missing from the observation", () => {
    const observation = orderCreated({ evidenceClasses: ["OTHER"] });
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "REQUIRED_EVIDENCE_CLASS_MISSING:ORDER_RECORD",
    );
  });

  it("rejects cross-order correlation leakage", () => {
    const observation = orderCreated({
      admittedFields: {
        orderRef: "ORDER:OTHER",
        marketplaceRef: "MARKETPLACE:MYNTRA",
        orderStatus: "CREATED",
      },
    });
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "CROSS_ORDER_LEAKAGE",
    );
  });

  it("rejects cross-marketplace scope", () => {
    const observation = shipment({
      admittedFields: {
        orderRef: "ORDER:1001",
        marketplaceRef: "MARKETPLACE:FLIPKART",
        shipmentStatus: "DISPATCHED",
      },
    });
    const profile = getCommerceProjectionProfileV1(
      "PROFILE:COMMERCE:MARKETPLACE:MYNTRA:SHIPMENT",
    );
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "CROSS_MARKETPLACE_LEAKAGE",
    );
  });

  it("reports a generic scope mismatch with the field name", () => {
    const observation = orderCreated();
    const profile: CommerceProjectionProfileV1 = {
      ...getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED"),
      requiredScope: [
        { fieldName: "orderStatus", equals: "READY", errorCode: "PROFILE_SCOPE_MISMATCH" },
      ],
    };
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "PROFILE_SCOPE_MISMATCH:orderStatus",
    );
  });

  it("projects only explicitly listed fields", () => {
    const observation = orderCreated({
      admittedFields: {
        orderRef: "ORDER:1001",
        marketplaceRef: "MARKETPLACE:MYNTRA",
        orderStatus: "CREATED",
        customerPhone: "+91-0000000000",
        warehouseBin: "BIN:A1",
        paymentMode: "CARD",
        internalException: "NONE",
        carrierRawPayload: { status: "opaque" },
      },
      fieldClassifications: {
        orderRef: "GOVERNED_INTERNAL",
        marketplaceRef: "PARTNER",
        orderStatus: "MANAGEMENT",
        customerPhone: "RESTRICTED",
        warehouseBin: "WORKFORCE",
        paymentMode: "CONFIDENTIAL",
        internalException: "GOVERNED_INTERNAL",
        carrierRawPayload: "RESTRICTED",
      },
    });
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    const draft = bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile));
    expect(Object.keys(draft.fields)).toEqual(["orderRef", "marketplaceRef", "orderStatus"]);
    expect(draft.fields).not.toHaveProperty("customerPhone");
    expect(draft.fields).not.toHaveProperty("warehouseBin");
    expect(draft.fields).not.toHaveProperty("carrierRawPayload");
  });

  it("reuses the Channel secret-field guard", () => {
    const observation = orderCreated({
      admittedFields: { ...orderCreated().admittedFields, secretValue: "never-route" },
      fieldClassifications: {
        ...orderCreated().fieldClassifications,
        secretValue: "RESTRICTED",
      },
    });
    const profile: CommerceProjectionProfileV1 = {
      ...getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED"),
      requiredSourceFields: ["orderRef", "marketplaceRef", "orderStatus", "secretValue"],
      fieldRules: [
        ...getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED").fieldRules,
        { sourceField: "secretValue", targetField: "apiKey", classification: "RESTRICTED" },
      ],
    };
    expect(() => bindCommerceObservationToHeaderBoardDraftV1(bindingInput(observation, profile))).toThrow(
      "projection_secret_field_forbidden:apiKey",
    );
  });
});
