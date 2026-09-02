export type CommerceEventTypeV1 =
  | "style_created"
  | "sku_created"
  | "inventory_mapped"
  | "inventory_visible"
  | "order_created"
  | "inventory_reserved"
  | "pick_task_created"
  | "picked"
  | "item_packed"
  | "dispatch_bin_scanned"
  | "awb_created"
  | "shipment_dispatched"
  | "shipment_in_transit"
  | "shipment_delivered"
  | "customer_collection_ready"
  | "customer_collected"
  | "return_created"
  | "return_qc_done"
  | "refund_created"
  | "credit_note_created"
  | "invoice_created"
  | "tax_output_posted"
  | "tax_adjustment_posted"
  | "order_closed";

export type CommerceSourceOwnerV1 =
  | "LOGIC_ERP"
  | "EASYCOM_OMS"
  | "WOOQER"
  | "CARRIER_FEED"
  | "TALLY_ACCOUNTING"
  | "POS"
  | "WAREHOUSE_EXECUTION"
  | "STORE_EXECUTION"
  | "CRM"
  | "SYNNERGYZE";

export type CommerceSourceRoleV1 =
  | "AUTHORITATIVE_ORIGIN"
  | "EXECUTION_PROOF"
  | "INTEGRATION_OBSERVER"
  | "DERIVED_RECONCILIATION";

export type CommerceFieldClassificationV1 =
  | "PUBLIC"
  | "CUSTOMER"
  | "PARTNER"
  | "WORKFORCE"
  | "MANAGEMENT"
  | "GOVERNED_INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED";

export type CommerceJsonPrimitiveV1 = string | number | boolean | null;
export type CommerceJsonValueV1 =
  | CommerceJsonPrimitiveV1
  | CommerceJsonValueV1[]
  | { [key: string]: CommerceJsonValueV1 };

export interface CommerceSourceEventV1 {
  sourceOwner: CommerceSourceOwnerV1;
  sourceRole: CommerceSourceRoleV1;
  sourceSystemRef: string;
  sourceEventName: string;
  sourceRecordRef: string;
  sourceRecordVersionRef?: string;
  evidenceRefs: readonly string[];
  evidenceClasses: readonly string[];
  subjectRef: string;
  placeRef?: string;
  occurredAt: string;
  observedAt: string;
  correlationId: string;
  predecessorEventRefs: readonly string[];
  admittedFields: Readonly<Record<string, CommerceJsonValueV1>>;
  fieldClassifications: Readonly<Record<string, CommerceFieldClassificationV1>>;
  schemaVersion: "1.0.0";
}

export interface CommerceEventObservationV1 extends CommerceSourceEventV1 {
  eventRef: string;
  eventType: CommerceEventTypeV1;
}

export interface CommerceSourcePolicyRuleV1 {
  eventType: CommerceEventTypeV1;
  sourceOwner: CommerceSourceOwnerV1;
  sourceRole: CommerceSourceRoleV1;
  sourceSystemRefs: readonly string[];
}

export interface CommerceSourcePolicyV1 {
  policyRef: string;
  version: number;
  status: "ACTIVE" | "INACTIVE";
  rules: readonly CommerceSourcePolicyRuleV1[];
}

export type CommerceTransitionStateV1 = "ADMITTED" | "RECONCILIATION_REQUIRED" | "REJECTED";

export interface CommerceTransitionResultV1 {
  state: CommerceTransitionStateV1;
  observationRef: string;
  reasonCodes: readonly string[];
  satisfiedPredecessorEventRefs: readonly string[];
}

export type OrderClosureKindV1 = "COURIER_DELIVERY" | "STORE_PICKUP" | "CANCELLED" | "RETURNED";

export interface OrderClosureProfileV1 {
  profileRef: string;
  kind: OrderClosureKindV1;
  requiredEventTypes: readonly CommerceEventTypeV1[];
  version: number;
  status: "ACTIVE" | "INACTIVE";
}
