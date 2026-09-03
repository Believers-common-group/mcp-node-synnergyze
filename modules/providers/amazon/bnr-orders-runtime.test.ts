import { describe, expect, it } from "vitest";

import type { AmazonOrdersSyncResultV1 } from "./governed-orders-runtime.ts";
import { AmazonBnrOrdersRuntimeV1 } from "./bnr-orders-runtime.ts";

function syncedResult(): AmazonOrdersSyncResultV1 {
  return {
    state: "SYNCED",
    provider: {
      providerRequestRef: "AMAZON-REQUEST-001",
      operation: "searchOrders",
      endpoint: "https://sellingpartnerapi-eu.amazon.com/orders/2026-01-01/orders",
      statusCode: 200,
      responseDigest: `sha256:${"a".repeat(64)}`,
      accessTokenPersisted: false,
      observedAt: "2026-08-23T05:40:00.000Z",
      nextTokenPresent: false,
    },
    river: {
      state: "PROVIDER_OBSERVED",
      reservationRef: "RIVER-RESERVATION-001",
      observationEvidenceRef: "AMAZON-PROVIDER-EVIDENCE-001",
      providerResponseDigest: `sha256:${"a".repeat(64)}`,
      sealed: false,
    },
    registry: {
      registryRevisionRef: "REGISTRY-REVISION:AMAZON:001",
      orderRefs: ["AMAZON-ORDER:001"],
    },
    silk: {
      state: "OBSERVED_NONFINAL",
      settlementFinality: false,
      moneyMoved: false,
      observedProceeds: [],
    },
    vsr: {
      registryRevisionRef: "REGISTRY-REVISION:AMAZON:001",
      orderRefs: ["AMAZON-ORDER:001"],
    },
    empire: {
      registryRevisionRef: "REGISTRY-REVISION:AMAZON:001",
      orderRefs: ["AMAZON-ORDER:001"],
    },
    realWorldWriteEffectOccurred: false,
  };
}

describe("Amazon Orders BNR-001 runtime binding", () => {
  it("annotates the existing governed runtime result with BNR-001 and the Orders service", async () => {
    let calls = 0;
    const delegate = {
      async sync() {
        calls += 1;
        return syncedResult();
      },
    };
    const runtime = new AmazonBnrOrdersRuntimeV1(delegate);

    const result = await runtime.sync({
      action: { action: "amazon.orders.search", capabilityRef: "amazon.orders.search" },
    } as never);

    expect(calls).toBe(1);
    expect(result.bnrNodeRef).toBe("BNR-001");
    expect(result.serviceRef).toBe("AMAZON-SPAPI-ORDERS");
    expect(result.provider.providerRequestRef).toBe("AMAZON-REQUEST-001");
    expect(result.realWorldWriteEffectOccurred).toBe(false);
    expect(result.silk.moneyMoved).toBe(false);
    expect(result.silk.settlementFinality).toBe(false);
  });

  it("rejects a sibling Amazon capability before invoking the provider runtime", async () => {
    let calls = 0;
    const delegate = {
      async sync() {
        calls += 1;
        return syncedResult();
      },
    };
    const runtime = new AmazonBnrOrdersRuntimeV1(delegate);

    await expect(
      runtime.sync({
        action: { action: "amazon.listings.put", capabilityRef: "amazon.listings.put" },
      } as never),
    ).rejects.toThrow("amazon_bnr_orders_capability_required");
    expect(calls).toBe(0);
  });
});
