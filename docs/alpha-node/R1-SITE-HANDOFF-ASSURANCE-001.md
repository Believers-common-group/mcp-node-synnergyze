# VSR R1 — Governed Cross-Domain Handoff Assurance (staging-only)

State: **DRAFT — NOT ACTIVATED**. Change set: R1-SITE-HANDOFF-ASSURANCE-001. Applies to BC, CC and VSR under REG-SITE-HANDOFF-001.

## Ownership and intended scope
- DigitalMe: independently verify current principal proof, never a caller-supplied boolean.
- Warden: verify grant ID, principal, source, audience, SITE_HANDOFF action, lifecycle and time window at issuance **and** consumption.
- River: reserve issuance before returning a token; retrieve exact nonce/principal/audience/decision-bound reservation; seal evidence before destination activation.
- Destination: create an inert PENDING session; activate after seal, abort on failure.
- Replay: persistent atomic cross-instance nonce consumption. In-memory storage is synthetic only.
- Provider/source-native verification remains authoritative; a transport link or site navigation alone grants nothing.

## Scope restriction
No production issuance, deployment, Vercel/Railway settings, route activation, external calls, secrets, real Warden or River binding, shared cross-domain cookies, or public SSO claims.

## CI validation commands
- npm ci
- npm run type-check
- npm run test:site-handoff
- npm run lint

Added synthetic cases: principal mismatch, denied/revoked grant, unbound reservation, rejected River seal, wrong audience, replay, and failed session activation. Existing runtime tests cover signing, TTL, audience and URL validation.

## Independent security review
1. **Proof authenticity**: Validate native issuer signatures, revocation, proof and decision authenticity. A Warden-named string is not proof.
2. **Atomicity**: Durable/idempotent replay, River and session operations; reconciliation on crash or post-seal activation failure.
3. **Trusted time**: Bound skew and enforce proof/grant expiry at use time.
4. **Destination**: Restrict return paths in addition to allowed canonical HTTPS origins.
5. **Token leakage**: Mask logs, history, referrers, analytics and traces.
6. **Isolation**: Enforce estate, tenant, relationship and purpose scope.
7. **Unavailable dependency**: No synthetic or permissive fallback.
8. **Compensation**: A seal without activation must have an explicit aborted/reconciled outcome.

## Release gate — HOLD
Require independent Sentinel/security review, confirmed CI, real DigitalMe/Warden/River adapters, durable replay, a destination session service, multi-instance and crash tests, and separate explicit deployment approval.