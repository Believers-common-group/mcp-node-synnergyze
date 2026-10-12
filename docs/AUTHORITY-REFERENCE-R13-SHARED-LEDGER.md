# Authority Reference R1.3 — Shared Replay-Ledger Contract (HOLD)

**Source-only staging design. SQL migration NOT applied. No database connected, no release deployed, no capability admitted.**

## Scope of delivery
- `schemas/authority-reference-r13-ledger.sql` specifies a PostgreSQL table with two independent uniqueness constraints: namespace + hashed tenant + hashed nonce, and namespace + hashed tenant + request digest. Both prevent a second admission attempt from silently reusing a nonce or reusing the exact request under a new nonce.
- `modules/synnergyze/authority-reference-pg-ledger.ts` creates a **pure** parameterized `INSERT ... ON CONFLICT DO NOTHING RETURNING` statement and interprets observations in a permanently non-executable HOLD assessment. It does not import a database client, open connections or run SQL.
- `modules/synnergyze/authority-reference-pg-ledger.test.ts` tests deterministic hashing and parameterization, malicious identifiers, duplicate nonce, duplicate request, simulated concurrently arriving requests, tenant separation, forged/partial result shapes, and failure handling. A small in-memory fixture models UNIQUE/ON CONFLICT behavior but **is not an integration test against PostgreSQL**.

## Binding and security assumptions
- Namespace is fixed to `AUTHORITY_REFERENCE_STAGING_R13` and the schema fixes `state=SPENT_OFFLINE_STAGING`. It cannot be promoted to an execution permit.
- Raw tenant and nonce identifiers are hashed with context-specific domain separators; **the caller-provided tenantRef is not itself authoritative**. Real DigitalMe, BNR Door and ARK membership must be independently verified before a production reservation API can be built.
- The database server, schema owner and access roles must be separately verified. Strict least-privilege INSERT only, approved schema migrations, audit and backup are required. No UPDATE, DELETE, TRUNCATE, reset or TTL recovery API is supplied. A malicious privileged database operator could still remove or rewrite records; separate audit anchoring is required.
- `CREATE TABLE IF NOT EXISTS` is convenient for staging review but **must never be treated as schema attestation**. Verify constraints, owner, RLS/grants, schema migration history and correct database identity before accepting operations.
- Atomicity and cross-worker replay refusal are **properties expected of a correctly provisioned PostgreSQL database**; the repository has not yet measured, provisioned or validated those properties live. Database outages and errors must fail closed.
- An observed row may be fabricated by an untrusted caller. The pure observer does not verify database/server identity and never returns `executionAllowed=true`.

## Explicitly missing
- A commissioned and independently attested Synnergyze runtime/worker.
- An independently anchored production DigitalMe/Warden/River trust and live revocation registry.
- Live Warden admission, signed live River **admission** receipt, and separate signed live River **execution** receipt.
- A deployed shared PostgreSQL ledger with verified ACID isolation/permissions/cross-host fencing.
- Production permit issuance, one-time consumption, approved official-source egress, and go-live approval.

## Test commands
```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install vitest run modules/synnergyze/authority-reference-preview.test.ts modules/synnergyze/authority-reference-commissioning.test.ts modules/synnergyze/authority-reference-admission-chain.test.ts modules/synnergyze/authority-reference-triple-issuer.test.ts modules/synnergyze/authority-reference-pg-ledger.test.ts
npm run type-check
```

**Deployment rule: DO NOT apply SQL migration, merge as authority, or connect to any production database via this PR.**
