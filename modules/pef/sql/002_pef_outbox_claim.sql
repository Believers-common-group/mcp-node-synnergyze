-- Workers claim unpublished rows inside a database transaction.
-- FOR UPDATE SKIP LOCKED prevents concurrent workers from claiming the same row.
SELECT outbox_id, event_id, topic, payload, created_at, published_at
FROM pef_outbox
WHERE published_at IS NULL
ORDER BY created_at, outbox_id
FOR UPDATE SKIP LOCKED
LIMIT 100;
