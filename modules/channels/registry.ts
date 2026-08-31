import type { ChannelV1 } from "./contracts.ts";

export class SyntheticChannelRegistryV1 {
  private readonly channels = new Map<string, ChannelV1>();

  register(channel: ChannelV1): ChannelV1 {
    if (channel.allowedClassifications.length === 0) throw new Error("channel_classification_required");
    if (this.channels.has(channel.channelRef)) throw new Error("channel_duplicate");
    const stored: ChannelV1 = {
      ...channel,
      allowedClassifications: [...channel.allowedClassifications],
      routeRefs: [...channel.routeRefs],
    };
    this.channels.set(channel.channelRef, stored);
    return structuredClone(stored);
  }

  get(channelRef: string): ChannelV1 {
    const channel = this.channels.get(channelRef);
    if (!channel) throw new Error("channel_unknown");
    return structuredClone(channel);
  }
}
