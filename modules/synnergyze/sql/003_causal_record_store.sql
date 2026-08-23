CREATE TABLE IF NOT EXISTS vsr_exception_records (
  exception_ref text PRIMARY KEY,
  source_digest text NOT NULL,
  execution_receipt_ref text NOT NULL,
  reservation_ref text NOT NULL,
  original_warden_decision_ref text NOT NULL,
  correlation_id text NOT NULL,
  record_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  CHECK (source_digest LIKE 'sha256:%')
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_exception_source_identity_uq
  ON vsr_exception_records (execution_receipt_ref, source_digest);

CREATE INDEX IF NOT EXISTS vsr_exception_correlation_idx
  ON vsr_exception_records (correlation_id);

CREATE TABLE IF NOT EXISTS vsr_reconciliation_records (
  record_ref text PRIMARY KEY,
  record_kind text NOT NULL CHECK (record_kind IN ('SCALAR_RECONCILIATION', 'COMPOSITE_ASSESSMENT')),
  parent_exception_ref text NOT NULL REFERENCES vsr_exception_records(exception_ref),
  source_digest text NOT NULL,
  record_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  CHECK (source_digest LIKE 'sha256:%')
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_reconciliation_identity_uq
  ON vsr_reconciliation_records (record_kind, parent_exception_ref, source_digest);

CREATE INDEX IF NOT EXISTS vsr_reconciliation_parent_idx
  ON vsr_reconciliation_records (parent_exception_ref, recorded_at, record_ref);

CREATE TABLE IF NOT EXISTS vsr_causal_record_supersessions (
  record_kind text NOT NULL CHECK (record_kind IN ('EXCEPTION', 'SCALAR_RECONCILIATION', 'COMPOSITE_ASSESSMENT')),
  record_ref text NOT NULL,
  supersession_ref text NOT NULL UNIQUE,
  superseded_by_ref text NOT NULL,
  reason_code text NOT NULL,
  source_evidence_refs_json jsonb NOT NULL,
  supersession_json jsonb NOT NULL,
  superseded_at timestamptz NOT NULL,
  PRIMARY KEY (record_kind, record_ref),
  CHECK (record_ref <> superseded_by_ref),
  CHECK (jsonb_typeof(source_evidence_refs_json) = 'array'),
  CHECK (jsonb_array_length(source_evidence_refs_json) > 0)
);

CREATE INDEX IF NOT EXISTS vsr_causal_supersession_successor_idx
  ON vsr_causal_record_supersessions (superseded_by_ref);
