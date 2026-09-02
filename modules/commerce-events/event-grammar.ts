import type { CommerceEventTypeV1 } from "./contracts.ts";

export const COMMERCE_EVENT_TYPES_V1: readonly CommerceEventTypeV1[] = Object.freeze([
  "style_created",
  "sku_created",
  "inventory_mapped",
  "inventory_visible",
  "order_created",
  "inventory_reserved",
  "pick_task_created",
  "picked",
  "item_packed",
  "dispatch_bin_scanned",
  "awb_created",
  "shipment_dispatched",
  "shipment_in_transit",
  "shipment_delivered",
  "customer_collection_ready",
  "customer_collected",
  "return_created",
  "return_qc_done",
  "refund_created",
  "credit_note_created",
  "invoice_created",
  "tax_output_posted",
  "tax_adjustment_posted",
  "order_closed",
]);

export const COMMERCE_EVENT_ALIASES_V1: Readonly<Record<string, CommerceEventTypeV1>> =
  Object.freeze({
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
  });

export function resolveCommerceEventTypeV1(sourceEventName: string): CommerceEventTypeV1 {
  const eventType = COMMERCE_EVENT_ALIASES_V1[sourceEventName];
  if (!eventType) throw new Error(`EVENT_ALIAS_UNKNOWN:${sourceEventName}`);
  return eventType;
}
