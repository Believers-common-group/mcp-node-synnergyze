# Synnergyze Genesis MCP — Deployment Contract

## Canonical deployment source

- Repository: `Believers-common-group/mcp-node-synnergyze`
- Runtime deployment branch: `genesis`
- Repository release branch: `main`
- Runtime: Node.js 22+
- Remote MCP transport: Streamable HTTP
- Health route: `/health`
- MCP route: `/mcp`

## Branch roles and lineage

`genesis` is the governed integration branch and the canonical Vercel runtime deployment source for the Synnergyze Genesis MCP surface.

`main` remains the repository release/governance branch. Promotion from `genesis` to `main` records a validated repository release; it does not by itself transfer Vercel production deployment authority away from `genesis`.

This runtime rule is effective from commit `413ba073cf3187a548896dd416cfb9bcce3f20c5` (`fix(vercel): deploy only canonical genesis branch`, 10 August 2026) and is additive to the earlier Genesis branch contract.

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

## Required Vercel environment

Configure these values in Vercel rather than GitHub:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Do not commit database passwords, secret keys, or service-role credentials.

## Deployment gates

A deployment is not considered healthy until all gates pass in order:

1. Vercel build succeeds.
2. `GET /health` returns HTTP 200 with `service = synnergyze-genesis-mcp`.
3. MCP initialization succeeds against `POST /mcp`.
4. `genesis_status` reports the Supabase environment as configured.
5. `genesis_supabase_probe` returns a successful Supabase REST reachability result.
6. Only after gates 1-5 pass may Registry-specific read tools be enabled.
7. Mutation tools require a separate Warden authorization design and must not inherit broad database authority.

## Legacy boundary

The inherited Algolia implementation remains repository lineage only. It is not the canonical Genesis remote MCP deployment interface. Do not expose legacy Algolia credentials or tools through `/mcp` unless they are explicitly re-admitted as governed provider capabilities.
