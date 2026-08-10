# Synnergyze Genesis MCP — Deployment Contract

## Canonical deployment source

- Repository: `Believers-common-group/mcp-node-synnergyze`
- Branch: `genesis`
- Runtime: Node.js 22+
- Remote MCP transport: Streamable HTTP
- Health route: `/health`
- MCP route: `/mcp`

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
