-- PROVIDER-AMAZON-REGISTRY-POSTGRES-001
-- Apply only to the canonical Alpha local Registry database where `uoe_master`
-- already exists. This migration deliberately does NOT create `uoe_master`.
-- If the target is not the Registry database, fail rather than create a shadow Registry.

CREATE TABLE IF NOT EXISTS uoe_master.amazon_order_projection (
  provider_order_id text PRIMARY KEY,
  order_ref text NOT NULL UNIQUE,
  provider_ref text NOT NULL CHECK (provider_ref = 'PROVIDER-AMAZON-001'),
  marketplace_id text,
  marketplace_name text,
  channel_name text,
  created_time timestamptz,
  last_updated_time timestamptz,
  fulfillment_status text,
  fulfilled_by text,
  quantity_fulfilled integer,
  quantity_unfulfilled integer,
  proceeds_amount text,
  proceeds_currency text,
  provider_response_digest text NOT NULL,
  provider_evidence_ref text NOT NULL,
  correlation_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  pii_projected boolean NOT NULL DEFAULT false CHECK (pii_projected = false),
  registry_revision_ref text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amazon_order_projection_correlation_idx
  ON uoe_master.amazon_order_projection (correlation_id);

CREATE INDEX IF NOT EXISTS amazon_order_projection_observed_idx
  ON uoe_master.amazon_order_projection (observed_at DESC);

CREATE INDEX IF NOT EXISTS amazon_order_projection_marketplace_idx
  ON uoe_master.amazon_order_projection (marketplace_id, last_updated_time DESC);

CREATE TABLE IF NOT EXISTS uoe_master.amazon_order_projection_revision (
  registry_revision_ref text PRIMARY KEY,
  provider_ref text NOT NULL CHECK (provider_ref = 'PROVIDER-AMAZON-001'),
  order_refs jsonb NOT NULL CHECK (jsonb_typeof(order_refs) = 'array'),
  provider_evidence_refs jsonb NOT NULL CHECK (jsonb_typeof(provider_evidence_refs) = 'array'),
  correlation_refs jsonb NOT NULL CHECK (jsonb_typeof(correlation_refs) = 'array'),
  observed_from timestamptz,
  observed_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE uoe_master.amazon_order_projection IS
  'Non-PII Amazon Orders provider projection. Provider state only; it does not grant authority or settlement finality.';

COMMENT ON TABLE uoe_master.amazon_order_projection_revision IS
  'Deterministic revision receipts for Amazon Orders projection batches. Not a River seal and not SILK settlement finality.';
