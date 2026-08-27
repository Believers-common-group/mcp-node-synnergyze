# ARC-PYTHON-DOMAIN-001 R0.2 — Lineage + Admission Freshness + Closure Proof

## Status

Approved architecture, frozen for implementation.

## Goal

A `WorkPacket` may reach `CLOSED` only when its company/matter lineage is consistent, the relevant authority remains current, the Warden admission is fresh against the same reviewed snapshots, the required professional result and evidence policy are satisfied, the external effect is verified, and persistence succeeds without stale-revision overwrite.

## Scope

R0.2 covers strong identifiers and closed vocabularies, immutable domain facts, the WorkPacket lifecycle, AuthorityGrant and AuthorityDecision, WardenAdmissionRequest and WardenDecision, ProfessionalResult, EvidenceItem and River receipts, EffectVerification, admission freshness, closure proof, optimistic persistence concurrency, lineage validation, and automated tests for the first vertical slice.

It excludes portal UI, ClickUp synchronization, provider marketplace/routing, billing, MCA automation, InsForge-specific persistence, AI inference, and dashboards.

## Architectural boundary

```text
src/arc/
├── domain/
├── application/
├── ports/
└── adapters/
```

Dependency direction is `domain <- application <- ports/adapters`. The domain layer must not depend on HTTP, FastAPI, InsForge, ClickUp, database libraries, Zed, or UI code.

## Core rules

1. Domain facts are immutable. Corrections occur through supersession or a new revision/event, never historical mutation.
2. Projections are rebuildable from immutable evidence.
3. IDs use distinct `NewType` definitions for company, person, provider, engagement, authority, work packet, evidence, matter, Warden decision, and River receipt identities.
4. Critical control vocabularies use `StrEnum` rather than ad-hoc strings.
5. `AuthorityGrant`, `AuthorityDecision`, and `WardenDecision` are distinct concepts. Authority is not execution admission.
6. `ProfessionalResult` proves the professional conclusion or performed work; it does not prove downstream effect.
7. `EffectResult.MATCH` is necessary but never sufficient for closure.
8. Consequential execution revalidates Warden freshness against current context, authority, and evidence hashes.
9. Repository writes use optimistic concurrency and return `SaveReceipt`.
10. River appends return attributable receipts distinct from the evidence identity.

## Lineage invariant

For closure, `WorkPacket`, `ProfessionalResult`, `EffectVerification`, and every supplied required `EvidenceItem` must agree on `company_id` and `matter_id`. Any mismatch is a hard validation failure.

## Admission freshness

A Warden decision is reusable only when the current context, authority snapshot, and evidence snapshot hashes equal the hashes reviewed at admission, and the decision remains temporally valid. Drift returns `RE_ADMISSION_REQUIRED`; denial returns `DENIED`; expired admission returns `EXPIRED`.

## Evidence policy

Evidence requirements belong to the packet. Policy evaluation requires the concrete requested levels. E6 does not automatically satisfy an absent E4 or another semantically distinct level.

## Closure proof

Closure checks, in order: source packet state, lineage, Warden lineage, Warden freshness, packet evidence policy, and effect result. Only a complete proof with `EffectResult.MATCH` permits the `EFFECT_VERIFICATION -> CLOSED` transition.

## Persistence and River

`WorkPacketRepository.save(packet, expected_revision=...)` rejects stale revisions. `RiverPort.append_evidence` and `append_transition` return distinct receipts whose results are consumed by the application flow.

## Python assurance contract

Target Python is exactly 3.12 on Linux. basedpyright is configured to enforce exhaustive match handling, unknown/Any restrictions, override correctness, import-cycle checks, unused result/coroutine checks, and uninitialized/unbound-variable checks. Ruff and pytest are mandatory verification gates.

## First vertical slice

```text
WorkPacket
-> AuthorityDecision
-> WardenAdmissionRequest
-> WardenDecision
-> ProfessionalResult
-> EvidenceItem
-> RiverAppendReceipt
-> EffectVerification
-> ClosureProof
-> WorkPacket CLOSED
-> SaveReceipt
```

## Required acceptance properties

- missing/expired authority cannot yield usable admission;
- Warden denial prevents execution;
- context/authority/evidence drift requires re-admission;
- wrong company or matter lineage is rejected;
- missing required professional/evidence proof prevents closure;
- `FILED` without external/effect evidence does not close;
- `NOT_YET_VISIBLE`, `MISMATCH`, `REJECTED`, and `UNKNOWN` do not close;
- complete `MATCH` with fresh admission and sufficient evidence permits closure;
- close from any state other than `EFFECT_VERIFICATION` fails;
- stale persistence revision raises an explicit concurrency conflict;
- superseded evidence remains preserved;
- River append returns a distinct consumed receipt;
- enum expansion left unhandled is caught by basedpyright.

## Completion criterion

R0.2 is accepted only when automated tests prove that no WorkPacket can be closed merely because a professional reported completion or an effect object says `MATCH`; closure requires consistent lineage, current authority, fresh Warden admission, packet-specific evidence sufficiency, verified effect, and a non-stale persistence commit.
