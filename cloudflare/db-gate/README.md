# Alpha / BNR Governed DB Gate — Cloudflare Hyperdrive Slice

Component: `BNR-DB-GATE-001`

Status: GOVERNED READS + SYNTHETIC CONTROLLED-WRITE CANARY

This Worker proves the governed path:

```text
caller -> Warden service binding -> Cloudflare Worker -> cache-disabled Hyperdrive -> Neon runtime Postgres
```

It does **not** replace `GEN-PART-PG-BRIDGE-003`, the existing governed Vercel bridge. It is an additive Cloudflare runtime adapter that must be independently verified before promotion.

## Boundary

- Supabase remains canonical for Registry/Warden governance state in `ALPHA-NODE-001`.
- Neon remains the runtime/public participation and operational workload plane.
- Warden decides whether a database operation is permissible.
- This Worker executes only named operations after Warden authorization.
- Hyperdrive handles database connectivity and pooling; it is not an authority service.
- No arbitrary SQL is accepted from callers.
- The only write operation is a synthetic canary against dedicated tables; it is not a production business action.

See:

- `../../docs/alpha-node/BNR-DB-GATE-001.md`
- `../../docs/alpha-node/BNR-DB-GATE-MUTATION-001.md`

## 1. Install

From this directory:

```bash
npm install
```

## 2. Create the Neon role for Hyperdrive

Create a dedicated least-privilege Neon role for this gateway. For the canary test environment, grant only the minimum access required for the named read operations plus the two canary tables created by the migration.

For the Hyperdrive origin, use the **direct/unpooled** Neon connection string. Do not use the Neon pooled endpoint for the Hyperdrive origin.

Do not save the connection string in this repository.

## 3. Apply the synthetic migration to a non-production Neon branch

Apply:

```text
migrations/001_bnr_db_gate_canary.sql
```

The migration creates only:

- `uoe_app_bridge.bnr_db_gate_canary_commands`
- `uoe_app_bridge.bnr_db_gate_command_receipts`

It contains no `GRANT` statements. Provision the dedicated role separately.

Do not apply the canary migration to production as a shortcut around the verification sequence.

## 4. Create the authoritative Hyperdrive configuration

The Alpha governed path must have Hyperdrive query caching disabled because it serves governance-sensitive, write, idempotency, and read-after-write paths.

```bash
npx wrangler hyperdrive create alpha-bnr-db-gate-auth \
  --connection-string="postgres://USER:PASSWORD@NEON_HOST:5432/DATABASE" \
  --caching-disabled
```

Copy the returned Hyperdrive configuration ID into `wrangler.jsonc` as the `HYPERDRIVE_AUTH` binding ID.

The origin credential is stored by Cloudflare/Hyperdrive, not in the Worker source.

## 5. Bind Warden

The Worker uses a Cloudflare service binding named `WARDEN`.

`wrangler.jsonc` currently targets:

```text
alpha-warden-gate
```

### Authorization contract

Warden must expose `/v1/authorize`.

For a read, it returns at least:

```json
{
  "allowed": true,
  "authority_ref": "AUTHORITY-REFERENCE",
  "operation": "registry.inbox.lookup"
}
```

For `runtime.canary.record`, Warden must bind the exact command and return:

```json
{
  "allowed": true,
  "authority_ref": "AUTHORITY-REFERENCE",
  "operation": "runtime.canary.record",
  "execution_lease_id": "LEASE-REFERENCE",
  "command_fingerprint": "SHA256-FINGERPRINT",
  "expires_at": "2026-08-13T12:00:00.000Z"
}
```

A bearer token by itself is not treated as authorization.

### Lease-consumption contract

After the database transaction commits, the DB Gate calls Warden `/v1/consume` with the exact authority, lease, operation, command fingerprint, command ID, and receipt reference.

Warden should make consumption idempotent by `receipt_ref` and return the same successful confirmation on safe replay:

```json
{
  "consumed": true,
  "authority_ref": "AUTHORITY-REFERENCE",
  "execution_lease_id": "LEASE-REFERENCE",
  "receipt_ref": "BNR-DB-GATE-RECEIPT:..."
}
```

If Warden is unavailable after the DB commit, the runtime command remains acknowledged with `warden_consumption_state=pending` and the HTTP response is `202`. Replaying the same idempotency key retries reconciliation without inserting another command.

## 6. Generate Worker binding types

After setting the real Hyperdrive ID and Warden service name:

```bash
npm run cf-typegen
```

This generates `worker-configuration.d.ts` from `wrangler.jsonc`. Do not hand-maintain the Worker binding interface.

## 7. Run focused tests and validation

```bash
npm test
npm run type-check
npm run check
npm run dry-run
```

Do not treat local success as production-equivalent verification.

## 8. Local development

```bash
npm run dev
```

The Warden service binding must also be available to the local Wrangler session. For full integration testing, run the Warden Worker and this DB Gate together or use deployed non-production Workers.

## Endpoints

### `GET /health`

Edge liveness only. It does not query Neon and does not prove database or Warden readiness.

### `POST /v1/query`

Requires:

```text
x-warden-authority-ref
x-digitalme-ref
x-context-ref
```

Supported operations:

```json
{
  "operation": "runtime.health"
}
```

and:

```json
{
  "operation": "registry.inbox.lookup",
  "input": {
    "source_node_code": "CWR-REGISTRY",
    "event_reference": "EVENT-REFERENCE"
  }
}
```

Both operations are Warden-gated. `runtime.health` queries only database identity/time; `/health` remains the non-database liveness endpoint.

### `POST /v1/command`

Requires:

```text
x-warden-authority-ref
x-digitalme-ref
x-context-ref
x-execution-lease-id
x-idempotency-key
```

Supported mutation canary:

```json
{
  "operation": "runtime.canary.record",
  "input": {
    "canary_ref": "CANARY-001",
    "payload": {
      "probe": "alpha-db-gate"
    }
  }
}
```

The Worker canonicalizes the command and computes a SHA-256 fingerprint before asking Warden to authorize it.

Possible success states:

- `200 accepted` — command + `ACKNOWLEDGED` receipt exist and Warden lease consumption is confirmed.
- `202 accepted_pending_authority_consumption` — command + receipt exist but post-commit Warden consumption needs reconciliation.

A same-key/different-envelope replay returns `409 idempotency_collision`.

The response explicitly reports `effect_observed: false`. Runtime acknowledgement is not effect evidence.

## Verification sequence

Do not point production traffic at this Worker until all of the following are satisfied:

1. `npm test`, `wrangler types`, TypeScript, Wrangler config check, and dry-run pass.
2. Hyperdrive is connected using a dedicated direct Neon role and caching is disabled.
3. Warden allow, deny, expiry, revocation, context-mismatch, authority-mismatch, lease-mismatch, and fingerprint-mismatch tests pass.
4. The migration and all mutation tests run on a non-production Neon branch.
5. First canary write returns one command and one receipt.
6. Identical replay returns the same command/receipt and no duplicate rows.
7. Same idempotency key with a changed envelope fails closed.
8. Simulated post-commit Warden outage returns `202`; safe replay later advances the receipt to `consumed`.
9. Structured logs contain references only and do not expose secret/token bodies or command payloads.
10. No route or receipt claims `EFFECT_OBSERVED`.
11. A Registry decision explicitly promotes any Cloudflare adapter production role.

## Production mutation rule

The canary does not authorize general runtime writes.

Every future business mutation must be introduced separately as a named/versioned command with fixed SQL, its own Warden action/scope, input schema, execution-lease rule, idempotency semantics, receipt/evidence requirements, and reconciliation tests.

`REQUEST != AUTHORITY != EXECUTION != ACKNOWLEDGEMENT != EFFECT`

## Primary references

- Neon Cloudflare Workers guide: https://neon.com/docs/guides/cloudflare-workers
- Cloudflare Neon integration: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
- Cloudflare Hyperdrive/Postgres: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- Cloudflare query caching: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- Cloudflare Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
