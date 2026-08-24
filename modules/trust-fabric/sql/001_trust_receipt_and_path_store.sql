CREATE TABLE IF NOT EXISTS vsr_trust_receipts (
  receipt_ref text PRIMARY KEY,
  receipt_type text NOT NULL,
  subject_ref text NOT NULL,
  object_ref text,
  relationship_ref text,
  issuer_ref text NOT NULL,
  verifier_ref text NOT NULL,
  claim jsonb NOT NULL,
  assurance jsonb NOT NULL,
  policy_ref text NOT NULL,
  evidence_refs jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  supersedes_receipt_ref text REFERENCES vsr_trust_receipts(receipt_ref),
  disclosure_policy_ref text,
  river_event_ref text NOT NULL,
  receipt_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsr_trust_receipts_validity_ck
    CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT vsr_trust_receipts_evidence_refs_array_ck
    CHECK (jsonb_typeof(evidence_refs) = 'array'),
  CONSTRAINT vsr_trust_receipts_no_self_supersession_ck
    CHECK (supersedes_receipt_ref IS NULL OR supersedes_receipt_ref <> receipt_ref)
);

CREATE INDEX IF NOT EXISTS vsr_trust_receipts_subject_idx
  ON vsr_trust_receipts (subject_ref, receipt_type);

CREATE INDEX IF NOT EXISTS vsr_trust_receipts_issuer_idx
  ON vsr_trust_receipts (issuer_ref, issued_at DESC);

CREATE INDEX IF NOT EXISTS vsr_trust_receipts_supersedes_idx
  ON vsr_trust_receipts (supersedes_receipt_ref)
  WHERE supersedes_receipt_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS vsr_trust_receipt_status_events (
  status_event_ref text PRIMARY KEY,
  receipt_ref text NOT NULL REFERENCES vsr_trust_receipts(receipt_ref),
  status text NOT NULL,
  reason_code text,
  effective_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  issuer_ref text NOT NULL,
  verifier_ref text,
  superseding_receipt_ref text REFERENCES vsr_trust_receipts(receipt_ref),
  evidence_refs jsonb NOT NULL,
  river_event_ref text NOT NULL,
  status_event_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsr_trust_receipt_status_values_ck
    CHECK (status IN (
      'CURRENT',
      'SUPERSEDED',
      'REVOKED',
      'EXPIRED',
      'SUSPENDED',
      'DISPUTED',
      'COMPROMISED',
      'UNKNOWN'
    )),
  CONSTRAINT vsr_trust_receipt_status_evidence_refs_array_ck
    CHECK (jsonb_typeof(evidence_refs) = 'array'),
  CONSTRAINT vsr_trust_receipt_status_time_ck
    CHECK (observed_at >= effective_at OR status = 'UNKNOWN')
);

CREATE INDEX IF NOT EXISTS vsr_trust_receipt_status_receipt_idx
  ON vsr_trust_receipt_status_events (receipt_ref, effective_at DESC, observed_at DESC);

CREATE TABLE IF NOT EXISTS vsr_trust_paths (
  trust_path_ref text PRIMARY KEY,
  resolution_ref text NOT NULL UNIQUE,
  action_ref text NOT NULL,
  intended_effect jsonb NOT NULL,
  requirement_set_ref text,
  required_assurance jsonb NOT NULL,
  observed_assurance jsonb NOT NULL,
  required_max_age_seconds jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_age_seconds jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_receipt_refs jsonb NOT NULL,
  selected_assurance_statement_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  result text NOT NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  material boolean NOT NULL,
  irreversible_effect boolean NOT NULL,
  policy_ref text NOT NULL,
  resolved_at timestamptz NOT NULL,
  valid_until timestamptz,
  river_event_ref text NOT NULL,
  trust_path_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vsr_trust_paths_result_values_ck
    CHECK (result IN (
      'SATISFIED',
      'HOLD',
      'DENIED',
      'CONFLICTED',
      'REQUIRES_STEP_UP',
      'REQUIRES_ADJUDICATION'
    )),
  CONSTRAINT vsr_trust_paths_selected_receipts_array_ck
    CHECK (jsonb_typeof(selected_receipt_refs) = 'array'),
  CONSTRAINT vsr_trust_paths_assurance_statements_array_ck
    CHECK (jsonb_typeof(selected_assurance_statement_refs) = 'array'),
  CONSTRAINT vsr_trust_paths_reason_codes_array_ck
    CHECK (jsonb_typeof(reason_codes) = 'array'),
  CONSTRAINT vsr_trust_paths_validity_ck
    CHECK (valid_until IS NULL OR valid_until >= resolved_at)
);

CREATE INDEX IF NOT EXISTS vsr_trust_paths_action_idx
  ON vsr_trust_paths (action_ref, resolved_at DESC);

CREATE INDEX IF NOT EXISTS vsr_trust_paths_policy_idx
  ON vsr_trust_paths (policy_ref, resolved_at DESC);

DROP FUNCTION IF EXISTS vsr_trust_fabric_reject_mutation() CASCADE;
CREATE FUNCTION vsr_trust_fabric_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'trust_fabric_append_only_violation:%', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS vsr_trust_receipts_append_only ON vsr_trust_receipts;
CREATE TRIGGER vsr_trust_receipts_append_only
BEFORE UPDATE OR DELETE ON vsr_trust_receipts
FOR EACH ROW EXECUTE FUNCTION vsr_trust_fabric_reject_mutation();

DROP TRIGGER IF EXISTS vsr_trust_receipt_status_events_append_only ON vsr_trust_receipt_status_events;
CREATE TRIGGER vsr_trust_receipt_status_events_append_only
BEFORE UPDATE OR DELETE ON vsr_trust_receipt_status_events
FOR EACH ROW EXECUTE FUNCTION vsr_trust_fabric_reject_mutation();

DROP TRIGGER IF EXISTS vsr_trust_paths_append_only ON vsr_trust_paths;
CREATE TRIGGER vsr_trust_paths_append_only
BEFORE UPDATE OR DELETE ON vsr_trust_paths
FOR EACH ROW EXECUTE FUNCTION vsr_trust_fabric_reject_mutation();
