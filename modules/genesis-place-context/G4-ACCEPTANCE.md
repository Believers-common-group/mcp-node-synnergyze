# G4 — Place Context acceptance closure

**State: SANDBOX CONFORMANCE COMPLETE ONLY; LIVE ADMISSION ALWAYS HOLD.**

Stacked change sequence: Genesis control contracts (genesis-stack PR #61),
runtime G1 (#136), synthetic Warden/River G2 (#138), signed-source G3 (#140),
followed by this G4 acceptance gate.

## Deliverable

The offline G4 evaluator checks the consistency of G1 place context lineage,
G2 synthetic Warden review, the deterministic G2 River evidence preview,
and explicit G3 non-effect markers. It returns a deterministic report
which can have conformance PASS or FAIL, but whose operationalAdmission
is always HOLD. Passing synthetic cryptographic tests is NOT government,
regulatory, tax, site-title, tenancy, or statutory permission.

The optional in-memory audit preview links report digests, supports replay
idempotency, and detects local alterations. It is neither persistent nor
externally witnessed, and must never be labeled a real River append/seal.
No real provider requests, device or payment effects, credentials, APIs,
or production Warden decisions are created here.

## Acceptance commands

- npm run type-check
- npm run lint
- npx vitest run modules/genesis-place-context
- npm run test

## Mandatory live-operation blockers

1. Independent regulator/source competence and trust-root admission.
2. Jurisdictionally complete applicable legal corpus, with amendment and
   expiry history independently evidenced.
3. Provider-native verification of estate/site/tenant legal-entity and
   registration claims; no Place-only tax inference.
4. Independent Warden signed authority, policy version, scope and revocation.
5. Durable River append/seal, replay, retention, privacy and read-back.
6. Approved pilot scope, consent, operator sign-off, cost and exit controls.

No self-declared boolean or synthetic Ed25519 signer in this code can
remove these blockers. Do not merge/deploy the stacked drafts or publish
claims of live readiness without a separate authenticated production gate.

## Negative-case acceptance

The G4 tests reject unverified and incomplete source context, mismatched
estate/Place/actor/envelope identifiers, digest forgery, unsafe authority
states, fabricated provider effects, preview gaps, replay and local
chain modification. G3 separately exercises signed rule/inventory
cryptographic validity and applicability/time/actor-bound proofs.

## Architecture

Earth → Virtual Estate → Place → Location → Door → Room → Window/Stage
→ Activity. A Place is recognized by a Virtual Estate, not thereby
owned or legally licensed. Multiple estates may recognize the same
physical site through independently verified bindings.
