-- B-010 provider-neutral Postgres durable replay/idempotency journal.
-- This schema creates storage capability only; it does not grant Warden authority or activate a destination site.

CREATE TABLE IF NOT EXISTS vsr_handoff_execution_journal (
  nonce text PRIMARY KEY,
  handoff_ref text NOT NULL,
  token_digest text NOT NULL,
  state text NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  expires_at_ms bigint NOT NULL,
  started_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  completed_at_ms bigint,
  failed_at_ms bigint,
  failure_reason text,
  result_json jsonb,
  CONSTRAINT vsr_handoff_execution_result_state_ck CHECK (
    (state = 'COMPLETED' AND result_json IS NOT NULL AND completed_at_ms IS NOT NULL)
    OR (state = 'FAILED' AND failure_reason IS NOT NULL AND failed_at_ms IS NOT NULL)
    OR (state = 'IN_PROGRESS' AND result_json IS NULL AND failure_reason IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_handoff_execution_token_digest_uq
  ON vsr_handoff_execution_journal (token_digest);

CREATE INDEX IF NOT EXISTS vsr_handoff_execution_expires_idx
  ON vsr_handoff_execution_journal (expires_at_ms);
