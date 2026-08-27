# Simulation-to-Reality Fabric R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `VSR-SIMULATION-TO-REALITY-FABRIC-001 R0.1` as the shared simulation safety and maturity substrate for modelled, synthetic, historical replay, counterfactual, and shadow learning, while making M4+ and every live/economic effect impossible in R0.1.

**Architecture:** Create a standalone `modules/simulation` boundary with canonical snapshot hashing, dataset-purpose/privacy binding, compute-governance admission, synthetic/replay/counterfactual/shadow runners, institutional-effect comparison, non-activating model-change proposals, and append-only persistence. The module receives pure evaluator callbacks and immutable refs; it never calls Warden runtime authorization, controlled execution, SILK, or SILK-DAM. Every record carries explicit reality maturity and negative effect capabilities.

**Tech Stack:** Node 22.14.0, TypeScript 5.8.3, Vitest 3.1.1, PostgreSQL-compatible/Neon DB, ESLint 9.24

**Spec:** `docs/superpowers/specs/2026-08-28-qualification-simulation-to-reality-design.md`

## Global Constraints

- Preserve `SIMULATED ≠ REAL` as an executable invariant.
- All M0–M3 effect flags are exactly `false`: `mayCreateAuthority`, `mayCreateQualification`, `mayCreateObligation`, `mayCreatePayment`, `mayTriggerExecution`.
- `M1_SYNTHETIC` requires `CG1_REPRODUCIBLE`; `M2_REPLAYED` and `M3_SHADOW` require `CG2_EVIDENCE_BOUND`.
- `M4_ADVISORY` through `M8_SILK_ACTIVE` may exist as type values, but R0.1 admission rejects them with `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- Simulation data is classified as `SYNTHETIC_PERSONA`, `PSEUDONYMIZED_HISTORICAL`, `IDENTIFIABLE_HISTORICAL`, or `LIVE_IDENTIFIABLE` and is bound to purpose, permitted scope, retention, and provenance before execution.
- No import from `modules/silk/**`, `modules/silk-dam/**`, `modules/synnergyze/execution-gate.ts`, or `modules/warden/decision-service.ts`.
- Define a local `SimulationQueryExecutorV1`; do not reuse a DB interface owned by a Synnergyze implementation file.
- Canonical hashes use SHA-256 over recursively stable key order and explicit stable sorting of unordered reference sets.
- Every durable identity is append-once: exact replay returns `IDEMPOTENT_REPLAY`; changed content under the same identity returns `CONFLICT`.
- A learned rule is only `PROPOSED_NOT_ACTIVE`; no R0.1 API can activate it.
- Tests are written before implementation and each task ends with a focused commit.

---

## File Map

**Create**
- `modules/simulation/contracts.ts` — maturity, compute governance, data classes, dataset bindings, admission, scenario, branch, outcome, comparison and proposal contracts.
- `modules/simulation/canonical.ts` — stable canonical JSON and SHA-256 identity helpers.
- `modules/simulation/reality-gate.ts` / `.test.ts` — immutable admission envelope and fail-closed M0–M3 gate.
- `modules/simulation/dataset-binding.ts` / `.test.ts` — privacy/purpose/scope/retention/provenance validation.
- `modules/simulation/scenario-runner.ts` / `.test.ts` — M1 synthetic execution around pure evaluator callbacks.
- `modules/simulation/replay-runner.ts` / `.test.ts` — M2 historical replay without source-history mutation.
- `modules/simulation/counterfactual-runner.ts` / `.test.ts` — alternate-policy branches bound to a source snapshot.
- `modules/simulation/shadow-runner.ts` / `.test.ts` — M3 side-by-side computation that cannot influence live state.
- `modules/simulation/comparison.ts` / `.test.ts` — explicit institutional-effect metrics.
- `modules/simulation/model-change-proposal.ts` / `.test.ts` — evidence-backed proposals that cannot activate policy.
- `modules/simulation/postgres-simulation-store.ts` / `.test.ts` — append-only durable store.
- `modules/simulation/sql/001_simulation_fabric.sql` — PostgreSQL schema and constraints.
- `.github/workflows/qualification-simulation-r0.1.yml` — scoped acceptance gate shared by all three approved R0.1 plans.

**Modify**
- `package.json` — add `test:simulation` and `lint:simulation`.
- `.vsr/module-bindings.yaml` — register `MOD-SIMULATION-REALITY-001` without SILK dependency.
- `.vsr/repository-components.yaml` — register gate, dataset binding, runners, comparison/proposal and durable store components.

## Public Interfaces

Create these exact foundations in `modules/simulation/contracts.ts`:

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
export type SimulationDataClassV1 = "SYNTHETIC_PERSONA" | "PSEUDONYMIZED_HISTORICAL" | "IDENTIFIABLE_HISTORICAL" | "LIVE_IDENTIFIABLE";

export interface SimulationEffectFlagsV1 {
  mayCreateAuthority: false;
  mayCreateQualification: false;
  mayCreateObligation: false;
  mayCreatePayment: false;
  mayTriggerExecution: false;
}

export interface SimulationDatasetBindingV1 {
  datasetBindingRef: string;
  datasetSnapshotRef: string;
  dataClass: SimulationDataClassV1;
  purposeRef: string;
  permittedScopeRefs: readonly string[];
  retentionRuleRef: string;
  provenanceRefs: readonly string[];
  createdAt: string;
  sourceDigest: string;
}

export interface RealityAdmissionRequestV1 {
  admissionRequestRef: string;
  objectType: string;
  objectRef: string;
  fromMaturity: RealityMaturityV1;
  requestedMaturity: RealityMaturityV1;
  qualificationSchemeRevisionRefs: readonly string[];
  computeGovernanceProfileRef: string;
  evidenceSnapshotRef: string;
  legalPolicyRefs: readonly string[];
  privacyPolicyRefs: readonly string[];
  authoritySnapshotRef: string;
  riskSnapshotRef: string;
  submittedAt: string;
  effectFlags: SimulationEffectFlagsV1;
  envelopeHash: string;
}
```

Also define `SimulationScenarioV1`, `SimulationBranchV1`, `SimulationSnapshotV1`, `SimulationOutcomeRecordV1`, `SimulationComparisonV1`, `ComputeGovernanceProfileV1`, `RealityAdmissionPolicyV1`, `RealityAdmissionDecisionV1`, `QualificationModelChangeProposalV1`, and blocker codes including `COMPUTE_GOVERNANCE_INSUFFICIENT`, `SIMULATION_INPUT_DRIFT`, `SIMULATION_OUTPUT_NOT_REPRODUCIBLE`, `SIMULATION_DATASET_NOT_PERMITTED`, `REALITY_PROMOTION_NOT_PERMITTED`, and `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.

---

### Task 1: Contract types and immutable fail-closed reality admission

**Files:** Create `modules/simulation/contracts.ts`, `modules/simulation/reality-gate.test.ts`, `modules/simulation/reality-gate.ts`.

**Interfaces:** Produces `evaluateRealityAdmissionV1(request, profile, policy): RealityAdmissionDecisionV1` and all shared simulation contracts.

- [ ] **Step 1: Write the failing admission tests.** Use a complete envelope and test M1+CG0 reject, M1+CG1 admit, M2/M3+CG1 reject, M2/M3+CG2 admit, and M4+ reject:

```ts
const request: RealityAdmissionRequestV1 = buildAdmissionRequest({
  fromMaturity: "M0_MODELLED",
  requestedMaturity: "M1_SYNTHETIC",
  computeGovernanceProfileRef: "COMPUTE-GOVERNANCE:CG1",
});
expect(evaluateRealityAdmissionV1(request, cg1, policy).admitted).toBe(true);
expect(evaluateRealityAdmissionV1({ ...request, requestedMaturity: "M4_ADVISORY" }, cg3, policy).reasonCodes)
  .toContain("REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY");
```

- [ ] **Step 2: Add a test that mutating `evidenceSnapshotRef`, `authoritySnapshotRef`, `riskSnapshotRef`, `legalPolicyRefs`, or `privacyPolicyRefs` without recomputing `envelopeHash` fails as `SIMULATION_INPUT_DRIFT`.**
- [ ] **Step 3: Add a type/runtime test that any true effect flag is rejected as `REALITY_PROMOTION_NOT_PERMITTED`.**
- [ ] **Step 4: Run `npx vitest run modules/simulation/reality-gate.test.ts`; expect RED because the module is absent.**
- [ ] **Step 5: Implement canonical envelope hashing and the M0–M3/CG admission matrix.** Use a rank map for CG and explicitly reject requested maturity rank > M3 before any evaluator work.
- [ ] **Step 6: Re-run focused test + `npm run -s type-check`; expect PASS.**
- [ ] **Step 7: Commit `feat(simulation): add immutable r0.1 reality admission gate`.**

### Task 2: Dataset privacy, purpose, scope, retention and provenance binding

**Files:** Create `modules/simulation/canonical.ts`, `modules/simulation/dataset-binding.test.ts`, `modules/simulation/dataset-binding.ts`.

**Interfaces:** Produces `createSimulationDatasetBindingV1(input): SimulationDatasetBindingV1`, `simulationDigestV1(value): string`, and stable canonical JSON helpers used by later runners.

- [ ] **Step 1: Write a passing synthetic binding test.** Require one purpose ref, at least one permitted scope ref, one retention rule ref, one provenance ref, valid `createdAt`, and a deterministic SHA-256 digest.
- [ ] **Step 2: Write fail cases:** empty purpose, empty permitted scope, empty provenance, invalid instant, and `LIVE_IDENTIFIABLE` dataset supplied to an M1 synthetic-only scenario policy → `SIMULATION_DATASET_NOT_PERMITTED`.
- [ ] **Step 3: Add a canonicalization test proving different input ordering of scope/provenance refs produces the same digest.**
- [ ] **Step 4: Run `npx vitest run modules/simulation/dataset-binding.test.ts`; expect RED.**
- [ ] **Step 5: Implement recursive stable key ordering, sorted declared sets, SHA-256, and dataset validation.** Do not copy raw person data into the binding; persist refs/classification only.
- [ ] **Step 6: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(simulation): bind governed simulation datasets`.**

### Task 3: Deterministic M1 synthetic scenario runner

**Files:** Create `modules/simulation/scenario-runner.test.ts`, `modules/simulation/scenario-runner.ts`.

**Interfaces:** Consumes admitted M1 request, dataset binding, scenario and pure evaluator callback; produces `SimulationOutcomeRecordV1`.

- [ ] **Step 1: Write a deterministic test using an injected evaluator:**

```ts
const evaluator = async (input: unknown) => ({ classification: "PASS", input });
const first = await runSyntheticScenarioV1({ scenario, admission, datasetBinding, input, evaluator });
const second = await runSyntheticScenarioV1({ scenario, admission, datasetBinding, input, evaluator });
expect(second.outputHash).toBe(first.outputHash);
expect(first.realityMaturity).toBe("M1_SYNTHETIC");
```

- [ ] **Step 2: Assert output contains `inputSnapshotRef`, `inputHash`, `outputSnapshotRef`, `outputHash`, evaluator/model refs, scenario/branch refs and all-false effect flags.**
- [ ] **Step 3: Add failures for non-admitted request, dataset-purpose/scope mismatch, and changed input under a claimed prior input hash → `SIMULATION_INPUT_DRIFT`.**
- [ ] **Step 4: Run `npx vitest run modules/simulation/scenario-runner.test.ts`; expect RED.**
- [ ] **Step 5: Implement only pure callback invocation after admission/dataset/hash checks.** The runner has no Warden/execution/SILK service dependency.
- [ ] **Step 6: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(simulation): add deterministic synthetic scenario runner`.**

### Task 4: M2 historical replay and counterfactual branching

**Files:** Create `modules/simulation/replay-runner.test.ts`, `modules/simulation/replay-runner.ts`, `modules/simulation/counterfactual-runner.test.ts`, `modules/simulation/counterfactual-runner.ts`.

**Interfaces:** Produces `runHistoricalReplayV1(input)` and `runCounterfactualBranchV1(input)` returning `SimulationOutcomeRecordV1` plus branch metadata.

- [ ] **Step 1: Write replay tests requiring M2+CG2, immutable source snapshot ref/hash, and a new replay output while the source object remains deeply equal to its pre-run clone.**
- [ ] **Step 2: Write a source-hash drift test and assert evaluator invocation count remains zero after `SIMULATION_INPUT_DRIFT`.**
- [ ] **Step 3: Write counterfactual tests proving changed intervention or policy revision changes branch/output hashes while preserving source reality ref/hash.**
- [ ] **Step 4: Run `npx vitest run modules/simulation/replay-runner.test.ts modules/simulation/counterfactual-runner.test.ts`; expect RED.**
- [ ] **Step 5: Implement replay/counterfactual runners using Task 1 admission and Task 2 canonicalization only.** Never mutate the source snapshot.
- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(simulation): add replay and counterfactual runners`.**

### Task 5: M3 shadow runner with hard no-effect boundary

**Files:** Create `modules/simulation/shadow-runner.test.ts`, `modules/simulation/shadow-runner.ts`.

**Interfaces:** Produces `runShadowScenarioV1(input): Promise<SimulationOutcomeRecordV1>`.

- [ ] **Step 1: Write a passing M3+CG2 test using a current-operation source snapshot and assert the shadow output is stored separately from `actualOutcomeRef`.**
- [ ] **Step 2: Inject spies named `authoritySink`, `executionSink`, and `economicSink` only in the test harness and assert invocation count remains zero after shadow evaluation.** The production function must not accept these sinks at all.
- [ ] **Step 3: Add a test that any M3 output whose effect flags are not all false is rejected before persistence.**
- [ ] **Step 4: Run `npx vitest run modules/simulation/shadow-runner.test.ts`; expect RED.**
- [ ] **Step 5: Implement the shadow runner as a pure evaluator + snapshot recorder.** Its public input contains no action token, execution adapter, payment adapter, obligation factory, or live mutation callback.
- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(simulation): add no-effect shadow runner`.**

### Task 6: Institutional comparison metrics and non-activating model-change proposals

**Files:** Create `modules/simulation/comparison.test.ts`, `modules/simulation/comparison.ts`, `modules/simulation/model-change-proposal.test.ts`, `modules/simulation/model-change-proposal.ts`.

**Interfaces:** Produces `compareSimulationOutcomesV1(input): SimulationComparisonV1` and `createQualificationModelChangeProposalV1(input): QualificationModelChangeProposalV1`.

- [ ] **Step 1: Write deterministic metric tests covering false-positive rate, false-negative rate, UNKNOWN/abstention rate, reassessment rate, evidence-insufficiency rate, outcome success rate, recency sensitivity, economic-eligibility concentration, role/capability/location/programme concentration, new-entrant disadvantage, subjective-assessor dependence, distributional delta, safety-significant cases and counterfactual stability.**
- [ ] **Step 2: Define zero-denominator behavior as `null` and test that output never contains `Infinity` or `NaN`.**
- [ ] **Step 3: Write proposal tests requiring `state: "PROPOSED_NOT_ACTIVE"`, `mayActivatePolicy: false`, source scheme/dataset/simulation refs, deltas, uncertainty, confidence, limitations and model ref.**
- [ ] **Step 4: Add a compile-time/runtime test rejecting an ACTIVE proposal shape.**
- [ ] **Step 5: Run both focused test files; expect RED.**
- [ ] **Step 6: Implement pure comparison and proposal factories only; expose no approval/activation method.**
- [ ] **Step 7: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 8: Commit `feat(simulation): add comparison and model-change proposals`.**

### Task 7: Append-only PostgreSQL simulation store

**Files:** Create `modules/simulation/postgres-simulation-store.test.ts`, `modules/simulation/postgres-simulation-store.ts`, `modules/simulation/sql/001_simulation_fabric.sql`.

**Interfaces:** Define local `SimulationQueryResultV1<T>` and `SimulationQueryExecutorV1`; persist dataset bindings, admission requests/decisions, scenarios, snapshots, branches, outcomes, comparisons and proposals.

- [ ] **Step 1: Write scripted-DB tests for every durable record family using `INSERT ... ON CONFLICT (<identity>) DO NOTHING`.** Exact digest replay must return `IDEMPOTENT_REPLAY`; changed digest must return `CONFLICT`.
- [ ] **Step 2: Write SQL-file tests for primary keys, parent FKs, `sha256:%` checks, dataset binding fields, admission envelope refs, M0–M3 restriction and all five false effect flags.**
- [ ] **Step 3: Add DB CHECK constraints restricting persisted runtime outcomes to `M0_MODELLED`, `M1_SYNTHETIC`, `M2_REPLAYED`, `M3_SHADOW`; M4+ rows must be impossible.**
- [ ] **Step 4: Add a schema test requiring model-change proposal state `PROPOSED_NOT_ACTIVE` and `may_activate_policy = false`.**
- [ ] **Step 5: Run `npx vitest run modules/simulation/postgres-simulation-store.test.ts`; expect RED.**
- [ ] **Step 6: Implement store parse/clone methods, race-safe readback and append-only semantics.**
- [ ] **Step 7: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 8: Commit `feat(simulation): add durable append-only simulation store`.**

### Task 8: Repository manifests, scoped CI and final foundation proof

**Files:** Modify `package.json`, `.vsr/module-bindings.yaml`, `.vsr/repository-components.yaml`; create `.github/workflows/qualification-simulation-r0.1.yml`.

- [ ] **Step 1: Add exact scripts:**

```json
"test:simulation": "vitest run modules/simulation/reality-gate.test.ts modules/simulation/dataset-binding.test.ts modules/simulation/scenario-runner.test.ts modules/simulation/replay-runner.test.ts modules/simulation/counterfactual-runner.test.ts modules/simulation/shadow-runner.test.ts modules/simulation/comparison.test.ts modules/simulation/model-change-proposal.test.ts modules/simulation/postgres-simulation-store.test.ts",
"lint:simulation": "eslint modules/simulation --ext .ts"
```

- [ ] **Step 2: Register `MOD-SIMULATION-REALITY-001` with dependencies limited to canonical registry/evidence refs and pure evaluator contracts.** Forbidden rules: `create-live-authority`, `trigger-controlled-execution`, `create-economic-obligation`, `create-payment`, `call-silk-runtime`, `self-activate-model-change`.
- [ ] **Step 3: Register component blocks for reality gate, dataset binding, synthetic/replay/counterfactual/shadow runners, comparison/proposal and store using repository manifest conventions, `activation_implied: false`, `activation_gate: r0.1-m0-through-m3-only`.**
- [ ] **Step 4: Create path-scoped workflow triggers for `modules/simulation/**`, `modules/qualification/**`, `modules/qualified-time/**`, `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, both `.vsr` manifests, and the workflow itself.**
- [ ] **Step 5: Workflow uses `.nvmrc`, `npm ci`, `npm run test:simulation`, `npm run lint:simulation`, and `npm run -s type-check`.** Later approved plans extend this same workflow.
- [ ] **Step 6: Run `npm run test:simulation`; expect PASS.**
- [ ] **Step 7: Run `npm run lint:simulation`; expect PASS.**
- [ ] **Step 8: Run `npm run -s type-check`; expect PASS.**
- [ ] **Step 9: Run `grep -R -nE 'from .*\/(silk|silk-dam)\/|from .*decision-service|from .*execution-gate' modules/simulation`; expect no output.**
- [ ] **Step 10: Inspect the plan and implementation for unresolved placeholder markers before commit; none may remain.**
- [ ] **Step 11: Commit `chore(simulation): register r0.1 acceptance surface`.**

## Completion Gate

Do not execute the Warden Qualification plan until all Task 8 focused commands pass on the exact branch head. Foundation completion means the repository can bind governed datasets, model, simulate, replay, branch, shadow, compare and propose changes through M3 without any ability to create authority, qualification, execution, payment, obligation, policy activation, or SILK effect.