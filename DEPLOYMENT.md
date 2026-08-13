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

Neon is the live external runtime projection used by the CWR -> VSR bridge. It is rebuildable and must not claim canonical authority over identity, consent, policy, licence, or evidence custody.

Supabase is a deferred optional adapter for retained data while that account is unavailable or unfunded. Supabase reachability is not a production deployment gate. Existing Supabase data is to be preserved and can be re-admitted later without changing the authority model.

RiverOS remains the evidence-continuity plane. Governed object stores such as Box may hold evidence/artifacts that should not live in application Git history. Dropbox or other object-store connectors may be used only as governed storage surfaces; they do not become canonical Registry state by being connected.

## Vercel project contract

The Vercel project `synnergyze-genesis-mcp` must use:

- Production Branch: `genesis`
- Framework Preset: Other / auto-detected serverless functions
- Output Directory: Auto-detect / cleared
- Repository root as the project root unless explicitly superseded

Do not set Output Directory to `public`, and do not create a placeholder `public` directory to satisfy a stale project setting. The repository already declares `outputDirectory: null` in `vercel.json`; the Vercel project-level override must also be cleared.

Equivalent Vercel CLI remediation when operating with an authorized Vercel token:

```bash
vercel project update synnergyze-genesis-mcp --auto-detect output-directory
```

After the project setting is corrected, a push to `genesis` is the canonical Git-triggered deployment path. `vercel.json#ignoreCommand` intentionally suppresses non-`genesis` Git deployments.

## One-click Vercel import

Use Vercel's repository clone/import flow for this exact branch:

`https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBelievers-common-group%2Fmcp-node-synnergyze%2Ftree%2Fgenesis&repository-name=synnergyze-genesis-mcp`

After import, confirm the project is linked to the `genesis` branch before promoting production.

## Required Vercel environment for the live projection bridge

Configure these values in Vercel rather than GitHub:

- `CWR_REGISTRY_DATABASE_URL` — pooled Neon connection using the least-privilege CWR bridge role.
- `VSR_PUBLIC_DATABASE_URL` — pooled Neon connection using the least-privilege VSR bridge role.
- `REGISTRY_BRIDGE_SECRET` — bearer secret for the governed bridge endpoint.

`CRON_SECRET` remains optional and must not be enabled until a controlled authorized bridge proof has passed.

## Deferred optional Supabase adapter

These variables may remain present to preserve the retained Supabase adapter, but they are not required for a healthy deployment:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

A missing, suspended, unfunded, mismatched, or unauthorized Supabase project must be reported as deferred/degraded adapter state and must not fail the Genesis runtime or promote Neon into canonical authority.

Do not commit database passwords, secret keys, or service-role credentials.

## Deployment gates

A live projection deployment is considered healthy when these gates pass in order:

1. Vercel build succeeds from `genesis`.
2. `GET /health` returns HTTP 200 with `service = synnergyze-genesis-mcp`.
3. MCP initialization succeeds against `POST /mcp`.
4. `genesis_status` reports the ALPHA-NODE-001 local Registry/Warden authority boundary and both Neon projection URLs configured.
5. `genesis_neon_projection_probe` confirms read-only connectivity to both CWR and VSR Neon databases.
6. `/registry-bridge` rejects no-auth and incorrect-bearer requests with HTTP 401.
7. An authorized bridge run may occur only when a legitimate governed `CWR-REGISTRY` outbox event exists; do not manufacture production events merely to satisfy a deployment test.
8. Cron remains disabled until the first controlled authorized bridge transfer is evidenced and verified.

`genesis_supabase_probe` is diagnostic only. Its failure does not block gates 1-8 while Supabase is deferred.

Registry-specific mutation tools still require Warden authorization design and must not inherit broad database authority.

## Legacy boundary

The inherited Algolia implementation remains repository lineage only. It is not the canonical Genesis remote MCP deployment interface. Do not expose legacy Algolia credentials or tools through `/mcp` unless they are explicitly re-admitted as governed provider capabilities.
