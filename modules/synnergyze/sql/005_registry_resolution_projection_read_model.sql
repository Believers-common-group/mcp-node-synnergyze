CREATE TABLE IF NOT EXISTS vsr_registry_exception_resolution_revision (
  registry_revision_ref text PRIMARY KEY,
  registry_object_ref text NOT NULL,
  projection_ref text NOT NULL UNIQUE,
  predecessor_registry_revision_ref text,
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
  revision_json jsonb NOT NULL,
  eligible_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsr_registry_resolution_revision_state_check CHECK (
    revision_json ->> 'state' = 'ELIGIBLE_FOR_REGISTRY_WRITE'
  ),
  CONSTRAINT vsr_registry_resolution_revision_non_synthetic_check CHECK (
    revision_json ->> 'synthetic' = 'false'
  ),
  CONSTRAINT vsr_registry_resolution_revision_write_eligible_check CHECK (
    revision_json ->> 'registryWriteEligible' = 'true'
  ),
  CONSTRAINT vsr_registry_resolution_no_self_predecessor CHECK (
    predecessor_registry_revision_ref IS NULL
    OR predecessor_registry_revision_ref <> registry_revision_ref
  ),
  CONSTRAINT vsr_registry_resolution_object_revision_uq
    UNIQUE (registry_object_ref, registry_revision_ref),
  CONSTRAINT vsr_registry_resolution_predecessor_same_object_fk
    FOREIGN KEY (registry_object_ref, predecessor_registry_revision_ref)
    REFERENCES vsr_registry_exception_resolution_revision (
      registry_object_ref,
      registry_revision_ref
    )
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_registry_resolution_single_child_uq
  ON vsr_registry_exception_resolution_revision (
    registry_object_ref,
    predecessor_registry_revision_ref
  )
  WHERE predecessor_registry_revision_ref IS NOT NULL;

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
  delivery_state text NOT NULL CHECK (delivery_state IN ('PENDING','DELIVERED','QUARANTINED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vsr_registry_projection_outbox_pending_idx
  ON vsr_registry_projection_outbox (delivery_state, available_at, created_at)
  WHERE delivery_state = 'PENDING';

CREATE TABLE IF NOT EXISTS vsr_registry_exception_resolution_read_model (
  registry_object_ref text PRIMARY KEY,
  current_registry_revision_ref text NOT NULL,
  read_model_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT vsr_registry_resolution_read_model_state_check CHECK (
    read_model_json ->> 'state' = 'PROJECTED_FROM_APPEND_ONLY_REGISTRY_REVISION'
  ),
  CONSTRAINT vsr_registry_resolution_read_model_source_check CHECK (
    read_model_json ->> 'sourceRevisionRef' = current_registry_revision_ref
  ),
  FOREIGN KEY (registry_object_ref, current_registry_revision_ref)
    REFERENCES vsr_registry_exception_resolution_revision (registry_object_ref, registry_revision_ref)
);
