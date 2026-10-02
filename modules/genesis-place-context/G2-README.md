# G2 Warden + River dry-run Place review

Status: **G2 CONTRACT INTEGRATION / REVIEW ONLY**, upstream stack:
- Genesis R0.2 proposal: Believers-common-group/genesis-stack PR #61
- G1 synthetic resolver: Believers-common-group/mcp-node-synnergyze PR #136

**This is not real Warden admission or River persistence.**
The G2 bridge calls the existing \`evaluateSyntheticWardenDecisionV1\` with exactly one review-only capability \`place_context.review\`. Any internal synthetic action token is discarded and is never returned, stored, published, or passed to an execution path. A separate River *style* receipt is computed deterministically, with \`NOT_PERSISTED_DRY_RUN\`, \`NO_AUTHORITY_ISSUED\`, \`NO_EXECUTION\`, and \`SYNTHETIC_UNTRUSTED\` as explicit states. It cannot be interpreted as a signed River append or a tax certification.

No endpoint is registered. No permission, legal rule, exception, tax state, payment, provider action, real signature, reservation, or approval is created. Only fake identifiers are used in tests.

## Validate
\`npx vitest run modules/genesis-place-context/warden-river-review.test.ts\`
\`npm run type-check\`
\`npm run test\`

## Release blockers
G1 sourceAdapter currently accepts injected receipt shapes and cannot prove real regulator/provider trust. G2 cannot validate G1's full canonical source snapshot or verify live actor/organizational identity, and thus **must remain synthetic-only**. Next stage requires source-admitted cryptographic verifier, signed independently verifiable Warden decision, River append/seal, idempotency, disclosure classification, revocation checks, and end-to-end negative tests. Never promote G2 as executable authority merely because its synthetic Warden decision says ALLOW.

## Change controls
Source hierarchy: Earth → Virtual Estate → Place → Location → Door → Room → Window/Stage → Activity.
A Place recognized by an Estate is not legal title, business registration or proof of a tax nexus. Authorities govern source law; Warden governs VSR actions. Receipt material excludes raw source payload, credentials and action tokens.
