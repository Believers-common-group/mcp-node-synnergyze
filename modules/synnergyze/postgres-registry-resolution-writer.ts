import { createHash } from "node:crypto";

import type { RegistryPostgresQueryExecutorV1 } from "./postgres-registry-types.ts";
import type { RegistryExceptionResolutionRevisionV1 } from "./registry-resolution-projection.ts";

export type RegistryResolutionWriteResultV1 =
  | { state: "APPENDED"; registryRevisionRef: string; outboxEventRef: string }
  | { state: "IDEMPOTENT_REPLAY"; registryRevisionRef: string; outboxEventRef: string }
  | { state: "CONFLICT" };

interface RegistryResolutionRevisionRowV1 {
  registry_revision_ref: string;
  registry_object_ref: string;
  projection_ref: string;
  predecessor_registry_revision_ref: string | null;
  river_publication_ref: string;
  river_trace_digest: string;
  attestation_ref: string;
  revision_json: RegistryExceptionResolutionRevisionV1 | string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function assertEligibleRevision(revision: RegistryExceptionResolutionRevisionV1): void {
  if (
    revision.state !== "ELIGIBLE_FOR_REGISTRY_WRITE" ||
    revision.registryWriteEligible !== true ||
    revision.synthetic !== false
  ) {
    throw new Error("registry_resolution_writer_eligible_non_synthetic_revision_required");
  }
  if (!revision.registryRevisionRef.trim() || !revision.registryObjectRef.trim()) {
    throw new Error("registry_resolution_writer_revision_identity_required");
  }
  if (revision.predecessorRegistryRevisionRef === revision.registryRevisionRef) {
    throw new Error("registry_resolution_writer_self_predecessor_forbidden");
  }
  if (
    !revision.riverPublicationRef.trim() ||
    !revision.riverTraceDigest.trim() ||
    !revision.attestationRef.trim() ||
    !revision.attestorRef.trim()
  ) {
    throw new Error("registry_resolution_writer_attested_river_proof_required");
  }
}

function exactIdentity(
  row: RegistryResolutionRevisionRowV1,
  revision: RegistryExceptionResolutionRevisionV1,
): boolean {
  return (
    row.registry_revision_ref === revision.registryRevisionRef &&
    row.registry_object_ref === revision.registryObjectRef &&
    row.projection_ref === revision.projectionRef &&
    row.predecessor_registry_revision_ref === (revision.predecessorRegistryRevisionRef ?? null) &&
    row.river_publication_ref === revision.riverPublicationRef &&
    row.river_trace_digest === revision.riverTraceDigest &&
    row.attestation_ref === revision.attestationRef
  );
}

export class PostgresRegistryExceptionResolutionWriterV1 {
  constructor(private readonly db: RegistryPostgresQueryExecutorV1) {}

  async append(
    revision: RegistryExceptionResolutionRevisionV1,
  ): Promise<RegistryResolutionWriteResultV1> {
    assertEligibleRevision(revision);
    const outboxEventRef = `REGISTRY-EVENT:WARDEN-EXCEPTION-RESOLUTION:${digest(
      `${revision.registryRevisionRef}|${revision.riverPublicationRef}|${revision.attestationRef}`,
    ).slice(0, 24)}`;

    await this.db.query("BEGIN");
    try {
      const inserted = await this.db.query<{ registry_revision_ref: string }>(
        `INSERT INTO vsr_registry_exception_resolution_revision
          (registry_revision_ref, registry_object_ref, projection_ref,
           predecessor_registry_revision_ref, original_exception_ref, assessment_ref,
           disposition, remedy_effect_ref, remedy_verification_ref, river_remedy_seal_ref,
           river_publication_ref, river_trace_digest, attestation_ref, attestor_ref,
           assurance, projection_policy_ref, revision_json, eligible_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::timestamptz,now())
         ON CONFLICT (registry_revision_ref) DO NOTHING
         RETURNING registry_revision_ref`,
        [
          revision.registryRevisionRef,
          revision.registryObjectRef,
          revision.projectionRef,
          revision.predecessorRegistryRevisionRef ?? null,
          revision.originalExceptionRef,
          revision.assessmentRef,
          revision.disposition,
          revision.remedyEffectRef,
          revision.remedyVerificationRef,
          revision.riverRemedySealRef,
          revision.riverPublicationRef,
          revision.riverTraceDigest,
          revision.attestationRef,
          revision.attestorRef,
          revision.assurance,
          revision.projectionPolicyRef,
          JSON.stringify(revision),
          revision.eligibleAt,
        ],
      );

      let state: "APPENDED" | "IDEMPOTENT_REPLAY" = "APPENDED";
      if (inserted.rowCount !== 1) {
        const selected = await this.db.query<RegistryResolutionRevisionRowV1>(
          `SELECT registry_revision_ref, registry_object_ref, projection_ref,
                  predecessor_registry_revision_ref, river_publication_ref,
                  river_trace_digest, attestation_ref, revision_json
           FROM vsr_registry_exception_resolution_revision
           WHERE registry_revision_ref = $1`,
          [revision.registryRevisionRef],
        );
        const row = selected.rows[0];
        if (!row) throw new Error("registry_resolution_writer_race_missing_revision");
        if (!exactIdentity(row, revision)) {
          await this.db.query("ROLLBACK");
          return { state: "CONFLICT" };
        }
        const persisted = parseJson<RegistryExceptionResolutionRevisionV1>(row.revision_json);
        if (JSON.stringify(persisted) !== JSON.stringify(revision)) {
          await this.db.query("ROLLBACK");
          return { state: "CONFLICT" };
        }
        state = "IDEMPOTENT_REPLAY";
      }

      await this.db.query(
        `INSERT INTO vsr_registry_projection_outbox
          (event_ref, registry_revision_ref, registry_object_ref, event_type,
           river_publication_ref, attestation_ref, payload, delivery_state,
           attempt_count, available_at, created_at)
         VALUES ($1,$2,$3,'WARDEN_EXCEPTION_RESOLUTION_PROJECTED',$4,$5,$6::jsonb,'PENDING',0,now(),now())
         ON CONFLICT (event_ref) DO NOTHING`,
        [
          outboxEventRef,
          revision.registryRevisionRef,
          revision.registryObjectRef,
          revision.riverPublicationRef,
          revision.attestationRef,
          JSON.stringify({
            registryObjectRef: revision.registryObjectRef,
            registryRevisionRef: revision.registryRevisionRef,
            predecessorRegistryRevisionRef: revision.predecessorRegistryRevisionRef ?? null,
            originalExceptionRef: revision.originalExceptionRef,
            disposition: revision.disposition,
            remedyEffectRef: revision.remedyEffectRef,
            riverPublicationRef: revision.riverPublicationRef,
            riverTraceDigest: revision.riverTraceDigest,
            attestationRef: revision.attestationRef,
            assurance: revision.assurance,
          }),
        ],
      );
      await this.db.query("COMMIT");
      return { state, registryRevisionRef: revision.registryRevisionRef, outboxEventRef };
    } catch (error) {
      try {
        await this.db.query("ROLLBACK");
      } catch {
        // Preserve the primary failure. The connection owner must fail closed on rollback uncertainty.
      }
      throw error;
    }
  }
}
