# AUTHORITY-REFERENCE-R12 — Offline Issuer Governance and Replay Protection

**Status: source-only STAGING REVIEW / HOLD. The project is not admitted or deployed.**

## R1.2 scoped implementation

- `modules/synnergyze/authority-reference-issuer-registry.ts`: verifies a **root-signed, versioned test directory** of three independently keyed issuer roles (DigitalMe, Warden, RiverOS). Requires an independently supplied test-root SPKI SHA-256 pin and namespace, monotonic minimum generation, bounded directory validity, distinct signer public keys and issuer IDs, per-key ACTIVE/REVOKED states, and per-key validity periods. Root key is never embedded.
- `modules/synnergyze/authority-reference-triple-issuer.ts`: verifies three cryptographically signed test proofs (DigitalMe identity context, Warden decision and River admission receipt) against the root-verified issuer directory. Binds actor, context, request, capability, candidate and worker digests, program/event, shared nonce and delegated assertion digest, and re-runs the R1.1 Warden–River exact-binding check with directory-derived trust keys.
- `modules/synnergyze/authority-reference-replay-ledger.ts`: explicit `OfflineNonceLedgerR12` stores a *hashed* nonce key with exclusive-create `wx` and synchronizes the record. Atomic duplicate prevention is scoped to a **single pre-provisioned, private, non-symlink local directory and its filesystem**. A missing, writable-by-others, or unavailable staging directory fails closed. An incomplete file still spends the nonce. No reset method is exposed.

## Assurance limits — do not misinterpret
- The root public key is **operator-supplied test material**. Mathematical verification against it does NOT prove that DigitalMe, Warden or RiverOS are independently administered or production-authorized.
- A caller-provided `minimumGeneration` is a rollback barrier only if stored and governed independently. The implementation does not maintain a live signed root-of-trust service.
- The nonce ledger is NOT a distributed transactional ledger, not a production permit ledger, and has no guaranteed cross-host or multi-volume uniqueness. The service does not claim power-loss guarantees that exceed those of the local filesystem.
- The offline verifier does NOT connect to a live worker, actual Warden API, real DigitalMe identity issuer, RiverOS intake, BNR Door or Genesis resource-admission service. It never reads official external sources, registers an MCP tool, issues production execution rights or modifies production policy.
- A valid fixture signature plus successful local nonce reservation is still **HOLD**, `executionAllowed=false`, `authoritativeAdmission=false`, `actualRiverReceiptVerified=false`, `oneTimeProductionPermitConsumed=false`.
- Envelopes, issuer directory, revocation list and local ledger are test-only; install no fixture keys in actual trust stores.

## Negative tests
Tampered root signatures, wrong root pin, generation rollback, expired directory, expired/revoked signer keys, shared signers across roles, DigitalMe/Warden/River nonce or scope mismatch, changed Warden signed claims, duplicate exact request, concurrent double reservation, restart/reconstruction persistence, replay with different content, insecure directory, and an invalid initial assertion never spending its nonce.

## Review

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install vitest run modules/synnergyze/authority-reference-preview.test.ts modules/synnergyze/authority-reference-commissioning.test.ts modules/synnergyze/authority-reference-admission-chain.test.ts modules/synnergyze/authority-reference-triple-issuer.test.ts
npm run type-check
```

## Production admission prerequisites (not implemented)
A separately governed production root trust registry with revocation freshness, approved worker build and actual deployment, verified DigitalMe principal and BNR Door / ARK membership scope, Genesis attested available capacity, live Warden admission and signed River receipt, transactional **shared** global nonce/permit one-time-use ledger, source-specific restricted egress, independently verified execution receipt, and a distinct operator-approved go-live decision. Approval for a review PR does not grant any of these.
