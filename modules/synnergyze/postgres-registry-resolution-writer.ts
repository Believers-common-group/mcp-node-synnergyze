import { createHash } from "node:crypto";

import type { PostgresQueryExecutorV1 } from "./postgres-remedy-journal.ts";
import type { RegistryExceptionResolutionProjectionV1 } from "./registry-resolution-projection.ts";

export type RegistryResolutionWriteResultV1 =
  | { state: "APPENDED"; registryRevisionRef: string; outboxEventRef: string }
  | { state: "IDEMPOTENT_REPLAY"; registryRevisionRef: string; outboxEventRef: string }
  | { state: "CONFLICT" };

interface RegistryResolutionRevisionRowV1 {
  registry_revision_ref: string;
  registry_object_ref: string;
  projection_ref: string;
  river_publication_ref: string;
  river_trace_digest: string;
  attestation_ref: string;
  projection_json: RegistryExceptionResolutionProjectionV1 | string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function assertEligibleProjection(projection: RegistryExceptionResolutionProjectionV1): void {
  if (
    projection.state !== "ELIGIBLE_FOR_REGISTRY_WRITE" ||
    projection.registryWriteEligible !== true ||
    projection.synthetic !== false
  ) {
    throw new Error("registry_resolution_writer_eligible_non_synthetic_projection_required");
  }
  if (!projection.attestationRef.trim() || !projection.attestorRef.trim()) {
    throw new Error("registry_resolution_writer_attestation_required");
  }
  if (projection.assurance === "A0") {
    throw new Error("registry_resolution_writer_assurance_required");
  }
  if (
    projection.riverEventRefs.length === 0 ||
    projection.riverEvidenceObjectRefs.length === 0 ||
    !projection.riverPublicationRef.trim() ||
    !projection.riverTraceDigest.trim()
  ) {
    throw new Error("registry_resolution_writer_river_proof_required");
  }
}

function exactIdentity(
  row: RegistryResolutionRevisionRowV1,
  projection: RegistryExceptionResolutionProjectionV1,
): boolean {
  return (
    row.registry_revision_ref === projection.registryRevisionRef &&
    row.registry_object_ref === projection.registryObjectRef &&
    row.projection_ref === projection.projectionRef &&
    row.river_publication_ref === projection.riverPublicationRef &&
    row.river_trace_digest === projection.riverTraceDigest &&
    row.attestation_ref === projection.attestationRef
  );
}

export class PostgresRegistryExceptionResolutionWriterV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async append(
    projection: RegistryExceptionResolutionProjectionV1,
  ): Promise<RegistryResolutionWriteResultV1> {
    assertEligibleProjection(projection);
    const outboxEventRef = `REGISTRY-EVENT:WARDEN-EXCEPTION-RESOLUTION:${digest(
      `${projection.registryRevisionRef}|${projection.riverPublicationRef}|${projection.attestationRef}`,
    ).slice(0, 24)}`;

    await this.db.query("BEGIN");
    try {
      const inserted = await this.db.query<{ registry_revision_ref: string }>(
        `INSERT INTO vsr_registry_exception_resolution_revision
          (registry_revision_ref, registry_object_ref, projection_ref, original_exception_ref,
           assessment_ref, disposition, remedy_effect_ref, remedy_verification_ref,
           river_remedy_seal_ref, river_publication_ref, river_trace_digest,
           attestation_ref, attestor_ref, assurance, projection_policy_ref,
           projection_json, eligible_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::timestamptz,now())
         ON CONFLICT (registry_revision_ref) DO NOTHING
         RETURNING registry_revision_ref`,
        [
          projection.registryRevisionRef,
          projection.registryObjectRef,
          projection.projectionRef,
          projection.originalExceptionRef,
          projection.assessmentRef,
          projection.disposition,
          projection.remedyEffectRef,
          projection.remedyVerificationRef,
          projection.riverRemedySealRef,
          projection.riverPublicationRef,
          projection.riverTraceDigest,
          projection.attestationRef,
          projection.attestorRef,
          projection.assurance,
          projection.projectionPolicyRef,
          JSON.stringify(projection),
          projection.eligibleAt,
        ],
      );

      let state: "APPENDED" | "IDEMPOTENT_REPLAY" = "APPENDED";
      if (inserted.rowCount !== 1) {
        const selected = await this.db.query<RegistryResolutionRevisionRowV1>(
          `SELECT registry_revision_ref, registry_object_ref, projection_ref,
                  river_publication_ref, river_trace_digest, attestation_ref, projection_json
           FROM vsr_registry_exception_resolution_revision
           WHERE registry_revision_ref = $1`,
          [projection.registryRevisionRef],
        );
        const row = selected.rows[0];
        if (!row) throw new Error("registry_resolution_writer_race_missing_revision");
        if (!exactIdentity(row, projection)) {
          await this.db.query("ROLLBACK");
          return { state: "CONFLICT" };
        }
        const persisted = parseJson<RegistryExceptionResolutionProjectionV1>(row.projection_json);
        if (JSON.stringify(persisted) !== JSON.stringify(projection)) {
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
          projection.registryRevisionRef,
          projection.registryObjectRef,
          projection.riverPublicationRef,
          projection.attestationRef,
          JSON.stringify({
            registryObjectRef: projection.registryObjectRef,
            registryRevisionRef: projection.registryRevisionRef,
            originalExceptionRef: projection.originalExceptionRef,
            disposition: projection.disposition,
            remedyEffectRef: projection.remedyEffectRef,
            riverPublicationRef: projection.riverPublicationRef,
            riverTraceDigest: projection.riverTraceDigest,
            attestationRef: projection.attestationRef,
            assurance: projection.assurance,
          }),
        ],
      );
      await this.db.query("COMMIT");
      return { state, registryRevisionRef: projection.registryRevisionRef, outboxEventRef };
    } catch (error) {
      try {
        await this.db.query("ROLLBACK");
      } catch {
        // Preserve the primary failure; connection owner must treat rollback failure as fatal.
      }
      throw error;
    }
  }
}
