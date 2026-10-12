#!/usr/bin/env bash
# R1.4: real PostgreSQL conformance in a disposable GitHub Actions service only.
set -euo pipefail

PG_CONTAINER="${1:?Expected ephemeral GitHub Actions PostgreSQL service container ID}"
[[ "$PG_CONTAINER" =~ ^[a-f0-9]{12,64}$ ]] || { echo "Invalid CI service container identifier"; exit 2; }
command -v docker >/dev/null
psql_ci() {
  docker exec -i --user postgres "$PG_CONTAINER" \
    psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}
table="authority_reference_r13_nonce_ledger"
namespace="AUTHORITY_REFERENCE_STAGING_R13"
tenant="sha256:$(printf 'a%.0s' {1..64})"
tenant2="sha256:$(printf 'b%.0s' {1..64})"
nonce="sha256:$(printf 'c%.0s' {1..64})"
nonce2="sha256:$(printf 'd%.0s' {1..64})"
request="sha256:$(printf 'e%.0s' {1..64})"
request2="sha256:$(printf 'f%.0s' {1..64})"
worker="sha256:$(printf '1%.0s' {1..64})"
role="authority_reference_r14_runtime"

echo "[R1.4] Applying migration ONLY to ephemeral CI PostgreSQL"
psql_ci < schemas/authority-reference-r13-ledger.sql
psql_ci <<'SQL'
REVOKE ALL ON TABLE authority_reference_r13_nonce_ledger FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE authority_reference_r14_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA public TO authority_reference_r14_runtime;
GRANT INSERT ON TABLE authority_reference_r13_nonce_ledger TO authority_reference_r14_runtime;
GRANT SELECT (ledger_namespace, tenant_digest, nonce_digest, request_digest, worker_digest, state)
  ON TABLE authority_reference_r13_nonce_ledger TO authority_reference_r14_runtime;
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
  WHERE conrelid = 'public.authority_reference_r13_nonce_ledger'::regclass
    AND conname IN ('authority_reference_r13_nonce_pk','authority_reference_r13_request_once')
    AND contype IN ('p','u');
  IF n <> 2 THEN RAISE EXCEPTION 'R1.4 expected PK and request UNIQUE constraints, got %', n; END IF;
  IF NOT has_table_privilege('authority_reference_r14_runtime',
     'authority_reference_r13_nonce_ledger','INSERT') THEN
      RAISE EXCEPTION 'R1.4 INSERT grant missing'; END IF;
  IF has_table_privilege('authority_reference_r14_runtime',
     'authority_reference_r13_nonce_ledger','UPDATE')
     OR has_table_privilege('authority_reference_r14_runtime',
     'authority_reference_r13_nonce_ledger','DELETE')
     OR has_table_privilege('authority_reference_r14_runtime',
     'authority_reference_r13_nonce_ledger','TRUNCATE')
     OR has_table_privilege('authority_reference_r14_runtime',
     'authority_reference_r13_nonce_ledger','REFERENCES')
     OR has_table_privilege('authority_reference_r14_runtime',
     'authority_reference_r13_nonce_ledger','TRIGGER')
  THEN RAISE EXCEPTION 'R1.4 privilege expansion detected'; END IF;
  IF pg_has_role('authority_reference_r14_runtime','pg_write_all_data','MEMBER')
     OR pg_has_role('authority_reference_r14_runtime','pg_read_all_data','MEMBER') THEN
      RAISE EXCEPTION 'R1.4 privileged role membership'; END IF;
END$$;
SQL

# Separate PostgreSQL sessions, not an in-memory model.
claim_sql() {
  local the_tenant="$1" the_nonce="$2" the_request="$3"
  cat <<SQL
SET ROLE authority_reference_r14_runtime;
WITH claim AS (
  INSERT INTO ${table} (ledger_namespace,tenant_digest,nonce_digest,request_digest,worker_digest)
  VALUES ('${namespace}','${the_tenant}','${the_nonce}','${the_request}','${worker}')
  ON CONFLICT DO NOTHING RETURNING nonce_digest
) SELECT count(*) FROM claim;
SQL
}
run_claim() { claim_sql "$@" | psql_ci; }

echo "[R1.4] Running 12 competing PostgreSQL connections"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pids=()
for i in $(seq 1 12); do
  (run_claim "$tenant" "$nonce" "$request" > "$tmp/claim-$i") &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
successes="$(grep -l '^1$' "$tmp"/claim-* | wc -l | tr -d ' ')"
duplicates="$(grep -l '^0$' "$tmp"/claim-* | wc -l | tr -d ' ')"
[[ "$successes" == 1 && "$duplicates" == 11 ]] || {
  echo "Expected 1 insert and 11 conflicts; got inserts=$successes conflicts=$duplicates"; exit 1;
}
echo "[R1.4] 12 concurrent connections: 1 insert, 11 rejected"

assert_claim() {
  local expected="$1"; shift
  local result
  result="$(run_claim "$@" | tr -d '\r\n[:space:]')"
  [[ "$result" == "$expected" ]] || { echo "Expected count $expected, received $result"; exit 1; }
}
assert_claim 0 "$tenant" "$nonce" "$request2"  # same nonce / different request
assert_claim 0 "$tenant" "$nonce2" "$request"  # new nonce / same request
assert_claim 1 "$tenant2" "$nonce" "$request"  # second tenant independent
assert_claim 0 "$tenant2" "$nonce" "$request"  # second tenant replay

echo "[R1.4] Verifying denied mutations for bounded runtime role"
for sql in \
  "UPDATE $table SET request_digest='$request2' WHERE 1=1;" \
  "DELETE FROM $table;" \
  "TRUNCATE TABLE $table;" \
  "ALTER TABLE $table DROP CONSTRAINT authority_reference_r13_request_once;" \
  "DROP TABLE $table;"
do
  if printf 'SET ROLE %s;\n%s\n' "$role" "$sql" | psql_ci > "$tmp/forbidden" 2>&1; then
    echo "DANGER: runtime role unexpectedly executed forbidden operation"; exit 1
  fi
  grep -Eqi 'permission denied|must be owner|not owner' "$tmp/forbidden" || {
    echo "Unexpected forbidden-operation failure"; cat "$tmp/forbidden"; exit 1;
  }
done
echo "[R1.4] UPDATE/DELETE/TRUNCATE/ALTER/DROP rejected"

echo "[R1.4] Verify database CHECK constraints reject invalid rows"
for sql in \
  "INSERT INTO $table (ledger_namespace,tenant_digest,nonce_digest,request_digest,worker_digest) VALUES ('PRODUCTION','$tenant','$nonce2','$request2','$worker');" \
  "INSERT INTO $table (ledger_namespace,tenant_digest,nonce_digest,request_digest,worker_digest) VALUES ('$namespace','WRONG','$nonce2','$request2','$worker');"
do
  if printf '%s\n' "$sql" | psql_ci > "$tmp/invalid" 2>&1; then
    echo "DANGER: invalid schema row inserted"; exit 1
  fi
  grep -qi 'violates check constraint' "$tmp/invalid" || {
    echo "Unexpected CHECK failure"; cat "$tmp/invalid"; exit 1
  }
done
count="$(printf 'SELECT count(*) FROM %s;\n' "$table" | psql_ci | tr -d '\r\n[:space:]')"
[[ "$count" == 2 ]] || { echo "Unexpected final row count $count"; exit 1; }
echo "[R1.4] PASS: real ephemeral PostgreSQL; 2 rows, no replay, bounded runtime role"
