# Qualified Time Ledger R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `VSR-QUALIFIED-TIME-LEDGER-001 R0.1` as an append-only T0–T4 pre-economic chain that converts observed duration into attributable, verified, qualified, and economically eligible time without creating money, stored value, obligation, transferability, redemption, payment, or settlement.

**Architecture:** Create a standalone `modules/qualified-time` boundary. Each stage is a new immutable record linked to the preceding stage and to River evidence, qualification scheme/assertion references, simulation maturity, and policy revision. Economic eligibility is a pure pre-SILK classification whose output is deliberately non-payable and non-settleable. The module consumes only public Simulation and Qualification contracts and may not import SILK/SILK-DAM implementations.

**Tech Stack:** Node 22.14.0, TypeScript 5.8.3, Vitest 3.1.1, PostgreSQL-compatible/Neon DB, ESLint 9.24

**Spec:** `docs/superpowers/specs/2026-08-28-qualification-simulation-to-reality-design.md`

## Global Constraints

- R0.1 implements only T0 Observed Duration → T1 Attributable Time → T2 Verified Contribution Time → T3 Qualified Contribution Time → T4 Economic-Eligible Time.
- T5 valuation, T6 obligation, T7 settlement/finality are absent from the R0.1 runtime and persistence schema.
- `durationMillis` values are non-negative safe integers. T1 ≤ T0, T2 ≤ T1, and T3 ≤ T2.
- Time quantity alone never creates qualification or economic eligibility.
- T3 requires an explicit scoped `QualificationAssertionV1`/projection reference and scheme revision matching the contribution scope/capability policy.
- T4 requires a versioned `EconomicEligibilityPolicyV1`; it is eligibility only, not an obligation.
- Every R0.1 economic eligibility result has `economicValue: null`, `settlementRef: null`, `createsObligation: false`, `payable: false`, `transferable: false`, and `redeemable: false`.
- R0.1 supports M0–M3 only and inherits all-false Simulation effect flags.
- `V4_SILK_ADMISSIBLE` may be simulated as a readiness classification at M0–M3, but it does not create a SILK handoff, settlement intent, or obligation.
- Qualified time must never substitute for a statutory wage or other payable amount; R0.1 has no wage-offset or payment-discharge operation.
- No `currency`, monetary amount, wallet balance, exchange rate, transfer, redemption, merchant-acceptance, payment, or settlement field belongs in R0.1 contracts/tables.
- No import from `modules/silk/**`, `modules/silk-dam/**`, or a provider/payment adapter.
- Tests are written before implementation and each task ends with a focused commit.

---

## File Map

**Create**
- `modules/qualified-time/contracts.ts` — T0–T4 public contracts and economic readiness states.
- `modules/qualified-time/contracts.test.ts` — compile-time prohibition of monetary/settlement/live-effect fields.
- `modules/qualified-time/canonical.ts` — stable hashes for each time-chain record.
- `modules/qualified-time/time-observation.ts` / `.test.ts` — T0 observed duration.
- `modules/qualified-time/time-attribution.ts` / `.test.ts` — T1 principal/activity attribution.
- `modules/qualified-time/contribution-verification.ts` / `.test.ts` — T2 evidence-backed verified contribution.
- `modules/qualified-time/qualification-compiler.ts` / `.test.ts` — T3 qualified contribution time.
- `modules/qualified-time/economic-eligibility.ts` / `.test.ts` — T4 pre-economic readiness classification.
- `modules/qualified-time/postgres-qualified-time-store.ts` / `.test.ts` — append-only durable chain.
- `modules/qualified-time/sql/001_qualified_time_ledger.sql` — PostgreSQL T0–T4 schema/invariants.

**Modify**
- `package.json` — add `test:qualified-time` and `lint:qualified-time`.
- `.github/workflows/qualification-simulation-r0.1.yml` — add Qualified Time checks.
- `.vsr/module-bindings.yaml` — register `MOD-QUALIFIED-TIME-001` with no SILK runtime dependency.
- `.vsr/repository-components.yaml` — register T0–T4 compiler/store components.
- `modules/contracts.test.ts` — add cross-boundary proof that economic eligibility is not settlement finality.

## Public Interfaces

Create these exact foundational types in `modules/qualified-time/contracts.ts`:

```ts
import type {
  RealityMaturityV1,
  SimulationEffectFlagsV1,
} from "../simulation/contracts.ts";

export type EconomicReadinessV1 =
  | "V0_NONE"
  | "V1_CONTRIBUTION_RECORDED"
  | "V2_CONTRIBUTION_VERIFIED"
  | "V3_ECONOMIC_ELIGIBLE"
  | "V4_SILK_ADMISSIBLE";

export interface TimeObservationV1 {
  observationRef: string;
  startAt: string;
  endAt: string;
  durationMillis: number;
  sourceRef: string;
  sourceEvidenceRefs: readonly string[];
  realityMaturity: Extract<RealityMaturityV1, "M0_MODELLED" | "M1_SYNTHETIC" | "M2_REPLAYED" | "M3_SHADOW">;
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}

export interface TimeAttributionV1 {
  attributionRef: string;
  observationRef: string;
  principalRef: string;
  activityRef: string;
  attributedMillis: number;
  attributionMethodRef: string;
  sourceEvidenceRefs: readonly string[];
  realityMaturity: TimeObservationV1["realityMaturity"];
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}

export interface VerifiedContributionTimeV1 {
  verificationRef: string;
  attributionRef: string;
  principalRef: string;
  taskObjectiveRef: string;
  capabilityRef: string;
  scopeRef: string;
  verifiedMillis: number;
  evidenceBundleRef: string;
  sourceEvidenceRefs: readonly string[];
  realityMaturity: TimeObservationV1["realityMaturity"];
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}

export interface QualifiedTimeClaimV1 {
  claimRef: string;
  verificationRef: string;
  principalRef: string;
  capabilityRef: string;
  scopeRef: string;
  schemeRevisionRef: string;
  qualificationAssertionRef: string;
  qualifiedMillis: number;
  qualificationBasisRef: string;
  realityMaturity: TimeObservationV1["realityMaturity"];
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}
```

The T4 output is intentionally restrictive:

```ts
export interface EconomicEligibilityResultV1 {
  resultRef: string;
  qualifiedTimeClaimRef: string;
  policyRevisionRef: string;
  readiness: EconomicReadinessV1;
  eligible: boolean;
  reasonCodes: readonly string[];
  economicValue: null;
  settlementRef: null;
  createsObligation: false;
  payable: false;
  transferable: false;
  redeemable: false;
  realityMaturity: TimeObservationV1["realityMaturity"];
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}
```

Also define `EconomicEligibilityPolicyV1` with explicit capability/scope/qualification/evidence/readiness criteria but no monetary amount, exchange rate or settlement fields.

---

### Task 1: Contracts and compile-time pre-economic boundary

**Files:** Create `modules/qualified-time/contracts.ts`, `modules/qualified-time/contracts.test.ts`; modify `modules/contracts.test.ts`.

**Interfaces:** Consumes Simulation public maturity/effect contracts. Produces all T0–T4 contracts used by Tasks 2–6.

- [ ] **Step 1: Write a valid T4 object and compile-time forbidden-shape tests.** Use:

```ts
const eligible: EconomicEligibilityResultV1 = {
  resultRef: "ECONOMIC-ELIGIBILITY:001",
  qualifiedTimeClaimRef: "QUALIFIED-TIME:001",
  policyRevisionRef: "ECONOMIC-ELIGIBILITY-POLICY:R0.1",
  readiness: "V3_ECONOMIC_ELIGIBLE",
  eligible: true,
  reasonCodes: ["POLICY_CRITERIA_SATISFIED"],
  economicValue: null,
  settlementRef: null,
  createsObligation: false,
  payable: false,
  transferable: false,
  redeemable: false,
  realityMaturity: "M1_SYNTHETIC",
  effectFlags: {
    mayCreateAuthority: false,
    mayCreateQualification: false,
    mayCreateObligation: false,
    mayCreatePayment: false,
    mayTriggerExecution: false,
  },
  sourceDigest: "sha256:economic-eligibility-001",
};

// @ts-expect-error R0.1 economic eligibility cannot carry value.
const invalidValue: EconomicEligibilityResultV1 = { ...eligible, economicValue: 100 };
// @ts-expect-error R0.1 cannot create a settlement reference.
const invalidSettlement: EconomicEligibilityResultV1 = { ...eligible, settlementRef: "SETTLEMENT:001" };
// @ts-expect-error Eligibility is not payable.
const invalidPayable: EconomicEligibilityResultV1 = { ...eligible, payable: true };
```

- [ ] **Step 2: Add a cross-boundary assertion to `modules/contracts.test.ts` that `economicEligibility.createsObligation === false` and the existing SILK `SettlementStateV1` finality remains a separate contract.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/contracts.test.ts modules/contracts.test.ts`; expect RED because Qualified Time contracts do not exist.**
- [ ] **Step 4: Implement the exact public interfaces above plus `EconomicEligibilityPolicyV1`.** Do not export any wallet, money, payment, transfer or settlement-intent type.
- [ ] **Step 5: Re-run focused tests + `npm run -s type-check`; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): define t0-t4 pre-economic contracts`.**

### Task 2: T0 observed duration with deterministic identity

**Files:** Create `modules/qualified-time/canonical.ts`, `modules/qualified-time/time-observation.test.ts`, `modules/qualified-time/time-observation.ts`.

**Interfaces:** Produces `createTimeObservationV1(input): TimeObservationV1` and `qualifiedTimeDigestV1(value): string`.

- [ ] **Step 1: Write tests for a 90-minute interval and assert `durationMillis === 5_400_000`, stable sorted evidence refs, M1–M3 all-false effect flags, and deterministic digest.**
- [ ] **Step 2: Add fail cases for invalid timestamps, end before start, duration above `Number.MAX_SAFE_INTEGER`, missing `sourceRef`, and missing source evidence.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/time-observation.test.ts`; expect RED.**
- [ ] **Step 4: Implement exact duration from parsed instants and stable SHA-256 identity.** Never accept caller-supplied duration as authoritative; compute it from `startAt`/`endAt`.
- [ ] **Step 5: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): add observed duration records`.**

### Task 3: T1 attributable time bounded by observation

**Files:** Create `modules/qualified-time/time-attribution.test.ts`, `modules/qualified-time/time-attribution.ts`.

**Interfaces:** Consumes `TimeObservationV1`. Produces `createTimeAttributionV1(input): TimeAttributionV1`.

- [ ] **Step 1: Write a test attributing 4,800,000 ms of a 5,400,000 ms observation to one principal/activity with explicit method and evidence refs.**
- [ ] **Step 2: Add failures for negative attribution, attribution greater than observed duration, principal/activity missing, source evidence missing, and reality maturity mismatch with the source observation.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/time-attribution.test.ts`; expect RED.**
- [ ] **Step 4: Implement lineage checks and deterministic hash using observation ref/hash plus attribution facts.**
- [ ] **Step 5: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): add attributable time boundary`.**

### Task 4: T2 verified contribution time bounded by attribution and evidence

**Files:** Create `modules/qualified-time/contribution-verification.test.ts`, `modules/qualified-time/contribution-verification.ts`.

**Interfaces:** Consumes `TimeAttributionV1` and a `QualificationEvidenceBundleV1` from Qualification Plan Task 2. Produces `verifyContributionTimeV1(input): VerifiedContributionTimeV1`.

- [ ] **Step 1: Write a test verifying 4,200,000 ms from the attributed 4,800,000 ms and binding principal, task/objective, capability, scope, evidence bundle and source refs.**
- [ ] **Step 2: Add failure cases:** verified > attributed → `verified_time_exceeds_attributed_time`; bundle principal mismatch → `verified_time_principal_mismatch`; evidence bundle integrity unresolved → `EVIDENCE_INTEGRITY_UNKNOWN`; M4+ maturity → `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/contribution-verification.test.ts`; expect RED.**
- [ ] **Step 4: Implement evidence-bound T2 compilation; do not infer verified duration from task completion alone.** The caller supplies candidate verified intervals/amount, but the compiler validates it against attribution and accepted evidence rules.
- [ ] **Step 5: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): verify contribution time`.**

### Task 5: T3 qualification compiler with exact scope/capability binding

**Files:** Create `modules/qualified-time/qualification-compiler.test.ts`, `modules/qualified-time/qualification-compiler.ts`.

**Interfaces:** Consumes `VerifiedContributionTimeV1`, `QualificationAssertionV1`, and scheme/policy binding. Produces `compileQualifiedTimeClaimV1(input): QualifiedTimeClaimV1`.

- [ ] **Step 1: Write a passing test where verified contribution, qualification assertion and policy share principal, capability/scope, scheme revision, and M1 maturity; assert qualifiedMillis ≤ verifiedMillis.**
- [ ] **Step 2: Add failures for principal mismatch, scope mismatch, unsupported capability, scheme revision mismatch, expired assertion at contribution time, and qualifiedMillis > verifiedMillis.**
- [ ] **Step 3: Add a test showing a long verified duration cannot compensate for a missing/insufficient qualification assertion.** Expected blocker: `QUALIFICATION_REQUIRED` or `QUALIFICATION_LEVEL_INSUFFICIENT` as declared in Qualified Time contracts.
- [ ] **Step 4: Run `npx vitest run modules/qualified-time/qualification-compiler.test.ts`; expect RED.**
- [ ] **Step 5: Implement exact binding and interval validation.** Use the assertion as evidence of simulated qualification standing only; do not create/modify the assertion.
- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualified-time): compile qualified contribution time`.**

### Task 6: T4 economic eligibility classifier with no economic effect

**Files:** Create `modules/qualified-time/economic-eligibility.test.ts`, `modules/qualified-time/economic-eligibility.ts`.

**Interfaces:** Consumes `QualifiedTimeClaimV1`, `EconomicEligibilityPolicyV1`, evidence/qualification readiness facts and reality admission. Produces `evaluateEconomicEligibilityV1(input): EconomicEligibilityResultV1`.

- [ ] **Step 1: Write tests for V0, V1, V2 and V3 classifications and a simulated V4 readiness classification.** V3/V4 must still return every economic-effect field as null/false.
- [ ] **Step 2: Add a test that a V4 result at M1–M3 contains `reasonCodes: ["SIMULATED_SILK_READINESS_ONLY"]` and exposes no SILK handoff function or settlement intent.**
- [ ] **Step 3: Add failure cases for policy revision mismatch, qualification not sufficient, evidence not verified, and any M4+ reality request.
- [ ] **Step 4: Run `npx vitest run modules/qualified-time/economic-eligibility.test.ts`; expect RED.**
- [ ] **Step 5: Implement the pure classifier.** A permitted return helper must hard-code the non-economic fields:

```ts
const PRE_ECONOMIC_EFFECT = {
  economicValue: null,
  settlementRef: null,
  createsObligation: false,
  payable: false,
  transferable: false,
  redeemable: false,
} as const;
```

- [ ] **Step 6: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualified-time): classify pre-economic eligibility`.**

### Task 7: Append-only PostgreSQL T0–T4 chain

**Files:** Create `modules/qualified-time/postgres-qualified-time-store.test.ts`, `modules/qualified-time/postgres-qualified-time-store.ts`, `modules/qualified-time/sql/001_qualified_time_ledger.sql`.

**Interfaces:** Define local `QualifiedTimeQueryExecutorV1`; persist T0 observations, T1 attributions, T2 verified contributions, T3 qualified claims, economic eligibility policies, and T4 results.

- [ ] **Step 1: Write scripted-DB tests for insert-once records, exact idempotent replay, conflicting replay, and full T0→T4 reconstruction by `qualifiedTimeClaimRef`.**
- [ ] **Step 2: Write SQL-file tests requiring parent FKs so T1 references T0, T2 references T1, T3 references T2, and T4 references T3/policy revision.**
- [ ] **Step 3: Add SQL CHECK constraints:** `attributed_millis <= observed_duration_millis` via stored parent-bound values or store-level transaction checks; `verified_millis <= attributed_millis`; `qualified_millis <= verified_millis`; all millis non-negative; reality M0–M3 only.
- [ ] **Step 4: Require T4 columns `economic_value_json` and `settlement_ref` to be absent entirely.** Persist only `eligible`, readiness, reason codes, and explicit false booleans `creates_obligation`, `payable`, `transferable`, `redeemable`, each with `CHECK (... = false)`.
- [ ] **Step 5: Add a schema test that lower-cases SQL and asserts absence of standalone columns/tables named `wallet`, `currency`, `exchange_rate`, `transfer`, `redemption`, `payment`, and `settlement_intent`.**
- [ ] **Step 6: Run `npx vitest run modules/qualified-time/postgres-qualified-time-store.test.ts`; expect RED.**
- [ ] **Step 7: Implement local persistence with SHA-256 source digests, `ON CONFLICT DO NOTHING`, exact replay vs conflict behavior, and reconstruction.**
- [ ] **Step 8: Re-run focused tests + type-check; expect PASS.**
- [ ] **Step 9: Commit `feat(qualified-time): add durable t0-t4 ledger`.**

### Task 8: Manifests, scoped CI and complete R0.1 proof

**Files:** Modify `package.json`, `.github/workflows/qualification-simulation-r0.1.yml`, `.vsr/module-bindings.yaml`, `.vsr/repository-components.yaml`.

- [ ] **Step 1: Add scripts:**

```json
"test:qualified-time": "vitest run modules/qualified-time/contracts.test.ts modules/qualified-time/time-observation.test.ts modules/qualified-time/time-attribution.test.ts modules/qualified-time/contribution-verification.test.ts modules/qualified-time/qualification-compiler.test.ts modules/qualified-time/economic-eligibility.test.ts modules/qualified-time/postgres-qualified-time-store.test.ts",
"lint:qualified-time": "eslint modules/qualified-time --ext .ts"
```

- [ ] **Step 2: Extend `.github/workflows/qualification-simulation-r0.1.yml` to run Simulation, Qualification, and Qualified Time focused tests/lint plus repo-wide type-check.**
- [ ] **Step 3: Register `MOD-QUALIFIED-TIME-001` with dependencies on `MOD-SIMULATION-REALITY-001` contracts, `MOD-QUALIFICATION-001` contracts, River evidence refs, objective/capability refs, and versioned pre-economic eligibility policy.** It must have no `SILK-001` or `SILK-DAM-001` dependency.
- [ ] **Step 4: Add forbidden manifest rules:** `create-monetary-value`, `create-stored-value`, `discharge-wage-or-payable-obligation`, `create-transfer-or-redemption`, `create-settlement-intent`, `call-silk-runtime`, `treat-v4-readiness-as-settlement-admission`.
- [ ] **Step 5: Add component-manifest entries for T0 observation, T1 attribution, T2 verification, T3 qualification compiler, T4 eligibility classifier and durable store, all with `activation_implied: false` and `activation_gate: r0.1-pre-economic-simulation-only`.
- [ ] **Step 6: Run `npm run test:simulation`; expect PASS.**
- [ ] **Step 7: Run `npm run test:qualification`; expect PASS.**
- [ ] **Step 8: Run `npm run test:qualified-time`; expect PASS.**
- [ ] **Step 9: Run `npm run lint:simulation && npm run lint:qualification && npm run lint:qualified-time`; expect PASS.**
- [ ] **Step 10: Run `npm run -s type-check`; expect PASS.**
- [ ] **Step 11: Run `grep -R -nE 'from .*\/(silk|silk-dam)\/|SettlementIntent|SettlementState|EconomicConsequenceDraft' modules/qualified-time`; expect no output.**
- [ ] **Step 12: Run `grep -R -nE '\b(wallet|exchangeRate|exchange_rate|redeem|transferable: true|payable: true|createsObligation: true)\b' modules/qualified-time`; expect no prohibited implementation values; test-only negative fixtures must be inspected separately.**
- [ ] **Step 13: Commit `chore(qualified-time): register complete r0.1 acceptance surface`.**

## Completion Gate

R0.1 is complete only when the exact branch head passes all three focused subsystem suites, focused lint, and repo type-check, and the durable T0–T4 chain can be replayed from immutable inputs without any monetary value, stored value, wage discharge, obligation, transfer, redemption, payment, settlement intent, or SILK runtime effect. Promotion to M4 advisory or any live/economic release requires a separate reviewed design and implementation plan.