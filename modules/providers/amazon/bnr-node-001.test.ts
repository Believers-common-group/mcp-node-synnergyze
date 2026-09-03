import { describe, expect, it } from "vitest";

import {
  AMAZON_BNR_NODE_001,
  resolveAmazonBnrServiceBindingV1,
} from "./bnr-node-001.ts";

const EXPECTED_SERVICE_REFS = [
  "AMAZON-SPAPI-ORDERS",
  "AMAZON-MARKETPLACE-LISTINGS",
  "AMAZON-FULFILMENT",
  "AMAZON-ADS",
  "AMAZON-BUSINESS-PROCUREMENT",
  "AWS-COMPUTE",
] as const;

describe("Amazon BNR-001 manifest", () => {
  it("reserves Amazon as BNR-001 without asserting a partnership or activation", () => {
    expect(AMAZON_BNR_NODE_001.nodeRef).toBe("BNR-001");
    expect(AMAZON_BNR_NODE_001.nodeClass).toBe("BNR");
    expect(AMAZON_BNR_NODE_001.partnerRef).toBe("PARTNER:AMAZON");
    expect(AMAZON_BNR_NODE_001.partnerLifecycle).toBe("PROPOSED_PARTNER");
    expect(AMAZON_BNR_NODE_001.activationState).toBe("INACTIVE");
    expect(AMAZON_BNR_NODE_001.authorityEvidenceRefs).toEqual([]);
    expect(AMAZON_BNR_NODE_001.commercialEvidenceRefs).toEqual([]);
    expect(AMAZON_BNR_NODE_001.activationEvidenceRefs).toEqual([]);
  });

  it("declares Amazon surfaces as separate service bindings", () => {
    expect(AMAZON_BNR_NODE_001.serviceBindings.map((binding) => binding.serviceRef)).toEqual(
      EXPECTED_SERVICE_REFS,
    );
  });

  it("makes Orders the only current R0.1 governed service capability", () => {
    const orders = resolveAmazonBnrServiceBindingV1("AMAZON-SPAPI-ORDERS");

    expect(orders.capabilityRef).toBe("amazon.orders.search");
    expect(orders.effectClass).toBe("READ_ONLY_PROVIDER_EFFECT");
    expect(orders.settlementFinality).toBe(false);
    expect(orders.state).toBe("REQUIRED");
    expect(orders.authorityRefs).toEqual(["AUTHORITY:AMAZON-SPAPI-ORDERS-READ"]);
  });

  it("does not bleed Orders authority into Listings or AWS", () => {
    const orders = resolveAmazonBnrServiceBindingV1("AMAZON-SPAPI-ORDERS");
    const listings = resolveAmazonBnrServiceBindingV1("AMAZON-MARKETPLACE-LISTINGS");
    const aws = resolveAmazonBnrServiceBindingV1("AWS-COMPUTE");

    expect(listings.authorityRefs).not.toEqual(orders.authorityRefs);
    expect(aws.authorityRefs).not.toEqual(orders.authorityRefs);
    expect(listings.capabilityRef).not.toBe(orders.capabilityRef);
    expect(aws.capabilityRef).not.toBe(orders.capabilityRef);
  });

  it("fails closed for an unknown Amazon service reference", () => {
    expect(() => resolveAmazonBnrServiceBindingV1("AMAZON-UNKNOWN")).toThrow(
      "amazon_bnr_service_not_found",
    );
  });
});
