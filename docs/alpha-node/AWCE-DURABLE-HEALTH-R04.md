# AWCE Durable Health Adapters R0.4

**Status:** draft, offline-tested, non-admitted; not deployed. This proposal depends on draft PR #146 (circuit breaker), PR #145 (router), and PR #144 (stdio deployment contract).

## Implemented in this PR

- `src/awcePgBreakerStore.ts`: `AtomicBreakerStore` adapter using PostgreSQL `SERIALIZABLE` transactions, row locking, parameterized queries, bounded retry on SQLSTATE `40001` and `40P01`, and fail-closed behavior on commit/storage failure. The PostgreSQL client/pool is injected; no credentials, connection strings, migrations, or connections are created by the module.
- `ops/migrations/awce-breaker-state-r04.sql`: **review-only** schema proposal for `awce.breaker_state`; not applied.
- `src/awceAuthenticatedMcpHealth.ts`: authenticated HTTPS `server/discover` probe pinned to MCP `2026-07-28`. Exact executor/capability/artifact binding, exact approved origin, bearer credentials supplied by a trusted provider, no redirects, no tool calls, 3-second maximum request deadline, JSON-only bounded 8 KiB result, and strict protocol response validation.
- Synthetic tests inject a fake PostgreSQL client and fake HTTP fetcher. They never contact a database, internet endpoint or local host.

## MCP compatibility boundary

This adapter probes a **future admitted, modern Streamable HTTP** endpoint only. The existing `algolia-mcp` CLI uses **stdio MCP** and remains `NOT_ADMITTED`: it is **not** a candidate for this HTTP probe. Do not coerce the stdio executable onto Vercel as a static site. No HTTP gateway is implemented in this PR.

Protocol reference: <https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/discover.mdx>. The response must include `result.resultType: "complete"`, `result.supportedVersions` containing `2026-07-28`, and a valid `result.capabilities` object. The self-reported `serverInfo` is not used as an identity or authorization proof.

## Required host-level protections (not implemented here)

- **Network egress allowlisting and DNS rebinding protection:** parse the endpoint URI only from an authorized trusted binding. The production network adapter must resolve and pin approved addresses or enforce an equivalent service mesh egress policy. Reject private/link-local, loopback, metadata and unexpected DNS answers. A URL-string check alone is not sufficient.
- **Credential governance:** use short-lived, per-executor, read-only tokens; no bearer tokens in source, logs, evidence payloads or repository variables. Use independently verified authentication issuer/audience bindings.
- **Request deadline:** HTTP fetch must honor abort/cancellation, including pending response-body reads. A stuck transport must be terminated by the hosting runtime.
- **PostgreSQL:** choose an estate-owned dedicated database, encrypted TLS connection, reviewed least-privileged DML role, backup/recovery plan, connection pool and migration approval. A fake store proves control flow only.
- **Distributed lease correctness:** choose a trusted clock and fencing/lease token source; transactional row updates must serialize across all workers. Health leases do not themselves authorize tool execution.
- **Evidence:** health events are monitoring evidence only; Warden authorization and River execution receipts remain independent mandatory gates.
- **Capability admission:** do not set `ADMITTED`, enable routing or invoke `RouterPorts.execution` based on this PR or its CI results.

## Review/test

```bash
npm ci
npx vitest run src/awcePgBreakerStore.test.ts src/awceAuthenticatedMcpHealth.test.ts
npm run type-check
```

Release is contingent on reviewed live host configuration and authenticated probes after the parent PRs are merged. **Do not run the migration or probe against production under this draft.**
