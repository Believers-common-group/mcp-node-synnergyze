# ALPHA-ASSET-COMPUTE-FABRIC-001

Status: IMPLEMENTATION CANDIDATE

Node: `ALPHA-NODE-001`

## Purpose

Extend the existing Alpha governed request path so a DigitalMe can use a governed asset when the required rights, Warden authority, compute funding, provider eligibility and effect evidence all resolve successfully.

This contract is additive. It does not replace the Registry, Warden, Runtime Worker, Effect Observer, RiverOS, or SILK boundaries.

## Standing invariants

`REQUEST != ENTITLEMENT != AUTHORITY != FUNDING != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT != SETTLEMENT`

Additional rules:

- Payment or available compute funding never grants authority by itself.
- Asset discovery never implies access to the underlying asset body or source.
- An execution may start only after both Warden authorization and a funding reservation exist.
- Provider acceptance never implies effect.
- Settlement is based on verified economic evidence, not merely on the original estimate.
- A failed or unverified effect must not silently create a canonical derived asset.
- Supporting runtime state is rebuildable and may not become canonical identity, rights, authority or settlement truth.

## Canonical boundaries

- Genesis / Registry: principal, asset, relationship, rights and derived-asset lineage.
- Warden: authority decision and short-lived capability constraints.
- Synnergyze: route planning, reservation coordination, provider dispatch and orchestration state.
- RiverOS: execution, metering, provider, exception and effect evidence.
- SILK: funding-source balances, reservations, charges, releases and settlement references.

The Alpha public repository contains only public-safe contracts, adapters and redacted fixtures. It must never contain credentials, private participant data, Warden token bodies, regulated evidence bodies or live financial-account credentials.

## Alpha 0.1 scope

The first executable slice proves one complete transaction with:

- one DigitalMe test principal;
- one governed digital asset and one derived capability;
- funding sources `ASSET_ALLOWANCE`, `ASSET_YIELD`, and `PREPAID`;
- one Warden decision input/output contract;
- one provider-neutral simulated execution adapter;
- one River-style append-only event trail;
- one effect receipt;
- one derived-asset registration candidate;
- one settlement result;
- one provider-failure path; and
- one effect-failure path.

No Cloud Workstations, physical factory routing, multi-provider optimization, credit underwriting, or production payment integration is part of Alpha 0.1.

## Transaction state model

The permitted happy path is:

`REQUESTED -> PRINCIPAL_RESOLVED -> ASSET_RESOLVED -> ENTITLEMENT_RESOLVED -> ROUTE_QUOTED -> WARDEN_PENDING -> AUTHORIZED -> FUNDS_RESERVED -> CAPABILITY_ISSUED -> DISPATCHED -> RUNNING -> OUTPUT_OBSERVED -> EFFECT_VERIFIED -> ASSET_REGISTERED -> SETTLED`

Failure paths enter an explicit exception state and may continue through reconciliation, recovery, compensation, reservation release, or terminal closure. A state transition may not skip a required authority, funding, execution or effect boundary.

## Core public-safe contracts

### Asset

An asset has a stable `assetId`, a type, visibility, access class, status, capabilities, rights-policy reference, compute profile, provider-policy reference and output-registration requirement.

### AssetRight

An asset right binds a principal scope to named capabilities and limits. The first Alpha capability set is `EXECUTE` and `DERIVE`. Source download and redistribution are independent rights and default to denied.

### ExecutionRequest

An execution request carries:

- `executionId`;
- `principalId` and operating context;
- `assetId` and requested capability;
- maximum cost and currency;
- region or other hard routing constraints; and
- ordered funding-source preferences.

The request names a capability, not a cloud-provider command.

### WardenDecision

A Warden decision is one of `ALLOW`, `DENY`, `REQUIRE_APPROVAL`, or `REQUIRE_EVIDENCE`. An `ALLOW` decision carries explicit constraints and an expiry. The fabric validates the decision; it does not mint or infer Warden authority.

### FundingSource and ComputeReservation

A funding source has a stable source ID, principal, funding kind, currency and explicit available balance. A reservation atomically moves value from available to reserved state for one execution.

The Alpha reservation ledger must prove:

1. reserving INR 50 from INR 100 leaves INR 50 available and INR 50 reserved;
2. settling an actual INR 32 charges INR 32, releases INR 18, and leaves INR 68 available;
3. a reservation greater than available funding fails closed; and
4. repeated final settlement for the same reservation is idempotent.

### RouteQuote

A route quote contains only policy-eligible routes. Hard constraints such as authority, region, security class and maximum cost are applied before optimization.

### CapabilityGrant

The execution side receives a short-lived, execution-bound capability envelope with allowed operations, provider route, cost ceiling and expiry. Permanent user or founder credentials are never the execution capability.

### ProviderAdapter

The Alpha provider interface is provider-neutral and supports prepare, execute, observe, cancel and collect-receipt operations. The first adapter is deterministic and simulated so the governance/economic path can be tested without cloud credentials.

### RiverEvent and EffectReceipt

Each significant transition appends a correlated event. Delivery and provider acceptance are not effects. An effect receipt requires explicit evidence that the expected result was observed.

### Settlement and DerivedAssetCandidate

Settlement preserves estimated, observed, billed and settled values separately when those values exist. A derived asset may become a registration candidate only after the expected effect verifies.

## Idempotency and replay

Every consequential mutation is bound to an idempotency key derived from stable transaction identity. Retrying the same key with the same significant payload reconciles the existing record. Reusing the same key with a different significant payload fails closed.

A Warden capability or execution lease is single-use according to its governing Alpha contract. Asset-compute retries may never revive expired or revoked authority.

## Acceptance scenarios

### A. Successful execution

Initial asset allowance: INR 100.

- reserve INR 50;
- execute a simulated governed capability;
- observe actual settled cost INR 32;
- verify the expected effect;
- create one derived-asset registration candidate;
- settle INR 32;
- release INR 18; and
- finish with INR 68 available.

Exactly one final settlement and one derived-asset candidate may exist for the execution.

### B. Provider failure before billable effect

- reserve INR 40;
- provider fails before a verified billable result;
- no derived asset is registered;
- INR 40 is released; and
- an exception/reconciliation event is retained.

### C. Execution accepted but effect fails

- provider execution may be acknowledged;
- explicit effect verification fails;
- settlement remains held or enters reconciliation according to policy; and
- no canonical derived asset is inferred from provider success.

## Alpha 0.1 completion gate

The slice is complete only when automated tests demonstrate reservation safety, authority/funding separation, replay safety, provider-failure release, explicit effect verification, derived-asset gating and idempotent settlement without requiring live secrets.