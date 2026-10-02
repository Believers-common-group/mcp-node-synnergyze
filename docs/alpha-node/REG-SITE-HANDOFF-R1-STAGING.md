# R1 Staging Cross-Domain Assurance — review gates

Scope: \`REG-SITE-HANDOFF-001\`, Believers Common / Creators Common / VSR.

This review branch adds \`site-handoff/assurance.ts\` (injectable coordinator) and \`site-handoff/assurance.test.ts\` (synthetic acceptance tests). It does NOT add any public route, grant issuer, deployed adapter, environment secret, River production record, DigitalMe assertion, production session or default-branch mutation.

## Existing upstream boundaries

- The existing \`site-handoff/runtime.ts\` implements HMAC SHA-256 audience-bound, short-lived tokens and nonce \`ReplayStore\` interface.
- \`MemoryReplayStore\` is **only suitable for synthetic tests**; multi-instance production requires atomic, persistent consume-once.
- Existing \`api/site-handoff.ts\` must remain \`activation_allowed:false\`.
- Existing Warden decision and River reservation demo services in this repository are described as **synthetic**. They are not eligible as live verifiers or evidence appenders.

## Staging sequence

1. DigitalMe native issuer/session proof check: principal ID, verified status, proof reference, expiry.
2. Warden native grant verification: principal, source, destination, exact \`SITE_HANDOFF\` action, ACTIVE and ALLOW, decision reference, expiry.
3. Handoff token proposal and River native reservation: binds nonce, principal, audience, Warden decision reference.
4. Only after successful reservation, return token to caller.
5. Destination validates audience, signature, canonical origin, TTL and atomic nonce replay check.
6. Re-check DigitalMe and Warden, lookup exact native River reservation.
7. Prepare capability-inert scoped destination session.
8. Seal native River evidence and only then activate the session.
9. On any failure, fail closed; abort any prepared session. Sealed-but-not-activated state must be sent to reconciliation; it must NOT be represented as completed execution.

## Remaining blockers / mandatory independent review

- No native DigitalMe proof-verification adapter has been implemented here.
- No native Warden grant-verification adapter has been implemented here.
- No real River reservation/seal adapter has been implemented here.
- No durable atomic nonce store, verified reconciliation or destination session backend has been implemented here.
- The coordinator currently consumes the one-time nonce before destination native authority and River lookup. A failure consumes the token and requires a fresh Warden-approved issuance (fail closed). Rate limits, DoS protections and idempotent retriable states require independent security design before activation.
- Verify full Warden grant binding to destination URL / scope (not merely origin) and least-privileged destination session semantics.
- Real-time revocation/freshness must be proven; concurrent redemption and multi-region split-brain must be tested.
- Reservation failure/timeout, unreachable Warden, sealed-but-inert sessions, crash consistency, post-seal activation failure and session cleanup must be evidenced.
- CI type-check, original \`test:site-handoff\`, R1 tests, lint and independent Sentinel/reputation review required.
- No public metrics or production identity, activity or receipts are claimed.

**Promotion state: HOLD.** This is a staging contract proposal, not a production-ready implementation.
