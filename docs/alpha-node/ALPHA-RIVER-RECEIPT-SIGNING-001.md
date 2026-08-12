# ALPHA-RIVER-RECEIPT-SIGNING-001

Status: VERIFIED CONTINUOUS DIGITAL-SIGNATURE ASSURANCE

Node: `ALPHA-NODE-001`

Signer: `alpha-river-receipt-signer/1.0.0`

Verifier: `alpha-river-signature-verifier/1.0.0`

Signer reference: `ALPHA-RIVER-RECEIPT-SIGNER-001`

Signer authority: `ALPHA-RIVER-SIGNER-POLICY-001`

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
- Key state supports `ACTIVE`, `RETIRED` and `REVOKED` without rewriting historical signatures.

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
- signs only verified River effect-witness receipts without an existing signature for the active signer key;
- self-verifies the ECDSA signature before recording the immutable signature attestation;
- cannot mark that signature independently verified.

### Verifier

`alpha-river-signature-verifier/1.0.0`:

- has no private-key access;
- retrieves only the public JWK, signature and canonical receipt payload;
- recomputes the canonical payload hash;
- verifies the ECDSA signature using the public key;
- records the result as a separate append-only verification attestation.

## Scheduling

Two Vault-authenticated once-per-minute scheduler jobs are active:

- job `11` — `alpha-river-receipt-signer-minute`
- job `12` — `alpha-river-signature-verifier-minute`

## Verified canary — 12 Aug 2026

River receipt:

- receipt: `03b6a0ba-b51c-426c-851c-da0ec25739b9`
- receipt hash: `cd399a46168bd196370b3261b24b0abc5c11b12d6e4272e11ad84fc25607a12a`
- mode: `HASH_CHAINED_INTERNAL`
- original receipt `signature_algorithm`, `signature` and `signer_reference` remain `NULL`; history was not rewritten.

Signature attestation:

- signature: `cb8f099f-e4eb-48f9-9010-623bf47971c4`
- signer: `ALPHA-RIVER-RECEIPT-SIGNER-001`
- key version: `1`
- canonical payload SHA-256: `c893141173d25b341e05c2edd675e7a5986094ed5111c82cff701280a1c717b2`
- signed at: `2026-08-12T19:30:03.530Z`
- issuance state: `SELF_VERIFIED`
- signature evidence hash: `0cccb76b66ea6b03d23c20cb29e6041cdb2e57ddf01a30036b3463aa6b246185`

Independent verification:

- verification: `275c53f6-330e-4505-9b23-c92142a8f928`
- verifier: `ALPHA-RIVER-SIGNATURE-VERIFIER-001`
- verifier version: `1.0.0`
- result: `VALID`
- verified at: `2026-08-12T19:31:00.971Z`
- verification used public key only
- signature length: `64` bytes
- key state at verification: `ACTIVE`
- verification evidence hash: `7f348c5de9473454cfbd69a0f74779d8274effbed7ee30e11c43b5e1cff280e9`

Replay verification at the next minute:

- signer: HTTP 200, processed `0`
- verifier: HTTP 200, processed `0`
- signature count for this receipt remains `1`
- verification count remains `1`

The signature-recording RPC was additionally hardened against concurrent duplicate insertion: conflicts resolve to the already-existing immutable attestation rather than attempting to update it.

## Registry evidence chain

The Registry now resolves:

`RIVER-RECEIPT:03b6... -> RIVER-SIGNATURE:cb8f... -> RIVER-SIGNATURE-VERIFICATION:275c...`

The signature and verification are each represented by their own evidence reference and SHA-256 evidence hash.

## Security status

Post-DDL security advisor results introduce no new authenticated `SECURITY DEFINER` warning for this signing subsystem. The new River signing tables appear only as intentional `RLS enabled / no policy` INFO because they are private fail-closed/service-role surfaces.

The estate remains AMBER for unrelated pre-existing DigitalMe/gateway-agent SECURITY DEFINER warnings and disabled leaked-password protection.

## Standing invariant

`RIVER HASH VERIFIED != DIGITAL SIGNATURE != PUBLIC-KEY VERIFICATION != KEY TRUST STATE`
