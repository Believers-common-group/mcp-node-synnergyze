# ALPHA-RIVER-RECEIPT-SIGNING-001

Status: DEPLOYED — LIVE CANARY VERIFICATION PENDING

Node: `ALPHA-NODE-001`

Signer: `alpha-river-receipt-signer/1.0.0`

Verifier: `alpha-river-signature-verifier/1.0.0`

Signer reference: `ALPHA-RIVER-RECEIPT-SIGNER-001`

Algorithm: `ECDSA_P256_SHA256`

Signature format: `P1363-RS-64`

Public-key fingerprint: `kZma2tG_97WuUAkIvF7fMOqgY6mM4Q7dDkwuoq5IoXk`

## Boundary

The original `riveros.receipts` row is append-only and is never modified to add a signature after issuance.

Signing is represented as a companion immutable attestation in `riveros.receipt_signatures`. Independent public-key verification is represented separately in `riveros.receipt_signature_verifications`.

`HASH VERIFIED != DIGITALLY SIGNED != INDEPENDENTLY VERIFIED`

## Key handling

- The public JWK and fingerprint are registered in `riveros.signer_keys`.
- The private P-256 signing JWK is stored only in Supabase Vault.
- Scheduler authentication keys are also stored in Vault.
- Private key material, worker secrets, database credentials and service-role credentials must never be committed to GitHub, Box, Notion, or manifests.
- Key state supports ACTIVE, RETIRED and REVOKED without rewriting historical signatures.

## Canonical signed payload

The signer signs the immutable receipt identity:

- `receipt_id`
- `event_id`
- `namespace_id`
- `sequence_no`
- `event_hash`
- `receipt_hash`
- `receipt_mode`
- `recorded_at`

The database computes and returns the canonical payload plus its SHA-256. The signer verifies that hash before signing.

## Separation of duties

### Signer

`alpha-river-receipt-signer/1.0.0`:

- has access to the private signing key through a service-role-only Vault resolver;
- may sign only verified River effect-witness receipts without an existing signature for the active signer key;
- self-verifies the signature against the derived public key before recording the immutable signature attestation;
- cannot mark that signature independently verified.

### Verifier

`alpha-river-signature-verifier/1.0.0`:

- has no private-key access;
- retrieves only the public JWK, signature and canonical receipt payload;
- recomputes the canonical payload hash;
- verifies the ECDSA signature using the public key;
- records the result as a separate append-only verification attestation.

## Scheduling

Two Vault-authenticated once-per-minute scheduler jobs are installed:

- `alpha-river-receipt-signer-minute`
- `alpha-river-signature-verifier-minute`

The signer runs before or independently of the verifier; the verifier selects only signatures that do not yet have its verification attestation.

## Current verification state

The schema, signer key registry, Vault secrets, Edge Functions and cron wiring were successfully installed. During the live canary step, the Supabase private connector began returning upstream/network `502` errors, and the local runtime could not resolve the private Supabase hostname. Therefore this contract is deliberately **not** marked VERIFIED yet.

Required closing checks when the private path is reachable:

1. Confirm one signature attestation exists for River receipt `03b6a0ba-b51c-426c-851c-da0ec25739b9`.
2. Confirm the original `riveros.receipts` row is unchanged.
3. Confirm the verifier records `VALID` using the public key only.
4. Confirm replay creates neither a second signature nor a second verification.
5. Confirm signer/verifier cron jobs are active and return HTTP 200.
6. Rerun the Supabase security advisor.

Until those checks pass, the correct assurance state remains:

`RIVER HASH-CHAIN VERIFIED / RECEIPT SIGNING DEPLOYED / LIVE SIGNATURE VERIFICATION PENDING`
