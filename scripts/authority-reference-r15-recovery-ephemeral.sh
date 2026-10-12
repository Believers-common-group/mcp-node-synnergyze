#!/usr/bin/env bash
# R1.5: disposable PostgreSQL restart/restore and replay preservation checks.
# Never points at an external database. The caller must supply a GitHub Actions
# service-container ID. No persistent cloud credentials or operations.
set -euo pipefail
PG_CONTAINER="${1:?Provide disposable GitHub Actions PostgreSQL service container ID}"
[[ "$PG_CONTAINER" =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Invalid CI service container ID'; exit 2; }
command -v docker >/dev/null
psql_in() {
  local container="$1"; shift
  docker exec -i --user postgres "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}
sql="authority_reference_r13_nonce_ledger"
query_rows="SELECT concat_ws('|',ledger_namespace,tenant_digest,nonce_digest,request_digest,worker_digest,state) FROM $sql ORDER BY ledger_namespace,tenant_digest,nonce_digest;"
identifier() {
  printf 'SELECT system_identifier::text FROM pg_control_system();\n' | psql_in "$1" | tr -d '\r\n[:space:]'
}
fingerprint() {
  printf '%s\n' "$query_rows" | psql_in "$1" | sha256sum | cut -d ' ' -f 1
}
count_rows() {
  printf 'SELECT count(*) FROM %s;\n' "$sql" | psql_in "$1" | tr -d '\r\n[:space:]'
}
claim() {
  local container="$1" tenant="$2" nonce="$3" request="$4"
  cat <<SQL | psql_in "$container" | tr -d '\r\n[:space:]'
SET ROLE authority_reference_r14_runtime;
WITH reservation AS (
  INSERT INTO $sql (ledger_namespace,tenant_digest,nonce_digest,request_digest,worker_digest)
  VALUES ('AUTHORITY_REFERENCE_STAGING_R13','$tenant','$nonce','$request','sha256:1111111111111111111111111111111111111111111111111111111111111111')
  ON CONFLICT DO NOTHING RETURNING nonce_digest
)
SELECT count(*) FROM reservation;
SQL
}
assert_eq() {
  if [[ "$1" != "$2" ]]; then printf 'R1.5 check failed: %s (wanted %s, got %s)\n' "$3" "$2" "$1"; exit 1; fi
}
tenant="sha256:$(printf 'a%.0s' {1..64})"
nonce="sha256:$(printf 'c%.0s' {1..64})"
request="sha256:$(printf 'e%.0s' {1..64})"
othernonce="sha256:$(printf 'd%.0s' {1..64})"
otherrequest="sha256:$(printf 'f%.0s' {1..64})"

# R1.4 uses this same schema and sets up exactly two synthetic spent rows.
bash scripts/authority-reference-r14-postgres-ephemeral.sh "$PG_CONTAINER"
before_cluster="$(identifier "$PG_CONTAINER")"
before_hash="$(fingerprint "$PG_CONTAINER")"
assert_eq "$(count_rows "$PG_CONTAINER")" 2 'seed row count'
[[ "$before_cluster" =~ ^[0-9]+$ && "$before_hash" =~ ^[0-9a-f]{64}$ ]] || exit 1

tmp="$(mktemp -d)"
restore_container="r15-restore-${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() {
  docker rm -f "$restore_container" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
docker exec "$PG_CONTAINER" pg_dump -U postgres -d postgres --data-only --no-owner --no-acl \
  --table=public.authority_reference_r13_nonce_ledger > "$tmp/data.sql"
test -s "$tmp/data.sql"
echo "[R1.5] Captured offline synthetic data snapshot before interruption"

# Restart the SAME database container using the same disposable storage.
docker restart "$PG_CONTAINER" >/dev/null
for i in $(seq 1 30); do
  if docker exec "$PG_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
assert_eq "$(identifier "$PG_CONTAINER")" "$before_cluster" 'restart cluster system_identifier'
assert_eq "$(fingerprint "$PG_CONTAINER")" "$before_hash" 'restart logical row fingerprint'
assert_eq "$(count_rows "$PG_CONTAINER")" 2 'restart spent rows'
assert_eq "$(claim "$PG_CONTAINER" "$tenant" "$nonce" "$otherrequest")" 0 'restart nonce replay'
assert_eq "$(claim "$PG_CONTAINER" "$tenant" "$othernonce" "$request")" 0 'restart request replay'
echo "[R1.5] Restart verified: same cluster, same rows, replay rejected"

# Start a DIFFERENT disposable DB cluster, not the service, with no external port.
docker run -d --name "$restore_container" -e POSTGRES_PASSWORD=r15-fixture-only \
  -e POSTGRES_DB=postgres postgres:16 >/dev/null
for i in $(seq 1 30); do
  if docker exec "$restore_container" pg_isready -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
psql_in "$restore_container" < schemas/authority-reference-r13-ledger.sql
psql_in "$restore_container" < "$tmp/data.sql"
restored_cluster="$(identifier "$restore_container")"
[[ "$restored_cluster" =~ ^[0-9]+$ && "$restored_cluster" != "$before_cluster" ]] || {
  echo 'Expected restored DB to have DIFFERENT cluster identifier'; exit 1;
}
assert_eq "$(fingerprint "$restore_container")" "$before_hash" 'restore logical row fingerprint'
assert_eq "$(count_rows "$restore_container")" 2 'restored spent rows'
# Separate cluster requires explicit re-pinning/commissioning; test replay without
# relying on a privileged caller or creating a production permit.
cat <<SQL | psql_in "$restore_container"
CREATE ROLE authority_reference_r14_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA public TO authority_reference_r14_runtime;
GRANT INSERT ON TABLE $sql TO authority_reference_r14_runtime;
GRANT SELECT (ledger_namespace,tenant_digest,nonce_digest,request_digest,worker_digest,state) ON TABLE $sql TO authority_reference_r14_runtime;
SQL
assert_eq "$(claim "$restore_container" "$tenant" "$nonce" "$otherrequest")" 0 'restored nonce replay'
assert_eq "$(claim "$restore_container" "$tenant" "$othernonce" "$request")" 0 'restored request replay'
echo "[R1.5] Restore verified: NEW cluster identity, equal rows, replay denied"
echo "[R1.5] Audit candidate: sha256:$before_hash rows=2 (UNANCHORED)"
echo "[R1.5] PASS: ephemeral restart/restore; NO external anchoring or authorisation"
