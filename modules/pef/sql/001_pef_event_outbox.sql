BEGIN;

CREATE TABLE IF NOT EXISTS pef_event (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  assertion_type TEXT NOT NULL CHECK (assertion_type IN (
    'physical_observation','derived_fact','inference','authority','execution','effect','exception','reconciliation','compensation'
  )),
  assurance TEXT NOT NULL CHECK (assurance IN ('A0','A1','A2','A3','A4')),
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  producer_id TEXT NOT NULL,
  producer_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  source_event_id TEXT NULL,
  predecessor_event_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pef_outbox (
  outbox_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES pef_event(event_id),
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS pef_outbox_unpublished_idx
  ON pef_outbox (created_at, outbox_id)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS pef_consumer_checkpoint (
  consumer_name TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES pef_event(event_id),
  processed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (consumer_name, event_id)
);

CREATE OR REPLACE FUNCTION pef_event_append_only_guard()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PEF_EVENT_APPEND_ONLY_%_FORBIDDEN', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pef_event_no_update ON pef_event;
CREATE TRIGGER pef_event_no_update
BEFORE UPDATE ON pef_event
FOR EACH ROW EXECUTE FUNCTION pef_event_append_only_guard();

DROP TRIGGER IF EXISTS pef_event_no_delete ON pef_event;
CREATE TRIGGER pef_event_no_delete
BEFORE DELETE ON pef_event
FOR EACH ROW EXECUTE FUNCTION pef_event_append_only_guard();

COMMIT;
