# Synnergyze Genesis MCP — Deployment Contract

## Canonical deployment source

- Repository: `Believers-common-group/mcp-node-synnergyze`
- Runtime deployment branch: `genesis`
- Repository release branch: `main`
- Runtime: Node.js 22+
- Remote MCP transport: Streamable HTTP
- Health route: `/health`
- MCP route: `/mcp`
- Registry bridge route: `/registry-bridge`

## Branch roles and lineage

`genesis` is the governed integration branch and the canonical Vercel runtime deployment source for the Synnergyze Genesis MCP surface.

`main` remains the repository release/governance branch. Promotion from `genesis` to `main` records a validated repository release; it does not by itself transfer Vercel production deployment authority away from `genesis`.

This runtime rule is effective from commit `413ba073cf3187a548896dd416cfb9bcce3f20c5` (`fix(vercel): deploy only canonical genesis branch`, 10 August 2026) and is additive to the earlier Genesis branch contract.

## Persistence and authority boundary

ALPHA-NODE-001 keeps the local Registry as canonical state and Warden as the policy/authority plane.

Neon is a live external runtime projection. It is rebuildable and must not claim canonical authority over identity, consent, policy, licence, or evidence custody. Neon may be operated through the governed connected control plane even when direct Vercel database credentials are not mounted.

Supabase is a deferred optional adapter for retained data while that account is unavailable or unfunded. Supabase reachability is not a production deployment gate. Existing Supabase data is preserved for later re-admission without changing the authority model.

RiverOS remains the evidence-continuity plane. Governed object stores such as Box may hold evidence and artifacts that should not live in application Git history. Dropbox or other object-store connectors may be used as governed mirrors/storage surfaces; connection alone never makes them canonical Registry state.

## Vercel project contract

The Vercel project `synnergyze-genesis-mcp` must use:

- Production Branch: `genesis`
- Framework Preset: Other / auto-detected serverless functions
- Output Directory: Auto-detect / cleared
- Repository root as the project root unless explicitly superseded

Do not set Output Directory to `public`, and do not create a placeholder `public` directory to satisfy a stale project setting. The repository declares `outputDirectory: null` in `vercel.json`; the Vercel project-level override must also remain cleared.

After the project setting is correct, a push to `genesis` is the canonical Git-triggered deployment path. `vercel.json#ignoreCommand` intentionally suppresses non-`genesis` Git deployments.

## Base runtime environment

The base MCP runtime does not require Supabase or direct database credentials to be considered operational. It must preserve the local Registry/Warden authority boundary and remain fail-closed for capabilities whose credentials are absent.

`REGISTRY_BRIDGE_SECRET` protects the direct bridge endpoint. `CRON_SECRET` remains optional and must stay unset until a controlled authorized bridge proof has passed.

## Direct Vercel-to-Neon bridge activation

These variables are required only to activate the direct `/registry-bridge` transport from Vercel:

- `CWR_REGISTRY_DATABASE_URL` — pooled Neon connection using the least-privilege CWR bridge role.
- `VSR_PUBLIC_DATABASE_URL` — pooled Neon connection using the least-privilege VSR bridge role.
- `REGISTRY_BRIDGE_SECRET` — bearer secret for the governed bridge endpoint.

If the two database URLs are absent, the direct bridge remains dormant. This is not a Genesis runtime failure while Neon is being operated through the connected governed control plane.

## Deferred optional Supabase adapter

These variables may remain present to preserve Supabase lineage, but they are not required for a healthy deployment:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

A missing, suspended, unfunded, mismatched, or unauthorized Supabase project is reported as deferred/degraded adapter state. Do not hard-code Supabase credentials in repository source and do not promote another provider into canonical authority merely because Supabase is unavailable.

Do not commit database passwords, secret keys, service-role credentials, or bearer secrets.

## Base runtime gates

The Genesis runtime is operational when:

1. Vercel builds successfully from `genesis`.
2. `GET /health` returns HTTP 200 with `service = synnergyze-genesis-mcp`.
3. MCP initialization succeeds against `POST /mcp`.
4. `genesis_status` reports `runtimeState = operational`, `ALPHA-NODE-001 local Registry` as canonical state, Warden as policy authority, Neon as `runtime_projection_only`, and Supabase as deferred optional.
5. `/registry-bridge` rejects no-auth and incorrect-bearer requests with HTTP 401.

`genesis_supabase_probe` and direct-Neon probe results are diagnostic and non-blocking for the base runtime.

## Direct bridge activation gates

The direct Vercel bridge is not considered activated until all of these pass:

1. Both Neon pooled database URLs are mounted in Vercel Production using the dedicated least-privilege roles.
2. `genesis_neon_projection_probe` confirms read-only connectivity to both CWR and VSR databases and reports `bridgeReady = true`.
3. No-auth and incorrect-bearer bridge requests still return HTTP 401.
4. A legitimate governed `CWR-REGISTRY` outbox event exists. Do not manufacture a production event merely to satisfy a test.
5. Exactly one authorized `limit=1` transfer succeeds and source, target, checkpoint, and evidence state are verified.
6. Only after that controlled proof may cron scheduling be considered.

Registry-specific mutation tools still require Warden authorization design and must not inherit broad database authority.

## Legacy boundary

The inherited Algolia implementation remains repository lineage only. It is not the canonical Genesis remote MCP deployment interface. Do not expose legacy Algolia credentials or tools through `/mcp` unless explicitly re-admitted as governed provider capabilities.
