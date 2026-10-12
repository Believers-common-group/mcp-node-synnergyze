# Authority Reference R1.5 — Recovery and Audit Fingerprint

**Review-only, source-controlled staging test. Authority remains HOLD.**

## Scope and method

R1.5 does not deploy or provision a persistent database. The GitHub Actions workflow `.github/workflows/authority-reference-r15-recovery.yml` starts a disposable PostgreSQL 16 service and calls `scripts/authority-reference-r15-recovery-ephemeral.sh`. Only a GitHub Actions ephemeral container ID is accepted. No user-managed Neon, Supabase, Vercel, Warden, RiverOS, local PC, or private browser source is contacted.

The R1.4 harness first applies the staging SQL schema, creates a restrictive test role and exercises 12 racing sessions. R1.5 then:

1. Reads the actual PostgreSQL `pg_control_system().system_identifier` and SHA-256 of deterministically ordered *synthetic row data*. The cluster ID distinguishes a server instance, but it is not a remote authenticated identity certificate.
2. Creates a **data-only** offline `pg_dump` snapshot of synthetic spent reservations to temporary runner storage, without exporting any user data.
3. Restarts the same ephemeral container and verifies unchanged cluster ID, row count and SHA-256. Both original nonce replay and request replay remain refused.
4. Creates a second, disposable PostgreSQL server (no published port), applies the schema and restores the snapshot.
5. Confirms the second server has a **different** PostgreSQL system ID but identical row count and row checksum, with replay refused using an isolated test role. A restored server must be separately admitted: matching data does not inherit runtime identity.
6. Logs the final checksum as an **unanchored audit candidate** and destroys the restored container and snapshot on job exit.

No deployment, database migration to existing services, Warden policy change, real issuer enrollment, or worker invocation is allowed by this workflow.

## Assurance limits

- A restart with the **same** container storage and a fresh-server **logical restore** is not a production high-availability, network partition, independent-site failover, point-in-time recovery, WAL archive, standby promotion or quorum simulation.
- `pg_control_system().system_identifier` is database metadata, not an independently validated transport certificate or durable worker attestation.
- The SHA-256 checkpoint detects unintended changes to these test rows when compared to the recorded result, but the checkpoint itself is neither independently signed nor anchored outside the runner. An administrator able to change both data and the checksum remains outside the protection boundary.
- Snapshot covers this one table only and does not reproduce production roles, grants, owners, policy decisions, backups or surrounding transactions.
- No real digital identities or official public records are handled. No live Warden decisions, River admission/execution receipts, distributed permit consumption, Genesis capacity or BNR Door membership is validated.
- The staging schema currently uses `CREATE TABLE IF NOT EXISTS`; this is **not** a reliable production migration integrity check. Schema owner and migration history must be independently verified.

## Progression and next release gate

R1.4 confirmed PostgreSQL nonce/request uniqueness under concurrency. R1.5 adds restart recovery, new-cluster restore checks and a reproducible but **unanchored** audit fingerprint. R1.6 requires an independently managed audit-signer/append-only external anchor, plus approved persistent staging identity, TLS and verified client/server policy and restore/failover drills. It is not authorised by this review PR.

**Disposition: HOLD for commissioning, production, and any external registry access.**