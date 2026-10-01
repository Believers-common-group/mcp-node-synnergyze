# Place Context Resolver — G1 sandbox
**No live provider integrations, no network calls, no production endpoint, no Warden admission and no River append.** This module implements a read-only source-verification *adapter interface* and a fail-closed resolver algorithm. All tests use fabricated refs and fake receipts, **not** legal/tax truth.
Control-plane source: Believers-common-group/genesis-stack PR #61 (G0 R0.2); change GEN-CHG-20261002-PLACE-CONTEXT-001.

## Check
npm run type-check
npx vitest run modules/genesis-place-context/resolver.test.ts

## Safety
The source adapter is NOT intrinsically trustworthy. A future provider-native verifier must independently check source identity, regulator trust root, document authenticity, content hash, effective/expiry and amendment/supersession, and signed evidence. The predicate adapter must independently validate conditions, exceptions, applicability evidence and scope. This first iteration prohibits automatically granting exceptions, treats conflicts as unresolved, and supplies no legal rule corpus. A COMPLETE status under fabricated test receipts never confers authority. Warden admission, privacy classification, signed provenance, River evidence, and live endpoint are separate G2+ gated work.
