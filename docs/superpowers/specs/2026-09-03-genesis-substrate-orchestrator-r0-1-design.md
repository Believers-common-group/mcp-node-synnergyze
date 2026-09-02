# GENESIS-SUBSTRATE-ORCHESTRATOR-001 R0.1 — Governed Workload Placement

Status: DESIGN SPECIFICATION
Date: 2026-09-03
Base branch: `genesis`
Design branch: `design/genesis-substrate-orchestrator-r0-1`
Reference runtime: `compute/runtime.ts`

## Purpose

`GENESIS-SUBSTRATE-ORCHESTRATOR-001 R0.1` adds a deterministic, governed placement layer between Genesis workload intent and the existing governed compute execution boundary.

R0.1 answers:

1. What workload is being requested?
2. Which Genesis substrate instances are eligible to host it?
3. Which eligible substrate is preferred under explicit placement policy?
4. What capacity must be reserved before execution can be attempted?
5. What Warden authority and River evidence references must accompany the placement?

R0.1 does **not** autonomously deploy workloads, create Warden authority, mutate external infrastructure, settle SILK charges, move data between jurisdictions, or convert a placement recommendation into execution.

The existing compute proof already enforces the sequence `Warden grant -> enrolled runner -> evidence reservation -> execution -> sealed evidence`. R0.1 extends that model upstream with governed workload, capacity, reservation, and placement contracts.

## Canonical boundaries

Existing invariant:

`REQUEST != AUTHORITY != EXECUTION != EFFECT`

Substrate-orchestration invariant:

`WORKLOAD INTENT != PLACEMENT PLAN != CAPACITY RESERVATION != WARDEN AUTHORITY != EXECUTION != EFFECT`

Additional invariants:

`SUBSTRATE CLASS != PRODUCT != PROVIDER != INSTANCE`

`EDITION != SUBSTRATE`

`TERRA != G5`

`PLACEMENT COMPILER != WARDEN`

`CAPACITY SNAPSHOT != CAPACITY RESERVATION`

`RESERVATION != EXECUTION`

`FAILOVER ELIGIBILITY != FAILOVER AUTHORITY`

Responsibilities:

- Genesis Registry — canonical identity for admitted substrate instances, workload identities, edition entitlements, licence references, and bindings.
- Genesis Substrate Orchestrator — deterministic eligibility filtering, ranking, reservation intent, and placement-plan construction.
- Warden — authority, policy decision, approval, denial, expiry, delegation, and execution admission.
- RiverOS — evidence reservation, decision references, placement provenance, denial receipts, and post-execution evidence.
- Synnergyze — orchestration and controlled execution only after Warden authority exists.
- SILK — later cost metering and settlement; out of scope for R0.1.
- VSR/UI/MCP surfaces — interaction surfaces only; never placement or execution authority.

No placement status may self-promote into Warden authority or runtime execution.

## Substrate taxonomy

R0.1 freezes the canonical physical substrate classes as:

- `G0` — constrained device
- `G1` — managed appliance
- `G2` — edge compute node
- `G3` — compute host
- `G4` — physical compute fabric

Cloud capacity is represented as a `TERRA` projection and is not a sixth physical class.

A substrate record must distinguish:

- class — `G0` through `G4`, or Terra projection;
- provider — OEM/cloud/infrastructure provider;
- product/model — vendor implementation;
- instance — actual admitted deployed resource;
- location/jurisdiction — where the resource is physically or contractually hosted;
- owner/operator — who owns and operates the resource;
- binding — which estate/ARK/location/edition it currently serves;
- capacity snapshot — currently reported schedulable capacity.

## Architectural choice

### Chosen: first-class deterministic module upstream of governed compute

Add:

`modules/genesis-substrate-orchestrator/`

The module owns workload requirements, capacity snapshots, placement policy, deterministic eligibility/ranking, reservation records, and placement plans. It imports or adapts existing Warden/River/compute contracts instead of recreating them.

The existing `compute/runtime.ts` remains the R0.1 execution proof boundary. A selected placement can later be translated into a concrete `ComputeIntent` and Warden grant path, but the placement module itself never invokes a runner without that boundary.

### Rejected for R0.1: external scheduler microservice

A separate scheduler would prematurely duplicate identity, policy, evidence, and failure semantics before the Genesis contracts are stable.

### Rejected for R0.1: direct Kubernetes/cloud scheduler integration

Provider-native schedulers remain future execution adapters. R0.1 first defines provider-neutral Genesis semantics so Kubernetes, cloud APIs, local runners, and future Genesis hardware can all implement the same placement contract.

## Core domain objects

### SubstrateClass

```ts
type PhysicalSubstrateClass = "G0" | "G1" | "G2" | "G3" | "G4";
type SubstrateKind = PhysicalSubstrateClass | "TERRA";
```

`TERRA` is a projection kind, not `G5`.

### WorkloadRequirementV1

Required fields:

- `workloadRef`
- `correlationId`
- `principalRef`
- `representedEntityRef`
- `editionRef`
- `licenceRefs[]`
- `requiredCapabilities[]`
- `minimumCpuUnits`
- `minimumMemoryMiB`
- `minimumStorageMiB`
- `gpuRequirement`
- `allowedSubstrateKinds[]`
- `preferredSubstrateKinds[]`
- `allowedJurisdictionRefs[]`
- `forbiddenJurisdictionRefs[]`
- `dataClass`
- `resilienceProfile`
- `evidenceRequired: true`

R0.1 data classes:

- `PUBLIC`
- `COMMERCIAL`
- `CONFIDENTIAL`
- `REGULATED`

R0.1 resilience profiles:

- `BRONZE` — one admissible placement;
- `SILVER` — primary plus one eligible alternate;
- `GOLD` — primary plus at least two eligible alternates.

R0.1 records resilience eligibility only. It does not execute failover.

### SubstrateCapacitySnapshotV1

Required fields:

- `snapshotRef`
- `substrateInstanceRef`
- `substrateKind`
- `providerRef`
- `productRef?`
- `ownerRef`
- `operatorRef`
- `locationRef?`
- `jurisdictionRef`
- `status`
- `attested`
- `availableCpuUnits`
- `availableMemoryMiB`
- `availableStorageMiB`
- `gpuCapabilities[]`
- `capabilityRefs[]`
- `bindingRefs[]`
- `observedAt`
- `expiresAt`
- `sourceDigest`

Statuses:

- `AVAILABLE`
- `DEGRADED`
- `MAINTENANCE`
- `SUSPENDED`
- `REVOKED`

Only `AVAILABLE` and, when explicitly permitted by policy, `DEGRADED` snapshots may be considered for placement.

A snapshot is an observation and is never itself a reservation or authority.

### PlacementPolicyV1

Required fields:

- `policyRef`
- `allowedSubstrateKinds[]`
- `preferredSubstrateKinds[]`
- `allowDegraded`
- `requireAttestation`
- `requiredCapabilityRefs[]`
- `allowedProviderRefs[]?`
- `forbiddenProviderRefs[]`
- `allowedJurisdictionRefs[]`
- `forbiddenJurisdictionRefs[]`
- `preferLocalBinding`
- `rankingOrder[]`
- `effectiveFrom`
- `effectiveUntil?`
- `sourceDigest`

R0.1 ranking keys are deterministic and limited to:

- `SUBSTRATE_PREFERENCE`
- `LOCAL_BINDING`
- `AVAILABLE_CPU_DESC`
- `AVAILABLE_MEMORY_DESC`
- `AVAILABLE_STORAGE_DESC`
- `INSTANCE_REF_ASC`

`INSTANCE_REF_ASC` is the mandatory final tie-breaker, preventing non-deterministic placement when earlier ranking keys are equal.

### PlacementCandidateV1

Required fields:

- `substrateInstanceRef`
- `eligible`
- `rejectionReasons[]`
- `rankVector[]`
- `sourceSnapshotRef`

Eligibility is computed, rebuildable, and not authority.

### CapacityReservationV1

Required fields:

- `reservationRef`
- `correlationId`
- `workloadRef`
- `substrateInstanceRef`
- `requestedCpuUnits`
- `requestedMemoryMiB`
- `requestedStorageMiB`
- `status`
- `requestedAt`
- `expiresAt`
- `wardenDecisionRef?`
- `riverEvidenceRef`

Statuses:

- `REQUESTED`
- `AUTHORIZED`
- `DENIED`
- `EXPIRED`
- `RELEASED`
- `CONSUMED`

R0.1 may construct and validate reservation records, but only an external Warden decision can advance `REQUESTED` to `AUTHORIZED`.

### PlacementPlanV1

Required fields:

- `placementRef`
- `correlationId`
- `workloadRef`
- `policyRef`
- `sourceSnapshotRefs[]`
- `primarySubstrateInstanceRef?`
- `alternateSubstrateInstanceRefs[]`
- `candidateResults[]`
- `blockingReasons[]`
- `reservationRef?`
- `computedAt`
- `sourceDigest`
- `projectionOnly: true`

Placement states are derived from the fields rather than encoded as execution states.

A plan without a primary is a valid denied/unplaceable projection when `blockingReasons[]` is non-empty.

### OrchestrationAttemptV1

Required fields:

- `attemptRef`
- `correlationId`
- `workloadRef`
- `placementRef`
- `reservationRef?`
- `wardenDecisionRef?`
- `riverEvidenceRef`
- `status`
- `reason?`
- `realWorldEffectOccurred: false`

R0.1 statuses:

- `PLACEMENT_READY`
- `BLOCKED_NO_ELIGIBLE_SUBSTRATE`
- `BLOCKED_RESERVATION_REQUIRED`
- `BLOCKED_WARDEN_REQUIRED`
- `DENIED`

R0.1 orchestration attempts remain non-effectful. Actual execution remains in the existing controlled compute/runtime path.

## Deterministic placement algorithm

Given one workload, one placement policy, and a set of capacity snapshots:

1. Reject expired capacity snapshots.
2. Reject `MAINTENANCE`, `SUSPENDED`, or `REVOKED` resources.
3. Reject `DEGRADED` unless policy explicitly permits it.
4. Reject unattested resources when attestation is required.
5. Reject substrate kinds not allowed by both workload and policy.
6. Reject forbidden providers or providers outside an explicit allowlist.
7. Reject jurisdictions forbidden by either workload or policy.
8. Require membership in the allowed-jurisdiction intersection when either side constrains jurisdiction.
9. Reject resources that lack required capabilities.
10. Reject resources below CPU, memory, storage, or GPU requirements.
11. Rank remaining resources using the policy's ordered deterministic ranking keys.
12. Use `substrateInstanceRef` ascending as the final tie-breaker.
13. Select the first eligible resource as primary.
14. Select alternates according to the workload's resilience profile.
15. Produce a source digest over workload, policy, and referenced snapshots so the plan is rebuildable and tamper-evident.

The compiler does not reserve capacity and does not request execution.

## Reservation flow

R0.1 flow:

`WORKLOAD -> CAPACITY SNAPSHOTS -> PLACEMENT COMPILER -> PLACEMENT PLAN -> RESERVATION REQUEST -> WARDEN DECISION -> RIVER EVIDENCE -> ELIGIBLE FOR EXECUTION HANDOFF`

Rules:

- No reservation may exist without a `placementRef` and selected `substrateInstanceRef`.
- A reservation request must not exceed the source capacity snapshot.
- Reservation expiry must be finite and after request time.
- A Warden denial must never be represented as an authorized reservation.
- Expired reservations cannot be consumed.
- A reservation is single-workload and single-substrate in R0.1.
- Multi-resource reservations are deferred.

## Warden boundary

The substrate orchestrator may prepare a Warden request containing:

- workload identity;
- principal and represented entity;
- selected substrate instance;
- requested resource quantities;
- edition and licence references;
- jurisdiction;
- placement policy reference;
- source digests;
- required River evidence reference.

The orchestrator cannot issue its own allow decision.

The Warden decision must bind at minimum:

- `correlationId`
- `workloadRef`
- `substrateInstanceRef`
- `reservationRef`
- `principalRef`
- `representedEntityRef`
- validity window
- decision status
- evidence requirement

Any mismatch blocks execution handoff.

## River evidence boundary

R0.1 requires evidence for:

- placement computed;
- placement denied/unplaceable;
- reservation requested;
- reservation authorized/denied;
- execution handoff attempted;
- mismatch or expiry denial.

Evidence records must retain correlation, workload, policy, snapshot, substrate, reservation, and Warden decision references.

The module may use an in-memory deterministic journal for R0.1 tests, matching the current governed-compute proof style. Durable River integration remains an adapter concern after the contracts pass conformance.

## Existing compute integration

`compute/runtime.ts` remains authoritative for the current synthetic execution proof.

R0.1 adds an adapter boundary that can translate an `AUTHORIZED` capacity reservation plus matching Warden decision into the existing compute attempt inputs.

The adapter must reject:

- substrate/runner substitution;
- provider substitution;
- principal substitution;
- represented-entity substitution;
- expired Warden decisions;
- expired reservations;
- unregistered runner;
- missing evidence requirement.

R0.1 does not broaden `ComputeProvider` or create real cloud/edge runners unless separately admitted.

## Error and denial semantics

Denials are expected governed outcomes and must be evidence-bearing.

Canonical reason codes include:

- `capacity_snapshot_expired`
- `substrate_status_ineligible`
- `substrate_attestation_required`
- `substrate_kind_not_allowed`
- `provider_not_allowed`
- `jurisdiction_not_allowed`
- `required_capability_missing`
- `cpu_capacity_insufficient`
- `memory_capacity_insufficient`
- `storage_capacity_insufficient`
- `gpu_capability_missing`
- `no_eligible_substrate`
- `reservation_exceeds_snapshot`
- `reservation_expired`
- `warden_decision_missing`
- `warden_decision_denied`
- `warden_reservation_mismatch`
- `warden_substrate_mismatch`
- `evidence_requirement_missing`

The module must not silently fall back to an ineligible provider or jurisdiction.

## R0.1 module layout

Planned module:

```text
modules/genesis-substrate-orchestrator/
├── contracts.ts
├── placement-compiler.ts
├── placement-compiler.test.ts
├── reservation-service.ts
├── reservation-service.test.ts
├── evidence-journal.ts
├── orchestration-coordinator.ts
├── orchestration-coordinator.test.ts
└── compute-handoff.ts
```

Responsibilities:

- `contracts.ts` — domain types, enums, validation helpers, canonical reason codes.
- `placement-compiler.ts` — pure deterministic candidate filtering/ranking and plan construction.
- `reservation-service.ts` — reservation construction, state validation, expiry and Warden binding checks.
- `evidence-journal.ts` — R0.1 append-only in-memory evidence envelopes.
- `orchestration-coordinator.ts` — non-effectful sequence from placement through reservation/authority checks.
- `compute-handoff.ts` — translation/validation seam into existing governed compute proof; no direct runner bypass.

## Testing and conformance

R0.1 tests must prove at least:

1. deterministic selection for identical inputs;
2. final tie-breaking by instance reference;
3. G0-G4/Terra taxonomy with Terra never treated as G5;
4. edition identity does not substitute for substrate eligibility;
5. expired snapshots are rejected;
6. forbidden jurisdictions are rejected;
7. insufficient capacity is rejected;
8. missing capabilities are rejected;
9. provider substitution is rejected;
10. no eligible substrate produces an evidence-bearing blocked outcome;
11. reservation cannot exceed the selected capacity snapshot;
12. reservation requires matching Warden authority before execution handoff;
13. expired Warden authority is rejected;
14. expired reservation is rejected;
15. substrate substitution between placement, reservation, Warden decision, and compute handoff is rejected;
16. denied paths report `realWorldEffectOccurred: false`;
17. the existing governed compute tests continue to pass unchanged.

Recommended verification commands after implementation:

```bash
npm test -- --run modules/genesis-substrate-orchestrator
npm run test:compute-proof
npm run type-check
npm run lint
```

A dedicated package script may be added during implementation:

```json
"test:substrate-orchestrator": "vitest run modules/genesis-substrate-orchestrator"
```

## R0.1 acceptance criteria

R0.1 is accepted when:

- the module is provider-neutral;
- the five physical classes G0-G4 are encoded without introducing G5;
- Terra is encoded as a cloud projection kind;
- identical inputs always produce identical placement output;
- every rejection is explicit and evidence-bearing;
- placement cannot create Warden authority;
- reservation cannot bypass Warden authority;
- execution handoff cannot substitute substrate, provider, principal, entity, or expired authority;
- no new real-world execution path bypasses `compute/runtime.ts` or the existing controlled-execution boundaries;
- all new tests, existing compute-proof tests, type-check, and lint pass.

## Explicit R0.1 non-goals

Deferred to later revisions:

- real Kubernetes placement;
- AWS/Azure/Oracle/Terra provider APIs;
- live G0/G1/G2/G3/G4 device discovery;
- capacity polling agents;
- power-aware or carbon-aware optimization;
- monetary cost optimization;
- SILK metering/settlement;
- cross-ARK capacity markets;
- live failover execution;
- multi-resource gang scheduling;
- migration between substrates;
- hardware passport issuance;
- OEM qualification;
- VSR user interface;
- public MCP provisioning actions.

These require the R0.1 contracts first and must not be smuggled into the first implementation.

## Evolution path

Expected additive evolution:

- `R0.2` — admitted substrate inventory adapters and persisted capacity snapshots;
- `R0.3` — provider adapter interface for Terra and physical hosts;
- `R0.4` — resilience execution and governed failover;
- `R0.5` — cost/energy-aware policy inputs;
- `R0.6` — SILK metering and capacity settlement;
- `R0.7` — bounded cross-ARK capacity publication and federation.

Later revisions must preserve the R0.1 authority and evidence boundaries unless explicitly superseded by a governed architecture decision.
