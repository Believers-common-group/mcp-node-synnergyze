import type { ChannelDeliveryEnvelopeV1, PublicationDeliveryState } from "./contracts.ts";

export interface RouteDeliveryResultV1 {
  state: PublicationDeliveryState;
  providerReceiptRef?: string;
  deliveredAt: string;
}

export interface ChannelRouteAdapterV1 {
  publish(envelope: ChannelDeliveryEnvelopeV1): Promise<RouteDeliveryResultV1>;
}
