# AWCE R0.5 — Disposable PostgreSQL Integration Gate

**Scope:** GitHub-hosted, ephemeral CI only. No production database, MCP endpoint, Warden service, River service, or personal/estate workstation access.

## Dependency order

Deployment-contract draft PR #144 → governed-router draft PR #145 → circuit-breaker draft PR #146 → durable-adapter draft PR #147 → **this R0.5 integration draft**.

## What the CI gate runs

The workflow `.github/workflows/awce-postgres-integration.yml` creates a **disposable PostgreSQL 16 service container** in the GitHub Actions runner. Its static, synthetic credentials are confined to that disposable runner and are not production secrets.

The script `ops/integration/pg/integration.mjs` executes the existing migration from `ops/migrations/awce-breaker-state-r04.sql` **in CI only**, then creates a limited role with `USAGE` on schema `awce` and `SELECT, INSERT, UPDATE` on the single breaker-state table. It deliberately verifies that the runtime role cannot create a table.

The integration checks:
1. Real PostgreSQL migrations and least-privileged role access.
2. Concurrent SERIALIZABLE transactions from independent connections; state is preserved and visible to a later client.
3. Single recovery lease across concurrent workers.
4. Rollback on transition failure, no false success and no residual row.
5. Parameterized SQL protects circuit keys against injection.
6. R0.3 health adapter's real PostgreSQL-backed state transitions, without admitting an unadmitted executor.
7. R0.2 router composition with real PostgreSQL health state and synthetic-only Warden decisions, River reservations/receipts and in-memory idempotency.

The integration script checks `CI=true` and `AWCE_CI_ISOLATED=true`, along with exact **disposable-only** test credentials, before any database write. The CI workflow does not use repository secrets.

## Limits / release prohibitions

- The route test's Warden signature flag and River receipt flag are **synthetic stubs**, not cryptographic authority or real evidence.
- The actual PG driver is installed **only under** `ops/integration/pg`, not into the live MCP executable or its package manifests. No live runtime wiring was added.
- No live MCP probe is made. The authenticated HTTP probe from R0.4 remains unconnected and network egress is not configured.
- The demonstration uses an in-memory idempotency stub; a durable idempotency ledger is still required before any real executor invocation.
- This CI demonstration does not establish the safety of simultaneous worker launch, host failover, clock-drift limits, production DNS/egress, real Warden signatures or authentic River receipts.
- The isolated PG test dependency is version-pinned at the direct package level; transitive dependency lockfile generation and supply-chain hardening remain a separate release requirement.
- The runner's ephemeral PostgreSQL state is destroyed after the CI job.

**Do not merge, run production migrations, provision real credentials, or activate MCP routing on the basis of this test alone.**
