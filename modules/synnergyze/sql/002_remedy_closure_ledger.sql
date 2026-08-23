CREATE TABLE IF NOT EXISTS vsr_remedy_closure_ledger (
  exception_ref text PRIMARY KEY,
  seal_ref text NOT NULL UNIQUE,
  remedy_effect_ref text NOT NULL UNIQUE,
  trace_digest text NOT NULL,
  original_execution_receipt_ref text NOT NULL,
  remedy_execution_receipt_ref text NOT NULL UNIQUE,
  original_warden_decision_ref text NOT NULL,
  remedy_warden_decision_ref text NOT NULL,
  parent_correlation_id text NOT NULL,
  remedy_correlation_id text NOT NULL,
  seal_json jsonb NOT NULL,
  supersession_json jsonb NOT NULL,
  sealed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsr_remedy_closure_distinct_decisions_ck
    CHECK (original_warden_decision_ref <> remedy_warden_decision_ref),
  CONSTRAINT vsr_remedy_closure_distinct_correlations_ck
    CHECK (parent_correlation_id <> remedy_correlation_id),
  CONSTRAINT vsr_remedy_closure_seal_state_ck
    CHECK (seal_json ->> 'state' = 'SEALED'),
  CONSTRAINT vsr_remedy_closure_supersession_state_ck
    CHECK (supersession_json ->> 'state' = 'RESOLVED_APPEND_ONLY')
);

CREATE INDEX IF NOT EXISTS vsr_remedy_closure_parent_correlation_idx
  ON vsr_remedy_closure_ledger (parent_correlation_id);

CREATE INDEX IF NOT EXISTS vsr_remedy_closure_remedy_correlation_idx
  ON vsr_remedy_closure_ledger (remedy_correlation_id);

CREATE INDEX IF NOT EXISTS vsr_remedy_closure_original_execution_idx
  ON vsr_remedy_closure_ledger (original_execution_receipt_ref);
