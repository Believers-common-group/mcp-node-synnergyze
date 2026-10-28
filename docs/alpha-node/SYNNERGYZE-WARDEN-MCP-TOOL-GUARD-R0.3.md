# SYNNERGYZE / WARDEN — MCP Tool-Guard R0.3

**Status:** Draft candidate. Design-time and test-only. **Do not deploy.**

## Engineering objective

Introduce an invocation-time enforcement boundary in Synnergyze's *actual* MCP `tools/call` dispatch for all tools in `GOVERNED` mode, including tools with no argument schema and tools annotated read-only. Do not confuse static `allowTools` / `denyTools` filtering with legal or organisational authority.

## Architecture

```text
DigitalMe / Genesis Gateway  -- independent, authenticated context (not implemented here)
      |
Warden authoritative decision + live River receipt (not implemented here)
      |
Trusted, server-owned ToolInvocationGuard adapter (no production adapter registered)
      |
Synnergyze MCP tools/call
      +-- schema validate
      +-- requireInvocationAuthority()  <- NEW
      +-- callback / provider I/O        <- only after successful gate
```

The third `startServer` argument is a **server bootstrap dependency**, never a CLI option, header, MCP parameter or LLM-provided assertion:

```ts
await startServer(options, transport, {
  mode: "GOVERNED",
  guard: createDenyAllWardenGuard(), // current secure default; blocks execution
});
```

A deployed adapter may someday supply `ALLOW` only after cryptographically verifying the independently authorised Warden decision, exact actor/case/capability/scope/expiry, live matching River receipt, revocation, replay and request-specific constraints. **This repository does not yet contain such an adapter or attestations.**

The `canInvokeGovernedTool` function only checks the verdict's shape. The `SYNTHETIC_ONLY` test mock is a test double and proves **dispatch wiring only**; it is not proof that the decision or receipt is genuine. A production adapter must provide authenticated, unforgeable attestation before use; never treat text strings such as `wardenDecisionRef` or `riverReceiptRef` as evidence by themselves.

## Compatibility and default safety

- Existing Algolia tools remain functional under the unchanged **LEGACY** default. This does not retrofit Warden authority to those tools.
- A tool registered as `governed: true` or with reserved `warden.`, `genesis.`, `telco.`, `subscriber.`, `intercept.` prefixes cannot register in LEGACY mode.
- In GOVERNED mode, every registered callback, including ordinary read/write Algolia tools, is preceded by the guard.
- If the trusted guard is missing or throws, the call is denied and its private error details are not exposed.
- `createDenyAllWardenGuard` returns HOLD, so **all calls in governed mode remain blocked until a separately reviewed, authoritative adapter exists**.
- No telecom tools, interceptors, subscriber location APIs, credentials, legal orders or telecom data are added. Never treat BNR/Genesis credentials as governmental powers.

## Tests

`npm run type-check`
`npm run test -- --run`

The new tests cover registration restrictions, missing guard, schema and no-schema callbacks, error redaction, forged caller authority flags, incomplete receipt claims, denied GET/POST reaching no provider I/O, synthetic success path and legacy compatibility.

## Outstanding before any production use

1. Server-side DigitalMe and organisation verification from Registry Desk, tenant and case isolation, and externally verified legal authority.
2. Cryptographic Warden signatures, case- and request-specific policy, revocation, expiry, scope, purpose and time-limited leases.
3. Matching authenticated live RiverOS evidence and failure-safe receipt matching, never a caller-supplied receipt ID.
4. Durable, atomic distributed replay and idempotency store; no in-memory-only assurance.
5. Independent authorization per physical, legal and geographic jurisdiction. The associated India telecom assurance pack remains a separate **unadmitted** candidate in the Alpha Warden repository.
6. Dedicated threat model, penetration testing, no-bypass review of additional transport paths, secrets and logging review.
7. Staged explicit rollout and independent governance/security review. No merge or release under this PR without approval.

## Upstream context

- Related Warden candidate: https://github.com/Believers-common-group/alpha-warden-admission-core/pull/5
- Operating boundary: `docs/alpha-node/ALPHA-NODE-001-OPERATING-BOUNDARY.md`
- `REQUEST != AUTHORITY != EXECUTION != EFFECT` remains the governing invariant.
