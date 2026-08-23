# ALPHA-ASSET-COMPUTE-FABRIC-001

Status: ALPHA 0.1 IMPLEMENTED — PUBLIC-SAFE TEST SLICE

Node: `ALPHA-NODE-001`

Verification record: `docs/alpha-node/ALPHA-ASSET-COMPUTE-FABRIC-001-VERIFICATION.md`

## Purpose

Extend the existing Alpha governed request path so a DigitalMe can use a governed asset when the required identity/rights facts, Warden authority, compute funding, provider route and effect evidence all resolve successfully.

This contract is additive. It does not replace Genesis/Registry, Warden, Synnergyze, RiverOS, SILK, provider infrastructure or canonical asset registration.

## Standing invariants

`REQUEST != ENTITLEMENT != AUTHORITY != FUNDING != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT != SETTLEMENT`

Additional rules:

- Payment or available compute funding never grants authority by itself.
- Asset discovery never implies access to the underlying asset body or source.
- Execution may start only after Warden authorization and a funding reservation exist.
- Provider acceptance or completion never implies effect.
- A failed or unverified effect may not create a derived-asset candidate.
- A provider failure before settlement releases the Alpha reservation and leaves exception/reconciliation evidence.
- Completed execution replay is idempotent; conflicting reuse of a completed execution ID fails closed.
- Supporting runtime state is rebuildable and may not become canonical identity, rights, authority, evidence or settlement truth.

## Canonical boundaries

- Genesis / Registry: principal, asset, relationship, rights and canonical derived-asset lineage.
- Warden: authority decision and short-lived capability constraints.
- Synnergyze: route planning, reservation coordination, provider dispatch and orchestration state.
- RiverOS: canonical execution, metering, provider, exception and effect evidence.
- SILK: canonical funding-source balances, reservations, charges, releases and settlement references.

The Alpha implementation in this public repository uses in-memory/public-safe projections for funding and evidence and a deterministic simulated provider. Labels such as `GENESIS-ALPHA-PROJECTION`, `RIVER-ALPHA`, and `SILK-ALPHA` are deliberately non-canonical.

The public repository must never contain live credentials, private participant data, Warden token bodies, regulated evidence bodies or live financial-account credentials.

## Alpha 0.1 implemented scope

The executable slice currently proves:

- one DigitalMe test principal;
- one governed digital asset reference and derivative operation;
- funding kinds `ASSET_ALLOWANCE`, `ASSET_YIELD`, and `PREPAID` in the ledger contract;
- one Warden decision validation/capability gate;
- one provider-neutral deterministic execution adapter;
- one River-style append-only in-memory event trail;
- independent effect verification input/output;
- one derived-asset registration candidate after verified effect;
- reservation settlement/release;
- provider-failure recovery;
- effect-rejection evidence and recovery; and
- completed-execution replay/idempotency protection.

No live Cloud Workstations, GCP batch/runtime execution, physical factory routing, multi-provider optimization, mixed-source funding, credit underwriting, production payment integration, production RiverOS sink, production SILK ledger, production Genesis resolver or production Warden service is exercised by Alpha 0.1.

## Transaction state model

The implemented happy path is:

`REQUESTED -> PRINCIPAL_RESOLVED -> ASSET_RESOLVED -> ENTITLEMENT_RESOLVED -> ROUTE_QUOTED -> WARDEN_PENDING -> AUTHORIZED -> FUNDS_RESERVED -> CAPABILITY_ISSUED -> DISPATCHED -> RUNNING -> METERING -> OUTPUT_OBSERVED -> EFFECT_VERIFIED -> ASSET_REGISTERED -> SETTLED -> CLOSED`

`ASSET_REGISTERED` is currently the state-machine gate after which the Alpha implementation emits `asset.candidate_created` to `GENESIS-ALPHA-PROJECTION`. It does **not** claim a canonical Genesis registration occurred.

Pre-settlement failures may enter:

`EXCEPTION -> RECONCILIATION -> CLOSED`

The state model also reserves `RECOVERY` and `COMPENSATION` for later recovery contracts. A transition may not skip required authority, funding, execution or effect boundaries.

## Core public-safe contracts

### Execution request and resolved facts

`AssetComputeExecutionInput` carries stable execution/principal/asset IDs, input reference, externally supplied principal/asset/entitlement/route resolution references, reservation request, funding priority, route, operation set, currency/cost ceiling, time and a supplied Warden decision.

The fabric consumes those references. It does not create canonical principal, asset, entitlement, route or Warden facts.

### Warden decision and capability

A Warden decision is one of `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, or `REQUIRE_EVIDENCE`.

The Alpha gate proves:

- a funded request with `DENY` cannot receive an execution capability;
- an expired `ALLOW` cannot be used;
- execution/principal/currency bindings must match;
- requested cost may not exceed the Warden maximum; and
- reserved funding must cover the requested capability ceiling.

The resulting capability is bound to one execution, principal, asset, operation set, selected route, cost ceiling, currency and expiry.

### Funding reservation

`InMemoryFundingLedger` models public-safe Alpha reservation semantics. It supports reserve, settle, release and balance queries.

The canonical acceptance fixture proves:

1. INR 100 available;
2. reserve INR 50 -> INR 50 available / INR 50 reserved;
3. actual cost INR 32 -> INR 32 settled;
4. unused INR 18 released; and
5. final INR 68 available / INR 0 reserved / INR 32 settled.

This is not a production SILK ledger and does not yet implement mixed-source allocation.

### Provider adapter

The implemented Alpha `ProviderAdapter` surface currently exposes `execute(input)` returning a `ProviderReceipt` and `ProviderObservation`.

`DeterministicProviderAdapter` is credential-free and simulates success or provider failure. It checks execution/capability binding and capability cost ceiling. Its result contains no effect-verification field.

Prepare/cancel/provider-specific lifecycle methods are future adapter extensions, not Alpha 0.1 claims.

### River-style event trail

`InMemoryEventLog` is an append-only public-safe test projection. Exact replay of the same event ID/significant payload returns the existing event; changed content under the same event ID fails with `EVENT_IDEMPOTENCY_CONFLICT`.

This is not canonical RiverOS storage.

### Effect verification and derived asset gating

Provider output must be passed to an independently supplied `EffectVerifier`.

If effect verification succeeds, the fabric emits `effect.verified` and may construct one `DerivedAssetCandidate`.

If verification fails or returns a mismatched output reference, the fabric emits `effect.rejected`, releases the pre-settlement reservation under the Alpha test policy, records exception/reconciliation evidence and creates no derived-asset candidate.

Production provider billing for failed effects may require partial charge/compensation rules and is intentionally not inferred by Alpha 0.1.

### Execution replay

The in-memory fabric stores completed execution fingerprints/results for the process lifetime.

- exact replay returns the completed result without another provider call, event append or settlement;
- conflicting reuse of the same completed execution ID throws `EXECUTION_IDEMPOTENCY_CONFLICT` before side effects.

This proves the semantic boundary but is not yet a durable or distributed idempotency store and does not claim protection against simultaneous in-flight duplicates across processes.

## Acceptance scenarios

### A. Successful execution

Initial allowance INR 100 -> reserve INR 50 -> provider actual cost INR 32 -> independent effect verification succeeds -> one derived-asset candidate -> settle INR 32 -> release INR 18 -> finish INR 68 available.

### B. Provider failure

Reserve INR 40 -> provider throws before settlement -> release INR 40 -> record `execution.exception` and reconciliation -> no derived asset.

### C. Provider completes but effect is rejected

Provider receipt + output observation exist -> effect verifier rejects output -> emit `effect.rejected` -> release Alpha reservation -> record exception/reconciliation -> no derived asset -> no successful settlement event.

### D. Completed execution replay

Exact replay -> return prior result -> no second provider call -> no second settlement -> no additional events.

Conflicting completed-execution reuse -> fail `EXECUTION_IDEMPOTENCY_CONFLICT` before provider/ledger/event side effects.

## Alpha 0.1 completion gate

The public-safe executable slice is considered implemented only when fresh automated checks demonstrate:

- reservation safety;
- authority/funding separation;
- guarded state transitions;
- event replay safety;
- provider/effect separation;
- provider-failure reservation release;
- effect rejection evidence;
- derived-asset gating;
- completed-execution idempotency; and
- repository test, type-check and lint success.

Observed evidence is recorded separately in `ALPHA-ASSET-COMPUTE-FABRIC-001-VERIFICATION.md`. Production integrations remain explicitly unverified until their own adapters and receipts are exercised.