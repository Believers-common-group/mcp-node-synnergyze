# AWCE–Synnergyze MCP Deployment Contract R0.1

**Status:** proposed, unadmitted, not deployed. This record is architecture/evidence only.

## Confirmed source and incident

- Source repo: `Believers-common-group/mcp-node-synnergyze`; `package.json` identifies the current product as `algolia-mcp`, not a production Synnergyze-hosted HTTP gateway.
- Current entrypoint: `src/app.ts`; `src/commands/start-server.ts` defaults to `StdioServerTransport`.
- `npm run build` invokes `bun build ./src/app.ts --compile`, which produces a CLI executable, not a `public/` static website.
- Vercel deployment `9zwMMSAnfZxE4zEwrW7hAhGxntbd` failed with `STATIC_BUILD_NO_OUT_DIR`; its project expected a `public` directory.
- Current `package.json` allows Node `>=22`; pin the intended Node major to 22 for the next tested runner instead of relying on automatic Vercel major upgrades.

## Contract boundary

The `ops/awce-mcp-deployment-contract.r0.1.json` record declares the existing CLI as **stdio-only** with **no admitted production endpoint**. It is **not eligible for automated routing, failover, deployment, or execution** until independent evidence validates hosting, identity, authority, reachability and receipts.

For a process-hosted stdio MCP worker, the MCP client or approved supervisor launches the executable on a dedicated, estate-managed host. It is not a public HTTP endpoint; no personal browser, private laptop session or unattended local process is an authorized substitute. A dedicated host is an architectural candidate, not presently provisioned.

A future networked gateway requires a **separate, reviewed Streamable HTTP implementation** with explicit server-side authentication, tenant isolation, rate limits, request limits and Warden revalidation. Adding `public/` or disabling the output-directory check is **not** a valid repair.

## Admission sequence

1. Genesis registers an exact executable/build artifact digest and runtime capability.
2. DigitalMe identity and delegated scope are independently validated.
3. Warden signs and verifies an execution decision bound to principal, operation, target and expiry.
4. Synnergyze selects only the admitted, reachable, healthy matching executor. Provider interchangeability never bypasses Warden.
5. The executor uses idempotency keys, bounded retry for transient failures, a circuit breaker and a deterministic no-route response when fallback is unavailable.
6. River receives a verifiable evidence receipt before the router declares completed success.

Never equate a GitHub test pass, a successful build, an MCP tool catalogue, or a Vercel `READY` deployment with live authorization. Missing credentials, admissions, services or endpoint health produce **BLOCKED** or **UNVERIFIED**, never an inferred green status.

## Release gate

The accompanying CI contract job checks that the current repository still matches the registered stdio/executable facts and has not introduced a Vercel static-output deployment manifest. This check is **necessary but not sufficient**; it is intentionally not a Vercel deployment or Warden/River integration test.

Before any approved runtime launch, provide a host inventory, signed artifact digest, process supervisor definition, actual protocol probe, non-secret admission evidence, replay/idempotency test, rollout plan and rollback plan. Keep this PR draft until reviewed.

**Incident:** https://vercel.com/faizahmed29-5330s-projects/synnergyze-genesis-mcp/9zwMMSAnfZxE4zEwrW7hAhGxntbd
