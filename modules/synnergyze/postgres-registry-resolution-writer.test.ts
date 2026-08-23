import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PostgresRegistryExceptionResolutionWriterV1,
} from "./postgres-registry-resolution-writer.ts";
import type { PostgresQueryExecutorV1, PostgresQueryResultV1 } from "./postgres-remedy-journal.ts";
import type { RegistryExceptionResolutionProjectionV1 } from "./registry-resolution-projection.ts";

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

function projection(
  overrides: Partial<RegistryExceptionResolutionProjectionV1> = {},
): RegistryExceptionResolutionProjectionV1 {
  return {
    version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001",
    projectionRef: "REGISTRY-PROJECTION:001",
    registryObjectRef: "WARDEN-EXCEPTION-RESOLUTION:EXCEPTION:001",
    registryRevisionRef: "REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:001",
    originalExceptionRef: "EXCEPTION:001",
    assessmentRef: "ASSESSMENT:001",
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    remedyEffectRef: "REMEDY-EFFECT:001",
    remedyVerificationRef: "REMEDY-VERIFICATION:001",
    riverRemedySealRef: "RIVER-REMEDY-SEAL:001",
    riverPublicationRef: "RIVER-CAUSAL-PUBLICATION:001",
    riverTraceDigest: "sha256:river-trace-001",
    riverEventRefs: ["RIVER-EVENT:001"],
    riverEvidenceObjectRefs: ["RIVER-EVIDENCE-OBJECT:001"],
    sourceEvidenceRefs: ["EVIDENCE:001"],
    generatedAt: "2026-08-23T06:10:00.000Z",
    synthetic: false,
    attestationRef: "RIVER-ATTESTATION:001",
    attestorRef: "RIVER-ATTESTOR:001",
    assurance: "A3",
    projectionPolicyRef: "REGISTRY-PROJECTION-POLICY:001",
    eligibleAt: "2026-08-23T06:10:03.000Z",
    registryWriteEligible: true,
    state: "ELIGIBLE_FOR_REGISTRY_WRITE",
    ...overrides,
  };
}

describe("PostgresRegistryExceptionResolutionWriterV1", () => {
  it("atomically appends one eligible revision and one Registry outbox event", async () => {
    const db = new ScriptedDb([
      { match: /^BEGIN$/, rowCount: 0 },
      {
        match: /^INSERT INTO vsr_registry_exception_resolution_revision/,
        rows: [{ registry_revision_ref: "REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:001" }],
      },
      { match: /^INSERT INTO vsr_registry_projection_outbox/, rowCount: 1 },
      { match: /^COMMIT$/, rowCount: 0 },
    ]);
    const result = await new PostgresRegistryExceptionResolutionWriterV1(db).append(projection());

    expect(result.state).toBe("APPENDED");
    expect(db.calls.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringMatching(/^INSERT INTO vsr_registry_exception_resolution_revision/),
      expect.stringMatching(/^INSERT INTO vsr_registry_projection_outbox/),
      "COMMIT",
    ]);
    expect(db.calls[1].sql).toContain("ON CONFLICT (registry_revision_ref) DO NOTHING");
    expect(db.calls[2].sql).toContain("ON CONFLICT (event_ref) DO NOTHING");
  });

  it("returns idempotent replay for the exact persisted revision and reuses the same outbox identity", async () => {
    const source = projection();
    const db = new ScriptedDb([
      { match: /^BEGIN$/, rowCount: 0 },
      { match: /^INSERT INTO vsr_registry_exception_resolution_revision/, rowCount: 0 },
      {
        match: /^SELECT registry_revision_ref, registry_object_ref, projection_ref/,
        rows: [{
          registry_revision_ref: source.registryRevisionRef,
          registry_object_ref: source.registryObjectRef,
          projection_ref: source.projectionRef,
          river_publication_ref: source.riverPublicationRef,
          river_trace_digest: source.riverTraceDigest,
          attestation_ref: source.attestationRef,
          projection_json: JSON.stringify(source),
        }],
      },
      { match: /^INSERT INTO vsr_registry_projection_outbox/, rowCount: 0 },
      { match: /^COMMIT$/, rowCount: 0 },
    ]);

    const result = await new PostgresRegistryExceptionResolutionWriterV1(db).append(source);
    expect(result.state).toBe("IDEMPOTENT_REPLAY");
    expect(result.registryRevisionRef).toBe(source.registryRevisionRef);
  });

  it("fails closed when a revision identity is reused with different River/attestation lineage", async () => {
    const source = projection();
    const db = new ScriptedDb([
      { match: /^BEGIN$/, rowCount: 0 },
      { match: /^INSERT INTO vsr_registry_exception_resolution_revision/, rowCount: 0 },
      {
        match: /^SELECT registry_revision_ref, registry_object_ref, projection_ref/,
        rows: [{
          registry_revision_ref: source.registryRevisionRef,
          registry_object_ref: source.registryObjectRef,
          projection_ref: source.projectionRef,
          river_publication_ref: "RIVER-CAUSAL-PUBLICATION:OTHER",
          river_trace_digest: "sha256:other",
          attestation_ref: "RIVER-ATTESTATION:OTHER",
          projection_json: JSON.stringify(source),
        }],
      },
      { match: /^ROLLBACK$/, rowCount: 0 },
    ]);

    await expect(
      new PostgresRegistryExceptionResolutionWriterV1(db).append(source),
    ).resolves.toEqual({ state: "CONFLICT" });
    expect(db.calls.some((call) => /^INSERT INTO vsr_registry_projection_outbox/.test(call.sql))).toBe(false);
  });

  it("rejects synthetic or A0 projections before touching the database", async () => {
    const db = new ScriptedDb([]);
    const writer = new PostgresRegistryExceptionResolutionWriterV1(db);

    await expect(writer.append({
      ...projection(),
      synthetic: true,
    } as unknown as RegistryExceptionResolutionProjectionV1)).rejects.toThrow(
      "registry_resolution_writer_eligible_non_synthetic_projection_required",
    );
    await expect(writer.append({
      ...projection(),
      assurance: "A0",
    })).rejects.toThrow("registry_resolution_writer_assurance_required");
    expect(db.calls).toHaveLength(0);
  });

  it("declares append-only revision identity, non-synthetic assurance gates and transactional outbox schema", () => {
    const migrationPath = fileURLToPath(
      new URL("./sql/004_registry_exception_resolution_projection.sql", import.meta.url),
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("registry_revision_ref text PRIMARY KEY");
    expect(sql).toContain("projection_ref text NOT NULL UNIQUE");
    expect(sql).toContain("assurance IN ('A1','A2','A3','A4')");
    expect(sql).toContain("projection_json ->> 'state' = 'ELIGIBLE_FOR_REGISTRY_WRITE'");
    expect(sql).toContain("projection_json ->> 'synthetic' = 'false'");
    expect(sql).toContain("projection_json ->> 'registryWriteEligible' = 'true'");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS vsr_registry_projection_outbox");
    expect(sql).toContain("delivery_state IN ('PENDING','DELIVERED','FAILED')");
  });
});
