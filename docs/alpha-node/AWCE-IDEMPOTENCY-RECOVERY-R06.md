# AWCE R0.6 — Durable idempotency and evidence-only recovery

**Status: draft / isolated CI.** No production database, MCP tool, Genesis host, Warden grant, or River service is contacted.

This draft follows #148 → #147 → #146 → #145 → #144. It adds a PostgreSQL idempotency ledger *separate* from the circuit-breaker state. The same request identity cannot be claimed twice.

## Execution invariants

- An atomic PostgreSQL INSERT on `(principal_id, request_id)` determines claim ownership; simultaneous callers can produce at most one `ACQUIRED` result.
- The claim binds **principal, request identifier, capability, and input digest**. The identifier cannot be reused for a different payload or capability.
- A `CLAIMED` record remains locked indefinitely until a verified receipt permits `COMPLETED`; **there is no TTL-based release, reclaim, delete, or automatic retry**.
- Completion is conditional on the exact binding and a matching receipt. A completed record cannot transition back, and a different receipt cannot overwrite it.
- `reconcileCompletedOperation` has no execution port. It only requests prior **independently verified** River evidence from a trusted adapter, checks full request binding, and finalizes the ledger.
- Failure to retrieve or authenticate evidence leaves `NEEDS_RECONCILIATION`; a timeout or uncertain result can never be interpreted as `NOT_STARTED` merely because no receipt was found.

## Files

- `src/awcePgIdempotencyLedger.ts`: atomic claim, conditional completion, authenticated-caller inspection boundary, verified-evidence reconciliation.
- `src/awcePgIdempotencyLedger.test.ts`: nine offline synthetic recovery cases.
- `ops/migrations/awce-execution-claims-r06.sql`: draft PostgreSQL schema and immutability trigger, **not applied to estate databases**.
- `ops/integration/pg/idempotency-r06.mjs`: isolated integration checks with a disposable PostgreSQL 16 server, ten concurrent claims, duplicate rejection, restricted role permissions, immutable completion and an independent second connection.
- `.github/workflows/awce-idempotency-r06.yml`: dedicated GitHub Actions ephemeral database test, with no production secrets.

## Still required before effectful execution

1. Review the role-based principal lookup boundary and require a separately authenticated caller; `inspect` does **not** enforce end-user authentication itself.
2. Implement real River receipt cryptographic verification with issuer, signature, reservation, operation and output bindings; a Boolean `verified` from an untrusted caller does not grant authority.
3. Implement a canonical request digest verifier and Warden signing/revocation adapter, review permission grants.
4. Ensure the executor *itself* enforces the idempotency key and can distinguish definite non-execution from an unknown outcome across process crashes. The router must never infer that state.
5. Add durable incident status, retention, manual adjudication, and evidence-backed operational resolution policy without automatically unblocking uncertain execution.
6. Validate production backup and recovery procedures, DB pooling, clock discipline, migrations, tenant isolation, audit events and legal retention policy.

## Running only the synthetic checks

```bash
npm ci
npx vitest run src/awcePgIdempotencyLedger.test.ts
npm run type-check
```

For real PostgreSQL integration, use only the GitHub Actions disposable CI job. No service credentials are requested and no external MCP probes are performed.

**R0.6 is a proof of duplicate containment, not a release authorization or complete exactly-once execution guarantee.**
