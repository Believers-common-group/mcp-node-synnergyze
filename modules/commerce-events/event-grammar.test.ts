import { describe, expect, it } from "vitest";
import { resolveCommerceEventTypeV1 } from "./event-grammar.ts";

const expectedAliases = {
  style_created: "style_created",
  sku_created: "sku_created",
  inventory_mapped: "inventory_mapped",
  inventory_visible: "inventory_visible",
  order_created: "order_created",
  ecom_order_created: "order_created",
  online_order_created: "order_created",
  inventory_reserved: "inventory_reserved",
  pick_task_created: "pick_task_created",
  warehouse_pick_created: "pick_task_created",
  pick_ticket_created: "pick_task_created",
  picked: "picked",
  item_packed: "item_packed",
  packed: "item_packed",
  dispatch_bin_scanned: "dispatch_bin_scanned",
  awb_created: "awb_created",
  awb_generated: "awb_created",
  shipment_dispatched: "shipment_dispatched",
  package_dispatched: "shipment_dispatched",
  ship_from_store_dispatched: "shipment_dispatched",
  shipment_in_transit: "shipment_in_transit",
  shipment_delivered: "shipment_delivered",
  customer_collection_ready: "customer_collection_ready",
  pickup_ready: "customer_collection_ready",
  customer_collected: "customer_collected",
  return_created: "return_created",
  return_initiated: "return_created",
  return_qc_done: "return_qc_done",
  refund_created: "refund_created",
  credit_note_created: "credit_note_created",
  invoice_created: "invoice_created",
  store_pos_invoice_created: "invoice_created",
  tax_output_posted: "tax_output_posted",
  tax_adjustment_posted: "tax_adjustment_posted",
  order_closed: "order_closed",
} as const;

describe("closed commerce event alias grammar", () => {
  it.each(Object.entries(expectedAliases))("maps %s exactly", (sourceName, canonical) => {
    expect(resolveCommerceEventTypeV1(sourceName)).toBe(canonical);
  });

  it("rejects fuzzy aliases", () => {
    expect(() => resolveCommerceEventTypeV1("shipmnt_deliverd")).toThrow(
      "EVENT_ALIAS_UNKNOWN:shipmnt_deliverd",
    );
  });

  it("rejects case-normalized guesses", () => {
    expect(() => resolveCommerceEventTypeV1("Ecom_Order_Created")).toThrow(
      "EVENT_ALIAS_UNKNOWN:Ecom_Order_Created",
    );
  });
});
