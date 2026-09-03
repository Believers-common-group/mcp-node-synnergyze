import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  RegistryPostgresQueryExecutorV1,
  RegistryPostgresQueryResultV1,
} from "./postgres-registry-types.ts";
import { PostgresRegistryExceptionResolutionWriterV1 } from "./postgres-registry-resolution-writer.ts";
import {
  PostgresRegistryResolutionConsumerV1,
  rebuildRegistryResolutionReadModelV1,
} from "./registry-resolution-consumer.ts";
import type { RegistryExceptionResolutionRevisionV1 } from "./registry-resolution-projection.ts";

interface PlannedResponse {
  match: RegExp;
  rows?: unknown[];
  rowCount?: number;
}

class ScriptedDb implements RegistryPostgresQueryExecutorV1 {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  constructor(private readonly plan: PlannedResponse[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<RegistryPostgresQueryResultV1<T>> {
    const normalized = sql.trim();
    this.calls.push({ sql: normalized, params });
    const step = this.plan.shift();
    if (!step) throw new Error(`unexpected_query:${normalized}`);
    if (!step.match.test(normalized)) throw new Error(`query_mismatch:${step.match}:${normalized}`);
    return {
      rows: (step.rows ?? []) as T[],
      rowCount: step.rowCount ?? step.rows?.length ?? 0,
    };
  }
}

function revision(
  ref: string,
  predecessorRegistryRevisionRef?: string,
): RegistryExceptionResolutionRevisionV1 {
  return {
    version: "REGISTRY-EXCEPTION-RESOLUTION-REVISION-001",
    projectionRef: `REGISTRY-PROJECTION:${ref}`,
    registryObjectRef: "WARDEN-EXCEPTION-RESOLUTION:EXCEPTION:001",
    registryRevisionRef: ref,
    ...(predecessorRegistryRevisionRef ? { predecessorRegistryRevisionRef } : {}),
    originalExceptionRef: "EXCEPTION:001",
    assessmentRef: `ASSESSMENT:${ref}`,
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    remedyEffectRef: `REMEDY-EFFECT:${ref}`,
    remedyVerificationRef: `REMEDY-VERIFY:${ref}`,
    riverRemedySealRef: `RIVER-SEAL:${ref}`,
    riverPublicationRef: `RIVER-PUBLICATION:${ref}`,
    riverTraceDigest: `sha256:${ref}`,
    attestationRef: `ATTESTATION:${ref}`,
    attestorRef: "ATTESTOR:001",
    assurance: "A3",
    projectionPolicyRef: "REGISTRY-PROJECTION-POLICY:001",
    eligibleAt: "2026-08-23T07:00:00.000Z",
    registryWriteEligible: true,
    state: "ELIGIBLE_FOR_REGISTRY_WRITE",
    synthetic: false,
  };
}

function revisionRow(source: RegistryExceptionResolutionRevisionV1) {
  return {
    registry_revision_ref: source.registryRevisionRef,
    registry_object_ref: source.registryObjectRef,
    predecessor_registry_revision_ref: source.predecessorRegistryRevisionRef ?? null,
    river_publication_ref: source.riverPublicationRef,
    attestation_ref: source.attestationRef,
    revision_json: JSON.stringify(source),
  };
}

function outboxRow(source: RegistryExceptionResolutionRevisionV1, eventRef = "EVENT:001") {
  return {
    event_ref: eventRef,
    registry_revision_ref: source.registryRevisionRef,
    registry_object_ref: source.registryObjectRef,
    river_publication_ref: source.riverPublicationRef,
    attestation_ref: source.attestationRef,
    attempt_count: 0,
  };
}

describe("Registry 1.2 append-only resolution projection", () => {
  it("writes a predecessor-bound revision and outbox event in one transaction", async () => {
    const child = revision("REV:002", "REV:001");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^INSERT INTO vsr_registry_exception_resolution_revision/, rows: [{ registry_revision_ref: child.registryRevisionRef }] },
      { match: /^INSERT INTO vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryExceptionResolutionWriterV1(db).append(child);
    expect(result.state).toBe("APPENDED");
    expect(db.calls[1].params[3]).toBe("REV:001");
    expect(db.calls[2].params[5]).toContain('"predecessorRegistryRevisionRef":"REV:001"');
  });

  it("applies a root revision and acknowledges delivery atomically", async () => {
    const root = revision("REV:001");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^SELECT event_ref, registry_revision_ref/, rows: [outboxRow(root)] },
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(root)] },
      { match: /^SELECT registry_object_ref, current_registry_revision_ref/, rowCount: 0 },
      { match: /^INSERT INTO vsr_registry_exception_resolution_read_model/, rowCount: 1 },
      { match: /^UPDATE vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryResolutionConsumerV1(db).consumeOne({
      now: "2026-08-23T07:01:00.000Z",
      retryAt: "2026-08-23T07:02:00.000Z",
    });
    expect(result).toEqual({ state: "APPLIED", eventRef: "EVENT:001", registryRevisionRef: "REV:001" });
    expect(db.calls[4].params[1]).toBe("REV:001");
    expect(db.calls[5].sql).toContain("delivery_state = 'DELIVERED'");
  });

  it("advances only when the incoming predecessor equals the current revision", async () => {
    const child = revision("REV:002", "REV:001");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^SELECT event_ref, registry_revision_ref/, rows: [outboxRow(child)] },
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(child)] },
      {
        match: /^SELECT registry_object_ref, current_registry_revision_ref/,
        rows: [{
          registry_object_ref: child.registryObjectRef,
          current_registry_revision_ref: "REV:001",
          read_model_json: "{}",
        }],
      },
      { match: /^UPDATE vsr_registry_exception_resolution_read_model/, rowCount: 1 },
      { match: /^UPDATE vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryResolutionConsumerV1(db).consumeOne({
      now: "2026-08-23T07:01:00.000Z",
      retryAt: "2026-08-23T07:02:00.000Z",
    });
    expect(result.state).toBe("APPLIED");
    expect(db.calls[4].sql).toContain("current_registry_revision_ref = $5");
  });

  it("treats a crash replay after projection as idempotent and only acknowledges the event", async () => {
    const root = revision("REV:001");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^SELECT event_ref, registry_revision_ref/, rows: [outboxRow(root)] },
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(root)] },
      {
        match: /^SELECT registry_object_ref, current_registry_revision_ref/,
        rows: [{
          registry_object_ref: root.registryObjectRef,
          current_registry_revision_ref: root.registryRevisionRef,
          read_model_json: "{}",
        }],
      },
      { match: /^UPDATE vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryResolutionConsumerV1(db).consumeOne({
      now: "2026-08-23T07:01:00.000Z",
      retryAt: "2026-08-23T07:02:00.000Z",
    });
    expect(result.state).toBe("IDEMPOTENT_REPLAY");
    expect(db.calls.some((call) => /^UPDATE vsr_registry_exception_resolution_read_model/.test(call.sql))).toBe(false);
  });

  it("defers an out-of-order child instead of inventing its missing predecessor state", async () => {
    const child = revision("REV:002", "REV:001");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^SELECT event_ref, registry_revision_ref/, rows: [outboxRow(child)] },
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(child)] },
      { match: /^SELECT registry_object_ref, current_registry_revision_ref/, rowCount: 0 },
      { match: /^UPDATE vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryResolutionConsumerV1(db).consumeOne({
      now: "2026-08-23T07:01:00.000Z",
      retryAt: "2026-08-23T07:02:00.000Z",
    });
    expect(result.state).toBe("BLOCKED_CAUSAL_GAP");
    expect(db.calls[4].sql).toContain("last_error = 'CAUSAL_GAP'");
  });

  it("acknowledges a late ancestor without rolling the read model backward", async () => {
    const root = revision("REV:001");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^SELECT event_ref, registry_revision_ref/, rows: [outboxRow(root)] },
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(root)] },
      {
        match: /^SELECT registry_object_ref, current_registry_revision_ref/,
        rows: [{
          registry_object_ref: root.registryObjectRef,
          current_registry_revision_ref: "REV:003",
          read_model_json: "{}",
        }],
      },
      { match: /^WITH RECURSIVE lineage AS/, rows: [{ found: 1 }] },
      { match: /^UPDATE vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryResolutionConsumerV1(db).consumeOne({
      now: "2026-08-23T07:01:00.000Z",
      retryAt: "2026-08-23T07:02:00.000Z",
    });
    expect(result.state).toBe("STALE_ALREADY_SUPERSEDED");
    expect(db.calls.some((call) => /^UPDATE vsr_registry_exception_resolution_read_model/.test(call.sql))).toBe(false);
  });

  it("quarantines a competing lineage instead of choosing a winner", async () => {
    const competing = revision("REV:X", "REV:Y");
    const db = new ScriptedDb([
      { match: /^BEGIN$/ },
      { match: /^SELECT event_ref, registry_revision_ref/, rows: [outboxRow(competing)] },
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(competing)] },
      {
        match: /^SELECT registry_object_ref, current_registry_revision_ref/,
        rows: [{
          registry_object_ref: competing.registryObjectRef,
          current_registry_revision_ref: "REV:CURRENT",
          read_model_json: "{}",
        }],
      },
      { match: /^WITH RECURSIVE lineage AS/, rowCount: 0 },
      { match: /^WITH RECURSIVE lineage AS/, rowCount: 0 },
      { match: /^UPDATE vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/ },
    ]);

    const result = await new PostgresRegistryResolutionConsumerV1(db).consumeOne({
      now: "2026-08-23T07:01:00.000Z",
      retryAt: "2026-08-23T07:02:00.000Z",
    });
    expect(result.state).toBe("QUARANTINED_CONFLICT");
    expect(db.calls[6].sql).toContain("delivery_state = 'QUARANTINED'");
  });

  it("rebuilds the read model from append-only revision facts without consulting outbox state", async () => {
    const root = revision("REV:001");
    const child = revision("REV:002", "REV:001");
    const tip = revision("REV:003", "REV:002");
    const db = new ScriptedDb([
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(child), revisionRow(tip), revisionRow(root)] },
      { match: /^INSERT INTO vsr_registry_exception_resolution_read_model/, rowCount: 1 },
    ]);

    const result = await rebuildRegistryResolutionReadModelV1({
      db,
      registryObjectRef: root.registryObjectRef,
      rebuiltAt: "2026-08-23T07:05:00.000Z",
    });
    expect(result.state).toBe("REBUILT");
    if (result.state !== "REBUILT") throw new Error("expected_rebuilt");
    expect(result.revisionCount).toBe(3);
    expect(result.readModel.currentRegistryRevisionRef).toBe("REV:003");
    expect(db.calls).toHaveLength(2);
  });

  it("rejects a fork during rebuild rather than deriving arbitrary current truth", async () => {
    const root = revision("REV:001");
    const childA = revision("REV:002-A", "REV:001");
    const childB = revision("REV:002-B", "REV:001");
    const db = new ScriptedDb([
      { match: /^SELECT registry_revision_ref, registry_object_ref/, rows: [revisionRow(root), revisionRow(childA), revisionRow(childB)] },
    ]);

    await expect(rebuildRegistryResolutionReadModelV1({
      db,
      registryObjectRef: root.registryObjectRef,
      rebuiltAt: "2026-08-23T07:05:00.000Z",
    })).rejects.toThrow("registry_resolution_rebuild_fork_detected");
  });

  it("declares same-object predecessor, single-child and rebuildable read-model database invariants", () => {
    const migrationPath = fileURLToPath(
      new URL("./sql/005_registry_resolution_projection_read_model.sql", import.meta.url),
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("assurance IN ('A1','A2','A3','A4')");
    expect(sql).toContain("vsr_registry_resolution_predecessor_same_object_fk");
    expect(sql).toContain("vsr_registry_resolution_single_child_uq");
    expect(sql).toContain("delivery_state IN ('PENDING','DELIVERED','QUARANTINED')");
    expect(sql).toContain("PROJECTED_FROM_APPEND_ONLY_REGISTRY_REVISION");
    expect(sql).toContain("sourceRevisionRef");
  });
});
