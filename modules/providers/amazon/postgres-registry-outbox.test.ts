import { describe, expect, it } from "vitest";

import type { AmazonOrderRegistryProjectionV1 } from "./governed-orders-runtime.ts";
import { PostgresAmazonRegistryOutboxWriterV1 } from "./postgres-registry-outbox-writer.ts";
import type { AmazonPostgresQueryExecutorV1 } from "./postgres-registry-writer.ts";

class RecordingDb implements AmazonPostgresQueryExecutorV1 {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.calls.push({ sql, params });
    return { rows: [] as T[], rowCount: 1 };
  }
}

const projection: AmazonOrderRegistryProjectionV1 = {
  orderRef: "AMAZON-ORDER:171-1234567-1234567",
  providerOrderId: "171-1234567-1234567",
  providerRef: "PROVIDER-AMAZON-001",
  marketplaceId: "A21TJRUUN4KGV",
  marketplaceName: "Amazon.in",
  channelName: "AMAZON",
  createdTime: "2026-08-23T04:31:00Z",
  lastUpdatedTime: "2026-08-23T04:32:00Z",
  quantityFulfilled: 1,
  quantityUnfulfilled: 0,
  proceedsAmount: "1499.00",
  proceedsCurrency: "INR",
  providerResponseDigest: `sha256:${"a".repeat(64)}`,
  providerEvidenceRef: "AMAZON-PROVIDER-EVIDENCE:TEST-001",
  correlationId: "CORR-AMAZON-ORDER-SYNC-001",
  observedAt: "2026-08-23T04:35:05Z",
  piiProjected: false,
};

describe("PROVIDER-AMAZON-REGISTRY-OUTBOX-001", () => {
  it("commits a pending CWR Registry outbox event in the same transaction as the projection", async () => {
    const db = new RecordingDb();
    const writer = new PostgresAmazonRegistryOutboxWriterV1(db);

    const result = await writer.writeBatch([projection]);
    const outboxIndex = db.calls.findIndex((call) => call.sql.includes("uoe_master.registry_outbox"));
    const commitIndex = db.calls.findIndex((call) => call.sql.trim() === "COMMIT");

    expect(outboxIndex).toBeGreaterThan(0);
    expect(commitIndex).toBeGreaterThan(outboxIndex);

    const outbox = db.calls[outboxIndex];
    expect(outbox?.params).toContain("CWR-REGISTRY");
    expect(outbox?.params).toContain("AMAZON_ORDER_PROJECTION_UPDATED");
    expect(outbox?.params).toContain(result.registryRevisionRef);
    expect(outbox?.params).toContain(projection.providerEvidenceRef);
    expect(outbox?.params).toContain("pending");

    const serialized = JSON.stringify(outbox?.params);
    expect(serialized).toContain(projection.orderRef);
    expect(serialized).not.toContain("buyerInfo");
    expect(serialized).not.toContain("recipient");
  });
});
