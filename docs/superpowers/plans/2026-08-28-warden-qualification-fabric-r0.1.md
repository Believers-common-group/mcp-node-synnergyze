# Warden Qualification Fabric R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `WARDEN-QUALIFICATION-FABRIC-001 R0.1` as a deterministic, evidence-bound, scope-specific qualification evaluator that can produce simulated qualification projections through M3 without creating standing authorization, live credentials, or economic obligations.

**Architecture:** Put canonical qualification types, evidence normalization, criteria evaluation, projection, status history, review/appeal, River receipt compilation, and durable storage in a new `modules/qualification` boundary. Add a thin `modules/warden/qualification-engine.ts` orchestration boundary that verifies assessor authority inputs and produces qualification decisions, but never invokes `modules/warden/decision-service.ts` and never issues an action token. R0.1 consumes `modules/simulation` maturity/effect contracts so every qualification result is explicitly non-live.

**Tech Stack:** Node 22.14.0, TypeScript 5.8.3, Vitest 3.1.1, PostgreSQL-compatible/Neon DB, ESLint 9.24

**Spec:** `docs/superpowers/specs/2026-08-28-qualification-simulation-to-reality-design.md`

## Global Constraints

- A principal has scoped qualifications, not one universal rank.
- Every result is bound to `schemeRef`, `schemeRevisionRef`, `scopeRef`, `evidenceBundleRef`, and a validity window.
- Human-facing L0–L5 is a projection; the source of truth is the qualification vector and criterion results.
- `QUALIFIED ≠ AUTHORIZED`; qualification outputs cannot contain `actionToken`, cannot produce `WardenDecisionV1`, and cannot trigger execution.
- R0.1 supports only M0–M3. Every result carries all-false simulation effect flags from `SimulationEffectFlagsV1`.
- A live qualification credential is out of scope. `QualificationAssertionV1` in R0.1 is explicitly `live: false` and `mayCreateQualification: false`.
- Insufficient evidence or unresolved authority must fail closed as `REFUSE` or `UNKNOWN`; no guessed promotion.
- A failed work outcome may trigger `QUALIFICATION_REVIEW_REQUIRED`; it must not directly rewrite or demote a prior assertion.
- Historical assertions/status events are append-only; supersession is a new record and never mutates prior history.
- AI/model output may supply evidence or a proposal but cannot independently satisfy required assessor authority.
- No import from `modules/silk/**`, `modules/silk-dam/**`, `modules/synnergyze/execution-gate.ts`, or `modules/warden/decision-service.ts`.
- Tests are written before implementation and each task ends with a focused commit.

---

## File Map

**Create**
- `modules/qualification/contracts.ts` — qualification schemes, evidence, vectors, decisions, assertions, reviews, appeals.
- `modules/qualification/contracts.test.ts` — compile-time non-authority/non-economic shape checks.
- `modules/qualification/canonical.ts` — stable evidence and assertion hashing.
- `modules/qualification/evidence-bundle.ts` / `.test.ts` — evidence-grade, integrity, recency and conflict normalization.
- `modules/qualification/criteria-evaluator.ts` / `.test.ts` — criterion-by-criterion deterministic evaluation and qualification vector.
- `modules/qualification/projection.ts` / `.test.ts` — L0–L5 human-facing projection from vector + criteria.
- `modules/warden/qualification-engine.ts` / `.test.ts` — Warden-scoped qualification decision orchestration, separate from runtime authorization.
- `modules/qualification/status-ledger.ts` / `.test.ts` — append-only status transitions, review and appeal records.
- `modules/qualification/river-receipt.ts` / `.test.ts` — compile qualification evidence/decision facts into River event envelopes.
- `modules/qualification/postgres-qualification-store.ts` / `.test.ts` — durable append-only persistence.
- `modules/qualification/sql/001_qualification_fabric.sql` — qualification schema and invariants.

**Modify**
- `package.json` — add `test:qualification` and `lint:qualification`.
- `.github/workflows/qualification-simulation-r0.1.yml` — add qualification tests/lint after Simulation Plan Task 6 creates the workflow.
- `.vsr/module-bindings.yaml` — register qualification module and Warden qualification engine contracts.
- `.vsr/repository-components.yaml` — register qualification evaluator, Warden engine, status ledger, River receipt adapter, and durable store.
- `modules/contracts.test.ts` — add one cross-boundary compile/runtime assertion that qualification does not imply authorization.

## Public Interfaces

Create these exact foundational types in `modules/qualification/contracts.ts`:

```ts
import type {
  RealityMaturityV1,
  SimulationEffectFlagsV1,
} from "../simulation/contracts.ts";

export type EvidenceGradeV1 = "E0_CLAIMED" | "E1_OBSERVED" | "E2_CORROBORATED" | "E3_VERIFIED" | "E4_ASSURED";
export type QualificationProgressionLevelV1 = "L0_DISCOVERED" | "L1_IDENTIFIED" | "L2_EVIDENCED" | "L3_DEMONSTRATED" | "L4_QUALIFIED" | "L5_RELIED_UPON";
export type QualificationDecisionKindV1 = "ASSERT" | "MAINTAIN" | "LIMIT" | "REQUIRE_REASSESSMENT" | "SUSPEND" | "REVOKE" | "REFUSE" | "UNKNOWN";
export type QualificationStatusEventKindV1 = "QUALIFICATION_ASSERTED" | "QUALIFICATION_RENEWED" | "QUALIFICATION_LIMITED" | "QUALIFICATION_SUSPENDED" | "QUALIFICATION_EXPIRED" | "QUALIFICATION_REVOKED" | "QUALIFICATION_SUPERSEDED" | "QUALIFICATION_REVIEW_REQUIRED";

export interface QualificationVectorV1 {
  identityAssurance: number;
  evidenceAssurance: number;
  competence: number;
  responsibilityAutonomy: number;
  experienceRecency: number;
  effectReliability: number;
  economicReadiness: number;
}
```

Use integer ranges `0..5` for vector dimensions in R0.1 and validate them at runtime. Also define:

- `QualificationSchemeV1`
- `QualificationSchemeRevisionV1`
- `CompetencyV1`
- `CompetencyRequirementV1`
- `ProgressionModelV1`
- `ProgressionLevelRuleV1`
- `AssessmentMethodV1`
- `EvidenceRequirementV1`
- `QualificationEvidenceItemV1`
- `QualificationEvidenceBundleV1`
- `CriterionResultV1`
- `QualificationEvaluationRequestV1`
- `QualificationEvaluationV1`
- `QualificationDecisionV1`
- `QualificationAssertionV1`
- `QualificationStatusEventV1`
- `QualificationReviewV1`
- `QualificationAppealV1`

The R0.1 assertion must include:

```ts
export interface QualificationAssertionV1 {
  assertionRef: string;
  principalRef: string;
  schemeRef: string;
  schemeRevisionRef: string;
  scopeRef: string;
  progressionLevel: QualificationProgressionLevelV1;
  vector: QualificationVectorV1;
  criterionResultRefs: readonly string[];
  evidenceBundleRef: string;
  issuerAuthorityRef: string;
  assessedAt: string;
  validFrom: string;
  validUntil: string;
  realityMaturity: Extract<RealityMaturityV1, "M0_MODELLED" | "M1_SYNTHETIC" | "M2_REPLAYED" | "M3_SHADOW">;
  effectFlags: SimulationEffectFlagsV1;
  live: false;
  sourceDigest: string;
  supersedesRef?: string;
}
```

---

### Task 1: Contract types and compile-time non-authority boundary

**Files:** Create `modules/qualification/contracts.ts`, `modules/qualification/contracts.test.ts`; modify `modules/contracts.test.ts`.

**Interfaces:** Consumes `RealityMaturityV1` and `SimulationEffectFlagsV1` from Simulation Plan Task 1. Produces all public qualification contracts used by Tasks 2–7.

- [ ] **Step 1: Write the compile-time boundary tests.** In `modules/qualification/contracts.test.ts`, create a valid simulated assertion and prove prohibited fields fail to type-check:

```ts
const assertion: QualificationAssertionV1 = {
  assertionRef: "QUALIFICATION-ASSERTION:001",
  principalRef: "DIGITALME:001",
  schemeRef: "QUALIFICATION-SCHEME:ENGINEERING",
  schemeRevisionRef: "QUALIFICATION-SCHEME-REVISION:ENGINEERING:R0.1",
  scopeRef: "SCOPE:MECHANICAL-DESIGN",
  progressionLevel: "L3_DEMONSTRATED",
  vector: { identityAssurance: 3, evidenceAssurance: 2, competence: 3, responsibilityAutonomy: 2, experienceRecency: 2, effectReliability: 2, economicReadiness: 1 },
  criterionResultRefs: ["QUALIFICATION-CRITERION-RESULT:001"],
  evidenceBundleRef: "QUALIFICATION-EVIDENCE-BUNDLE:001",
  issuerAuthorityRef: "WARDEN-QUALIFICATION-AUTHORITY:SIMULATED:001",
  assessedAt: "2026-08-28T00:00:00.000Z",
  validFrom: "2026-08-28T00:00:00.000Z",
  validUntil: "2027-08-28T00:00:00.000Z",
  realityMaturity: "M1_SYNTHETIC",
  effectFlags: {
    mayCreateAuthority: false,
    mayCreateQualification: false,
    mayCreateObligation: false,
    mayCreatePayment: false,
    mayTriggerExecution: false,
  },
  live: false,
  sourceDigest: "sha256:qualification-001",
};

// @ts-expect-error R0.1 qualification cannot become live.
const invalidLive: QualificationAssertionV1 = { ...assertion, live: true };
// @ts-expect-error Qualification assertion never carries an action token.
const invalidToken: QualificationAssertionV1 = { ...assertion, actionToken: "TOKEN" };
```

- [ ] **Step 2: Run `npx vitest run modules/qualification/contracts.test.ts modules/contracts.test.ts` and confirm RED because qualification contracts do not exist.**
- [ ] **Step 3: Implement the exact public types above plus the remaining named contracts.** Make `QualificationDecisionV1` carry `decision`, `reasonCodes`, `evaluationRef`, optional `assertion`, `realityMaturity`, all-false `effectFlags`, and `authorized: false`.
- [ ] **Step 4: Add a runtime assertion to `modules/contracts.test.ts` that `qualificationDecision.authorized === false` while a separately constructed `WardenDecisionV1` may be `ALLOW`.** This proves the boundaries coexist without conflation.
- [ ] **Step 5: Run the focused tests and `npm run -s type-check`; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): define r0.1 non-authority contracts`.**

### Task 2: Canonical evidence bundle with grades, integrity, recency and conflicts

**Files:** Create `modules/qualification/canonical.ts`, `modules/qualification/evidence-bundle.test.ts`, `modules/qualification/evidence-bundle.ts`.

**Interfaces:** Consumes `QualificationEvidenceItemV1`, `QualificationEvidenceBundleV1`, `EvidenceRequirementV1`. Produces `buildQualificationEvidenceBundleV1(input)` and `qualificationEvidenceBundleDigestV1(bundle)`.

- [ ] **Step 1: Write tests with evidence items in different input order and assert one canonical bundle hash.** Include `grade`, `evidenceRef`, `observedAt`, `provenanceVerified`, `integrityVerified`, and optional `conflictGroupRef`.
- [ ] **Step 2: Add failing cases:** duplicate evidence ref with changed content → `qualification_evidence_conflict`; integrity false where E3/E4 is required → `EVIDENCE_INTEGRITY_UNKNOWN`; stale item outside `maxAgeSeconds` → `EVIDENCE_RECENCY_FAILED`; missing minimum grade → `EVIDENCE_INSUFFICIENT`.
- [ ] **Step 3: Run `npx vitest run modules/qualification/evidence-bundle.test.ts`; expect RED.**
- [ ] **Step 4: Implement stable canonicalization.** Grade order must be explicit:

```ts
const EVIDENCE_GRADE_RANK: Record<EvidenceGradeV1, number> = {
  E0_CLAIMED: 0,
  E1_OBSERVED: 1,
  E2_CORROBORATED: 2,
  E3_VERIFIED: 3,
  E4_ASSURED: 4,
};
```

Sort evidence by `evidenceRef`, normalize conflict refs, validate instants, and hash with SHA-256.
- [ ] **Step 5: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): bind immutable evidence bundles`.**

### Task 3: Deterministic criterion evaluator and multidimensional vector

**Files:** Create `modules/qualification/criteria-evaluator.test.ts`, `modules/qualification/criteria-evaluator.ts`.

**Interfaces:** Consumes a scheme revision, evidence bundle, current assertions, and evaluation time. Produces `evaluateQualificationCriteriaV1(input): QualificationEvaluationV1`.

- [ ] **Step 1: Write a passing-path test fixture with three criteria:** minimum evidence grade, demonstrated capability observation count, and recency. Assert every criterion yields its own `CriterionResultV1` and the vector is deterministic.
- [ ] **Step 2: Write fail-closed tests:** unmet prerequisite → `PREREQUISITE_NOT_MET`; conflicting evidence → criterion state `REVIEW_REQUIRED`; absent required evidence → `EVIDENCE_INSUFFICIENT`; invalid vector value outside `0..5` → `qualification_vector_out_of_range`.
- [ ] **Step 3: Add a test proving 1,000 hours of E0/E1 evidence cannot satisfy a criterion requiring E3.** This enforces evidence quality over quantity.
- [ ] **Step 4: Run `npx vitest run modules/qualification/criteria-evaluator.test.ts`; expect RED.**
- [ ] **Step 5: Implement the evaluator as pure functions with no database/model/service calls.** Return `PASS | FAIL | REVIEW_REQUIRED | UNKNOWN` per criterion and calculate vector values only from explicit scheme rules.
- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualification): add deterministic criterion evaluator`.**

### Task 4: L0–L5 projection without universal ranking

**Files:** Create `modules/qualification/projection.test.ts`, `modules/qualification/projection.ts`.

**Interfaces:** Consumes `QualificationEvaluationV1` and `ProgressionModelV1`. Produces `projectQualificationLevelV1(evaluation, model): QualificationProgressionLevelV1`.

- [ ] **Step 1: Write tests proving one principal can project `L4_QUALIFIED` for mechanical design and `L1_IDENTIFIED` for electrical maintenance from two different scheme/scope evaluations.**
- [ ] **Step 2: Add a test proving projection stops at the highest fully satisfied level and does not average failed dimensions into a promotion.**
- [ ] **Step 3: Run `npx vitest run modules/qualification/projection.test.ts`; expect RED.**
- [ ] **Step 4: Implement ordered level rules using explicit required vector minima and required criterion refs.** Do not export any `trustScore`, `reputationScore`, or global principal-level function.
- [ ] **Step 5: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): project scoped progression levels`.**

### Task 5: Warden Qualification Engine without runtime authorization

**Files:** Create `modules/warden/qualification-engine.test.ts`, `modules/warden/qualification-engine.ts`.

**Interfaces:** Consumes scheme revision, canonical evidence bundle, evaluator authority snapshot, current assertions, simulation admission decision, and evaluation time. Produces `WardenQualificationEngineV1.evaluate(request): QualificationDecisionV1`.

- [ ] **Step 1: Write tests for `ASSERT`, `MAINTAIN`, `REFUSE`, and `UNKNOWN`.** `ASSERT` requires active scheme revision, valid assessor authority snapshot, sufficient evidence, satisfied prerequisites, admitted M1–M3 simulation maturity, and a deterministic level projection.
- [ ] **Step 2: Add tests for authority/evidence blockers:** missing assessor authority → `UNKNOWN` with `ASSESSOR_AUTHORITY_MISSING`; inactive scheme → `REFUSE` with `QUALIFICATION_SCHEME_NOT_ACTIVE`; unresolved evidence integrity → `UNKNOWN`; M4 request → blocked with `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- [ ] **Step 3: Add a test that inspects an `ASSERT` result and requires `authorized: false`, `live: false`, all effect flags false, and no `actionToken` key.**
- [ ] **Step 4: Run `npx vitest run modules/warden/qualification-engine.test.ts`; expect RED.**
- [ ] **Step 5: Implement the engine using only pure imports from `modules/qualification/**` and `modules/simulation/**`.** The constructor accepts no execution adapter and no runtime Warden decision service:

```ts
export class WardenQualificationEngineV1 {
  evaluate(input: WardenQualificationEvaluationInputV1): QualificationDecisionV1 {
    // validate simulation admission, scheme, authority, evidence, criteria, then project
  }
}
```

- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Run `grep -nE '(decision-service|execution-gate|silk|silk-dam)' modules/warden/qualification-engine.ts`; expect no imports/matches.**
- [ ] **Step 8: Commit `feat(warden): add simulated qualification engine`.**

### Task 6: Append-only status history, review and appeal

**Files:** Create `modules/qualification/status-ledger.test.ts`, `modules/qualification/status-ledger.ts`.

**Interfaces:** Produces `InMemoryQualificationStatusLedgerV1.append(event)`, `.openReview(review)`, `.fileAppeal(appeal)`, `.history(assertionRef)`.

- [ ] **Step 1: Write tests for assert → review-required → limited/suspended/superseded event histories and ensure prior assertion objects are byte-for-byte unchanged.**
- [ ] **Step 2: Write a test that records a failed operational outcome and permits only creation of `QUALIFICATION_REVIEW_REQUIRED`; direct automatic `QUALIFICATION_REVOKED` from an outcome event must throw `qualification_direct_outcome_demotion_forbidden`.**
- [ ] **Step 3: Write appeal tests requiring `appealRef`, `subjectAssertionRef`, `reasonCode`, `supportingEvidenceRefs`, `filedAt`, `state: "OPEN"`, and `realityMaturity <= M3`.
- [ ] **Step 4: Run `npx vitest run modules/qualification/status-ledger.test.ts`; expect RED.**
- [ ] **Step 5: Implement append-only event identity with exact replay → `IDEMPOTENT_REPLAY` and changed event content under the same ref → `CONFLICT`.**
- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualification): add review appeal and status lineage`.**

### Task 7: River evidence receipt adapter

**Files:** Create `modules/qualification/river-receipt.test.ts`, `modules/qualification/river-receipt.ts`.

**Interfaces:** Consumes `QualificationDecisionV1`, `QualificationEvidenceBundleV1`, and `EventEnvelopeV1` from River. Produces `compileQualificationRiverEventV1(input): EventEnvelopeV1` and a `QualificationReceiptManifestV1` with exact decision/evidence hashes.

- [ ] **Step 1: Write a test asserting event type `QUALIFICATION_EVALUATED`, correlation id, deterministic payload digest, scheme revision ref, evidence bundle ref/hash, decision ref, and reality maturity are bound into the receipt manifest.**
- [ ] **Step 2: Add tests proving changed evidence hash changes the River payload digest and M4+ inputs are rejected before receipt compilation.**
- [ ] **Step 3: Run `npx vitest run modules/qualification/river-receipt.test.ts`; expect RED.**
- [ ] **Step 4: Implement a pure event compiler; do not call River reservation/seal services.** Use `EventEnvelopeV1` only as a public evidence-event contract.
- [ ] **Step 5: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): compile river evaluation receipts`.**

### Task 8: Durable PostgreSQL qualification store

**Files:** Create `modules/qualification/postgres-qualification-store.test.ts`, `modules/qualification/postgres-qualification-store.ts`, `modules/qualification/sql/001_qualification_fabric.sql`.

**Interfaces:** Define local `QualificationQueryExecutorV1`; persist schemes/revisions, competencies/requirements, progression models/levels, assessment methods, evidence requirements/bundles, evaluations/criterion results, assertions/status events, reviews, and appeals.

- [ ] **Step 1: Write scripted-DB tests for insert-once assertion, exact replay, conflicting replay, status append, review append, appeal append, and reconstruction of one principal+scheme+scope history.**
- [ ] **Step 2: Write SQL-file tests asserting primary keys, foreign keys to scheme revisions/assertions, source-digest `sha256:%` checks, `live = false`, and reality maturity restricted to M0–M3.**
- [ ] **Step 3: Add SQL constraints requiring assertion/evaluation effect flags to remain false and vector JSON to be an object.**
- [ ] **Step 4: Run `npx vitest run modules/qualification/postgres-qualification-store.test.ts`; expect RED.**
- [ ] **Step 5: Implement the local query interfaces and store following repository insert-once/idempotency patterns.** Never import a DB interface from `modules/synnergyze`.
- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualification): add durable qualification history store`.**

### Task 9: Manifests, scoped CI and final qualification proof

**Files:** Modify `package.json`, `.github/workflows/qualification-simulation-r0.1.yml`, `.vsr/module-bindings.yaml`, `.vsr/repository-components.yaml`.

- [ ] **Step 1: Add scripts:**

```json
"test:qualification": "vitest run modules/qualification/contracts.test.ts modules/qualification/evidence-bundle.test.ts modules/qualification/criteria-evaluator.test.ts modules/qualification/projection.test.ts modules/qualification/status-ledger.test.ts modules/qualification/river-receipt.test.ts modules/qualification/postgres-qualification-store.test.ts modules/warden/qualification-engine.test.ts",
"lint:qualification": "eslint modules/qualification modules/warden/qualification-engine.ts modules/warden/qualification-engine.test.ts --ext .ts"
```

- [ ] **Step 2: Extend the scoped workflow to run `npm run test:qualification` and `npm run lint:qualification` after simulation checks.** Keep repo-wide `npm run -s type-check`.
- [ ] **Step 3: Register `MOD-QUALIFICATION-001` and `WARDEN-QUALIFICATION-ENGINE-001` with dependencies on Simulation contracts, Registry/DigitalMe refs, River evidence contracts, and explicit assessor-authority inputs only.** Forbidden entries must include `issue-action-token`, `treat-qualification-as-authorization`, `self-promote-learned-rule`, `create-live-credential-r0.1`, `create-economic-obligation`, and `call-silk-runtime`.
- [ ] **Step 4: Add component-manifest entries for evaluator, Warden engine, status/review ledger, River receipt compiler and durable store with `activation_implied: false` and `activation_gate: r0.1-simulation-only-m0-through-m3`.**
- [ ] **Step 5: Run `npm run test:simulation`; expect PASS because this plan may not regress the prerequisite foundation.**
- [ ] **Step 6: Run `npm run test:qualification`; expect PASS.**
- [ ] **Step 7: Run `npm run lint:qualification`; expect PASS.**
- [ ] **Step 8: Run `npm run -s type-check`; expect PASS.**
- [ ] **Step 9: Run `grep -R -nE 'from .*\/(silk|silk-dam)\/|from .*decision-service|from .*execution-gate' modules/qualification modules/warden/qualification-engine.ts`; expect no output.**
- [ ] **Step 10: Commit `chore(qualification): register r0.1 acceptance surface`.**

## Completion Gate

Do not begin Qualified Time implementation until the exact branch head passes Simulation and Qualification focused tests, focused lint, and repo type-check. R0.1 qualification is complete only when it can deterministically evaluate and replay scoped qualification projections, preserve append-only review/appeal history, and emit River evidence events while remaining unable to create live qualification, standing authorization, execution, payment, economic obligation, or SILK effect.