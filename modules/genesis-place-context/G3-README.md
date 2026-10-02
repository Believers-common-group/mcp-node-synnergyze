# G3 — Signed Source Assurance / Bounded E2E (test-only)

Draft G3 stacks onto G2 (draft PR #138), G1 (#136), and Genesis contract G0 (#61). No real world estate, tax rule, statute, regulator credentials, signed government trust roots, external endpoint, Warden admission, production provider action, or River append is introduced.

## Trust model
- Cryptographic integrity: verify Ed25519 signatures on purpose-scoped source claims, digest of exact original bytes and time/jurisdiction/provider scopes. Key trust anchors are explicitly supplied by an independent admission authority; this code does NOT verify real-world regulator identity or permit anyone to claim a public key is a government source. All checked sources in tests are generated from ephemeral synthetic keys.
- Coverage: separately validate a purpose-scoped signed **inventory** whose scope digest covers exactly the Place/estate binding and obligation rules. This does not prove legal completeness: the inventory issuer must independently be certified competent and its jurisdictional coverage audited. No real such issuer is onboarded in G3.
- Applicability: require a separately signed predicate receipt bound to activity, place, estate and facts. Signature verification ensures authenticity of the record, **not truth or correct legal interpretation** of its conclusion.
- G1 still compares source freshness; G2 performs a **synthetic Warden policy evaluation only** and emits a **NOT_PERSISTED_DRY_RUN** River-style preview.
- Single jurisdiction only for this demonstrator. Missing/expired/revoked/untrusted/mismatched sources, unknown cases, insufficient coverage and competing bindings result in HOLD.

## Non-effect boundaries
No native network fetch, credentials, writes, payments, machines, shell access, real River receipt, Warden action grants, license compliance certification or real-world taxation logic. **Never point this G3 code at real operational documents until independent source admission, evidence integrity, privacy, regulatory/legal review and revision are complete.**

## Verification
`npx vitest run modules/genesis-place-context/g3-e2e.test.ts`
`npm run type-check`
`npm run test`

G3 approval requires independent admission of credible competent authority roots, key revocation/freshness, provider native adapters, non-synthetic Warden policy enforcement, append-only River verification, redaction/provenance and bounded real-site pilot acceptance. Passing synthetic unit tests does not satisfy those gates.

## Qualification hardening
A signed applicability conclusion is now bound to the **specific obligation, jurisdiction, actor, activity class and event time, Place binding, envelope ID/version and facts reference**. Shared predicates across distinct requirements are held pending an explicit many-to-many rule contract. Claimed recognition/requirement verification times must agree with source issuance, and a claim cannot be issued outside its signed validity interval. These controls limit replay and post-dated claims but do not independently establish legally competent authorities or complete regulations.
