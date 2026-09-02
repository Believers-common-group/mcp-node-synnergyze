import { describe, expect, it } from "vitest";
import {
  COMMERCE_PROJECTION_PROFILES_R0_3,
  getCommerceProjectionProfileV1,
} from "./commerce-profiles.ts";

const expectedProfileRefs = [
  "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
  "PROFILE:COMMERCE:WAREHOUSE:PICK-TASK",
  "PROFILE:COMMERCE:WAREHOUSE:PACKED",
  "PROFILE:COMMERCE:MARKETPLACE:MYNTRA:SHIPMENT",
  "PROFILE:COMMERCE:LOGISTICS:DISPATCHED",
  "PROFILE:COMMERCE:LOGISTICS:DELIVERED",
  "PROFILE:COMMERCE:RETURNS:CREATED",
  "PROFILE:COMMERCE:MANAGEMENT:ORDER-CLOSED",
  "PROFILE:COMMERCE:CUSTOMER:DELIVERED",
  "PROFILE:COMMERCE:WORKFORCE:PICK-TASK",
] as const;

describe("R0.3 commerce projection profiles", () => {
  it("registers exactly the ten approved semantic profiles", () => {
    expect(COMMERCE_PROJECTION_PROFILES_R0_3.map((profile) => profile.profileRef).sort()).toEqual(
      [...expectedProfileRefs].sort(),
    );
    expect(COMMERCE_PROJECTION_PROFILES_R0_3).toHaveLength(10);
  });

  it.each(expectedProfileRefs)("keeps %s active and versioned", (profileRef) => {
    const profile = getCommerceProjectionProfileV1(profileRef);
    expect(profile.status).toBe("ACTIVE");
    expect(profile.version).toBe(1);
    expect(profile.sourceOwnerPolicyRef).toBe("COMMERCE-SOURCE-POLICY:VOI:R0-3");
    expect(profile.sourceRolePolicyRef).toBe("COMMERCE-SOURCE-ROLE-POLICY:VOI:R0-3");
  });

  it("keeps Myntra as a scope rule rather than the semantic Channel", () => {
    const profile = getCommerceProjectionProfileV1(
      "PROFILE:COMMERCE:MARKETPLACE:MYNTRA:SHIPMENT",
    );
    expect(profile.targetChannelRef).toBe("VSR-CHANNEL:COMMERCE:MARKETPLACE");
    expect(profile.requiredScope).toEqual([
      {
        fieldName: "marketplaceRef",
        equals: "MARKETPLACE:MYNTRA",
        errorCode: "CROSS_MARKETPLACE_LEAKAGE",
      },
    ]);
  });

  it("minimizes the customer delivery projection", () => {
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:CUSTOMER:DELIVERED");
    expect(profile.targetChannelRef).toBe("VSR-CHANNEL:COMMERCE:ORDERS");
    expect(profile.classification).toBe("CUSTOMER");
    expect(profile.fieldRules.map((rule) => rule.sourceField)).toEqual(["orderRef", "deliveryStatus"]);
    expect(profile.fieldRules.map((rule) => rule.sourceField)).not.toEqual(
      expect.arrayContaining(["awb", "address", "phone", "email", "warehouseBin", "operatorRef"]),
    );
  });

  it("minimizes the workforce pick-task projection", () => {
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:WORKFORCE:PICK-TASK");
    expect(profile.targetChannelRef).toBe("VSR-CHANNEL:COMMERCE:WAREHOUSE");
    expect(profile.classification).toBe("WORKFORCE");
    expect(profile.fieldRules.map((rule) => rule.sourceField)).toEqual([
      "orderRef",
      "taskRef",
      "dueTime",
    ]);
    expect(profile.fieldRules.map((rule) => rule.sourceField)).not.toEqual(
      expect.arrayContaining(["customerPhone", "customerEmail", "customerAddress", "paymentMode"]),
    );
  });

  it("returns a structured clone rather than mutable registry state", () => {
    const first = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    const second = getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED");
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.fieldRules).not.toBe(second.fieldRules);
  });

  it("fails closed for an unknown profile", () => {
    expect(() => getCommerceProjectionProfileV1("PROFILE:UNKNOWN")).toThrow(
      "PROFILE_UNKNOWN:PROFILE:UNKNOWN",
    );
  });
});
