# WORK-CAPABILITY-RECONCILIATION-BRIDGE-001 R0.1 Design

**Status:** Approved architecture, implementation not started  
**Date:** 2026-08-24  
**Base:** `feat/work-capability-runtime-r0.1` @ `2a0f627780e7ae97bee03bc8f30f4556c5ceff1d`

## 1. Purpose

`WORK-CAPABILITY-RECONCILIATION-BRIDGE-001 R0.1` closes the gap between the synthetic Work/Capability runtime and the existing Synnergyze reconciliation path without changing the authority semantics of Warden, River, controlled execution, effect verification, or `ReconciliationFabricV1`.

The bridge binds a Work Unit's pre-execution expectation and post-execution quantity/quality outcome to the existing execution lineage:

`Work Unit → Warden ALLOW → River reservation → expected-effect contract → controlled execution → observation → verified effect → River seal/causal trace → ReconciliationFabricV1 → Work-level closure/exception`.

A partial Work outcome must never be treated as completed merely because the generic observed state matches the requested state. Conversely, the bridge must not invent a parallel reconciliation engine. The existing fabric remains the authority for action/effect/evidence lineage; this bridge adds Work-level completion semantics on top.

## 2. Architectural Decision

Three placements were considered:

1. **Teach `ReconciliationFabricV1` garment quantity semantics.** Rejected because the fabric is intentionally generic and should not absorb domain-specific Work completion rules.
2. **Encode all Work quantity semantics into the generic effect matcher.** Rejected for R0.1 because `ExpectedEffectContractV1` currently compiles from `requestedEffect` and does not carry the full Work quantity/quality contract.
3. **Add an additive Work/Capability reconciliation bridge.** Selected. The bridge requires the generic reconciliation determination first, then applies the already-computed `CapabilityOutcomeV1` to determine Work closure or exception.

This preserves existing boundaries and keeps the bridge small enough to delete or replace later without destabilizing the generic fabric.

## 3. Existing Contracts Reused Unchanged

The bridge reuses:

- `ExpectedEffectContractV1` and `EffectExpectationServiceV1`;
- `EvidenceReservationV1`, `EvidenceSealV1`, and `CausalTraceV1`;
- `SynnergyzeExecutionReceiptV1`;
- `PostExecutionObservationV1` and `EffectVerificationResultV1`;
- `ReconciliationFabricV1` and `ReconciliationDeterminationV1`;
- `WorkUnitV1`, `WorkAssignmentV1`, `CapabilityOutcomeV1`, and `RemainingWorkProposalV1`;
- existing Warden decision service and controlled execution gate for any subsequent recovery action.

No new authority source is introduced.

## 4. New Bridge Contracts

Create `modules/work-capability/reconciliation-bridge.ts` with the following public contracts.

### 4.1 `WorkReconciliationExpectationV1`

A deterministic Work-level wrapper compiled before execution.

Required fields:

- `version: "WORK-RECONCILIATION-EXPECTATION-001"`
- `workExpectationRef`
- `workUnitRef`
- `objectiveRef`
- `workflowRef`
- `expectedEffectRef`
- `expectedEffectContractRef`
- `requiredQuantity`
- `requiredFirstPassQuality`
- `compiledAt`
- `sourceDigest`
- `state: "BOUND_PRE_EXECUTION"`
- `synthetic: true`

The wrapper does not replace `ExpectedEffectContractV1`; it binds Work semantics to that contract.

### 4.2 `WorkCapabilityReconciliationDeterminationV1`

Required fields:

- `version: "WORK-CAPABILITY-RECONCILIATION-BRIDGE-001"`
- `workReconciliationRef`
- `workUnitRef`
- `assignmentRef`
- `executionReceiptRef`
- `reconciliationRef`
- `genericClassification`
- `workOutcomeRef`
- `state: "CLOSED" | "EXCEPTION"`
- `classification: "FULL_EFFECT" | "PARTIAL_EFFECT" | "FAILED_EFFECT" | "GENERIC_RECONCILIATION_EXCEPTION"`
- `remainingWorkProposalRef?`
- `recoveryAuthorizationRequired`
- `closedAt?`
- `determinedAt`
- `sourceDigest`
- `synthetic: true`

### 4.3 `WorkRecoveryRequestV1`

A proposal only. It is not executable authority.

Required fields:

- `recoveryRequestRef`
- `parentWorkUnitRef`
- `parentReconciliationRef`
- `remainingWorkProposalRef`
- `remainingQuantity`
- `requiredCapabilityRefs`
- `targetRef`
- `requestedEffect`
- `reasonCode: "PARTIAL_EFFECT_REMAINING_WORK"`
- `requiresFreshWardenDecision: true`
- `authorized: false`
- `synthetic: true`

The bridge may emit this request only when a valid remaining-work proposal exists.

## 5. Expected-Effect Support for the Synthetic Garment Capability

`EffectExpectationServiceV1` cannot currently validate an expectation for `garment.waistband.attach` because the trusted compiler surface only recognizes the existing synthetic service-request capability.

R0.1 will add one bounded trusted compiler:

`SyntheticGarmentWaistbandExpectationCompilerV1`

Rules:

- capability: `garment.waistband.attach`;
- supported requested effect: `GARMENT-STATE:waistband_attached`;
- matcher: prefix match on `GARMENT-WAISTBAND-OBSERVED:`;
- compiler identity is fixed and validated by `validateExpectedEffectContractV1`;
- no dynamic caller-supplied matcher is accepted.

This compiler proves that the observed state belongs to the expected garment effect family. Quantity and quality closure remain Work-level responsibilities of the bridge.

## 6. Evidence Seal and Causal Trace

R0.1 must not fabricate an independent River ledger.

For the synthetic fixture, add a small `SyntheticWorkCapabilityEvidenceFinalizerV1` under `modules/work-capability/` that produces typed `EvidenceSealV1` and `CausalTraceV1` only from already-existing synthetic execution/effect lineage.

The finalizer must enforce:

- reservation reference equality;
- correlation equality;
- verified effect reference equality;
- verification reference binding;
- deterministic `RC1-TRACE-V1` trace-digest grammar already accepted by `ReconciliationFabricV1`;
- seal timestamp not earlier than verified-effect timestamp;
- exact replay returns the same seal/trace;
- changed lineage under the same identity fails closed.

This finalizer is a synthetic compatibility surface, not a production River sealing implementation.

## 7. Reconciliation Algorithm

`WorkCapabilityReconciliationBridgeV1.reconcile(...)` executes in this order:

1. Validate Work expectation integrity and pre-execution timestamp.
2. Validate Work Unit, assignment, execution receipt, Work outcome, and remaining-work proposal lineage.
3. Call the existing `ReconciliationFabricV1.reconcile(...)` with the underlying expected-effect contract, execution receipt, observation, verification result, evidence seal, causal trace, and reconciliation time.
4. If the generic fabric rejects input, fail closed and return no Work determination.
5. If the generic fabric returns `EXCEPTION`, return Work classification `GENERIC_RECONCILIATION_EXCEPTION`; do not create recovery Work automatically.
6. If the generic fabric returns `RECONCILED/MATCH`, evaluate `CapabilityOutcomeV1`:
   - `FULL_EFFECT` → `CLOSED`;
   - `PARTIAL_EFFECT` → `EXCEPTION` and require a valid `RemainingWorkProposalV1`;
   - `FAILED_EFFECT` → `EXCEPTION`.
7. For `PARTIAL_EFFECT`, compile a `WorkRecoveryRequestV1` from the remaining-work proposal. It remains `authorized: false` and `requiresFreshWardenDecision: true`.
8. No recovery Work Unit is executed by this bridge.

## 8. Fresh Warden Authority Boundary

A recovery request is not authorization.

Any later recovery execution must create a new Warden decision request whose lineage includes:

- parent Work Unit;
- parent Work reconciliation determination;
- remaining-work proposal;
- recovery request;
- current actor/composition context;
- current policy/authority snapshot.

The original execution's `ALLOW` decision cannot authorize the recovery execution.

R0.1 proves the requirement by asserting that the bridge output contains no action token, no execution receipt, and no executable assignment for the recovery work.

## 9. Idempotency and Conflict Rules

Identity key:

`workUnitRef + assignmentRef + executionReceiptRef + reconciliationRef`

Fingerprint material includes:

- Work expectation digest;
- generic expected-effect contract digest;
- Work Unit identity and thresholds;
- assignment identity;
- execution receipt identity;
- observation/effect/seal/trace identity;
- Work outcome values;
- remaining-work proposal values;
- determination timestamp.

Rules:

- exact replay returns the same Work determination and recovery request;
- exact replay does not mint another reconciliation determination, seal, or recovery request;
- changed quantity, quality, effect, seal, trace, assignment, or remaining-work material under the same identity fails closed with `work_capability_reconciliation_idempotency_conflict`.

## 10. Synthetic Acceptance Scenario

Reference batch:

- Work Unit: waistband attachment;
- required quantity: 500;
- actor composition: `HUMAN:OPERATOR-P17 + AGENT:WORK-INSTRUCTION-A2 + MACHINE:LOCKSTITCH-M04`;
- accepted quantity: 487;
- rework quantity: 6;
- output quantity: 493;
- remaining quantity: 7;
- first-pass quality: `487 / 493`, above the R0.1 threshold;
- generic observed effect family: matched;
- generic reconciliation: `RECONCILED / MATCH`;
- Work reconciliation: `EXCEPTION / PARTIAL_EFFECT`;
- recovery request: 7 units, `authorized: false`, fresh Warden decision required.

Success scenario:

- output quantity 500;
- quality threshold met;
- generic reconciliation `MATCH`;
- Work reconciliation `CLOSED / FULL_EFFECT`;
- no recovery request.

## 11. Fail-Closed Cases

Acceptance tests must cover at least:

- unsupported garment requested effect cannot compile;
- missing/invalid expected-effect contract;
- expectation compiled after execution;
- missing seal;
- invalid seal trace digest;
- missing or mismatched causal trace;
- generic reconciliation exception;
- `PARTIAL_EFFECT` without a remaining-work proposal;
- remaining-work quantity not equal to the Work outcome shortfall;
- recovery request incorrectly marked authorized;
- exact replay;
- mutated replay conflict.

## 12. Files Expected to Change

Primary:

- `modules/work-capability/reconciliation-bridge.ts` — new;
- `modules/work-capability/reconciliation-bridge.test.ts` — new;
- `modules/work-capability/fixtures/garment.ts` — expose/bind the additional expectation/evidence fixture material;
- `modules/synnergyze/effect-expectation.ts` — add the bounded synthetic garment compiler and trusted validation path;
- `package.json` — focused test command.

Only if required by compiler typing:

- `modules/work-capability/contracts.ts`.

`ReconciliationFabricV1` is not expected to change.

## 13. Repository Test Gate

The implementation is not complete until the same exact head passes:

- focused reconciliation-bridge tests;
- existing Work/Capability tests;
- existing reconciliation conformance tests;
- type-check;
- lint;
- full Vitest suite;
- current repository CI/security gates triggered by the stacked PR.

## 14. Non-Goals

R0.1 does not:

- merge PR #83;
- modify live factory systems;
- issue worker qualifications or credentials;
- execute recovery work autonomously;
- settle payroll or SILK obligations;
- control PLC/MES equipment;
- implement a production River evidence ledger;
- generalize all Work capabilities into a universal expectation compiler;
- alter the generic `ReconciliationFabricV1` classification model.

## 15. Release Boundary

The deliverable is a synthetic proof that one partial physical Work result can traverse the full existing execution/evidence/reconciliation lineage and emerge as a governed Work exception with an exact, non-authorized recovery request requiring fresh Warden authority.

The bridge is complete only when the 500 → 493 → 7 scenario is proven end-to-end and a 500 → 500 scenario closes without a recovery request.