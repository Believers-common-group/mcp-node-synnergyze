import type { ChannelDeliveryEnvelopeV1, PublicationDeliveryState } from "./contracts.ts";
import type { ChannelRouteAdapterV1, RouteDeliveryResultV1 } from "./route-adapter.ts";

export class SyntheticInMemoryRouteAdapterV1 implements ChannelRouteAdapterV1 {
  private readonly byDeliveryRef = new Map<string, ChannelDeliveryEnvelopeV1>();

  constructor(private readonly resultState: PublicationDeliveryState = "DELIVERED") {}

  async publish(envelope: ChannelDeliveryEnvelopeV1): Promise<RouteDeliveryResultV1> {
    if (!this.byDeliveryRef.has(envelope.deliveryRef)) {
      this.byDeliveryRef.set(envelope.deliveryRef, structuredClone(envelope));
    }
    return {
      state: this.resultState,
      providerReceiptRef: `MEMORY-RECEIPT:${envelope.deliveryRef}`,
      deliveredAt: "2026-09-01T00:01:25Z",
    };
  }

  deliveryCount(): number {
    return this.byDeliveryRef.size;
  }

  deliveries(): readonly ChannelDeliveryEnvelopeV1[] {
    return [...this.byDeliveryRef.values()].map((value) => structuredClone(value));
  }
}
