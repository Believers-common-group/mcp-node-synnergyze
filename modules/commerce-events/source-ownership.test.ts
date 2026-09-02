import { describe, expect, it } from "vitest";
import type {
  CommerceSourceEventV1,
  CommerceSourceOwnerV1,
  CommerceSourcePolicyV1,
  CommerceSourceRoleV1,
} from "./contracts.ts";
import { assertCommerceSourcePermittedV1 } from "./source-ownership.ts";

const policy: CommerceSourcePolicyV1 = {
  policyRef: "COMMERCE-SOURCE-POLICY:VOI:R0-3",
  version: 1,
  status: "ACTIVE",
  rules: [
    { eventType: "order_created", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "inventory_reserved", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "pick_task_created", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "item_packed", sourceOwner: "WOOQER", sourceRole: "EXECUTION_PROOF", sourceSystemRefs: ["SYSTEM:VOI:WOOQER"] },
    { eventType: "shipment_dispatched", sourceOwner: "CARRIER_FEED", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:CARRIER"] },
    { eventType: "shipment_delivered", sourceOwner: "CARRIER_FEED", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:CARRIER"] },
    { eventType: "shipment_delivered", sourceOwner: "EASYCOM_OMS", sourceRole: "INTEGRATION_OBSERVER", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "invoice_created", sourceOwner: "LOGIC_ERP", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:LOGIC"] },
    { eventType: "return_created", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
  ],
};

function source(overrides: Partial<CommerceSourceEventV1> = {}): CommerceSourceEventV1 {
  return {
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
    admittedFields: { orderRef: "ORDER:1001" },
    fieldClassifications: { orderRef: "GOVERNED_INTERNAL" },
    schemaVersion: "1.0.0",
    ...overrides,
  };
}

describe("commerce source owner/role policy", () => {
  it("admits the configured authoritative source", () => {
    expect(() => assertCommerceSourcePermittedV1(source(), "order_created", policy)).not.toThrow();
  });

  it("distinguishes an unknown source owner", () => {
    const unknown = source({ sourceOwner: "OTHER" as CommerceSourceOwnerV1 });
    expect(() => assertCommerceSourcePermittedV1(unknown, "order_created", policy)).toThrow(
      "SOURCE_OWNER_UNKNOWN",
    );
  });

  it("distinguishes an unknown source role", () => {
    const unknown = source({ sourceRole: "OTHER" as CommerceSourceRoleV1 });
    expect(() => assertCommerceSourcePermittedV1(unknown, "order_created", policy)).toThrow(
      "SOURCE_ROLE_UNKNOWN",
    );
  });

  it("rejects a known owner not admitted for the event", () => {
    expect(() =>
      assertCommerceSourcePermittedV1(
        source({ sourceOwner: "WOOQER", sourceRole: "EXECUTION_PROOF", sourceSystemRef: "SYSTEM:VOI:WOOQER" }),
        "order_created",
        policy,
      ),
    ).toThrow("SOURCE_OWNER_NOT_PERMITTED");
  });

  it("rejects source-role elevation for an integration observer", () => {
    expect(() =>
      assertCommerceSourcePermittedV1(
        source({ sourceEventName: "shipment_delivered", sourceRole: "AUTHORITATIVE_ORIGIN" }),
        "shipment_delivered",
        policy,
      ),
    ).toThrow("SOURCE_ROLE_NOT_PERMITTED");
  });

  it("rejects an unlisted source system for an otherwise valid owner/role", () => {
    expect(() =>
      assertCommerceSourcePermittedV1(
        source({ sourceSystemRef: "SYSTEM:OTHER:EASYCOM" }),
        "order_created",
        policy,
      ),
    ).toThrow("SOURCE_SYSTEM_NOT_PERMITTED");
  });

  it("rejects inactive policy", () => {
    expect(() =>
      assertCommerceSourcePermittedV1(source(), "order_created", { ...policy, status: "INACTIVE" }),
    ).toThrow("SOURCE_POLICY_INACTIVE");
  });
});
