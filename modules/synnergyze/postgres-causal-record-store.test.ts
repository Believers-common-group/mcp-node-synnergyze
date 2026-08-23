import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PostgresCausalRecordStoreV1,
} from "./postgres-causal-record-store.ts";
import type { PostgresQueryExecutorV1, PostgresQueryResultV1 } from "./postgres-remedy-journal.ts";
import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { ReconciliationDeterminationV1 } from "./reconciliation-fabric.ts";
import type { CausalRecordSupersessionV1 } from "./causal-record-store.ts";

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

function exception(overrides: Partial<CanonicalExceptionRecordV1> = {}): CanonicalExceptionRecordV1 {
  return {
    version: "EXCEPTION-FABRIC-001",
    exceptionRef: "EXCEPTION:001",
    source: "EFFECT_VERIFICATION",
    classification: "STATE",
    reasonCode: "EXECUTION_NOT_UNVERIFIED",
    reasonDigest: "sha256:reason",
    executionReceiptRef: "EXECUTION:001",
    actionRef: "ACTION:001",
    reservationRef: "RESERVATION:001",
    originalWardenDecisionRef: "WARDEN-DECISION:001",
    checkpointRef: "CHECKPOINT:001",
    programRef: "PROGRAM:001",
    eventRef: "EVENT:001",
    capabilityRef: "inventory.transfer",
    targetRef: "TRANSFER:001",
    requestedEffect: "inventory.transfer.completed",
    correlationId: "CORR:001",
    sourceEvidenceRefs: ["EVIDENCE:EXCEPTION:001"],
    lineageViolations: [],
    executedAt: "2026-08-23T04:00:00.000Z",
    detectedAt: "2026-08-23T04:00:01.000Z",
    sourceDigest: "sha256:exception-source-001",
    state: "OPEN",
    synthetic: true,
    ...overrides,
  };
}

function scalar(sourceException = exception()): ReconciliationDeterminationV1 {
  return {
    version: "RECONCILIATION-FABRIC-001",
    reconciliationRef: "RECONCILIATION:001",
    exceptionRef: sourceException.exceptionRef,
    classification: "UNKNOWN",
    executionReceiptRef: sourceException.executionReceiptRef,
    reservationRef: sourceException.reservationRef,
    originalWardenDecisionRef: sourceException.originalWardenDecisionRef,
    programRef: sourceException.programRef,
    eventRef: sourceException.eventRef,
    targetRef: sourceException.targetRef,
    requestedEffect: sourceException.requestedEffect,
    correlationId: sourceException.correlationId,
    sourceEvidenceRefs: ["EVIDENCE:EXCEPTION:001"],
    candidateRemedies: [],
    sourceDigest: "sha256:reconciliation-source-001",
    reconciledAt: "2026-08-23T04:00:02.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
  };
}

function composite(sourceException = exception()): CompositeEffectAssessmentV1 {
  return {
    version: "PARTIAL-EFFECT-ASSESSMENT-001",
    assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:001",
    effectSetRef: "EXPECTED-EFFECT-SET:001",
    executionReceiptRef: sourceException.executionReceiptRef,
    reservationRef: sourceException.reservationRef,
    originalWardenDecisionRef: sourceException.originalWardenDecisionRef,
    programRef: sourceException.programRef,
    eventRef: sourceException.eventRef,
    targetRef: sourceException.targetRef,
    correlationId: sourceException.correlationId,
    classification: "PARTIAL_EFFECT",
    matchedComponentRefs: ["COMPONENT:SOURCE"],
    missingComponentRefs: ["COMPONENT:DEST"],
    unexpectedComponentRefs: [],
    duplicateComponentRefs: [],
    conflictingComponentRefs: [],
    sourceEvidenceRefs: ["EVIDENCE:SOURCE"],
    candidateRemedies: [],
    assessedAt: "2026-08-23T04:00:03.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
  };
}

function supersession(): CausalRecordSupersessionV1 {
  return {
    version: "CAUSAL-RECORD-SUPERSESSION-001",
    supersessionRef: "CAUSAL-SUPERSESSION:001",
    recordKind: "SCALAR_RECONCILIATION",
    recordRef: "RECONCILIATION:001",
    supersededByRef: "PARTIAL-EFFECT-ASSESSMENT:001",
    reasonCode: "composite_effect_evidence_supersedes_scalar_unknown",
    sourceEvidenceRefs: ["EVIDENCE:SOURCE"],
    supersededAt: "2026-08-23T04:00:04.000Z",
    state: "SUPERSEDED_APPEND_ONLY",
    synthetic: true,
  };
}

describe("PostgresCausalRecordStoreV1", () => {
  it("stores an exception with insert-once identity", async () => {
    const sourceException = exception();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_exception_records/, rows: [{ exception_ref: sourceException.exceptionRef }] },
    ]);

    await expect(
      new PostgresCausalRecordStoreV1(db).putException(sourceException, "2026-08-23T04:00:05.000Z"),
    ).resolves.toMatchObject({ state: "STORED", record: sourceException });
    expect(db.calls[0].sql).toContain("ON CONFLICT (exception_ref) DO NOTHING");
  });

  it("fails closed when the same exception ref reappears with a different source digest", async () => {
    const sourceException = exception();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_exception_records/, rowCount: 0 },
      {
        match: /^SELECT exception_ref, source_digest, record_json/,
        rows: [{
          exception_ref: sourceException.exceptionRef,
          source_digest: "sha256:other",
          record_json: JSON.stringify({ ...sourceException, sourceDigest: "sha256:other" }),
        }],
      },
    ]);

    await expect(
      new PostgresCausalRecordStoreV1(db).putException(sourceException, "2026-08-23T04:00:05.000Z"),
    ).resolves.toEqual({ state: "CONFLICT" });
  });

  it("reconstructs the full persisted anomaly chain after a fresh process instance", async () => {
    const sourceException = exception();
    const scalarRecord = scalar(sourceException);
    const compositeRecord = composite(sourceException);
    const supersessionRecord = supersession();
    const db = new ScriptedDb([
      {
        match: /^SELECT exception_ref, source_digest, record_json/,
        rows: [{
          exception_ref: sourceException.exceptionRef,
          source_digest: sourceException.sourceDigest,
          record_json: JSON.stringify(sourceException),
        }],
      },
      {
        match: /^SELECT record_ref, record_kind, parent_exception_ref, source_digest, record_json/,
        rows: [
          {
            record_ref: scalarRecord.reconciliationRef,
            record_kind: "SCALAR_RECONCILIATION",
            parent_exception_ref: sourceException.exceptionRef,
            source_digest: scalarRecord.sourceDigest,
            record_json: JSON.stringify(scalarRecord),
          },
          {
            record_ref: compositeRecord.assessmentRef,
            record_kind: "COMPOSITE_ASSESSMENT",
            parent_exception_ref: sourceException.exceptionRef,
            source_digest: "sha256:composite",
            record_json: JSON.stringify(compositeRecord),
          },
        ],
      },
      {
        match: /^SELECT supersession_ref, record_kind, record_ref, superseded_by_ref, supersession_json/,
        rows: [{
          supersession_ref: supersessionRecord.supersessionRef,
          record_kind: supersessionRecord.recordKind,
          record_ref: supersessionRecord.recordRef,
          superseded_by_ref: supersessionRecord.supersededByRef,
          supersession_json: JSON.stringify(supersessionRecord),
        }],
      },
    ]);

    const restarted = new PostgresCausalRecordStoreV1(db);
    const history = await restarted.reconstruct(sourceException.exceptionRef);
    expect(history).toEqual({
      exception: sourceException,
      scalarReconciliations: [scalarRecord],
      compositeAssessments: [compositeRecord],
      supersessions: [supersessionRecord],
    });
    expect(db.calls).toHaveLength(3);
  });

  it("checks the persisted record exists before writing a supersession edge", async () => {
    const db = new ScriptedDb([
      { match: /^SELECT record_ref FROM vsr_reconciliation_records/, rowCount: 0 },
    ]);
    await expect(
      new PostgresCausalRecordStoreV1(db).supersede({
        recordKind: "SCALAR_RECONCILIATION",
        recordRef: "RECONCILIATION:MISSING",
        supersededByRef: "PARTIAL-EFFECT-ASSESSMENT:001",
        reasonCode: "evidence_correction",
        sourceEvidenceRefs: ["EVIDENCE:001"],
        supersededAt: "2026-08-23T04:00:05.000Z",
      }),
    ).rejects.toThrow("causal_store_superseded_record_missing");
    expect(db.calls).toHaveLength(1);
  });

  it("declares immutable causal storage and parent lineage constraints in SQL", () => {
    const migrationPath = fileURLToPath(
      new URL("./sql/003_causal_record_store.sql", import.meta.url),
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("exception_ref text PRIMARY KEY");
    expect(sql).toContain("parent_exception_ref text NOT NULL REFERENCES vsr_exception_records(exception_ref)");
    expect(sql).toContain("record_ref text PRIMARY KEY");
    expect(sql).toContain("PRIMARY KEY (record_kind, record_ref)");
    expect(sql).toContain("CHECK (record_ref <> superseded_by_ref)");
    expect(sql).toContain("jsonb_array_length(source_evidence_refs_json) > 0");
  });
});
