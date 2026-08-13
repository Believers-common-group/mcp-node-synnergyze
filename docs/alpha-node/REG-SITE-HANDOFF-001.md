# REG-SITE-HANDOFF-001 — Warden Cross-Site Handoff

Status: `ALPHA / SCAFFOLDED_NOT_ACTIVATED`
Containing node: `ALPHA-NODE-001`
Authority boundary: `WARDEN`
Registered apps: `APP-BC-001`, `APP-CC-001`
Registration contact: `warden@believerscommon.com`

## Purpose

Provide DigitalMe continuity between Believers Common, Creators Common and Virtual Silk Road without sharing a browser cookie across top-level domains and without allowing a website to self-issue authority.

```text
DigitalMe
  -> source site
  -> Warden grant verification
  -> short-lived handoff token
  -> destination site
  -> audience + signature + expiry + return URL verification
  -> one-time nonce consumption
  -> scoped destination session
  -> River evidence
```

## Token invariants

- issuer is `WARDEN`
- containing node is `ALPHA-NODE-001`
- audience is exactly one destination site
- source and destination must differ
- maximum TTL is 120 seconds; default is 90 seconds
- return URL must remain on the destination site's canonical HTTPS origin
- every token carries a unique nonce
- every token references a pre-existing Warden grant
- token verification uses constant-time signature comparison
- replay must fail closed

## App registration

The first two Warden site applications are recorded in `config/site-apps/REG-SITE-APP-001.json`:

- `APP-BC-001` — Believers Common — `https://believerscommon.com`
- `APP-CC-001` — Creators Common — `https://creators-common.org`

The registered administrative/contact address for both is `warden@believerscommon.com`.

VSR remains the Front Gate destination/source surface under `REG-SITE-001`; a dedicated VSR app registration can be added when its authentication client boundary is separated from the public Front Gate projection.

## Activation gate

The cryptographic protocol and synthetic replay tests are implemented, but production issuance/consumption is deliberately not enabled yet.

Activation requires:

1. a real Warden grant verifier bound to the current DigitalMe/session;
2. a durable atomic replay store shared across serverless instances;
3. River evidence reservation before issuance and sealing after successful consumption;
4. destination-side scoped-session creation with no shared cross-domain cookie;
5. production secrets stored only in the deployment secret manager;
6. end-to-end proof for BC -> CC, BC -> VSR, CC -> BC and CC -> VSR.

The `/site-handoff` route therefore reports readiness only and returns `activation_allowed: false` until those gates are satisfied.
