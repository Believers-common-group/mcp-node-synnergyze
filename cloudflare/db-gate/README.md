# Alpha / BNR Governed DB Gate — Cloudflare Hyperdrive Slice

Component: `BNR-DB-GATE-001`

Status: NON-DESTRUCTIVE IMPLEMENTATION SLICE

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
- This first slice is read-only after authorization.

See `../../docs/alpha-node/BNR-DB-GATE-001.md` for the full contract.

## 1. Install

From this directory:

```bash
npm install
```

## 2. Create the Neon role for Hyperdrive

Create a dedicated least-privilege Neon role for this gateway. Grant only the schemas/tables required by the named operations.

For the Hyperdrive origin, use the **direct/unpooled** Neon connection string. Do not use the Neon pooled endpoint for the Hyperdrive origin.

Do not save the connection string in this repository.

## 3. Create the authoritative Hyperdrive configuration

The first Alpha slice must have Hyperdrive query caching disabled because it serves governance-sensitive and read-after-write-capable paths.

```bash
npx wrangler hyperdrive create alpha-bnr-db-gate-auth \
  --connection-string="postgres://USER:PASSWORD@NEON_HOST:5432/DATABASE" \
  --caching-disabled
```

Copy the returned Hyperdrive configuration ID into `wrangler.jsonc` as the `HYPERDRIVE_AUTH` binding ID.

The origin credential is stored by Cloudflare/Hyperdrive, not in the Worker source.

## 4. Bind Warden

The Worker uses a Cloudflare service binding named `WARDEN`.

`wrangler.jsonc` currently targets:

```text
alpha-warden-gate
```

That service must expose an HTTP verification endpoint compatible with the request sent to `/v1/authorize` and return a decision containing at least:

```json
{
  "allowed": true,
  "authority_ref": "AUTHORITY-REFERENCE",
  "operation": "registry.inbox.lookup"
}
```

A bearer token by itself is not treated as authorization.

## 5. Generate Worker binding types

After setting the real Hyperdrive ID and Warden service name:

```bash
npm run cf-typegen
```

This generates `worker-configuration.d.ts` from `wrangler.jsonc`. Do not hand-maintain the Worker binding interface.

## 6. Validate

```bash
npm run type-check
npm run check
npm run dry-run
```

Do not treat local success as production-equivalent verification.

## 7. Local development

```bash
npm run dev
```

The Warden service binding must also be available to the local Wrangler session. For full integration testing, run the Warden Worker and this DB Gate together using Wrangler multi-config development or test the deployed non-production Workers.

## Endpoints

### `GET /health`

Edge liveness only. It does not query Neon and does not prove database or Warden readiness.

### `POST /v1/query`

Requires these governance headers:

```text
x-warden-authority-ref
x-digitalme-ref
x-context-ref
```

`x-execution-lease-id` is also forwarded when present. Future consequential operations must require and validate it explicitly.

Supported initial operations:

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

## Promotion sequence

Do not point production traffic at this Worker until all of the following are satisfied:

1. `wrangler types`, TypeScript, Wrangler config check, and dry-run pass.
2. Hyperdrive is connected using a dedicated direct Neon role and caching is disabled.
3. Warden allow, deny, expiry, revocation, context-mismatch, and authority-mismatch tests pass.
4. A non-production Neon branch is used for remote integration testing.
5. Structured logs show request, authority reference, operation, and result cardinality without exposing secrets or participant payloads.
6. A Registry decision explicitly promotes the Cloudflare adapter into an active runtime role.
7. Only after lease/idempotency/evidence tests pass may a write command be introduced.

## Future write slice

A mutation endpoint must not be added as generic SQL. Each mutation must be a named command with fixed SQL and must carry at least:

- actor/context reference;
- Warden authority reference;
- execution lease ID;
- idempotency key;
- command version;
- evidence/receipt reference;
- deterministic reconciliation behavior.

`REQUEST != AUTHORITY != EXECUTION != ACKNOWLEDGEMENT != EFFECT`

## Primary references

- Neon Cloudflare Workers guide: https://neon.com/docs/guides/cloudflare-workers
- Cloudflare Neon integration: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
- Cloudflare Hyperdrive/Postgres: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- Cloudflare Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
