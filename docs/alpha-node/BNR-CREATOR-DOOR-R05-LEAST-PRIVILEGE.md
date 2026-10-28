# BNR Creator Door R0.5 — Least-Privilege / Canonical Authority Gate

**Status:** isolated Neon authorization probe PASS; production Registry/Warden/RiverOS **NOT CONNECTED**.
**Observed:** 28 October 2026.
**Related:** Draft PR #157 and R0.2–R0.4 contract and acceptance evidence.

## Isolated experiment (not a deployment)

Created `bnr-creator-door-r05-authz-probe-20261028`, a **non-default child** of the R0.4 synthetic Neon acceptance branch in the existing BNR runtime-stitcher **verification** project. The VSR project, canonical Registry, and production data were not modified.

The R0.5 child has a `bnr_cd_r05_probe` role with `NOLOGIN`, no superuser privilege and no BYPASSRLS. It was granted schema USAGE and table SELECT strictly for the test. All seven inherited staging tables have RLS enabled and **no allow policy** for that role.

Actual SQL under `SET LOCAL ROLE bnr_cd_r05_probe` produced:
- RLS-visible request rows: **0** (despite eight existing synthetic fixture rows).
- `INSERT`: **denied**; `UPDATE`: **denied**.
- Execute `acknowledge_synthetic` and `witness_synthetic`: **denied**.
- Setting a caller-controlled `bnr.actor_ref` configuration variable did **not** make rows visible. The variable is not a trusted identity assertion.
- Attempted writes and guarded function calls yielded `insufficient_privilege`; tests asserted they could not succeed.

Owner-level follow-up read: 8 synthetic requests, one mock acknowledgement, one synthetic witness, **zero independent receipt verification rows**, zero external-dispatch records. The R0.4 historical 17/17 SQL acceptance checks remain in that inherited synthetic dataset.

## Local R0.5 package

The **downloadable standalone Python pilot**, not committed as executable application code here, adds an offline, key-pinned JOSE ES256 identity verifier and negative tests. It accepts only a pinned public key and matching issuer/audience/lifetime; disallows `none`, wrong key, untrusted JWK/JKU headers and forged signatures. Its API returns identity facts, **never Registry membership or Warden authority**.

The complete R0.5 local regression suite passed **46/46** tests (prior tests plus new identity and evidence diagnostics). A simulated signing key is created transiently for unit tests; **no real DigitalMe JWKS was used or verified**.

## Release blocks

1. Canonical Supabase Registry and representation API cannot be verified: connected database inspection returned `ECONNREFUSED`; no authoritative membership read.
2. DigitalMe trusted issuer/audience, production JWKS, rotation, fresh session/revocation and representation chain unverified.
3. Warden signed decisions and atomic one-use authority/lease issue/consume APIs unverified.
4. Designated non-production transport worker/service identity and VSR action mapping not authorized. The inspected `uoe_app_bridge.action_requests.source_app` CHECK permits `VSR` and `EMPIRE`, not `BNR`.
5. Real runtime acknowledgement plus separate RiverOS effect witness, receipt signing and independent public-key verification unverified.
6. Ordinary application-account RLS policies, operator consent, external platform rights, privacy, threat model and rollback review outstanding.

**DO NOT** grant the probe role live access, move the sandbox schema to a default branch, publish a signed test identity as real DigitalMe, modify the VSR source constraint, or enable external dispatch. No Metronome partnership, payment access or live Creator Door registration exists.

The R0.5 child branch remains available for inspection and may generate Neon compute/storage charges. Clean up only after the evidence is reviewed.

## Machine-readable record

[BNR-CREATOR-DOOR-R05-RESULTS.json](./BNR-CREATOR-DOOR-R05-RESULTS.json) contains the dated acceptance snapshot and explicit false statuses for every unverified external authority gate.

A GitHub PR, local signature, and a role/RLS test are **not** authorization for a real effect.
