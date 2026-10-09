# AWCE Health-aware Routing Core R0.2

**Status:** draft library and synthetic tests only. **No network or process operation, no deployment, and no admission.** Builds upon the review-only deployment contract in [AWCE-MCP-DEPLOYMENT-CONTRACT-R01.md](./AWCE-MCP-DEPLOYMENT-CONTRACT-R01.md) and `ops/awce-mcp-deployment-contract.r0.1.json`.

## What is implemented

`src/awceExecutionRouter.ts` is a deterministic dependency-injected orchestration core. It does not import, call, or replace the existing Algolia MCP CLI, Warden–MXC draft execution contract, Genesis host operations, or River service.

Ports are explicit: an authoritative capability **registry**, independent **Warden** admission, a non-effect **health** probe, **River** reservation/receipt/non-execution evidence, a durable atomic **idempotency** claim, and an independently reviewed **execution** adapter. No provider is selectable merely by its name or a successful build.

### Governed execution sequence

1. Validate the request identifier, principal, capability and exact input digest.
2. Resolve authoritative records; only `ADMITTED` capabilities with a valid artifact digest are candidates.
3. Authorize **each** attempted executor with fresh Warden evidence bound to request ID, principal, executor, artifact digest and input digest; reject unsigned, denied, expired or mismatched grants.
4. Perform a bounded read-only protocol health check; treat failure as unavailable, not proof of fault.
5. Reserve a River evidence slot, **then** atomically claim the operation idempotency key (shared durable implementation required), then re-check permit expiry.
6. Dispatch only through a provider adapter; never auto-start a host or infer permission from an MCP tool catalogue.
7. On success, verify an exact matching River receipt, then persist idempotency completion before reporting `COMPLETED`.

### Failure behavior

- `BLOCKED`: invalid request, registry unavailable, unadmitted executor, invalid/expired Warden grant, unhealthy executor with no authorized alternative, failed River reservation, or missing/double idempotency claim.
- `UNCERTAIN`: invocation exception, lost acknowledgement or an outcome indicating execution **may** have occurred. **Never retry or fail over automatically.**
- `PENDING_EVIDENCE`: execution succeeded but evidence/finalization was not verified, or non-execution evidence was missing. **Never retry automatically.**
- Safe fallback requires (a) request policy `allowFallback`, (b) an explicitly eligible, **admitted** alternative, (c) a new executor-specific Warden permit, and (d) either no invocation having been started or verified River non-execution evidence.

The module processes at most three authorized candidates in order of priority; no unbounded retry loop exists. **Ports must implement timeouts, cancellation behavior and admission verification outside the pure router.** Persistent circuit-breaker state, a durable distributed idempotency store, hosted MCP transport and a runtime health collector are **not implemented** here.

### Important integration boundary

The separate **draft** Warden–MXC branch (`feat/warden-mxc-execution-contract-r0.1`) must be reviewed and explicitly reconciled before a new adapter can bind `RouterPorts.execution` to real MXC. This PR does not merge those branches or grant host authority. River signatures/receipt verification, Warden decision signature verification, and health authentication belong to provider-backed adapters, **not** to a model-generated mock.

This source currently only provides interfaces and synthetic checks; running those tests does not prove that production Warden, River, Genesis or Synnergyze are connected or available.

### Test instructions

```bash
npm ci
npx vitest run src/awceExecutionRouter.test.ts
npm run type-check
```

Release gate remains fail-closed. Do not route to the existing `synnergyze-algolia-mcp-stdio` record, which is `NOT_ADMITTED`.

## Review checklist

- [ ] Define canonical Warden decision verification and authority revocation semantics.
- [ ] Define a reusable River receipt verifier with durable signature and correlation rules.
- [ ] Select an estate-owned, non-personal executor host and implement an independently supervised stdio process adapter.
- [ ] Provide durable atomic idempotency and recovery of `UNCERTAIN`/`PENDING_EVIDENCE` operations.
- [ ] Implement passive probes and persistent circuit breakers with strict network/request budgets.
- [ ] Test crash/restart, duplicate delivery and host failover under a reviewed synthetic workload.
- [ ] Approve integration and rollout explicitly, then observe real endpoint/evidence results before marking it healthy.
