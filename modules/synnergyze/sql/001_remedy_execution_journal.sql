CREATE TABLE IF NOT EXISTS vsr_remedy_execution_journal (
  authorization_ref text PRIMARY KEY,
  execution_fingerprint text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  expires_at_ms bigint NOT NULL,
  started_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  completed_at_ms bigint,
  failed_at_ms bigint,
  failure_reason text,
  receipt_json jsonb,
  CHECK (
    (state = 'IN_PROGRESS' AND receipt_json IS NULL AND failure_reason IS NULL) OR
    (state = 'COMPLETED' AND receipt_json IS NOT NULL AND failure_reason IS NULL) OR
    (state = 'FAILED' AND receipt_json IS NULL AND failure_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_remedy_execution_fingerprint_uq
  ON vsr_remedy_execution_journal (execution_fingerprint);
