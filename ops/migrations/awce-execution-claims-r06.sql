-- AWCE R0.6 DRAFT migration. CI-only until independently reviewed.
-- Uses an already-reviewed 'awce' schema; do not apply to production by default.
BEGIN;
CREATE SCHEMA IF NOT EXISTS awce;
CREATE TABLE IF NOT EXISTS awce.execution_claims (
  principal_id text NOT NULL CHECK (length(principal_id) BETWEEN 1 AND 256),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 256),
  capability text NOT NULL CHECK (length(capability) BETWEEN 1 AND 256),
  input_digest text NOT NULL CHECK (length(input_digest) BETWEEN 1 AND 256),
  status text NOT NULL DEFAULT 'CLAIMED' CHECK (status IN ('CLAIMED','COMPLETED')),
  receipt_id text,
  executor_id text,
  reservation_id text,
  output_digest text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (principal_id, request_id),
  CONSTRAINT awce_claim_completion_coherent CHECK (
    (status = 'CLAIMED' AND receipt_id IS NULL AND executor_id IS NULL
      AND reservation_id IS NULL AND output_digest IS NULL AND completed_at IS NULL)
    OR
    (status = 'COMPLETED' AND receipt_id IS NOT NULL AND executor_id IS NOT NULL
      AND reservation_id IS NOT NULL AND output_digest IS NOT NULL AND completed_at IS NOT NULL)
  )
);
-- No trigger permits mutable operations once completed, or altered request bindings.
CREATE OR REPLACE FUNCTION awce.guard_execution_claim_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'COMPLETED'
    OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.capability IS DISTINCT FROM OLD.capability
    OR NEW.input_digest IS DISTINCT FROM OLD.input_digest
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.status <> 'COMPLETED'
    OR NEW.receipt_id IS NULL OR NEW.executor_id IS NULL
    OR NEW.reservation_id IS NULL OR NEW.output_digest IS NULL
    OR NEW.completed_at IS NULL
  THEN
    RAISE EXCEPTION 'AWCE_CLAIM_IMMUTABILITY_VIOLATION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS awce_claim_transition_guard ON awce.execution_claims;
CREATE TRIGGER awce_claim_transition_guard
BEFORE UPDATE ON awce.execution_claims
FOR EACH ROW EXECUTE FUNCTION awce.guard_execution_claim_transition();
COMMIT;

-- CI runtime role: GRANT USAGE ON SCHEMA awce; SELECT, INSERT, UPDATE on
-- awce.execution_claims only. Never GRANT DELETE, TRUNCATE, DDL or admin role.
