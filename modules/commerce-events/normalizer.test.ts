import { describe, expect, it } from "vitest";
import type { CommerceSourceEventV1, CommerceSourcePolicyV1 } from "./contracts.ts";
import { normalizeCommerceEventV1 } from "./normalizer.ts";

const policy: CommerceSourcePolicyV1 = {
  policyRef: "COMMERCE-SOURCE-POLICY:VOI:R0-3",
  version: 1,
  status: "ACTIVE",
  rules: [
    {
      eventType: "order_created",
      sourceOwner: "EASYCOM_OMS",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"],
    },
  ],
};

const easycomOrder: CommerceSourceEventV1 = {
  sourceOwner: "EASYCOM_OMS",
  sourceRole: "AUTHORITATIVE_ORIGIN",
  sourceSystemRef: "SYSTEM:VOI:EASYCOM",
  sourceEventName: "ecom_order_created",
  sourceRecordRef: "EASYCOM:ORDER:1001",
  sourceRecordVersionRef: "VERSION:1",
  evidenceRefs: ["EVIDENCE:EASYCOM:ORDER:1001"],
  evidenceClasses: ["ORDER_RECORD"],
  subjectRef: "ORDER:1001",
  placeRef: "NODE:VOI:ECOM",
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
};

describe("commerce event normalizer", () => {
  it("normalizes an exact alias while preserving source lineage", () => {
    const observation = normalizeCommerceEventV1({ source: easycomOrder, policy });
    expect(observation.eventType).toBe("order_created");
    expect(observation.sourceEventName).toBe("ecom_order_created");
    expect(observation.sourceRecordRef).toBe("EASYCOM:ORDER:1001");
    expect(observation.sourceRole).toBe("AUTHORITATIVE_ORIGIN");
    expect(observation.eventRef).toMatch(/^COMMERCE-EVENT:[a-f0-9]{24}$/);
  });

  it("is deterministic for the same versioned source record", () => {
    const first = normalizeCommerceEventV1({ source: easycomOrder, policy });
    const second = normalizeCommerceEventV1({ source: structuredClone(easycomOrder), policy });
    expect(second.eventRef).toBe(first.eventRef);
  });

  it("returns cloned admitted field maps", () => {
    const observation = normalizeCommerceEventV1({ source: easycomOrder, policy });
    expect(observation.admittedFields).toEqual(easycomOrder.admittedFields);
    expect(observation.admittedFields).not.toBe(easycomOrder.admittedFields);
    expect(observation.fieldClassifications).not.toBe(easycomOrder.fieldClassifications);
  });

  it("rejects unsupported schema versions", () => {
    const source = { ...easycomOrder, schemaVersion: "2.0.0" as "1.0.0" };
    expect(() => normalizeCommerceEventV1({ source, policy })).toThrow(
      "SOURCE_SCHEMA_VERSION_UNSUPPORTED",
    );
  });

  it("rejects a missing source system ref", () => {
    expect(() =>
      normalizeCommerceEventV1({ source: { ...easycomOrder, sourceSystemRef: "" }, policy }),
    ).toThrow("SOURCE_SYSTEM_REF_MISSING");
  });

  it("rejects a missing source record ref", () => {
    expect(() =>
      normalizeCommerceEventV1({ source: { ...easycomOrder, sourceRecordRef: "" }, policy }),
    ).toThrow("SOURCE_RECORD_REF_MISSING");
  });

  it("rejects a missing subject ref", () => {
    expect(() =>
      normalizeCommerceEventV1({ source: { ...easycomOrder, subjectRef: "" }, policy }),
    ).toThrow("SUBJECT_RESOLUTION_FAILED");
  });

  it("rejects a missing correlation ref", () => {
    expect(() =>
      normalizeCommerceEventV1({ source: { ...easycomOrder, correlationId: "" }, policy }),
    ).toThrow("CORRELATION_MISMATCH");
  });

  it("rejects missing evidence refs", () => {
    expect(() =>
      normalizeCommerceEventV1({ source: { ...easycomOrder, evidenceRefs: [] }, policy }),
    ).toThrow("SOURCE_EVIDENCE_MISSING");
  });

  it("rejects missing evidence classes", () => {
    expect(() =>
      normalizeCommerceEventV1({ source: { ...easycomOrder, evidenceClasses: [] }, policy }),
    ).toThrow("SOURCE_EVIDENCE_CLASS_MISSING");
  });

  it("rejects field/classification parity mismatches", () => {
    expect(() =>
      normalizeCommerceEventV1({
        source: {
          ...easycomOrder,
          admittedFields: { ...easycomOrder.admittedFields, warehouseBin: "BIN:A1" },
        },
        policy,
      }),
    ).toThrow("COMMERCE_FIELD_CLASSIFICATION_MISMATCH");
  });

  it("rejects an orderRef that does not match correlationId", () => {
    expect(() =>
      normalizeCommerceEventV1({
        source: {
          ...easycomOrder,
          admittedFields: { ...easycomOrder.admittedFields, orderRef: "ORDER:OTHER" },
        },
        policy,
      }),
    ).toThrow("CORRELATION_MISMATCH");
  });

  it("rejects observations recorded before occurrence", () => {
    expect(() =>
      normalizeCommerceEventV1({
        source: {
          ...easycomOrder,
          occurredAt: "2026-09-02T00:00:02Z",
          observedAt: "2026-09-02T00:00:01Z",
        },
        policy,
      }),
    ).toThrow("COMMERCE_OBSERVED_BEFORE_OCCURRED");
  });
});
