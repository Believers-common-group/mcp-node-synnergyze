import type { PefEventV1 } from "../../packages/contracts/event.ts";
import type { PefOutboxRecordV1 } from "./persistence.ts";

export interface RiverPublisherPortV1 {
  publish(topic: string, event: PefEventV1): Promise<void>;
}

export interface OutboxRepositoryPortV1 {
  lockUnpublished(limit: number): Promise<readonly PefOutboxRecordV1[]>;
  markPublished(outboxId: string, publishedAt: string): Promise<void>;
}

export async function publishOutboxBatchV1(
  repository: OutboxRepositoryPortV1,
  publisher: RiverPublisherPortV1,
  publishedAt: string,
  limit = 100,
): Promise<number> {
  const rows = await repository.lockUnpublished(limit);
  let published = 0;
  for (const row of rows) {
    await publisher.publish(row.topic, row.payload);
    await repository.markPublished(row.outbox_id, publishedAt);
    published += 1;
  }
  return published;
}

export async function consumeIdempotentlyV1(
  consumerName: string,
  event: PefEventV1,
  checkpoint: {
    exists(consumerName: string, eventId: string): Promise<boolean>;
    commit(consumerName: string, eventId: string, processedAt: string): Promise<void>;
  },
  consequence: (event: PefEventV1) => Promise<void>,
  processedAt: string,
): Promise<"PROCESSED" | "DUPLICATE"> {
  if (await checkpoint.exists(consumerName, event.event_id)) return "DUPLICATE";
  await consequence(event);
  await checkpoint.commit(consumerName, event.event_id, processedAt);
  return "PROCESSED";
}
