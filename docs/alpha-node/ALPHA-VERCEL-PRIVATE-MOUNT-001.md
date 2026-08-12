# ALPHA-VERCEL-PRIVATE-MOUNT-001

**Scope root:** `ALPHA-NODE-001`  
**State:** `DRAFT_PRIVATE_MOUNT_CONTRACT`  
**Service:** `synnergyze-genesis-mcp`  
**Canonical source branch:** `genesis`

## Purpose

Mount the Vercel-hosted Synnergyze Genesis MCP boundary into `ALPHA-NODE-001` without making the deployment public and without treating Vercel authentication as Registry or Warden authority.

The mount is an Alpha edge/runtime connector. It does not replace the Alpha Registry, Genesis identity resolution, Warden authorization, RiverOS evidence, or Synnergyze governed execution semantics.

## Authentication layers

The private mount uses independent credentials for independent boundaries.

1. **Vercel edge access** — `VERCEL_AUTOMATION_BYPASS_SECRET`
   - Sent only in the `x-vercel-protection-bypass` request header.
   - Allows the Alpha probe/runtime to pass Vercel Deployment Protection.
   - Must not be placed in URLs, logs, source code, Registry payloads, DigitalMe projections, or River evidence bodies.
   - Does **not** grant access to Registry bridge operations by itself.

2. **Registry bridge service authorization** — `REGISTRY_BRIDGE_SECRET`
   - Sent as `Authorization: Bearer ...` only when the bridge is intentionally executed.
   - Separate from the Vercel bypass secret.
   - The safe probe never sends it unless `ALPHA_RUN_REGISTRY_BRIDGE=1` is explicitly set.

3. **Warden authority** — independent governed decision
   - Neither Vercel bypass nor bridge bearer is a Warden decision.
   - Edge/service authentication cannot manufacture participant authority, consent, licence, mandate, or Registry effect.

Canonical invariant:

```text
VERCEL_EDGE_ACCESS != SERVICE_AUTHORIZATION != WARDEN_AUTHORITY != REGISTRY_EFFECT
```

## Current Vercel service contract

The `genesis` branch defines an API-only deployment with these governed routes:

```text
/health           -> /api/health
/mcp              -> /api/mcp
/registry-bridge  -> /api/registry-bridge
```

The deployment must remain API-only (`framework: null`, no static output directory).

## Mount states

```text
BUILD_READY
   ↓
EDGE_PROTECTED
   ↓ generate/bind scoped Vercel automation bypass
EDGE_REACHABLE
   ↓
HEALTH_VERIFIED
   ↓
MCP_VERIFIED
   ↓
BRIDGE_DEFAULT_DENY_VERIFIED
   ↓ explicit Warden/operator execution envelope if bridge mutation is required
BRIDGE_AUTHORIZED_TEST
   ↓ River/Registry evidence
ALPHA_PRIVATE_MOUNT_READY
```

`BUILD_READY` does not imply `EDGE_REACHABLE`.  
`EDGE_REACHABLE` does not imply `MCP_VERIFIED`.  
`MCP_VERIFIED` does not authorize Registry bridge execution.  
`REGISTRY_BRIDGE_SECRET` does not replace Warden authority.

## Safe acceptance probe

Run from an Alpha-controlled environment or authorized operator shell:

```bash
export ALPHA_VERCEL_BASE_URL='https://<protected-genesis-alias>'
export VERCEL_AUTOMATION_BYPASS_SECRET='<secret-from-vercel-project-protection>'

node scripts/alpha-vercel-private-probe.mjs
```

Default probe behavior:

1. `GET /health` must return `200` and identify `synnergyze-genesis-mcp`.
2. `GET /mcp` must reach the application and return governed `405` (`POST` required).
3. `POST /mcp` performs a Streamable HTTP MCP initialize request and must return the expected server identity.
4. `GET /registry-bridge?limit=1` **without** a bearer must return `401 unauthorized`.
5. Authorized bridge execution is skipped.

The default probe is therefore non-bridge-mutating.

## Explicit bridge execution

The Registry bridge claims/leases outbox rows and may deliver events. It is a mutating operation even when invoked with HTTP `GET`.

Run only inside an explicit execution envelope:

```bash
export REGISTRY_BRIDGE_SECRET='<bridge-secret>'
export ALPHA_RUN_REGISTRY_BRIDGE=1
node scripts/alpha-vercel-private-probe.mjs
```

The probe constrains the bridge test to `limit=1` and expects the governed bridge identity `GEN-PART-PG-BRIDGE-003` with source `CWR-REGISTRY`.

Do not set `ALPHA_RUN_REGISTRY_BRIDGE=1` merely to test connectivity.

## Secret custody

For Alpha:

- Store the Vercel automation bypass secret in an Alpha secret store / operator environment, not source.
- Use a project/environment-scoped secret, rotate independently of the bridge credential.
- Never reuse DigitalMe, Warden, Registry database, Supabase service-role, or Alpha bootstrap credentials as the Vercel bypass secret.
- Prefer the HTTP header form over a query parameter to reduce accidental logging.
- Revoke/rotate the bypass when an Alpha mount is retired or superseded.

## Production promotion

The initial Alpha private mount may target a stable `genesis` branch alias while the project remains non-live. Production alias assignment is a separate state transition and must not be inferred from a READY preview deployment.

Promotion criteria include:

- private probe passes;
- required Vercel/Supabase/bridge environment variables are confirmed without exposing values;
- focused repository tests/CI are green or independently reproduced;
- dependency/security gate is dispositioned;
- production branch/routing is explicitly set to the intended `genesis` lineage;
- Warden/River/Registry edge-effect acceptance is completed.

## Alpha boundary

This document and probe are scoped only to `ALPHA-NODE-001`. Any future BNR-node reuse must be issued as a new version/object with its own authority, credentials, node identity, environment and evidence lineage.
