# Simulation-to-Reality Fabric R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `VSR-SIMULATION-TO-REALITY-FABRIC-001 R0.1` as the shared simulation safety and maturity substrate for synthetic, replay, counterfactual, and shadow learning, while making any M4+ or real-world effect impossible in R0.1.

**Architecture:** Create a standalone `modules/simulation` boundary with pure canonicalization, admission evaluation, scenario/replay/counterfactual runners, append-only persistence, and a model-change proposal surface. The module may consume immutable references and pure evaluator callbacks, but it must not call Warden runtime authorization, controlled execution, SILK, or SILK-DAM. R0.1 supports M0–M3 only and binds every output to deterministic input/output hashes.

**Tech Stack:** Node 22.14.0, TypeScript 5.8.3, Vitest 3.1.1, PostgreSQL-compatible/Neon DB, ESLint 9.24

**Spec:** `docs/superpowers/specs/2026-08-28-qualification-simulation-to-reality-design.md`

## Global Constraints

- Preserve `SIMULATED ≠ REAL` as an executable invariant.
- All M0–M3 effect flags are exactly `false`: `mayCreateAuthority`, `mayCreateQualification`, `mayCreateObligation`, `mayCreatePayment`, `mayTriggerExecution`.
- `M1_SYNTHETIC` requires `CG1_REPRODUCIBLE`; `M2_REPLAYED` and `M3_SHADOW` require `CG2_EVIDENCE_BOUND`.
- `M4_ADVISORY` through `M8_SILK_ACTIVE` may exist as type values but R0.1 admission must reject them with `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- No import from `modules/silk/**`, `modules/silk-dam/**`, `modules/synnergyze/execution-gate.ts`, or `modules/warden/decision-service.ts`.
- Do not reuse `PostgresQueryExecutorV1` from a Synnergyze implementation file; define a small local `SimulationQueryExecutorV1` interface to preserve module independence.
- Canonical hashes use SHA-256 over stable key order and stable sorting of unordered reference sets.
- Every durable identity is append-once: exact replay returns `IDEMPOTENT_REPLAY`; changed content under the same identity returns `CONFLICT`.
- Tests are written before implementation and each task ends with a focused commit.

---

## File Map

**Create**
- `modules/simulation/contracts.ts` — public R0.1 types and blocker codes.
- `modules/simulation/canonical.ts` — stable canonical JSON, SHA-256 snapshot and branch identities.
- `modules/simulation/reality-gate.ts` / `.test.ts` — maturity + compute governance admission.
- `modules/simulation/scenario-runner.ts` / `.test.ts` — M1 synthetic execution around pure evaluator callbacks.
- `modules/simulation/replay-runner.ts` / `.test.ts` — M2 replay without source-history mutation.
- `modules/simulation/counterfactual-runner.ts` / `.test.ts` — alternate-policy branches bound to one source snapshot.
- `modules/simulation/comparison.ts` / `.test.ts` — explicit institutional-effect metrics.
- `modules/simulation/model-change-proposal.ts` / `.test.ts` — proposals that cannot activate policy.
- `modules/simulation/postgres-simulation-store.ts` / `.test.ts` — append-only durable store.
- `modules/simulation/sql/001_simulation_fabric.sql` — PostgreSQL schema and constraints.
- `.github/workflows/qualification-simulation-r0.1.yml` — scoped acceptance gate shared by the three R0.1 plans.

**Modify**
- `package.json` — add `test:simulation` and `lint:simulation`.
- `.vsr/module-bindings.yaml` — register `MOD-SIMULATION-REALITY-001` without SILK dependency.
- `.vsr/repository-components.yaml` — register reality gate, scenario runner, replay/counterfactual runner, and simulation store components.

## Public Interfaces

`modules/simulation/contracts.ts` must export:

```ts
export type RealityMaturityV1 =
  | "M0_MODELLED" | "M1_SYNTHETIC" | "M2_REPLAYED" | "M3_SHADOW"
  | "M4_ADVISORY" | "M5_GOVERNED_PILOT" | "M6_VERIFIED_LIVE"
  | "M7_ECONOMICALLY_ADMISSIBLE" | "M8_SILK_ACTIVE";

export type ComputeGovernanceLevelV1 =
  | "CG0_EXPERIMENTAL" | "CG1_REPRODUCIBLE" | "CG2_EVIDENCE_BOUND"
  | "CG3_POLICY_GOVERNED" | "CG4_INDEPENDENTLY_VERIFIABLE"
  | "CG5_CONTROLLED_LIVE" | "CG6_ECONOMIC_COMPUTATION" | "CG7_SETTLEMENT_GRADE";

export type SimulationModeV1 = "SYNTHETIC" | "HISTORICAL_REPLAY" | "COUNTERFACTUAL" | "SHADOW";

export interface SimulationEffectFlagsV1 {
  mayCreateAuthority: false;
  mayCreateQualification: false;
  mayCreateObligation: false;
  mayCreatePayment: false;
  mayTriggerExecution: false;
}
```

Also define `SimulationScenarioV1`, `SimulationBranchV1`, `SimulationSnapshotV1`, `SimulationOutcomeRecordV1`, `SimulationComparisonV1`, `ComputeGovernanceProfileV1`, `RealityAdmissionPolicyV1`, `RealityAdmissionRequestV1`, `RealityAdmissionDecisionV1`, `QualificationModelChangeProposalV1`, and blocker codes including `COMPUTE_GOVERNANCE_INSUFFICIENT`, `SIMULATION_INPUT_DRIFT`, `SIMULATION_OUTPUT_NOT_REPRODUCIBLE`, `REALITY_PROMOTION_NOT_PERMITTED`, and `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.

---

### Task 1: Contract types and fail-closed reality gate

**Files:** Create `modules/simulation/contracts.ts`, `modules/simulation/reality-gate.test.ts`, `modules/simulation/reality-gate.ts`.

- [ ] Write tests asserting M1+CG0 is rejected, M1+CG1 is admitted, M2/M3+CG1 are rejected, M2/M3+CG2 are admitted, and every requested M4+ transition is rejected with `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- [ ] Add a test that attempts any true effect flag in an M0–M3 request and expects `REALITY_PROMOTION_NOT_PERMITTED`.
- [ ] Run `npx vitest run modules/simulation/reality-gate.test.ts` and confirm RED because the module does not exist.
- [ ] Implement only the contracts and deterministic gate necessary to satisfy those tests. The decision shape must include `admitted`, `reasonCodes`, `fromMaturity`, `requestedMaturity`, `computeGovernanceLevel`, `envelopeHash`, and all-false effect flags.
- [ ] Re-run the focused test and `npm run -s type-check`.
- [ ] Commit: `feat(simulation): add r0.1 reality admission gate`.

### Task 2: Canonical snapshots and deterministic synthetic scenario runner

**Files:** Create `modules/simulation/canonical.ts`, `modules/simulation/scenario-runner.test.ts`, `modules/simulation/scenario-runner.ts`.

- [ ] Write tests proving equivalent unordered reference inputs produce the same snapshot hash, material input changes change the hash, and two runs over identical scenario/evaluator inputs produce identical output hashes.
- [ ] Define the evaluator boundary as a pure injected function `(input: unknown) => unknown | Promise<unknown>`; the runner must not import Warden or execution services.
- [ ] Add a test proving the returned `SimulationOutcomeRecordV1` is `M1_SYNTHETIC`, carries all-false effect flags, and contains `inputSnapshotRef`, `inputHash`, `outputSnapshotRef`, `outputHash`, evaluator/model refs, and scenario/branch refs.
- [ ] Run `npx vitest run modules/simulation/scenario-runner.test.ts` and confirm RED.
- [ ] Implement stable recursive key ordering, sorted declared reference sets, SHA-256 digests, scenario identity, and synthetic runner.
- [ ] Re-run focused test + `npm run -s type-check`.
- [ ] Commit: `feat(simulation): add deterministic synthetic scenario runner`.

### Task 3: Historical replay and counterfactual branches

**Files:** Create `modules/simulation/replay-runner.test.ts`, `modules/simulation/replay-runner.ts`, `modules/simulation/counterfactual-runner.test.ts`, `modules/simulation/counterfactual-runner.ts`.

- [ ] Test that replay requires M2/CG2, binds an immutable source snapshot, and returns a new replay output without mutating the source object.
- [ ] Test that counterfactual branches require `parentBranchRef` or a source snapshot, preserve the source-reality ref/hash, and produce different branch/output hashes when intervention or policy revision changes.
- [ ] Test that a source snapshot hash mismatch fails as `SIMULATION_INPUT_DRIFT` before evaluator invocation.
- [ ] Run both focused test files and confirm RED.
- [ ] Implement replay and counterfactual runners using canonical functions from Task 2 and admission checks from Task 1.
- [ ] Re-run focused tests + type-check.
- [ ] Commit: `feat(simulation): add replay and counterfactual runners`.

### Task 4: Comparison metrics and non-activating model-change proposals

**Files:** Create `modules/simulation/comparison.test.ts`, `modules/simulation/comparison.ts`, `modules/simulation/model-change-proposal.test.ts`, `modules/simulation/model-change-proposal.ts`.

- [ ] Test deterministic comparison output for false-positive rate, false-negative rate, UNKNOWN/abstention rate, reassessment rate, evidence-insufficiency rate, outcome success rate, recency sensitivity, economic-eligibility concentration, role/capability/location/programme concentration, new-entrant disadvantage, subjective-assessor dependence, distributional delta, safety-significant case count, and counterfactual stability.
- [ ] Define zero-denominator behavior explicitly as `null`, never `Infinity`, `NaN`, or guessed zero.
- [ ] Test `QualificationModelChangeProposalV1` always has `state: "PROPOSED_NOT_ACTIVE"`, `mayActivatePolicy: false`, source scheme/dataset/simulation refs, deltas, confidence, uncertainty, limitations, and created-by model ref.
- [ ] Test that attempts to create an ACTIVE proposal are impossible at the type boundary and rejected by the runtime factory.
- [ ] Run focused tests and confirm RED.
- [ ] Implement comparison and proposal factories only; do not implement an approval/activation API.
- [ ] Re-run focused tests + type-check.
- [ ] Commit: `feat(simulation): add institutional comparison and model proposals`.

### Task 5: Append-only PostgreSQL simulation store

**Files:** Create `modules/simulation/postgres-simulation-store.test.ts`, `modules/simulation/postgres-simulation-store.ts`, `modules/simulation/sql/001_simulation_fabric.sql`.

- [ ] Define local `SimulationQueryResultV1<T>` and `SimulationQueryExecutorV1` interfaces in the store file.
- [ ] Write scripted-DB tests for scenario, snapshot, branch, outcome, comparison, admission evaluation, and model-change-proposal inserts.
- [ ] Require `INSERT ... ON CONFLICT (<identity>) DO NOTHING`; exact digest replay returns `IDEMPOTENT_REPLAY`; mismatched digest returns `CONFLICT`.
- [ ] Add tests reading the SQL file and asserting primary keys, parent FKs, `sha256:%` checks, M0–M3 reality checks, and database CHECK constraints that all five effect flags remain false.
- [ ] Add a DB constraint restricting R0.1 persisted runtime outcomes to `M0_MODELLED`, `M1_SYNTHETIC`, `M2_REPLAYED`, `M3_SHADOW`; do not persist M4+ outcomes.
- [ ] Run `npx vitest run modules/simulation/postgres-simulation-store.test.ts` and confirm RED.
- [ ] Implement the schema and store with explicit parse/clone functions and fail-closed race handling.
- [ ] Re-run focused test + type-check.
- [ ] Commit: `feat(simulation): add durable append-only simulation store`.

### Task 6: Repository manifests, scoped CI, and final R0.1 proof

**Files:** Modify `package.json`, `.vsr/module-bindings.yaml`, `.vsr/repository-components.yaml`; create `.github/workflows/qualification-simulation-r0.1.yml`.

- [ ] Add `test:simulation` as an explicit Vitest list containing all simulation test files and `lint:simulation` as `eslint modules/simulation --ext .ts`.
- [ ] Register module `MOD-SIMULATION-REALITY-001` with dependencies limited to canonical registry/evidence references and pure evaluator contracts; forbidden rules must include `create-live-authority`, `trigger-controlled-execution`, `create-economic-obligation`, `call-silk-runtime`, and `self-activate-model-change`.
- [ ] Register component blocks following the repository's current component-manifest structure with `activation_implied: false` and `activation_gate: r0.1-m0-through-m3-only`.
- [ ] Create path-scoped workflow triggers for `modules/simulation/**`, `modules/qualification/**`, `modules/qualified-time/**`, `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, both `.vsr` manifests, and this workflow.
- [ ] Workflow uses Node from `.nvmrc`, `npm ci`, `npm run test:simulation`, `npm run lint:simulation`, and `npm run -s type-check`. Later plans extend the same workflow with qualification and qualified-time commands.
- [ ] Run `npm run test:simulation`.
- [ ] Run `npm run lint:simulation`.
- [ ] Run `npm run -s type-check`.
- [ ] Run `grep -R -nE '(\.\./silk|modules/silk|silk-dam|decision-service|execution-gate)' modules/simulation` and require no implementation imports; references in test descriptions alone must be inspected and not treated as imports.
- [ ] Run `grep -R -nE '\b(TODO|TBD|FIXME)\b' modules/simulation docs/superpowers/plans/2026-08-28-simulation-to-reality-fabric-r0.1.md` and require no unresolved placeholders.
- [ ] Commit: `chore(simulation): register r0.1 acceptance surface`.

## Completion Gate

Do not start the Warden Qualification plan until all Task 6 focused commands pass on the exact branch head. R0.1 completion means the repository can model, simulate, replay, branch, compare, and propose changes through M3 without any ability to create authority, qualification, execution, payment, obligation, or SILK effect.