-- AWCE R0.4: reviewed migration DRAFT, not applied.
-- Requires a dedicated estate-owned PostgreSQL instance with tightly scoped
-- application privileges. Run manually only after security and backup review.
BEGIN;
CREATE SCHEMA IF NOT EXISTS awce;
CREATE TABLE IF NOT EXISTS awce.breaker_state (
  circuit_key text PRIMARY KEY,
  state jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT awce_breaker_key_nonblank CHECK (
    length(circuit_key) > 0 AND length(circuit_key) <= 1000
  ),
  CONSTRAINT awce_breaker_revision_nonnegative CHECK (revision >= 0),
  CONSTRAINT awce_breaker_state_object CHECK (
    jsonb_typeof(state) = 'object'
    AND state->>'phase' IN ('CLOSED', 'OPEN', 'HALF_OPEN')
  )
);
COMMIT;

-- Grant SELECT, INSERT, UPDATE only to the reviewed AWCE runtime role.
-- Do not grant DELETE, CREATE, broad schema DDL or superuser privileges.
-- The repository does not embed credentials, connection strings or grants.
