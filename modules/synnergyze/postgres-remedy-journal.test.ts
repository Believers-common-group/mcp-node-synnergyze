import { describe, expect, it } from "vitest";

import type { RemedyExecutionReceiptV1 } from "./remedy-execution.ts";
import {
  PostgresRemedyExecutionJournalV1,
  type PostgresQueryExecutorV1,
  type PostgresQueryResultV1,
} from "./postgres-remedy-journal.ts";

interface Row {
  authorization_ref: string;
  execution_fingerprint: string;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  receipt_json: RemedyExecutionReceiptV1 | null;
  failure_reason?: string;
}

class FakePostgres implements PostgresQueryExecutorV1 {
  readonly rows = new Map<string, Row>();

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<T>> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const authorizationRef = String(params[0]);

    if (normalized.startsWith("INSERT INTO vsr_remedy_execution_journal")) {
      if (this.rows.has(authorizationRef)) return { rows: [], rowCount: 0 };
      this.rows.set(authorizationRef, {
        authorization_ref: authorizationRef,
        execution_fingerprint: String(params[1]),
        state: "IN_PROGRESS",
        receipt_json: null,
      });
      return {
        rows: [{ authorization_ref: authorizationRef } as unknown as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("SELECT authorization_ref")) {
      const row = this.rows.get(authorizationRef);
      return {
        rows: row ? [row as unknown as T] : [],
        rowCount: row ? 1 : 0,
      };
    }

    if (normalized.startsWith("UPDATE vsr_remedy_execution_journal") && normalized.includes("'COMPLETED'")) {
      const row = this.rows.get(authorizationRef);
      if (!row || row.execution_fingerprint !== String(params[1]) || row.state !== "IN_PROGRESS") {
        return { rows: [], rowCount: 0 };
      }
      row.state = "COMPLETED";
      row.receipt_json = JSON.parse(String(params[2])) as RemedyExecutionReceiptV1;
      return {
        rows: [{ authorization_ref: authorizationRef } as unknown as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("UPDATE vsr_remedy_execution_journal") && normalized.includes("'FAILED'")) {
      const row = this.rows.get(authorizationRef);
      if (!row || row.execution_fingerprint !== String(params[1]) || row.state !== "IN_PROGRESS") {
        return { rows: [], rowCount: 0 };
      }
      row.state = "FAILED";
      row.failure_reason = String(params[2]);
      return {
        rows: [{ authorization_ref: authorizationRef } as unknown as T],
        rowCount: 1,
      };
    }

    throw new Error(`unexpected_sql:${normalized}`);
  }
}

function receipt(): RemedyExecutionReceiptV1 {
  return {
    version: "REMEDY-EXECUTION-001",
    receiptRef: "REMEDY-EXECUTION-RECEIPT:001",
    authorizationRef: "REMEDY-AUTHORIZATION:001",
    reconciliationRef: "RECONCILIATION:001",
    proposalRef: "REMEDY-PROPOSAL:001",
    proposalKind: "RECOVER",
    parentCorrelationId: "CORR:PARENT",
    remedyCorrelationId: "CORR:CHILD",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY",
    remedyCheckpointRef: "WARDEN-REMEDY-CHECKPOINT:001",
    capabilityRef: "reconciliation.recover",
    targetRef: "TARGET:001",
    adapterRef: "ADAPTER:001",
    adapterResultRef: "RESULT:001",
    executedAt: "2026-08-23T05:01:30.000Z",
    state: "EXECUTED_UNVERIFIED_REMEDY",
    synthetic: true,
    idempotentReplay: false,
  };
}

describe("PostgresRemedyExecutionJournalV1", () => {
  it("reconstructs IN_PROGRESS across a fresh journal instance", async () => {
    const db = new FakePostgres();
    const first = new PostgresRemedyExecutionJournalV1(db);
    expect(await first.begin({
      authorizationRef: "AUTH:001",
      executionFingerprint: "sha256:one",
      expiresAtMs: 100,
      startedAtMs: 10,
    })).toEqual({ state: "STARTED" });

    const restarted = new PostgresRemedyExecutionJournalV1(db);
    expect(await restarted.begin({
      authorizationRef: "AUTH:001",
      executionFingerprint: "sha256:one",
      expiresAtMs: 100,
      startedAtMs: 20,
    })).toEqual({ state: "IN_PROGRESS" });
  });

  it("replays a completed durable receipt after restart", async () => {
    const db = new FakePostgres();
    const first = new PostgresRemedyExecutionJournalV1(db);
    await first.begin({
      authorizationRef: "REMEDY-AUTHORIZATION:001",
      executionFingerprint: "sha256:complete",
      expiresAtMs: 100,
      startedAtMs: 10,
    });
    await first.complete({
      authorizationRef: "REMEDY-AUTHORIZATION:001",
      executionFingerprint: "sha256:complete",
      receipt: receipt(),
      completedAtMs: 20,
    });

    const restarted = new PostgresRemedyExecutionJournalV1(db);
    const replay = await restarted.begin({
      authorizationRef: "REMEDY-AUTHORIZATION:001",
      executionFingerprint: "sha256:complete",
      expiresAtMs: 100,
      startedAtMs: 30,
    });
    expect(replay.state).toBe("COMPLETED");
    if (replay.state !== "COMPLETED") throw new Error("expected_completed");
    expect(replay.receipt.receiptRef).toBe(receipt().receiptRef);
  });

  it("returns CONFLICT for changed execution identity", async () => {
    const db = new FakePostgres();
    const journal = new PostgresRemedyExecutionJournalV1(db);
    await journal.begin({
      authorizationRef: "AUTH:CONFLICT",
      executionFingerprint: "sha256:first",
      expiresAtMs: 100,
      startedAtMs: 10,
    });
    expect(await journal.begin({
      authorizationRef: "AUTH:CONFLICT",
      executionFingerprint: "sha256:mutated",
      expiresAtMs: 100,
      startedAtMs: 20,
    })).toEqual({ state: "CONFLICT" });
  });

  it("reconstructs FAILED rather than permitting a blind retry", async () => {
    const db = new FakePostgres();
    const journal = new PostgresRemedyExecutionJournalV1(db);
    await journal.begin({
      authorizationRef: "AUTH:FAILED",
      executionFingerprint: "sha256:failed",
      expiresAtMs: 100,
      startedAtMs: 10,
    });
    await journal.fail({
      authorizationRef: "AUTH:FAILED",
      executionFingerprint: "sha256:failed",
      reason: "provider_unknown",
      failedAtMs: 20,
    });

    const restarted = new PostgresRemedyExecutionJournalV1(db);
    expect(await restarted.begin({
      authorizationRef: "AUTH:FAILED",
      executionFingerprint: "sha256:failed",
      expiresAtMs: 100,
      startedAtMs: 30,
    })).toEqual({ state: "FAILED" });
  });
});
