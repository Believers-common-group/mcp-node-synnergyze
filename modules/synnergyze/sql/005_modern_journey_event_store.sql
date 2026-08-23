CREATE TABLE IF NOT EXISTS vsr_modern_journey_events (
  event_ref text PRIMARY KEY,
  transaction_ref text NOT NULL,
  journey_ref text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  predecessor_event_ref text REFERENCES vsr_modern_journey_events(event_ref),
  correlation_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'TRANSACTION_OPENED',
    'RESOURCE_RESERVED',
    'PROVIDER_EXECUTION_FAILED',
    'RESOURCE_RELEASED',
    'FALLBACK_AUTHORIZED',
    'FALLBACK_RESOURCE_RESERVED',
    'PROVIDER_EXECUTED_UNVERIFIED',
    'ECONOMIC_EVENT_RECORDED',
    'OBLIGATION_CREATED',
    'EFFECT_VERIFIED',
    'TRANSACTION_CLOSED'
  )),
  occurred_at timestamptz NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest LIKE 'sha256:%'),
  idempotency_key text NOT NULL UNIQUE,
  event_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_ref, sequence),
  CHECK (correlation_id = transaction_ref),
  CHECK ((sequence = 1 AND predecessor_event_ref IS NULL) OR sequence > 1)
);

CREATE INDEX IF NOT EXISTS vsr_modern_journey_events_transaction_sequence_idx
  ON vsr_modern_journey_events(transaction_ref, sequence);
