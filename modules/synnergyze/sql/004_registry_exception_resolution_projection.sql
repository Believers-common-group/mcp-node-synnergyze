CREATE TABLE IF NOT EXISTS vsr_registry_exception_resolution_revision (
  registry_revision_ref text PRIMARY KEY,
  registry_object_ref text NOT NULL,
  projection_ref text NOT NULL UNIQUE,
  original_exception_ref text NOT NULL,
  assessment_ref text NOT NULL,
  disposition text NOT NULL CHECK (
    disposition IN (
      'SUPERSEDED_BY_VERIFIED_RECOVERY',
      'SUPERSEDED_BY_VERIFIED_COMPENSATION'
    )
  ),
  remedy_effect_ref text NOT NULL,
  remedy_verification_ref text NOT NULL,
  river_remedy_seal_ref text NOT NULL,
  river_publication_ref text NOT NULL,
  river_trace_digest text NOT NULL,
  attestation_ref text NOT NULL,
  attestor_ref text NOT NULL,
  assurance text NOT NULL CHECK (assurance IN ('A1','A2','A3','A4')),
  projection_policy_ref text NOT NULL,
  projection_json jsonb NOT NULL,
  eligible_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsr_registry_resolution_projection_state_check CHECK (
    projection_json ->> 'state' = 'ELIGIBLE_FOR_REGISTRY_WRITE'
  ),
  CONSTRAINT vsr_registry_resolution_projection_non_synthetic_check CHECK (
    projection_json ->> 'synthetic' = 'false'
  ),
  CONSTRAINT vsr_registry_resolution_projection_write_eligible_check CHECK (
    projection_json ->> 'registryWriteEligible' = 'true'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_registry_resolution_object_attestation_uq
  ON vsr_registry_exception_resolution_revision (registry_object_ref, attestation_ref);

CREATE INDEX IF NOT EXISTS vsr_registry_resolution_exception_idx
  ON vsr_registry_exception_resolution_revision (original_exception_ref, eligible_at);

CREATE INDEX IF NOT EXISTS vsr_registry_resolution_river_publication_idx
  ON vsr_registry_exception_resolution_revision (river_publication_ref);

CREATE TABLE IF NOT EXISTS vsr_registry_projection_outbox (
  event_ref text PRIMARY KEY,
  registry_revision_ref text NOT NULL REFERENCES vsr_registry_exception_resolution_revision(registry_revision_ref),
  registry_object_ref text NOT NULL,
  event_type text NOT NULL CHECK (event_type = 'WARDEN_EXCEPTION_RESOLUTION_PROJECTED'),
  river_publication_ref text NOT NULL,
  attestation_ref text NOT NULL,
  payload jsonb NOT NULL,
  delivery_state text NOT NULL CHECK (delivery_state IN ('PENDING','DELIVERED','FAILED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vsr_registry_projection_outbox_pending_idx
  ON vsr_registry_projection_outbox (delivery_state, available_at)
  WHERE delivery_state = 'PENDING';
