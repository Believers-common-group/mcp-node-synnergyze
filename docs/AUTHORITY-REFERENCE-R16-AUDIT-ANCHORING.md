# R1.6 — Test-Only Signed Recovery Checkpoints

**Governance state: HOLD. No worker commissioning, production signing keys, external audit system, or official-source access.**

## Threat model and exact implementation
- R1.5 exports a synthetic PostgreSQL restart/restore recovery checkpoint with source commit, original/restored database system identifiers, spent synthetic row count, row digest, replay-rejection evidence and `externallyAnchored=false`.
- The R1.6 GitHub Actions workflow has **three jobs on separate runners**:
  1. `produce-synthetic-evidence` runs disposable PostgreSQL and publishes the **synthetic** recovery checkpoint only.
  2. `sign-test-evidence` has **no database service, database credentials, or networked audit service**. It generates an ephemeral Ed25519 **test** key, validates the checkpoint shape, signs its exact file bytes and bound source commit with domain separation, and publishes an offline review bundle with public key, signature and computed public-key SPKI pin. Its temporary private key is destroyed.
  3. `verify-signed-evidence` independently recomputes file digest, checks a fixed versioned signature message, tests a separately passed public-key pin, exact commit and expiration, and ensures that the evidence and all verification outputs explicitly preserve **HOLD**. It then injects adversarial changes to row digest, bundle authority status, pin and commit, all of which must fail verification.

- The signed proof includes run ID, source commit, original and restored PostgreSQL IDs, candidate file SHA-256, row digest, exact original row count, 10-minute validity, audience and explicit `CI_EPHEMERAL_TEST_ONLY` designation.
- The verifier never produces an execution permit or treats the test identity as a Warden/River issuer. Even valid signatures only establish that one **ephemeral test key** signed the fixture candidate.

## Security boundary — NOT an independently anchored production event
A GitHub Actions artifact, even when signed, is not independently administered off-platform notarisation. **The pin is derived during the same workflow as the ephemeral test key**, rather than published beforehand in an independent trust store. It protects the signature's mathematical integrity under this one test run, but does **not** establish independent signer identity, tamper-proof retention or trusted date of a historical source record. The GitHub run ID and short-lived commit binding are only provenance metadata, not legal or regulatory certification.

No external anchoring occurs. No new source network connector, credential request, service deploy or database migration beyond the throwaway CI PostgreSQL service. The source checkpoint includes no user/client data. All artifacts use seven-day retention and may expire.

## Validation
```sh
# Automatically runs for this PR:
# .github/workflows/authority-reference-r16-audit.yml
# Per-run prerequisites: disposable PostgreSQL 16 service + Node 22
# A successful verify job must emit:
# R1.6 PASS: signature and candidate bound, tampering/pin/commit substitution refused; all outputs HOLD
```

## Still missing for independently anchored production evidence
- An independently governed, registered audit signer with pinned trust roots, HSM or equivalent key custody and monitored rotation/revocation.
- An append-only evidence store outside the worker/database security domain, retention/legal-hold controls, signing timestamp policy, and independent reader verification.
- Verified production database identity and authenticated TLS/client policy. PostgreSQL system identifier is **not** a cryptographic server certificate.
- A recoverable, audited and authorised multi-host replay/permit service, not just disposable test containers.
- Real DigitalMe/BNR Door and ARK scope, Genesis capacity, Warden admission and **live River admission + execution receipts**, plus separate release approval.

**Do not merge or deploy this source-only PR as an authority grant. Preserve existing Warden and Vercel restrictions.**