import { describe, expect, it } from "vitest";

import {
  PostgresScopedRemedyExecutionJournalV1,
} from "./postgres-scoped-remedy-journal.ts";
import type {
  PostgresQueryExecutorV1,
  PostgresQueryResultV1,
} from "./postgres-remedy-journal.ts";
import type { ScopedRemedyExecutionReceiptV1 } from "./scoped-remedy-execution.ts";

interface PlannedResponse {
  match: RegExp;
  rows?: unknown[];
  rowCount?: number;
}

class ScriptedDb implements PostgresQueryExecutorV1 {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  constructor(private readonly plan: PlannedResponse[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<T>> {
    this.calls.push({ sql, params });
    const step = this.plan.shift();
    if (!step) throw new Error(`unexpected_query:${sql}`);
    if (!step.match.test(sql)) throw new Error(`query_mismatch:${step.match}:${sql}`);
    return {
      rows: (step.rows ?? []) as T[],
      rowCount: step.rowCount ?? step.rows?.length ?? 0,
    };
  }
}

function receipt(): ScopedRemedyExecutionReceiptV1 {
  return {
    version: "SCOPED-REMEDY-EXECUTION-001",
    receiptRef: "SCOPED-REMEDY-EXECUTION-RECEIPT:001",
    authorizationRef: "REMEDY-AUTHORIZATION:001",
    assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:001",
    effectSetRef: "EXPECTED-EFFECT-SET:001",
    proposalRef: "REMEDY-PROPOSAL:001",
    proposalKind: "COMPENSATE",
    componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
    parentCorrelationId: "CORR:PARENT:001",
    remedyCorrelationId: "CORR:REMEDY:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY-001",
    capabilityRef: "inventory.source_debit.compensate",
    targetRef: "TRANSFER:001",
    adapterRef: "SCOPED-ADAPTER:001",
    adapterResultRef: "SCOPED-RESULT:001",
    executedAt: "2026-08-22T16:00:05.000Z",
    state: "EXECUTED_UNVERIFIED_REMEDY",
    synthetic: true,
    idempotentReplay: false,
  };
}

describe("POSTGRES-SCOPED-REMEDY-JOURNAL-001", () => {
  it("starts a durable authorization row atomically", async () => {
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_remedy_execution_journal/, rows: [{ authorization_ref: "REMEDY-AUTHORIZATION:001" }] },
    ]);
    const journal = new PostgresScopedRemedyExecutionJournalV1(db);

    await expect(journal.begin({
      authorizationRef: "REMEDY-AUTHORIZATION:001",
      executionFingerprint: "sha256:fingerprint",
      expiresAtMs: 1_800_000,
      startedAtMs: 1_000_000,
    })).resolves.toEqual({ state: "STARTED" });
    expect(db.calls[0].sql).toContain("ON CONFLICT (authorization_ref) DO NOTHING");
  });

  it("returns an exact completed scoped receipt for durable replay", async () => {
    const value = receipt();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_remedy_execution_journal/, rowCount: 0 },
      {
        match: /^SELECT authorization_ref, execution_fingerprint, state, receipt_json/,
        rows: [{
          authorization_ref: value.authorizationRef,
          execution_fingerprint: "sha256:fingerprint",
          state: "COMPLETED",
          receipt_json: JSON.stringify(value),
        }],
      },
    ]);
    const journal = new PostgresScopedRemedyExecutionJournalV1(db);

    const replay = await journal.begin({
      authorizationRef: value.authorizationRef,
      executionFingerprint: "sha256:fingerprint",
      expiresAtMs: 1_800_000,
      startedAtMs: 1_000_000,
    });
    expect(replay.state).toBe("COMPLETED_SCOPED");
    if (replay.state !== "COMPLETED_SCOPED") throw new Error("expected_scoped_completion");
    expect(replay.receipt.componentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
  });

  it("rejects a generic completed receipt from the same shared table as a scoped replay conflict", async () => {
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_remedy_execution_journal/, rowCount: 0 },
      {
        match: /^SELECT authorization_ref, execution_fingerprint, state, receipt_json/,
        rows: [{
          authorization_ref: "REMEDY-AUTHORIZATION:001",
          execution_fingerprint: "sha256:fingerprint",
          state: "COMPLETED",
          receipt_json: JSON.stringify({ version: "REMEDY-EXECUTION-001" }),
        }],
      },
    ]);
    const journal = new PostgresScopedRemedyExecutionJournalV1(db);

    await expect(journal.begin({
      authorizationRef: "REMEDY-AUTHORIZATION:001",
      executionFingerprint: "sha256:fingerprint",
      expiresAtMs: 1_800_000,
      startedAtMs: 1_000_000,
    })).resolves.toEqual({ state: "CONFLICT" });
  });

  it("completes only the exact in-progress fingerprint with the full scoped receipt JSON", async () => {
    const value = receipt();
    const db = new ScriptedDb([
      { match: /^UPDATE vsr_remedy_execution_journal/, rows: [{ authorization_ref: value.authorizationRef }] },
    ]);
    const journal = new PostgresScopedRemedyExecutionJournalV1(db);

    await expect(journal.completeScoped({
      authorizationRef: value.authorizationRef,
      executionFingerprint: "sha256:fingerprint",
      receipt: value,
      completedAtMs: 1_100_000,
    })).resolves.toBeUndefined();
    expect(db.calls[0].sql).toContain("state = 'IN_PROGRESS'");
    expect(db.calls[0].params[2]).toBe(JSON.stringify(value));
  });
});
