import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  GovernedHandoffResultV1,
  HandoffJournalStartV1,
} from "./governed-runtime.ts";
import {
  PostgresHandoffExecutionJournalV1,
  type PostgresQueryExecutorV1,
  type PostgresQueryResultV1,
} from "./postgres-journal.ts";

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

function start(overrides: Partial<HandoffJournalStartV1> = {}): HandoffJournalStartV1 {
  return {
    nonce: "NONCE-001",
    handoffRef: "HANDOFF:001",
    tokenDigest: "sha256:token-001",
    expiresAtMs: 1_800_000,
    startedAtMs: 1_000_000,
    ...overrides,
  };
}

function completedResult(): GovernedHandoffResultV1 {
  return {
    state: "HANDOFF_VERIFIED",
    handoffRef: "HANDOFF:001",
    tokenDigest: "sha256:token-001",
    wardenGrantRef: "WARDEN-GRANT:001",
    wardenDecisionRef: "WARDEN-DECISION:001",
    wardenEvidenceRef: "RIVER-EVIDENCE:WARDEN-001",
    reservationRef: "RIVER-RESERVATION:001",
    destinationSessionRef: "DESTINATION-SESSION:001",
    destinationVerificationEvidenceRef: "POST-DEPLOYMENT-EVIDENCE:001",
    riverSealRef: "RIVER-SEAL:001",
    digitalMeRef: "DIGITALME-001",
    destinationSite: "VSR",
    capabilityRefs: ["program:read"],
    roleRefs: ["VSR_VIEWER"],
    activationImplied: false,
    idempotentReplay: false,
  };
}

describe("B-010 Postgres durable handoff journal", () => {
  it("starts a new journal row atomically after expiring stale rows", async () => {
    const db = new ScriptedDb([
      { match: /^DELETE FROM vsr_handoff_execution_journal/, rowCount: 0 },
      { match: /^INSERT INTO vsr_handoff_execution_journal/, rows: [{ nonce: "NONCE-001" }] },
    ]);
    const journal = new PostgresHandoffExecutionJournalV1(db);

    await expect(journal.begin(start())).resolves.toEqual({ state: "STARTED" });
    expect(db.calls).toHaveLength(2);
    expect(db.calls[1].sql).toContain("ON CONFLICT (nonce) DO NOTHING");
    expect(db.calls[1].params).toEqual([
      "NONCE-001",
      "HANDOFF:001",
      "sha256:token-001",
      1_800_000,
      1_000_000,
    ]);
  });

  it("returns a completed result for an exact durable replay", async () => {
    const result = completedResult();
    const db = new ScriptedDb([
      { match: /^DELETE FROM vsr_handoff_execution_journal/, rowCount: 0 },
      { match: /^INSERT INTO vsr_handoff_execution_journal/, rowCount: 0 },
      {
        match: /^SELECT nonce, handoff_ref, token_digest, state, expires_at_ms, result_json/,
        rows: [
          {
            nonce: "NONCE-001",
            handoff_ref: "HANDOFF:001",
            token_digest: "sha256:token-001",
            state: "COMPLETED",
            expires_at_ms: 1_800_000,
            result_json: JSON.stringify(result),
          },
        ],
      },
    ]);
    const journal = new PostgresHandoffExecutionJournalV1(db);

    const replay = await journal.begin(start());
    expect(replay.state).toBe("COMPLETED");
    if (replay.state !== "COMPLETED") throw new Error("expected_completed");
    expect(replay.result).toEqual(result);
  });

  it("fails closed when a nonce is reused for different token or handoff identity", async () => {
    const db = new ScriptedDb([
      { match: /^DELETE FROM vsr_handoff_execution_journal/, rowCount: 0 },
      { match: /^INSERT INTO vsr_handoff_execution_journal/, rowCount: 0 },
      {
        match: /^SELECT nonce, handoff_ref, token_digest, state, expires_at_ms, result_json/,
        rows: [
          {
            nonce: "NONCE-001",
            handoff_ref: "HANDOFF:OTHER",
            token_digest: "sha256:other",
            state: "IN_PROGRESS",
            expires_at_ms: 1_800_000,
            result_json: null,
          },
        ],
      },
    ]);
    const journal = new PostgresHandoffExecutionJournalV1(db);

    await expect(journal.begin(start())).resolves.toEqual({ state: "CONFLICT" });
  });

  it("completes only the exact in-progress nonce and token digest", async () => {
    const db = new ScriptedDb([
      { match: /^UPDATE vsr_handoff_execution_journal/, rows: [{ nonce: "NONCE-001" }] },
    ]);
    const journal = new PostgresHandoffExecutionJournalV1(db);
    const result = completedResult();

    await expect(
      journal.complete({
        nonce: "NONCE-001",
        tokenDigest: "sha256:token-001",
        result,
        completedAtMs: 1_100_000,
      }),
    ).resolves.toBeUndefined();
    expect(db.calls[0].sql).toContain("state = 'IN_PROGRESS'");
    expect(db.calls[0].params).toEqual([
      "NONCE-001",
      "sha256:token-001",
      JSON.stringify(result),
      1_100_000,
    ]);
  });

  it("refuses to report completion or failure when the durable compare-and-set loses", async () => {
    const completeDb = new ScriptedDb([{ match: /^UPDATE vsr_handoff_execution_journal/, rowCount: 0 }]);
    const failDb = new ScriptedDb([{ match: /^UPDATE vsr_handoff_execution_journal/, rowCount: 0 }]);

    await expect(
      new PostgresHandoffExecutionJournalV1(completeDb).complete({
        nonce: "NONCE-001",
        tokenDigest: "sha256:token-001",
        result: completedResult(),
        completedAtMs: 1_100_000,
      }),
    ).rejects.toThrow("handoff_journal_complete_conflict");

    await expect(
      new PostgresHandoffExecutionJournalV1(failDb).fail({
        nonce: "NONCE-001",
        tokenDigest: "sha256:token-001",
        reason: "destination_failed",
        failedAtMs: 1_100_000,
      }),
    ).rejects.toThrow("handoff_journal_fail_conflict");
  });

  it("declares primary replay identity, unique token digest and fail-closed state consistency in SQL", () => {
    const migrationPath = fileURLToPath(
      new URL("./sql/001_handoff_execution_journal.sql", import.meta.url),
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("nonce text PRIMARY KEY");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS vsr_handoff_execution_token_digest_uq");
    expect(sql).toContain("state IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')");
    expect(sql).toContain("state = 'COMPLETED' AND result_json IS NOT NULL");
    expect(sql).toContain("state = 'FAILED' AND failure_reason IS NOT NULL");
  });
});
