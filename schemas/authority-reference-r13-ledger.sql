-- AUTHORITY-REFERENCE-R13 / STAGING_ONLY
-- REVIEW ARTEFACT: never run automatically. Requires separate change approval.
-- PostgreSQL schema: append-only one-shot reservations, not production authority.
-- Trusted database roles must not be granted UPDATE/DELETE/TRUNCATE or DDL on this table.
-- Operator must independently bind tenant/ARK/Door scope in the Warden admission plane.

CREATE TABLE IF NOT EXISTS authority_reference_r13_nonce_ledger (
  ledger_namespace text NOT NULL
    CONSTRAINT r13_namespace_fixed CHECK (ledger_namespace = 'AUTHORITY_REFERENCE_STAGING_R13'),
  tenant_digest text NOT NULL
    CONSTRAINT r13_tenant_hash CHECK (tenant_digest ~ '^sha256:[0-9a-f]{64}$'),
  nonce_digest text NOT NULL
    CONSTRAINT r13_nonce_hash CHECK (nonce_digest ~ '^sha256:[0-9a-f]{64}$'),
  request_digest text NOT NULL
    CONSTRAINT r13_request_hash CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  worker_digest text NOT NULL
    CONSTRAINT r13_worker_hash CHECK (worker_digest ~ '^sha256:[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'SPENT_OFFLINE_STAGING'
    CONSTRAINT r13_state_fixed CHECK (state = 'SPENT_OFFLINE_STAGING'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT authority_reference_r13_nonce_pk
    PRIMARY KEY (ledger_namespace, tenant_digest, nonce_digest),
  CONSTRAINT authority_reference_r13_request_once
    UNIQUE (ledger_namespace, tenant_digest, request_digest)
);

-- No RESET / UPSERT / ON CONFLICT DO UPDATE facility is defined.
-- Partitioning or retention/expiry is NOT approved: dropping records can reopen replay.
-- Strict database privileges, backups, auditing and availability remain deployment gates.
