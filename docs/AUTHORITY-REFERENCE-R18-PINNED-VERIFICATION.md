# Authority Reference R1.8 — Independently Pinned Signature Conformance

**Status: source-only staging review; production authority remains HOLD.**

The R1.8 verifier extends R1.7's 13 scoped evidence records with Ed25519 signature checks. Its public keys and SPKI SHA-256 pins must be supplied separately from the evidence packet, with explicit key state, issuer identity, validity interval and minimum registry generation. This does **not** establish that those pins came from an independently commissioned estate authority. Key provenance, revocation freshness and controlled key custody require verification by separately appointed domain custodians.

Checks reject malformed signatures, changed evidence/claim bindings, unknown or revoked keys, expired attestations, incorrect namespace/generation, repeated attestation controls, and shared signing identities in key governance-critical roles. The canonical signature covers the specific control, candidate digest, evidence digest, issuer identity, nonce and time limits. Inputs and signing keys in tests are disposable.

Every result is `HOLD`, with `executionAllowed=false`, `issuerAuthorityVerified=false`, `liveRiverReceiptsVerified=false`, and `permitConsumed=false`, including a result with 13 matching offline signatures.

Run `npx --no-install vitest run modules/synnergyze/authority-reference-r18-pinned-verification.test.ts` for negative tests.

### Boundary to live independent verification
1. Confirm identity and written mandate of each independent control owner, including external audit signer.
2. Obtain trusted out-of-band public-key pins and signed generation/revocation records.
3. Authenticate actual deployed worker artifact, Warden service and RiverOS issuer endpoints.
4. Bind current DigitalMe/Door/ARK/Genesis rights to the same request and capability.
5. Authenticate real Warden admission with a signed River admission receipt and separate execution receipt.
6. Verify global atomic replay protection and source egress policy under a separate, explicit deployment approval.

No live endpoints, credentials, databases, user devices, MCP routes, government registries or production deployment settings are touched.
