import { describe, expect, it } from "vitest";

import type { AmazonOrderRegistryProjectionV1 } from "./governed-orders-runtime.ts";
import {
  PostgresAmazonRegistryProjectionWriterV1,
  type AmazonPostgresQueryExecutorV1,
} from "./postgres-registry-writer.ts";

function projection(overrides: Partial<AmazonOrderRegistryProjectionV1> = {}): AmazonOrderRegistryProjectionV1 {
  return {
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
    ...overrides,
  };
}

class RecordingDb implements AmazonPostgresQueryExecutorV1 {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  failOnOrderWrite = false;

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.calls.push({ sql, params });
    if (this.failOnOrderWrite && sql.includes("amazon_order_projection")) {
      throw new Error("database_write_failed");
    }
    return { rows: [] as T[], rowCount: 1 };
  }
}

describe("PROVIDER-AMAZON-REGISTRY-POSTGRES-001", () => {
  it("writes the non-PII order projection and revision atomically into the existing Registry schema", async () => {
    const db = new RecordingDb();
    const writer = new PostgresAmazonRegistryProjectionWriterV1(db);

    const result = await writer.writeBatch([projection()]);

    expect(result.registryRevisionRef).toMatch(/^REGISTRY-REVISION:AMAZON:[0-9a-f]{24}$/);
    expect(result.orderRefs).toEqual(["AMAZON-ORDER:171-1234567-1234567"]);
    expect(db.calls[0]?.sql.trim()).toBe("BEGIN");
    expect(db.calls.at(-1)?.sql.trim()).toBe("COMMIT");

    const orderWrite = db.calls.find((call) => call.sql.includes("uoe_master.amazon_order_projection"));
    expect(orderWrite).toBeDefined();
    expect(orderWrite?.sql).toContain("ON CONFLICT (provider_order_id) DO UPDATE");
    expect(orderWrite?.params).toContain(false);

    const revisionWrite = db.calls.find((call) =>
      call.sql.includes("uoe_master.amazon_order_projection_revision"),
    );
    expect(revisionWrite).toBeDefined();
    expect(revisionWrite?.params).toContain(result.registryRevisionRef);
    expect(JSON.stringify(db.calls)).not.toContain("client-secret");
    expect(JSON.stringify(db.calls)).not.toContain("refresh-token");
    expect(JSON.stringify(db.calls)).not.toContain("access-token");
  });

  it("rolls back and exposes no revision when a projection write fails", async () => {
    const db = new RecordingDb();
    db.failOnOrderWrite = true;
    const writer = new PostgresAmazonRegistryProjectionWriterV1(db);

    await expect(writer.writeBatch([projection()])).rejects.toThrow("database_write_failed");
    expect(db.calls.at(-1)?.sql.trim()).toBe("ROLLBACK");
    expect(db.calls.some((call) => call.sql.trim() === "COMMIT")).toBe(false);
  });

  it("rejects any projection that claims PII was projected before opening a transaction", async () => {
    const db = new RecordingDb();
    const writer = new PostgresAmazonRegistryProjectionWriterV1(db);
    const unsafe = { ...projection(), piiProjected: true } as unknown as AmazonOrderRegistryProjectionV1;

    await expect(writer.writeBatch([unsafe])).rejects.toThrow("amazon_registry_pii_projection_forbidden");
    expect(db.calls).toHaveLength(0);
  });
});
