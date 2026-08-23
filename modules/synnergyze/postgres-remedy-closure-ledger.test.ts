import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PostgresRemedyClosureLedgerV1,
} from "./postgres-remedy-closure-ledger.ts";
import type { PostgresQueryExecutorV1, PostgresQueryResultV1 } from "./postgres-remedy-journal.ts";
import type {
  ExceptionSupersessionRecordV1,
  RemedyCausalSealV1,
} from "./remedy-lineage-closure.ts";

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

function seal(overrides: Partial<RemedyCausalSealV1> = {}): RemedyCausalSealV1 {
  return {
    version: "REMEDY-CAUSAL-SEAL-001",
    sealRef: "RIVER-REMEDY-SEAL:001",
    reservationRef: "RIVER-RESERVATION:001",
    correlationId: "CORR:PARENT:001",
    state: "SEALED",
    traceDigest: "sha256:trace-001",
    sealedAt: "2026-08-22T13:00:10.000Z",
    originalExceptionRef: "EXCEPTION:001",
    assessmentRef: "ASSESSMENT:001",
    effectSetRef: "EFFECT-SET:001",
    proposalRef: "PROPOSAL:001",
    authorizationRef: "AUTHORIZATION:001",
    originalExecutionReceiptRef: "EXECUTION:ORIGINAL:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL:001",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY:001",
    remedyExecutionReceiptRef: "EXECUTION:REMEDY:001",
    remedyEffectRef: "REMEDY-EFFECT:001",
    remedyVerificationRef: "REMEDY-VERIFICATION:001",
    parentCorrelationId: "CORR:PARENT:001",
    remedyCorrelationId: "CORR:REMEDY:001",
    componentRefs: ["COMPONENT:001"],
    observationRefs: ["OBSERVATION:001"],
    sourceEvidenceRefs: ["EVIDENCE:001"],
    synthetic: true,
    ...overrides,
  };
}

function supersession(
  sourceSeal = seal(),
  overrides: Partial<ExceptionSupersessionRecordV1> = {},
): ExceptionSupersessionRecordV1 {
  return {
    version: "EXCEPTION-SUPERSESSION-001",
    supersessionRef: "EXCEPTION-SUPERSESSION:001",
    exceptionRef: sourceSeal.originalExceptionRef,
    priorState: "OPEN",
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    assessmentRef: sourceSeal.assessmentRef,
    proposalRef: sourceSeal.proposalRef,
    authorizationRef: sourceSeal.authorizationRef,
    remedyEffectRef: sourceSeal.remedyEffectRef,
    remedyVerificationRef: sourceSeal.remedyVerificationRef,
    riverSealRef: sourceSeal.sealRef,
    originalExecutionReceiptRef: sourceSeal.originalExecutionReceiptRef,
    remedyExecutionReceiptRef: sourceSeal.remedyExecutionReceiptRef,
    originalWardenDecisionRef: sourceSeal.originalWardenDecisionRef,
    remedyWardenDecisionRef: sourceSeal.remedyWardenDecisionRef,
    parentCorrelationId: sourceSeal.parentCorrelationId,
    remedyCorrelationId: sourceSeal.remedyCorrelationId,
    componentRefs: [...sourceSeal.componentRefs],
    sourceEvidenceRefs: [...sourceSeal.sourceEvidenceRefs],
    supersededAt: sourceSeal.sealedAt,
    state: "RESOLVED_APPEND_ONLY",
    synthetic: true,
    ...overrides,
  };
}

describe("PostgresRemedyClosureLedgerV1", () => {
  it("appends one terminal causal closure with insert-once semantics", async () => {
    const db = new ScriptedDb([
      {
        match: /^INSERT INTO vsr_remedy_closure_ledger/,
        rows: [{ exception_ref: "EXCEPTION:001" }],
      },
    ]);
    const ledger = new PostgresRemedyClosureLedgerV1(db);
    const sourceSeal = seal();

    await expect(
      ledger.append({ seal: sourceSeal, supersession: supersession(sourceSeal) }),
    ).resolves.toEqual({ state: "APPENDED" });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain("ON CONFLICT (exception_ref) DO NOTHING");
    expect(db.calls[0].params[0]).toBe("EXCEPTION:001");
    expect(db.calls[0].params).not.toContain("WARDEN-ACTION-TOKEN");
  });

  it("returns the existing closure for an exact durable replay", async () => {
    const sourceSeal = seal();
    const sourceSupersession = supersession(sourceSeal);
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_remedy_closure_ledger/, rowCount: 0 },
      {
        match: /^SELECT exception_ref, seal_ref, remedy_effect_ref, trace_digest/,
        rows: [
          {
            exception_ref: sourceSeal.originalExceptionRef,
            seal_ref: sourceSeal.sealRef,
            remedy_effect_ref: sourceSeal.remedyEffectRef,
            trace_digest: sourceSeal.traceDigest,
            seal_json: JSON.stringify(sourceSeal),
            supersession_json: JSON.stringify(sourceSupersession),
          },
        ],
      },
    ]);

    const result = await new PostgresRemedyClosureLedgerV1(db).append({
      seal: sourceSeal,
      supersession: sourceSupersession,
    });
    expect(result.state).toBe("EXISTING");
    if (result.state !== "EXISTING") throw new Error("expected_existing");
    expect(result.seal).toEqual(sourceSeal);
    expect(result.supersession).toEqual(sourceSupersession);
  });

  it("fails closed when one exception is presented with a different verified remedy closure", async () => {
    const sourceSeal = seal();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_remedy_closure_ledger/, rowCount: 0 },
      {
        match: /^SELECT exception_ref, seal_ref, remedy_effect_ref, trace_digest/,
        rows: [
          {
            exception_ref: sourceSeal.originalExceptionRef,
            seal_ref: "RIVER-REMEDY-SEAL:OTHER",
            remedy_effect_ref: "REMEDY-EFFECT:OTHER",
            trace_digest: "sha256:other",
            seal_json: JSON.stringify(sourceSeal),
            supersession_json: JSON.stringify(supersession(sourceSeal)),
          },
        ],
      },
    ]);

    await expect(
      new PostgresRemedyClosureLedgerV1(db).append({
        seal: sourceSeal,
        supersession: supersession(sourceSeal),
      }),
    ).resolves.toEqual({ state: "CONFLICT" });
  });

  it("rejects a seal and supersession that disagree before touching durable state", async () => {
    const db = new ScriptedDb([]);
    const sourceSeal = seal();

    await expect(
      new PostgresRemedyClosureLedgerV1(db).append({
        seal: sourceSeal,
        supersession: supersession(sourceSeal, { remedyEffectRef: "REMEDY-EFFECT:OTHER" }),
      }),
    ).rejects.toThrow("remedy_closure_ledger_effect_mismatch");
    expect(db.calls).toHaveLength(0);
  });

  it("declares append-only identity and causal separation constraints in SQL", () => {
    const migrationPath = fileURLToPath(
      new URL("./sql/002_remedy_closure_ledger.sql", import.meta.url),
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("exception_ref text PRIMARY KEY");
    expect(sql).toContain("seal_ref text NOT NULL UNIQUE");
    expect(sql).toContain("remedy_effect_ref text NOT NULL UNIQUE");
    expect(sql).toContain("original_warden_decision_ref <> remedy_warden_decision_ref");
    expect(sql).toContain("parent_correlation_id <> remedy_correlation_id");
    expect(sql).toContain("seal_json ->> 'state' = 'SEALED'");
    expect(sql).toContain("supersession_json ->> 'state' = 'RESOLVED_APPEND_ONLY'");
  });
});
