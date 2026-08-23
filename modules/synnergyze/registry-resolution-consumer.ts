import type { RegistryPostgresQueryExecutorV1 } from "./postgres-registry-types.ts";
import type {
  RegistryExceptionResolutionRevisionV1,
  RegistryResolutionReadModelV1,
} from "./registry-resolution-projection.ts";

interface OutboxRowV1 {
  event_ref: string;
  registry_revision_ref: string;
  registry_object_ref: string;
  river_publication_ref: string;
  attestation_ref: string;
  attempt_count: number;
}

interface RevisionRowV1 {
  registry_revision_ref: string;
  registry_object_ref: string;
  predecessor_registry_revision_ref: string | null;
  river_publication_ref: string;
  attestation_ref: string;
  revision_json: RegistryExceptionResolutionRevisionV1 | string;
}

interface ReadModelRowV1 {
  registry_object_ref: string;
  current_registry_revision_ref: string;
  read_model_json: RegistryResolutionReadModelV1 | string;
}

export type RegistryResolutionConsumeResultV1 =
  | { state: "NO_WORK" }
  | { state: "APPLIED"; eventRef: string; registryRevisionRef: string }
  | { state: "IDEMPOTENT_REPLAY"; eventRef: string; registryRevisionRef: string }
  | { state: "STALE_ALREADY_SUPERSEDED"; eventRef: string; registryRevisionRef: string }
  | { state: "BLOCKED_CAUSAL_GAP"; eventRef: string; registryRevisionRef: string }
  | { state: "QUARANTINED_CONFLICT"; eventRef: string; registryRevisionRef: string };

export type RegistryResolutionRebuildResultV1 =
  | { state: "NOT_FOUND" }
  | { state: "REBUILT"; readModel: RegistryResolutionReadModelV1; revisionCount: number };

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function readModelFromRevision(
  revision: RegistryExceptionResolutionRevisionV1,
  projectedAt: string,
): RegistryResolutionReadModelV1 {
  return {
    version: "GENESIS-REGISTRY-RESOLUTION-READ-MODEL-001",
    registryObjectRef: revision.registryObjectRef,
    currentRegistryRevisionRef: revision.registryRevisionRef,
    originalExceptionRef: revision.originalExceptionRef,
    disposition: revision.disposition,
    remedyEffectRef: revision.remedyEffectRef,
    remedyVerificationRef: revision.remedyVerificationRef,
    riverRemedySealRef: revision.riverRemedySealRef,
    riverPublicationRef: revision.riverPublicationRef,
    riverTraceDigest: revision.riverTraceDigest,
    attestationRef: revision.attestationRef,
    assurance: revision.assurance,
    projectionPolicyRef: revision.projectionPolicyRef,
    projectedAt,
    sourceRevisionRef: revision.registryRevisionRef,
    state: "PROJECTED_FROM_APPEND_ONLY_REGISTRY_REVISION",
  };
}

function assertRevisionRow(row: RevisionRowV1, revision: RegistryExceptionResolutionRevisionV1): void {
  if (
    row.registry_revision_ref !== revision.registryRevisionRef ||
    row.registry_object_ref !== revision.registryObjectRef ||
    row.predecessor_registry_revision_ref !== (revision.predecessorRegistryRevisionRef ?? null) ||
    row.river_publication_ref !== revision.riverPublicationRef ||
    row.attestation_ref !== revision.attestationRef ||
    revision.synthetic !== false ||
    revision.registryWriteEligible !== true ||
    revision.state !== "ELIGIBLE_FOR_REGISTRY_WRITE"
  ) {
    throw new Error("registry_resolution_consumer_revision_integrity_failure");
  }
}

async function isAncestor(input: {
  db: RegistryPostgresQueryExecutorV1;
  registryObjectRef: string;
  descendantRevisionRef: string;
  possibleAncestorRevisionRef: string;
}): Promise<boolean> {
  const result = await input.db.query<{ found: number }>(
    `WITH RECURSIVE lineage AS (
       SELECT registry_revision_ref, predecessor_registry_revision_ref
       FROM vsr_registry_exception_resolution_revision
       WHERE registry_object_ref = $1 AND registry_revision_ref = $2
       UNION ALL
       SELECT r.registry_revision_ref, r.predecessor_registry_revision_ref
       FROM vsr_registry_exception_resolution_revision r
       JOIN lineage l ON r.registry_revision_ref = l.predecessor_registry_revision_ref
       WHERE r.registry_object_ref = $1
     )
     SELECT 1 AS found FROM lineage WHERE registry_revision_ref = $3 LIMIT 1`,
    [input.registryObjectRef, input.descendantRevisionRef, input.possibleAncestorRevisionRef],
  );
  return result.rowCount === 1;
}

async function markDelivered(
  db: RegistryPostgresQueryExecutorV1,
  eventRef: string,
  deliveredAt: string,
): Promise<void> {
  const updated = await db.query(
    `UPDATE vsr_registry_projection_outbox
     SET delivery_state = 'DELIVERED', delivered_at = $2::timestamptz,
         attempt_count = attempt_count + 1, last_error = NULL
     WHERE event_ref = $1 AND delivery_state = 'PENDING'`,
    [eventRef, deliveredAt],
  );
  if (updated.rowCount !== 1) throw new Error("registry_resolution_consumer_delivery_ack_conflict");
}

async function deferCausalGap(
  db: RegistryPostgresQueryExecutorV1,
  eventRef: string,
  retryAt: string,
): Promise<void> {
  const updated = await db.query(
    `UPDATE vsr_registry_projection_outbox
     SET attempt_count = attempt_count + 1, available_at = $2::timestamptz,
         last_error = 'CAUSAL_GAP'
     WHERE event_ref = $1 AND delivery_state = 'PENDING'`,
    [eventRef, retryAt],
  );
  if (updated.rowCount !== 1) throw new Error("registry_resolution_consumer_gap_update_conflict");
}

async function quarantineConflict(
  db: RegistryPostgresQueryExecutorV1,
  eventRef: string,
): Promise<void> {
  const updated = await db.query(
    `UPDATE vsr_registry_projection_outbox
     SET delivery_state = 'QUARANTINED', attempt_count = attempt_count + 1,
         last_error = 'CAUSAL_CONFLICT'
     WHERE event_ref = $1 AND delivery_state = 'PENDING'`,
    [eventRef],
  );
  if (updated.rowCount !== 1) throw new Error("registry_resolution_consumer_quarantine_conflict");
}

export class PostgresRegistryResolutionConsumerV1 {
  constructor(private readonly db: RegistryPostgresQueryExecutorV1) {}

  async consumeOne(input: {
    now: string;
    retryAt: string;
  }): Promise<RegistryResolutionConsumeResultV1> {
    await this.db.query("BEGIN");
    try {
      const claimed = await this.db.query<OutboxRowV1>(
        `SELECT event_ref, registry_revision_ref, registry_object_ref,
                river_publication_ref, attestation_ref, attempt_count
         FROM vsr_registry_projection_outbox
         WHERE delivery_state = 'PENDING' AND available_at <= $1::timestamptz
         ORDER BY created_at, event_ref
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [input.now],
      );
      const outbox = claimed.rows[0];
      if (!outbox) {
        await this.db.query("COMMIT");
        return { state: "NO_WORK" };
      }

      const selectedRevision = await this.db.query<RevisionRowV1>(
        `SELECT registry_revision_ref, registry_object_ref, predecessor_registry_revision_ref,
                river_publication_ref, attestation_ref, revision_json
         FROM vsr_registry_exception_resolution_revision
         WHERE registry_revision_ref = $1`,
        [outbox.registry_revision_ref],
      );
      const revisionRow = selectedRevision.rows[0];
      if (!revisionRow) throw new Error("registry_resolution_consumer_revision_missing");
      const revision = parseJson<RegistryExceptionResolutionRevisionV1>(revisionRow.revision_json);
      assertRevisionRow(revisionRow, revision);
      if (
        outbox.registry_object_ref !== revision.registryObjectRef ||
        outbox.river_publication_ref !== revision.riverPublicationRef ||
        outbox.attestation_ref !== revision.attestationRef
      ) {
        throw new Error("registry_resolution_consumer_outbox_revision_mismatch");
      }

      const selectedCurrent = await this.db.query<ReadModelRowV1>(
        `SELECT registry_object_ref, current_registry_revision_ref, read_model_json
         FROM vsr_registry_exception_resolution_read_model
         WHERE registry_object_ref = $1
         FOR UPDATE`,
        [revision.registryObjectRef],
      );
      const current = selectedCurrent.rows[0];

      if (!current) {
        if (revision.predecessorRegistryRevisionRef) {
          await deferCausalGap(this.db, outbox.event_ref, input.retryAt);
          await this.db.query("COMMIT");
          return {
            state: "BLOCKED_CAUSAL_GAP",
            eventRef: outbox.event_ref,
            registryRevisionRef: revision.registryRevisionRef,
          };
        }
        const model = readModelFromRevision(revision, input.now);
        await this.db.query(
          `INSERT INTO vsr_registry_exception_resolution_read_model
            (registry_object_ref, current_registry_revision_ref, read_model_json, updated_at)
           VALUES ($1,$2,$3::jsonb,$4::timestamptz)`,
          [revision.registryObjectRef, revision.registryRevisionRef, JSON.stringify(model), input.now],
        );
        await markDelivered(this.db, outbox.event_ref, input.now);
        await this.db.query("COMMIT");
        return {
          state: "APPLIED",
          eventRef: outbox.event_ref,
          registryRevisionRef: revision.registryRevisionRef,
        };
      }

      if (current.current_registry_revision_ref === revision.registryRevisionRef) {
        await markDelivered(this.db, outbox.event_ref, input.now);
        await this.db.query("COMMIT");
        return {
          state: "IDEMPOTENT_REPLAY",
          eventRef: outbox.event_ref,
          registryRevisionRef: revision.registryRevisionRef,
        };
      }

      if (revision.predecessorRegistryRevisionRef === current.current_registry_revision_ref) {
        const model = readModelFromRevision(revision, input.now);
        const updated = await this.db.query(
          `UPDATE vsr_registry_exception_resolution_read_model
           SET current_registry_revision_ref = $2, read_model_json = $3::jsonb,
               updated_at = $4::timestamptz
           WHERE registry_object_ref = $1 AND current_registry_revision_ref = $5`,
          [
            revision.registryObjectRef,
            revision.registryRevisionRef,
            JSON.stringify(model),
            input.now,
            revision.predecessorRegistryRevisionRef,
          ],
        );
        if (updated.rowCount !== 1) throw new Error("registry_resolution_consumer_read_model_cas_conflict");
        await markDelivered(this.db, outbox.event_ref, input.now);
        await this.db.query("COMMIT");
        return {
          state: "APPLIED",
          eventRef: outbox.event_ref,
          registryRevisionRef: revision.registryRevisionRef,
        };
      }

      const incomingAlreadySuperseded = await isAncestor({
        db: this.db,
        registryObjectRef: revision.registryObjectRef,
        descendantRevisionRef: current.current_registry_revision_ref,
        possibleAncestorRevisionRef: revision.registryRevisionRef,
      });
      if (incomingAlreadySuperseded) {
        await markDelivered(this.db, outbox.event_ref, input.now);
        await this.db.query("COMMIT");
        return {
          state: "STALE_ALREADY_SUPERSEDED",
          eventRef: outbox.event_ref,
          registryRevisionRef: revision.registryRevisionRef,
        };
      }

      if (revision.predecessorRegistryRevisionRef) {
        const currentPrecedesIncoming = await isAncestor({
          db: this.db,
          registryObjectRef: revision.registryObjectRef,
          descendantRevisionRef: revision.predecessorRegistryRevisionRef,
          possibleAncestorRevisionRef: current.current_registry_revision_ref,
        });
        if (currentPrecedesIncoming) {
          await deferCausalGap(this.db, outbox.event_ref, input.retryAt);
          await this.db.query("COMMIT");
          return {
            state: "BLOCKED_CAUSAL_GAP",
            eventRef: outbox.event_ref,
            registryRevisionRef: revision.registryRevisionRef,
          };
        }
      }

      await quarantineConflict(this.db, outbox.event_ref);
      await this.db.query("COMMIT");
      return {
        state: "QUARANTINED_CONFLICT",
        eventRef: outbox.event_ref,
        registryRevisionRef: revision.registryRevisionRef,
      };
    } catch (error) {
      try {
        await this.db.query("ROLLBACK");
      } catch {
        // Preserve primary failure. Projection truth remains the append-only revision facts.
      }
      throw error;
    }
  }
}

export async function rebuildRegistryResolutionReadModelV1(input: {
  db: RegistryPostgresQueryExecutorV1;
  registryObjectRef: string;
  rebuiltAt: string;
}): Promise<RegistryResolutionRebuildResultV1> {
  const selected = await input.db.query<RevisionRowV1>(
    `SELECT registry_revision_ref, registry_object_ref, predecessor_registry_revision_ref,
            river_publication_ref, attestation_ref, revision_json
     FROM vsr_registry_exception_resolution_revision
     WHERE registry_object_ref = $1`,
    [input.registryObjectRef],
  );
  if (selected.rowCount === 0) return { state: "NOT_FOUND" };

  const revisions = selected.rows.map((row) => {
    const revision = parseJson<RegistryExceptionResolutionRevisionV1>(row.revision_json);
    assertRevisionRow(row, revision);
    return revision;
  });
  const byRef = new Map(revisions.map((revision) => [revision.registryRevisionRef, revision]));
  const roots = revisions.filter((revision) => !revision.predecessorRegistryRevisionRef);
  if (roots.length !== 1) throw new Error("registry_resolution_rebuild_root_conflict");

  const childByPredecessor = new Map<string, RegistryExceptionResolutionRevisionV1>();
  for (const revision of revisions) {
    const predecessor = revision.predecessorRegistryRevisionRef;
    if (!predecessor) continue;
    if (!byRef.has(predecessor)) throw new Error("registry_resolution_rebuild_predecessor_missing");
    if (childByPredecessor.has(predecessor)) throw new Error("registry_resolution_rebuild_fork_detected");
    childByPredecessor.set(predecessor, revision);
  }

  let current = roots[0];
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.registryRevisionRef)) throw new Error("registry_resolution_rebuild_cycle_detected");
    visited.add(current.registryRevisionRef);
    const child = childByPredecessor.get(current.registryRevisionRef);
    if (!child) break;
    current = child;
  }
  if (visited.size !== revisions.length) throw new Error("registry_resolution_rebuild_disconnected_history");

  const model = readModelFromRevision(current, input.rebuiltAt);
  await input.db.query(
    `INSERT INTO vsr_registry_exception_resolution_read_model
      (registry_object_ref, current_registry_revision_ref, read_model_json, updated_at)
     VALUES ($1,$2,$3::jsonb,$4::timestamptz)
     ON CONFLICT (registry_object_ref) DO UPDATE
     SET current_registry_revision_ref = EXCLUDED.current_registry_revision_ref,
         read_model_json = EXCLUDED.read_model_json,
         updated_at = EXCLUDED.updated_at`,
    [input.registryObjectRef, current.registryRevisionRef, JSON.stringify(model), input.rebuiltAt],
  );
  return { state: "REBUILT", readModel: model, revisionCount: revisions.length };
}
