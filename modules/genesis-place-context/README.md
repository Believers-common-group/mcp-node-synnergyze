# Place Context Resolver — G1 sandbox
**No live provider integrations, no network calls, no production endpoint, no Warden admission and no River append.** This module implements a read-only source-verification *adapter interface* and a fail-closed resolver algorithm. All tests use fabricated refs and fake receipts, **not** legal/tax truth.
Control-plane source: Believers-common-group/genesis-stack PR #61 (G0 R0.2); change GEN-CHG-20261002-PLACE-CONTEXT-001.

## Check
npm run type-check
npx vitest run modules/genesis-place-context/resolver.test.ts

## Safety
The source adapter is NOT intrinsically trustworthy. A future provider-native verifier must independently check source identity, regulator trust root, document authenticity, content hash, effective/expiry and amendment/supersession, and signed evidence. The predicate adapter must independently validate conditions, exceptions, applicability evidence and scope. This first iteration prohibits automatically granting exceptions, treats conflicts as unresolved, and supplies no legal rule corpus. A COMPLETE status under fabricated test receipts never confers authority. Warden admission, privacy classification, signed provenance, River evidence, and live endpoint are separate G2+ gated work.

G1 alignment: `legal_entity_refs`, `occupancy_basis`, rule category, authority class, inheritance, source freshness and `scope_factors` are now checked rather than inferred from a VERIFIED label. Synthetic tenancy does not establish actual lawful possession.

G2 hardening: the G1 context digest now binds the complete activity identity, actor, facts, Place binding, legal entities, compiled rules, source receipt hashes and effective-time inputs. It remains non-authenticating until the provider-native verification boundary is proven.


## G2 synthetic review, Warden and River candidate bridge
`g2-review-bridge.ts` calls the G1 resolver directly (never trusts a caller-supplied COMPLETE record), checks bounded identity, matching estate/place and represented legal entity, freshness, source readiness and a manual-review-only Warden policy. It invokes the existing synthetic Warden evaluator for either ESCALATE or DENY. It blocks unexpected ALLOW and never returns action tokens. The existing River `EventEnvelopeV1` contract is used only to prepare in-memory candidates. There is no River reservation, persistence, append-only evidence, Synnergyze/ARK execution, public publication, provider effect or settlement.

Passing synthetic fixtures does not establish actual trust-root verification, the legal completeness of the obligation inventory, or any real-world compliance conclusion. All real execution remains disabled. Review cases: `npx vitest run modules/genesis-place-context/g2-review-bridge.test.ts`.
