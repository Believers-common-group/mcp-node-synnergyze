# ALPHA-RIVER-KEY-LIFECYCLE-001

Status: **VERIFIED LIFECYCLE CONTROL / KEY V2 STAGED**

## Purpose

`ALPHA-RIVER-KEY-LIFECYCLE-001` governs signer-key succession for immutable River receipt signatures. It separates cryptographic validity, historical trust at signing time, and current key state.

Canonical invariant:

`OLD SIGNATURE != CURRENT KEY STATE`

A key being retired or revoked now does not automatically mean a signature was invalid when it was produced. Historical verification must evaluate the key at `signed_at`, including activation, validity window, revocation time, and any backdated compromise time.

## Key lifecycle

Supported operational states:

`STAGED -> ACTIVE -> RETIRED`

Emergency terminal states:

`ACTIVE|STAGED -> REVOKED`

`ACTIVE|STAGED|RETIRED -> COMPROMISED`

`STAGED` means the public key is registered and private material is secured, but the private key is unusable for signing.

State changes that alter operational trust require an executable Warden decision token bound to the exact key action and exact target key. The lifecycle transition function consumes the Warden runtime action through the existing GEE change-envelope mechanism.

No Warden token -> no activation, retirement, revocation, or compromise declaration.

## Rotation model

One signer identity may have multiple immutable key versions. At most one key version may be `ACTIVE` at a time.

Signer reference:

`ALPHA-RIVER-RECEIPT-SIGNER-001`

Current key inventory:

- v1 — signer key `ec23bf85-8b13-4a92-9ac6-71dbc2440721` — **ACTIVE**
- v1 public fingerprint — `kZma2tG_97WuUAkIvF7fMOqgY6mM4Q7dDkwuoq5IoXk`
- v2 — signer key `aadac578-2022-42e4-8d76-43a8c1bf785e` — **STAGED**
- v2 public fingerprint — `6mCcAmqDY_O0k3EYBK7qwFM1G4CtvWlRygilZALqBTI`
- v2 explicitly supersedes v1 after authorized cutover.

Private key material remains in Supabase Vault and is not included in this repository.

## Immutable lifecycle evidence

`riveros.signer_key_events` is an append-only key-state event ledger. It records registration, staging, activation, supersession, retirement, revocation, and compromise declarations with effective time, recorded time, authority reference, decision-token reference, execution reference, reason, metadata, and event hash.

`riveros.signer_keys` remains the current-state projection; the event ledger preserves the state-transition history.

## Historical signature trust

`riveros.receipt_signature_trust_assessments` is append-only. It binds a cryptographic verification result to the signer-key trust state at the signature time.

Representative outcomes:

- `VALID_TRUSTED_AT_SIGNING`
- `CRYPTOGRAPHICALLY_INVALID`
- `UNTRUSTED_COMPROMISED_AT_SIGNING`
- `UNTRUSTED_REVOKED_AT_SIGNING`
- `UNTRUSTED_NOT_ACTIVE_AT_TIME`
- `UNTRUSTED_OUTSIDE_VALID_WINDOW`

Trust assessment is automatically triggered when a signature-verification attestation is inserted. Lifecycle changes re-assess prior signatures under the new evidence basis without mutating earlier assessments.

### Verified v1 canary

- River receipt `03b6a0ba-b51c-426c-851c-da0ec25739b9`
- Signature `cb8f099f-e4eb-48f9-9010-623bf47971c4`
- Cryptographic verification: `VALID`
- Trust at signing: `TRUSTED_AT_TIME`
- Historical status: `VALID_TRUSTED_AT_SIGNING`

## Public verification key projection

`public.riveros_signer_public_keys` exposes only verification-safe material: signer/key identity, key version, algorithm, signature format, public JWK, public-key fingerprint, lifecycle state and lifecycle timestamps.

It deliberately excludes Vault secret identifiers, private key material and Warden token material.

Historical public keys remain available after retirement or revocation so old receipts remain independently verifiable.

## Rotation-safe signer worker

`alpha-river-receipt-signer/1.1.0` binds every signing attempt to the exact `signer_key_id` selected by the database. The worker retrieves private material by that exact key ID, eliminating a list-then-rotate race between key selection and private-key retrieval.

The existing public-key verifier remains independent from private material. Historical trust assessment is database-triggered and does not depend on the verifier worker version.

## Negative canaries

Verified:

1. STAGED v2 private key retrieval for signing is rejected with `SIGNER_KEY_NOT_ACTIVE`.
2. v2 activation without a Warden decision token is rejected with `WARDEN_DECISION_TOKEN_REQUIRED`.
3. Exactly one active signer key remains: v1.
4. v2 trust snapshot while staged is `NOT_ACTIVE_AT_TIME`.

## Compromise semantics

Revocation and compromise are deliberately distinct.

- `REVOKED`: trust ceases from the revocation boundary unless separate evidence establishes earlier compromise.
- `COMPROMISED`: may carry a backdated `compromised_at` time. Signatures at or after that time become historically untrusted even if the compromise was discovered later.

Therefore:

`KEY REVOKED NOW != SIGNATURE INVALID THEN`

but

`COMPROMISE EFFECTIVE BEFORE SIGNING -> HISTORICAL SIGNATURE UNTRUSTED`

## Security posture

The post-DDL Supabase advisor introduced no new signed-in-user `SECURITY DEFINER` warning for this lifecycle subsystem. New private lifecycle tables are RLS fail-closed and service-role only. The public verification-key projection has an explicit read-only RLS policy for `anon` and `authenticated`, with writes limited to `service_role`.

The wider estate remains **AMBER** because pre-existing `authenticated_security_definer_function_executable` warnings and leaked-password-protection configuration remain unresolved.

## Pending authority action

Key v2 is intentionally **not activated**. Activation must be backed by a real Warden/GEE policy, ACV, decision token and exact approved change envelope for:

`riveros.signer_key.activate`

Target:

`RIVEROS:SIGNER_KEY:aadac578-2022-42e4-8d76-43a8c1bf785e`

Until that authority exists and is consumed, v1 remains the sole signing key.

## Next assurance boundary

After governed key activation/rotation, the next independent assurance layer is `ALPHA-RIVER-EXTERNAL-TIMESTAMP-001`: external trusted timestamp/notary evidence. It must remain distinct from key lifecycle and signature verification.