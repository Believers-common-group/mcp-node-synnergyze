# BNR Creator Door R0.3 — Sandbox test and integration discovery

Status: LOCAL SYNTHETIC DEMONSTRATION PASSED; PRODUCTION CONNECTIONS BLOCKED.
Date: 2026-10-28. Related draft PR: #157.

## Discovery (read-only)

The connected Neon `vsr-public-services` project has:
- `uoe_app_bridge.action_requests` (actor, environment, action, input manifest, idempotency key, Warden reference, status, effect references);
- `uoe_app_bridge.actor_surface_grants` (actor grants, scopes, validity, status);
- `creator_relay_runtime` (inbox/outbox/receipt/attempt tables);
- `public.warden_execution_permit_state` (nonce, authority reference, expiry, consumption and revocation data).

Table existence is **not** a Creator Door entitlement, nor proof that the canonical Registry resides there. Read-only metadata was inspected; no Neon row changes were made. Canonical Supabase Registry/Warden API remains unverified.

## Locally generated R0.3 test package

The separate local Python prototype (not committed in this PR) adds a CLI-only, in-memory bridge mock to the R0.2 Creator Door. Test run: **23/23 passed** (10 R0.2 regressions, 13 new R0.3 checks).

Synthetic workflow:
`R0.2 PREVIEW -> SIGNED SYNTHETIC IDENTITY -> MOCK REGISTRY RESOLUTION -> MOCK WARDEN DECISION -> SYNTHETIC LEASE -> MOCK NEON ACK -> EXPLICIT SYNTHETIC EFFECT WITNESS -> P-256 SIGNED DEMO RECEIPT -> PUBLIC-KEY VERIFICATION`

Negative tests: mismatched/forged/expired identity; unconsented, revoked and expired membership; claimed external authority/effect; conflicting idempotency key; self-approval; tampered Warden decision; expired and replayed lease; premature effect; nonindependent witness; tampered receipt and wrong public key. Legacy local Creator Door tests still pass.

## Immutable boundaries

- Request != authority != lease != acknowledgement != effect.
- Synthetic P-256 signature != a production Warden or RiverOS cryptographic attestation.
- Local hash and public-key check != independent institutional custody.
- `external_dispatch: false` throughout R0.3: no action was sent to a connected Registry, Warden, Neon, or RiverOS service.
- Metronome and any other third-party creator community remain reference cases, not enrolled partners.
- Do not expose the mock bridge on a public endpoint or use its token keys for production.
- The R0.3 code and unit-test source reside only in the separate downloadable pilot package at this stage; do not infer that GitHub CI has executed those tests from this document.

## Required promotion controls

1. Canonical Registry project ID, API, contract owner and consent status.
2. Server-validated DigitalMe issuer/representation with JWT audience, JWKS key lifecycle and fresh revocation checks.
3. Independently validated Warden decisions with atomic single-use grants and execution leases.
4. Approved non-production Neon branch, action-request mapping, collision-safe acknowledgement and retry handling.
5. RiverOS signed receipt and verifier with separate custody and actual effect observation.
6. Security review, rollback, privacy compliance, independent operator approval and explicit partner consent.

Keep the PR in **draft**, and do not merge or deploy it as authorization evidence. See `CROSS-SURFACE-MANIFEST-CONTRACT.md` and the R0.2 release gates in this directory.