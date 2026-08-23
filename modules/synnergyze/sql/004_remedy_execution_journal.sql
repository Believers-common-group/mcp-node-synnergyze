-- WARDEN Remedy Fabric 1.1
-- Contract-only migration. This PR does not apply it to any live database.

CREATE TABLE IF NOT EXISTS vsr_remedy_execution_journal (
  authorization_ref TEXT PRIMARY KEY,
  execution_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  expires_at_ms BIGINT NOT NULL,
  started_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  completed_at_ms BIGINT,
  failed_at_ms BIGINT,
  failure_reason TEXT,
  receipt_json JSONB,
  CHECK (
    (state = 'COMPLETED' AND receipt_json IS NOT NULL AND completed_at_ms IS NOT NULL)
    OR state <> 'COMPLETED'
  ),
  CHECK (
    (state = 'FAILED' AND failure_reason IS NOT NULL AND failed_at_ms IS NOT NULL)
    OR state <> 'FAILED'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vsr_remedy_execution_journal_fingerprint_uq
  ON vsr_remedy_execution_journal (execution_fingerprint);
