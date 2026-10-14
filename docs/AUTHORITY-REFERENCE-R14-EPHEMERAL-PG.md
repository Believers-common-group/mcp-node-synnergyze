# Authority Reference R1.4 — Real, Disposable PostgreSQL Conformance

**Staging evidence only. No production database changes, migrations, Warden admission or worker execution.**

## What changed
- Added `scripts/authority-reference-r14-postgres-ephemeral.sh`: a fail-closed shell integration harness which accepts **only a GitHub Actions service-container ID**, loads the R1.3 SQL schema into that disposable PostgreSQL container, grants a dedicated limited test role `authority_reference_r14_runtime`, and validates physical database constraints and privileges.
- Added `.github/workflows/authority-reference-r14-postgres.yml`: GitHub-hosted ephemeral `postgres:16` service, no DB credentials from connected systems, no production network endpoints, no project deployment.
- The R1.3 schema remains a **review artifact only** for any persistent database. This R1.4 workflow applies it only to a throwaway CI service.
- The role is NOLOGIN and NOREPLICATION; it can INSERT and SELECT the minimal RETURNING columns, but must not UPDATE, DELETE, TRUNCATE, ALTER or DROP the protected ledger.

## Real database checks
1. PostgreSQL system catalogs contain the nonce primary key and separate request uniqueness constraint.
2. Twelve independent PostgreSQL sessions race to submit an identical tenant + nonce + request; expected **one insert and eleven rejected duplicates**.
3. Same nonce with changed request and same request with changed nonce are both rejected.
4. Different tenant scopes do not collide; replay within that separate tenant still fails.
5. The limited role cannot UPDATE, DELETE, TRUNCATE, ALTER or DROP ledger data/schema.
6. CHECK constraints reject a non-staging namespace and malformed digest; final valid row count is exactly two.

This is genuine PostgreSQL transaction/constraint testing inside GitHub Actions, not an in-memory simulation. It is **not** multi-host production proof: connections share one disposable database server and no infrastructure loss, failover, replication, privileged-administrator tampering or real Warden-issued permits are tested.

## Invocation

The CI workflow injects the container ID as `R14_PG_CONTAINER`. Do not point it at an existing user-run database or host and do not use connected database credentials. The script runs all DDL only against a fresh throwaway container.

## Limits

- No authorised DigitalMe principal, verified BNR Door membership, Genesis capacity, Warden production signer or RiverOS live receipt.
- No signed provenance of the deployed worker or cryptographically authenticated database observation.
- No deployed distributed permit service. The reserved rows are labelled `SPENT_OFFLINE_STAGING`; observing one does not constitute permission to execute.
- No migration to Neon, Supabase or any registered cloud account, no Vercel deployment and no production API change.
- The current R1.3 DDL must undergo formal migration and privilege review before persistent staging adoption. Privileged operators with DDL can still tamper with a bare database unless evidence is independently anchored.

**Release decision: HOLD.** Commit/review CI evidence; do not merge as authority, deploy, or enable external official-source retrieval.
