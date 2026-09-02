import { describe, expect, it } from "vitest";

import {
  adaptEasyEcomCreateOrderV2Payload,
  adaptEasyEcomGetAllOrdersV2Payload,
  buildEasyEcomGetAllOrdersV2Url,
} from "./easyecom-readonly-adapter.ts";

const payload = [
  {
    order_id: 141340837,
    reference_code: "MYNTRA-REF-1001",
    marketplace: "Myntra",
    marketplace_id: 42,
    order_status: "Open",
    last_update_date: "2026-09-02 12:30:00",
    customer_name: "Sensitive Customer",
    contact_num: "9999999999",
    email: "private@example.invalid",
    address_line_1: "Private address",
    payment_mode: "PrePaid",
    suborders: [{ sku: "VOI-001", productName: "Private raw product payload" }],
  },
];

describe("EasyEcom read-only admission adapter", () => {
  it("maps Create Order V2 into a bounded Commerce source event", () => {
    const [source] = adaptEasyEcomCreateOrderV2Payload(payload, "2026-09-02T07:00:00.000Z");

    expect(source.sourceOwner).toBe("EASYCOM_OMS");
    expect(source.sourceRole).toBe("AUTHORITATIVE_ORIGIN");
    expect(source.sourceSystemRef).toBe("SYSTEM:VOI:EASYCOM");
    expect(source.sourceEventName).toBe("ecom_order_created");
    expect(source.sourceRecordRef).toBe("EASYCOM:ORDER:141340837");
    expect(source.subjectRef).toBe("ORDER:141340837");
    expect(source.correlationId).toBe("ORDER:141340837");
    expect(source.evidenceClasses).toEqual(["ORDER_RECORD"]);
    expect(source.admittedFields).toEqual({
      orderRef: "ORDER:141340837",
      marketplaceRef: "MARKETPLACE:EASYCOM:42",
      orderStatus: "Open",
    });
  });

  it("never copies customer, address, payment, or raw vendor payload into admitted fields", () => {
    const [source] = adaptEasyEcomCreateOrderV2Payload(payload, "2026-09-02T07:00:00.000Z");
    const serialized = JSON.stringify(source.admittedFields);

    expect(serialized).not.toContain("Sensitive Customer");
    expect(serialized).not.toContain("9999999999");
    expect(serialized).not.toContain("private@example.invalid");
    expect(serialized).not.toContain("Private address");
    expect(serialized).not.toContain("PrePaid");
    expect(serialized).not.toContain("suborders");
    expect(Object.keys(source.admittedFields)).toEqual(["orderRef", "marketplaceRef", "orderStatus"]);
  });

  it("uses webhook receipt time instead of inventing timezone semantics for EasyEcom source timestamps", () => {
    const [source] = adaptEasyEcomCreateOrderV2Payload(payload, "2026-09-02T07:00:00.000Z");
    expect(source.occurredAt).toBe("2026-09-02T07:00:00.000Z");
    expect(source.observedAt).toBe("2026-09-02T07:00:00.000Z");
    expect(source.sourceRecordVersionRef).toContain("2026-09-02 12:30:00");
  });

  it("fails closed when an order lacks its EasyEcom order id or marketplace id", () => {
    expect(() =>
      adaptEasyEcomCreateOrderV2Payload([{ ...payload[0], order_id: undefined }], "2026-09-02T07:00:00.000Z"),
    ).toThrow();
    expect(() =>
      adaptEasyEcomCreateOrderV2Payload([{ ...payload[0], marketplace_id: undefined }], "2026-09-02T07:00:00.000Z"),
    ).toThrow();
  });

  it("builds only the documented read-only getAllOrdersV2 reconciliation query", () => {
    expect(
      buildEasyEcomGetAllOrdersV2Url(
        "https://api.example.invalid/getAllOrdersV2",
        "2026-09-02 12:15:59",
      ),
    ).toBe(
      "https://api.example.invalid/getAllOrdersV2?updated_after=2026-09-02+12%3A15%3A59",
    );
  });

  it("rejects non-HTTPS reconciliation endpoints", () => {
    expect(() =>
      buildEasyEcomGetAllOrdersV2Url("http://api.example.invalid/getAllOrdersV2", "2026-09-02 12:15:59"),
    ).toThrow("EASYECOM_BACKFILL_ENDPOINT_HTTPS_REQUIRED");
  });
});


describe("EasyEcom getAllOrdersV2 reconciliation adapter", () => {
  it("marks API-recovered orders with API reconciliation evidence", () => {
    const [source] = adaptEasyEcomGetAllOrdersV2Payload(payload, "2026-09-02T07:10:00.000Z");
    expect(source.evidenceRefs[0]).toContain("EVIDENCE:EASYCOM:API:GET-ALL-ORDERS-V2:");
    expect(source.sourceEventName).toBe("ecom_order_created");
    expect(source.admittedFields.orderRef).toBe("ORDER:141340837");
  });
});
