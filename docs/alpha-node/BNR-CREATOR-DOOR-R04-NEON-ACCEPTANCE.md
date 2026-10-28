# BNR Creator Door R0.4 — Isolated Neon Staging Gate

**Status: SYNTHETIC POSTGRESQL ACCEPTANCE PASSED; CANONICAL AUTHORITY INTEGRATION BLOCKED.**
Date: 28 October 2026.

## Where the validation ran

A separate non-default child branch named `bnr-creator-door-r04-synthetic-20261028` was created in the BNR runtime-stitcher **verification** Neon project, not the VSR runtime project and not the production Registry. The user can inspect this branch in their connected Neon account.

The branch includes the `bnr_creator_r04` PostgreSQL schema with synthetic requests, permits, leases, acknowledgements, effect-witness placeholders, receipt-verification placeholders and acceptance-check evidence. All seven tables have RLS enabled. Schema PUBLIC privileges, table PUBLIC privileges and the transition functions' PUBLIC execution rights were revoked. No general access policy was granted.

The acceptance functions use `SECURITY INVOKER` and enforce:
- synthetic namespace and `external_dispatch=false`;
- consent not revoked before acknowledgement;
- matched actor and payload digest between request and synthetic decision;
- an unexpired synthetic permit and lease, locking the request/permit/lease on acknowledgement;
- exactly one lease consumption and one acknowledgement;
- separate, non-creator/non-reviewer synthetic witness only after acknowledgement;
- idempotency uniqueness and fail-closed errors.

The PostgreSQL test issuer itself was a privileged synthetic fixture producer, **not** an independently verified DigitalMe/Warden issuer.

## Test evidence

17 of 17 database checks passed: wrong lease; missing permit; revoked grant; expired permit; mismatched digest; expired lease; premature effect; duplicate idempotency; external-dispatch guard; self-approval; denied consent; one acknowledgement; replay denial; self-witness denial; reviewer-witness denial; one synthetic witness; witness replay denial.

Separate local Python regression suite: 27 tests passed (23 prior mock tests + four historical evidence snapshot checks).

A post-test database read returned:
- 8 synthetic requests, 7 permits;
- 1 consumed lease, 1 mock acknowledgement;
- 1 synthetic witness;
- **0 receipt-verification records**, **0 external-dispatch records**, 17 passing acceptance checks.

`LOCAL SYNTHETIC EFFECT WITNESS != EXTERNAL EFFECT OBSERVED` and
`MOCK ACKNOWLEDGEMENT != REAL NEON SERVICE DELIVERY`.

These counts are a dated observation, not continuous monitoring. The complete local non-production R0.4 package includes a clean-branch schema script, source code and test report; it has not been committed or deployed as a service via this PR.

## Important compatibility finding

The inspected `vsr-public-services.uoe_app_bridge.action_requests` table has a `source_app` constraint allowing only `VSR` and `EMPIRE`. Do **not** insert `BNR` or weaken the constraint without a separately approved contract change. No data was written to that project.

## Required release gates

1. Verify canonical Supabase BNR Registry and its API; previous DB connection returned ECONNREFUSED.
2. Approve DigitalMe JWT issuer, audience, JWKS rotation and representation validation.
3. Approve Warden signature/decision verification and atomic one-use execution lease custodian.
4. Approve non-production action-request mapping and authorized worker identity for runtime transport.
5. Independently witness effect and verify a signed real RiverOS receipt with separate key custody.
6. Review RLS under an ordinary least-privilege role (owner-level staging tests bypass ordinary RLS), privacy, incident handling, operator consent and rollback.

No live creator enrollment, Metronome partnership, Silk settlement, external relay, or public deployment has been initiated. Keep PR #157 as **DRAFT** until the gates close.

See `BNR-CREATOR-DOOR-R02-CONTRACT.md`, `BNR-CREATOR-DOOR-R02-RELEASE-GATES.md`, and `BNR-CREATOR-DOOR-R03-SANDBOX-RESULTS.md`.
