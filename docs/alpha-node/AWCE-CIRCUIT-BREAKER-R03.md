# AWCE Circuit Breaker R0.3

**Scope:** deterministic offline health/recovery logic only. No executor admission, MCP transport implementation, network calls, service modifications, or production deployment.

## Composition

The circuit breaker in `src/awceCircuitBreaker.ts` implements `RouterPorts.health` from the reviewed AWCE R0.2 draft, via an explicitly injected `AtomicBreakerStore`, `NativeHealthProbe`, clock, lease-token provider, and bounded policy. This branch builds upon draft PR #145, which in turn depends on draft PR #144.

The current Synnergyze Algolia CLI executable remains `NOT_ADMITTED`; successful unit tests do **not** change admission.

## State transitions

| State | Trigger | Transition |
| --- | --- | --- |
| CLOSED | healthy native probe | CLOSED, reset consecutive failures |
| CLOSED | unsuccessful probe below threshold | CLOSED, increment failures |
| CLOSED | failure threshold reached | OPEN, save opening timestamp |
| OPEN | cooldown still active | remain OPEN; no probe |
| OPEN | cooldown elapsed | HALF_OPEN with a single leased recovery token |
| HALF_OPEN | lease active | other probes blocked |
| HALF_OPEN | valid healthy probe completes before lease expiry | CLOSED |
| HALF_OPEN | valid failed probe completes before expiry | OPEN, restart cooldown |
| HALF_OPEN | probe lease expired or replaced | discard stale result, remain HALF_OPEN |

A new artifact digest is isolated from previous failure state. No learned routing preference, LLM policy override, or automatic privileged operation is allowed.

## Dependencies that still must be implemented and verified

1. **Atomic durable state**: a strongly consistent, serializable transaction or compare-and-swap service on estate-managed infrastructure. The in-memory test fake is not a deployable store. Concurrent process workers must observe the same circuit key.
2. **Native health probe**: bound to a specific authenticated MCP executor/transport and artifact digest, strictly read-only, deadline-enforced independently of this module, with no private user data.
3. **Cancellation**: enforce `probeTimeoutMs` at the network/worker boundary; an exception is recorded as a failed observation. The state machine alone cannot kill hung I/O or process calls.
4. **Monotonic clock**: timestamp source shared across workers; use trustworthy server time with bounded drift. Lease identifiers must be unique/unpredictable across workers. In-memory local clocks are only test fixtures.
5. **Authorization**: Warden's operation-specific signature, revocation and scope checks remain separate and mandatory. A healthy probe does not authorize an operation.
6. **Evidence**: River completion and nonexecution receipts remain separately mandatory. Health-state transition logs should be retained as independent evidence, without calling health transitions execution receipts.

### Current safety limits

- Closed circuits may admit multiple simultaneous read-only health probes; the atomic store serializes their *recording*, not the probe calls. A late success can clear an earlier failure while the breaker remains CLOSED, so a production implementation must choose probe ordering/epoch semantics and bound concurrency.
- A health success is not proof of an MCP tool execution.
- Only known `ADMITTED` records are probed; any storage failure, exception, missing lease token, expired recovery lease, or stale result produces `false`.
- No feature enables automatic promotion of an executor from `NOT_ADMITTED` to `ADMITTED`.

## Validation

Run `npm ci`, `npx vitest run src/awceCircuitBreaker.test.ts`, `npm run type-check`, and lint. These tests are purely synthetic and cannot verify provider availability.

**Do not merge, enable service discovery or deploy until dependency PRs and infrastructure integrations pass security review.**
