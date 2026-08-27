# Warden Qualification Fabric R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `WARDEN-QUALIFICATION-FABRIC-001 R0.1` as a deterministic, evidence-bound, scope-specific qualification evaluator that produces simulated qualification projections through M3 without creating standing authorization, live credentials, or economic obligations.

**Architecture:** Put canonical qualification types, evidence normalization, criteria evaluation, scoped progression, append-only status/review/appeal history, minimum-disclosure presentation, River receipt compilation, and durable storage in a new `modules/qualification` boundary. Add a thin `modules/warden/qualification-engine.ts` orchestration boundary that validates explicit assessor-authority inputs and produces qualification decisions, but never invokes runtime Warden authorization and never issues an action token. All R0.1 assertions are non-live projections governed by Simulation-to-Reality contracts.

**Tech Stack:** Node 22.14.0, TypeScript 5.8.3, Vitest 3.1.1, PostgreSQL-compatible/Neon DB, ESLint 9.24

**Spec:** `docs/superpowers/specs/2026-08-28-qualification-simulation-to-reality-design.md`

## Global Constraints

- A principal has scoped qualifications, not one universal rank.
- Every result is bound to `schemeRef`, `schemeRevisionRef`, `scopeRef`, `evidenceBundleRef`, and a validity window.
- Human-facing L0–L5 is a projection; the source of truth is the qualification vector and criterion results.
- `QUALIFIED ≠ AUTHORIZED`; qualification outputs cannot contain `actionToken`, cannot produce `WardenDecisionV1`, and cannot trigger execution.
- R0.1 supports only M0–M3. Every result carries all-false simulation effect flags from `SimulationEffectFlagsV1`.
- A live qualification credential is out of scope. `QualificationAssertionV1` is explicitly `live: false` and `mayCreateQualification: false`.
- Insufficient evidence or unresolved authority fails closed as `REFUSE` or `UNKNOWN`; there is no guessed promotion.
- A failed work outcome may create `QUALIFICATION_REVIEW_REQUIRED`; it never directly rewrites, revokes, or demotes a prior assertion.
- Historical assertions/status events are append-only; supersession is a new event and never mutates prior history.
- Where a scheme requires independent assessment, candidate/self/model identity cannot satisfy the assessor-authority requirement.
- AI/model output may supply evidence or a proposal but cannot independently satisfy assessor authority or activate a scheme revision.
- Downstream verifiers receive a minimum claim, not raw work/evidence history, unless separate authority permits the underlying evidence.
- No import from `modules/silk/**`, `modules/silk-dam/**`, `modules/synnergyze/execution-gate.ts`, or `modules/warden/decision-service.ts`.
- Tests are written before implementation and each task ends with a focused commit.

---

## File Map

**Create**
- `modules/qualification/contracts.ts` — schemes, evidence, vectors, decisions, assertions, status, review, appeal and presentation contracts.
- `modules/qualification/contracts.test.ts` — compile-time non-authority/non-economic shape checks.
- `modules/qualification/canonical.ts` — stable evidence/evaluation/assertion hashing.
- `modules/qualification/evidence-bundle.ts` / `.test.ts` — evidence grade, integrity, recency and conflict normalization.
- `modules/qualification/criteria-evaluator.ts` / `.test.ts` — deterministic criterion evaluation and qualification vector.
- `modules/qualification/projection.ts` / `.test.ts` — scoped L0–L5 projection.
- `modules/warden/qualification-engine.ts` / `.test.ts` — Warden qualification orchestration separate from runtime authorization.
- `modules/qualification/status-ledger.ts` / `.test.ts` — append-only status transitions, current-standing projection, review and appeal.
- `modules/qualification/presentation.ts` / `.test.ts` — minimum-disclosure qualification claim.
- `modules/qualification/river-receipt.ts` / `.test.ts` — River event/receipt compilation.
- `modules/qualification/postgres-qualification-store.ts` / `.test.ts` — durable append-only persistence.
- `modules/qualification/sql/001_qualification_fabric.sql` — qualification schema and invariants.

**Modify**
- `package.json` — add `test:qualification` and `lint:qualification`.
- `.github/workflows/qualification-simulation-r0.1.yml` — add qualification tests/lint after the Simulation plan creates the workflow.
- `.vsr/module-bindings.yaml` — register qualification module and Warden qualification engine.
- `.vsr/repository-components.yaml` — register evaluator, Warden engine, status/review ledger, presentation, River receipt and store.
- `modules/contracts.test.ts` — cross-boundary proof that qualification does not imply authorization.

## Public Interfaces

Create these exact foundations in `modules/qualification/contracts.ts`:

```ts
import type {
  RealityAdmissionDecisionV1,
  RealityMaturityV1,
  SimulationEffectFlagsV1,
} from "../simulation/contracts.ts";

export type EvidenceGradeV1 =
  | "E0_CLAIMED" | "E1_OBSERVED" | "E2_CORROBORATED" | "E3_VERIFIED" | "E4_ASSURED";

export type CriterionStateV1 = "PASS" | "FAIL" | "REVIEW_REQUIRED" | "UNKNOWN";

export type QualificationProgressionLevelV1 =
  | "L0_DISCOVERED" | "L1_IDENTIFIED" | "L2_EVIDENCED"
  | "L3_DEMONSTRATED" | "L4_QUALIFIED" | "L5_RELIED_UPON";

export type QualificationDecisionKindV1 =
  | "ASSERT" | "MAINTAIN" | "LIMIT" | "REQUIRE_REASSESSMENT"
  | "SUSPEND" | "REVOKE" | "REFUSE" | "UNKNOWN";

export type QualificationStatusEventKindV1 =
  | "QUALIFICATION_ASSERTED" | "QUALIFICATION_RENEWED" | "QUALIFICATION_LIMITED"
  | "QUALIFICATION_SUSPENDED" | "QUALIFICATION_EXPIRED" | "QUALIFICATION_REVOKED"
  | "QUALIFICATION_SUPERSEDED" | "QUALIFICATION_REVIEW_REQUIRED";

export interface QualificationVectorV1 {
  identityAssurance: number;
  evidenceAssurance: number;
  competence: number;
  responsibilityAutonomy: number;
  experienceRecency: number;
  effectReliability: number;
  economicReadiness: number;
}

export interface AssessorAuthoritySnapshotV1 {
  authoritySnapshotRef: string;
  assessorPrincipalRef: string;
  authorityDomainRefs: readonly string[];
  validFrom: string;
  validUntil: string;
  sourceEvidenceRefs: readonly string[];
  sourceDigest: string;
}
```

Each vector value is an integer `0..5` in R0.1 and is runtime-validated. Also define `QualificationSchemeV1`, `QualificationSchemeRevisionV1`, `CompetencyV1`, `CompetencyRequirementV1`, `ProgressionModelV1`, `ProgressionLevelRuleV1`, `AssessmentMethodV1`, `EvidenceRequirementV1`, `QualificationEvidenceItemV1`, `QualificationEvidenceBundleV1`, `CriterionResultV1`, `QualificationEvaluationRequestV1`, `QualificationEvaluationV1`, `QualificationDecisionV1`, `QualificationAssertionV1`, `QualificationStatusEventV1`, `QualificationReviewV1`, `QualificationAppealV1`, `QualificationStandingV1`, `QualificationPresentationRequestV1`, `QualificationPresentationV1`, `QualificationReceiptManifestV1`, and `WardenQualificationEvaluationInputV1`.

`WardenQualificationEvaluationInputV1` must contain `request`, `schemeRevision`, `progressionModel`, `evidenceBundle`, `assessorAuthority`, `currentAssertions`, and `realityAdmission: RealityAdmissionDecisionV1`.

The R0.1 assertion is explicitly non-live:

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
  realityMaturity: Extract<RealityMaturityV1,
    "M0_MODELLED" | "M1_SYNTHETIC" | "M2_REPLAYED" | "M3_SHADOW">;
  effectFlags: SimulationEffectFlagsV1;
  live: false;
  sourceDigest: string;
  supersedesRef?: string;
}
```

---

### Task 1: Contracts and compile-time non-authority boundary

**Files:** Create `modules/qualification/contracts.ts`, `modules/qualification/contracts.test.ts`; modify `modules/contracts.test.ts`.

**Interfaces:** Consumes Simulation public contracts; produces all qualification contracts for later tasks.

- [ ] **Step 1: Write compile-time tests using a valid simulated assertion:**

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
  effectFlags: { mayCreateAuthority: false, mayCreateQualification: false, mayCreateObligation: false, mayCreatePayment: false, mayTriggerExecution: false },
  live: false,
  sourceDigest: "sha256:qualification-001",
};

// @ts-expect-error R0.1 qualification cannot become live.
const invalidLive: QualificationAssertionV1 = { ...assertion, live: true };
// @ts-expect-error Qualification assertion never carries an action token.
const invalidToken: QualificationAssertionV1 = { ...assertion, actionToken: "TOKEN" };
```

- [ ] **Step 2: Run `npx vitest run modules/qualification/contracts.test.ts modules/contracts.test.ts`; expect RED because qualification contracts are absent.**
- [ ] **Step 3: Implement the named contracts.** `QualificationDecisionV1` carries `decision`, `reasonCodes`, `evaluationRef`, optional `assertion`, `realityMaturity`, all-false `effectFlags`, and `authorized: false`.
- [ ] **Step 4: Add a runtime assertion to `modules/contracts.test.ts`: a qualification decision is `authorized === false` while an independent `WardenDecisionV1` can separately be `ALLOW`.**
- [ ] **Step 5: Run focused tests + `npm run -s type-check`; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): define r0.1 non-authority contracts`.**

### Task 2: Canonical immutable evidence bundle

**Files:** Create `modules/qualification/canonical.ts`, `modules/qualification/evidence-bundle.test.ts`, `modules/qualification/evidence-bundle.ts`.

**Interfaces:** Produces `buildQualificationEvidenceBundleV1(input): QualificationEvidenceBundleV1` and `qualificationEvidenceBundleDigestV1(bundle): string`.

- [ ] **Step 1: Write ordering/hash tests with items carrying `grade`, `evidenceRef`, `observedAt`, `provenanceVerified`, `integrityVerified`, and optional `conflictGroupRef`.** Reordered inputs must hash identically.
- [ ] **Step 2: Add failures:** changed duplicate evidence ref → `QUALIFICATION_EVIDENCE_CONFLICT`; integrity false where E3/E4 required → `EVIDENCE_INTEGRITY_UNKNOWN`; stale item beyond `maxAgeSeconds` → `EVIDENCE_RECENCY_FAILED`; minimum grade absent → `EVIDENCE_INSUFFICIENT`.
- [ ] **Step 3: Run `npx vitest run modules/qualification/evidence-bundle.test.ts`; expect RED.**
- [ ] **Step 4: Implement explicit grade ordering:**

```ts
const EVIDENCE_GRADE_RANK: Record<EvidenceGradeV1, number> = {
  E0_CLAIMED: 0, E1_OBSERVED: 1, E2_CORROBORATED: 2, E3_VERIFIED: 3, E4_ASSURED: 4,
};
```

Sort evidence by `evidenceRef`, validate instants, canonicalize conflict refs and SHA-256 the immutable bundle.
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): bind immutable evidence bundles`.**

### Task 3: Deterministic criteria, assessor independence and qualification vector

**Files:** Create `modules/qualification/criteria-evaluator.test.ts`, `modules/qualification/criteria-evaluator.ts`.

**Interfaces:** Produces `evaluateQualificationCriteriaV1(input: QualificationEvaluationRequestV1): QualificationEvaluationV1`.

- [ ] **Step 1: Write a passing scheme fixture with minimum evidence grade, capability demonstration, recency and an independent-assessment criterion.** Assert one `CriterionResultV1` per criterion and deterministic vector output.
- [ ] **Step 2: Add failures:** unmet prerequisite → `PREREQUISITE_NOT_MET`; conflicting evidence → `REVIEW_REQUIRED`; absent evidence → `EVIDENCE_INSUFFICIENT`; vector outside `0..5` → `QUALIFICATION_VECTOR_OUT_OF_RANGE`.
- [ ] **Step 3: Add a test where `requiresIndependentAssessor: true` and `assessorPrincipalRef === candidatePrincipalRef`; expect `ASSESSOR_INDEPENDENCE_REQUIRED`.**
- [ ] **Step 4: Add a test proving 1,000 hours of E0/E1 evidence cannot satisfy a criterion requiring E3.**
- [ ] **Step 5: Run `npx vitest run modules/qualification/criteria-evaluator.test.ts`; expect RED.**
- [ ] **Step 6: Implement pure criterion evaluation returning `CriterionStateV1`; derive vector values only from explicit scheme rules.**
- [ ] **Step 7: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 8: Commit `feat(qualification): add deterministic criteria and assessor guards`.**

### Task 4: Scoped L0–L5 projection

**Files:** Create `modules/qualification/projection.test.ts`, `modules/qualification/projection.ts`.

**Interfaces:** Produces `projectQualificationLevelV1(evaluation: QualificationEvaluationV1, model: ProgressionModelV1): QualificationProgressionLevelV1`.

- [ ] **Step 1: Write tests proving one principal can be `L4_QUALIFIED` in mechanical design and `L1_IDENTIFIED` in electrical maintenance from different scheme/scope evaluations.**
- [ ] **Step 2: Add a test that projection stops at the highest fully satisfied level and never averages a failed dimension into promotion.**
- [ ] **Step 3: Run `npx vitest run modules/qualification/projection.test.ts`; expect RED.**
- [ ] **Step 4: Implement ordered explicit vector minima + required criterion refs.** Export no `trustScore`, `reputationScore`, or network-wide principal-rank function.
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): project scoped progression levels`.**

### Task 5: Warden Qualification Engine without runtime authorization

**Files:** Create `modules/warden/qualification-engine.test.ts`, `modules/warden/qualification-engine.ts`.

**Interfaces:** Produces `WardenQualificationEngineV1.evaluate(input: WardenQualificationEvaluationInputV1): QualificationDecisionV1`.

- [ ] **Step 1: Write tests for `ASSERT`, `MAINTAIN`, `REFUSE`, and `UNKNOWN`.** `ASSERT` requires active scheme revision, valid assessor authority, adequate evidence/prerequisites and admitted M1–M3 maturity.
- [ ] **Step 2: Add blockers:** missing authority → `UNKNOWN` + `ASSESSOR_AUTHORITY_MISSING`; inactive scheme → `REFUSE` + `QUALIFICATION_SCHEME_NOT_ACTIVE`; unresolved evidence integrity → `UNKNOWN`; M4 request → `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- [ ] **Step 3: Assert every `ASSERT` result has `authorized: false`, assertion `live: false`, all effect flags false, and no `actionToken` key.**
- [ ] **Step 4: Run `npx vitest run modules/warden/qualification-engine.test.ts`; expect RED.**
- [ ] **Step 5: Implement the engine directly from the two pure qualification functions; do not invent another service layer:**

```ts
export class WardenQualificationEngineV1 {
  evaluate(input: WardenQualificationEvaluationInputV1): QualificationDecisionV1 {
    const evaluation = evaluateQualificationCriteriaV1(input.request);
    const progressionLevel = projectQualificationLevelV1(evaluation, input.progressionModel);
    return compileQualificationDecisionV1({ input, evaluation, progressionLevel });
  }
}
```

Create `compileQualificationDecisionV1(args): QualificationDecisionV1` in the same file; it validates `input.realityAdmission.admitted`, scheme state, assessor authority validity, then constructs only the allowed decision/assertion shape.
- [ ] **Step 6: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 7: Run `grep -nE '(decision-service|execution-gate|silk|silk-dam)' modules/warden/qualification-engine.ts`; expect no output.**
- [ ] **Step 8: Commit `feat(warden): add simulated qualification engine`.**

### Task 6: Append-only status, current standing, review and appeal

**Files:** Create `modules/qualification/status-ledger.test.ts`, `modules/qualification/status-ledger.ts`.

**Interfaces:** Produces `InMemoryQualificationStatusLedgerV1.append(event)`, `.openReview(review)`, `.fileAppeal(appeal)`, `.history(assertionRef)`, and `.standing(assertionRef, at): QualificationStandingV1`.

- [ ] **Step 1: Write assert → review-required → limited/suspended/superseded history tests and deep-freeze the original assertion to prove it never mutates.**
- [ ] **Step 2: Write an operational-failure test permitting only `QUALIFICATION_REVIEW_REQUIRED`; direct outcome→revocation must throw `QUALIFICATION_DIRECT_OUTCOME_DEMOTION_FORBIDDEN`.**
- [ ] **Step 3: Write current-standing tests for valid, expired, suspended, revoked and superseded assertions at specific instants.** Historical truth remains retrievable even when current standing is unavailable.
- [ ] **Step 4: Write appeal tests requiring `appealRef`, `subjectAssertionRef`, `reasonCode`, supporting evidence refs, `filedAt`, `state: "OPEN"`, and M0–M3 maturity.**
- [ ] **Step 5: Run `npx vitest run modules/qualification/status-ledger.test.ts`; expect RED.**
- [ ] **Step 6: Implement append-once identity: exact replay → `IDEMPOTENT_REPLAY`; changed content under same ref → `CONFLICT`.**
- [ ] **Step 7: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 8: Commit `feat(qualification): add standing review appeal and status lineage`.**

### Task 7: Minimum-disclosure qualification presentation

**Files:** Create `modules/qualification/presentation.test.ts`, `modules/qualification/presentation.ts`.

**Interfaces:** Produces `presentQualificationV1(assertion: QualificationAssertionV1, request: QualificationPresentationRequestV1): QualificationPresentationV1`.

- [ ] **Step 1: Write a test where a verifier asks only whether mechanical-design L3+ is valid.** Expected presentation contains assertion/scheme/scope/level/validity but not vector internals, criterion refs, bundle contents, assessor notes or work history.
- [ ] **Step 2: Add a test that an unsupported disclosure field request is rejected as `QUALIFICATION_DISCLOSURE_NOT_PERMITTED`.**
- [ ] **Step 3: Run `npx vitest run modules/qualification/presentation.test.ts`; expect RED.**
- [ ] **Step 4: Implement an allowlisted presentation factory:**

```ts
return {
  assertionRef: assertion.assertionRef,
  schemeRef: assertion.schemeRef,
  schemeRevisionRef: assertion.schemeRevisionRef,
  scopeRef: assertion.scopeRef,
  progressionLevel: assertion.progressionLevel,
  validFrom: assertion.validFrom,
  validUntil: assertion.validUntil,
  live: false,
};
```

- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): add minimum-disclosure presentation`.**

### Task 8: River evaluation receipt adapter

**Files:** Create `modules/qualification/river-receipt.test.ts`, `modules/qualification/river-receipt.ts`.

**Interfaces:** Produces `compileQualificationRiverEventV1(input): { event: EventEnvelopeV1; manifest: QualificationReceiptManifestV1 }`.

- [ ] **Step 1: Write a test asserting event type `QUALIFICATION_EVALUATED`, sequence, correlation id, deterministic payload digest, scheme revision ref, evidence bundle ref/hash, decision ref and reality maturity in the manifest.**
- [ ] **Step 2: Add tests proving changed evidence hash changes payload digest and M4+ input is rejected before receipt compilation.**
- [ ] **Step 3: Run `npx vitest run modules/qualification/river-receipt.test.ts`; expect RED.**
- [ ] **Step 4: Implement a pure `EventEnvelopeV1` compiler only; do not call River reservation/seal services.**
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualification): compile river evaluation receipts`.**

### Task 9: Durable PostgreSQL qualification store

**Files:** Create `modules/qualification/postgres-qualification-store.test.ts`, `modules/qualification/postgres-qualification-store.ts`, `modules/qualification/sql/001_qualification_fabric.sql`.

**Interfaces:** Define local `QualificationQueryExecutorV1`; persist schemes/revisions, competencies/requirements, progression models/levels, assessment methods, evidence requirements/bundles, evaluations/criterion results, assertions/status events, reviews and appeals.

- [ ] **Step 1: Write scripted-DB tests for insert-once assertion, exact replay, conflict, status append, review append, appeal append and principal+scheme+scope reconstruction.**
- [ ] **Step 2: Write SQL-file tests asserting primary keys, scheme-revision/assertion FKs, `sha256:%` source digests, `live = false`, M0–M3 reality restriction and vector JSON object shape.**
- [ ] **Step 3: Add DB checks requiring all five effect capabilities false on evaluation/assertion rows and preserving status history as append-only rows.**
- [ ] **Step 4: Run `npx vitest run modules/qualification/postgres-qualification-store.test.ts`; expect RED.**
- [ ] **Step 5: Implement local query interfaces and insert-once/readback store patterns; never import a DB interface from `modules/synnergyze`.**
- [ ] **Step 6: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualification): add durable qualification history store`.**

### Task 10: Manifests, scoped CI and final qualification proof

**Files:** Modify `package.json`, `.github/workflows/qualification-simulation-r0.1.yml`, `.vsr/module-bindings.yaml`, `.vsr/repository-components.yaml`.

- [ ] **Step 1: Add exact scripts:**

```json
"test:qualification": "vitest run modules/qualification/contracts.test.ts modules/qualification/evidence-bundle.test.ts modules/qualification/criteria-evaluator.test.ts modules/qualification/projection.test.ts modules/qualification/status-ledger.test.ts modules/qualification/presentation.test.ts modules/qualification/river-receipt.test.ts modules/qualification/postgres-qualification-store.test.ts modules/warden/qualification-engine.test.ts",
"lint:qualification": "eslint modules/qualification modules/warden/qualification-engine.ts modules/warden/qualification-engine.test.ts --ext .ts"
```

- [ ] **Step 2: Extend the scoped workflow with `npm run test:qualification` and `npm run lint:qualification` after Simulation checks; retain repo-wide `npm run -s type-check`.**
- [ ] **Step 3: Register `MOD-QUALIFICATION-001` and `WARDEN-QUALIFICATION-ENGINE-001` with dependencies on Simulation contracts, Registry/DigitalMe refs, River evidence contracts and explicit assessor-authority inputs only.** Forbidden entries: `issue-action-token`, `treat-qualification-as-authorization`, `self-promote-learned-rule`, `create-live-credential-r0.1`, `create-economic-obligation`, `call-silk-runtime`.
- [ ] **Step 4: Add component entries for evaluator, Warden engine, status/review ledger, minimum-disclosure presentation, River receipt compiler and store with `activation_implied: false`, `activation_gate: r0.1-simulation-only-m0-through-m3`.**
- [ ] **Step 5: Run `npm run test:simulation`; expect PASS.**
- [ ] **Step 6: Run `npm run test:qualification`; expect PASS.**
- [ ] **Step 7: Run `npm run lint:qualification`; expect PASS.**
- [ ] **Step 8: Run `npm run -s type-check`; expect PASS.**
- [ ] **Step 9: Run `grep -R -nE 'from .*\/(silk|silk-dam)\/|from .*decision-service|from .*execution-gate' modules/qualification modules/warden/qualification-engine.ts`; expect no output.**
- [ ] **Step 10: Inspect the plan and implementation for unresolved placeholder markers; none may remain.**
- [ ] **Step 11: Commit `chore(qualification): register r0.1 acceptance surface`.**

## Completion Gate

Do not execute the Qualified Time plan until the exact branch head passes Simulation and Qualification focused suites, focused lint and repo type-check. Qualification R0.1 is complete only when it can deterministically evaluate/replay scoped non-live qualification projections, preserve append-only standing/review/appeal history, disclose a minimum verifier claim, and emit River evidence events while remaining unable to create live qualification, standing authorization, execution, payment, economic obligation, or SILK effect.