# Qualified Time Ledger R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `VSR-QUALIFIED-TIME-LEDGER-001 R0.1` as an append-only T0–T4 pre-economic chain that converts observed duration into attributable, recorded, verified, qualified and economically eligible contribution without creating money, stored value, obligation, transferability, redemption, payment, or settlement.

**Architecture:** Create a standalone `modules/qualified-time` boundary. Each stage is an immutable record linked to the preceding stage and to River evidence, qualification scheme/assertion refs, simulation maturity and policy revision. A `ContributionRecordV1` captures the work/capability/objective context before verification. Economic eligibility remains a pure pre-SILK classification whose output is deliberately non-payable and non-settleable.

**Tech Stack:** Node 22.14.0, TypeScript 5.8.3, Vitest 3.1.1, PostgreSQL-compatible/Neon DB, ESLint 9.24

**Spec:** `docs/superpowers/specs/2026-08-28-qualification-simulation-to-reality-design.md`

## Global Constraints

- R0.1 implements T0 Observed Duration → T1 Attributable Time → Contribution Record → T2 Verified Contribution Time → T3 Qualified Contribution Time → T4 Economic-Eligible Time.
- T5 valuation, T6 obligation and T7 settlement/finality are absent from R0.1 runtime and persistence.
- `durationMillis` values are non-negative safe integers. T1 ≤ T0, T2 ≤ T1 and T3 ≤ T2.
- Time quantity alone never creates qualification or economic eligibility.
- A contribution record binds principal, task/objective, capability, scope, attribution and evidence context before any verification claim exists.
- T3 requires an explicit scoped `QualificationAssertionV1` and scheme revision matching the contribution's scope/capability policy.
- T4 requires a versioned `EconomicEligibilityPolicyV1`; eligibility is not an obligation.
- Every R0.1 T4 result has `economicValue: null`, `settlementRef: null`, `createsObligation: false`, `payable: false`, `transferable: false`, and `redeemable: false`.
- R0.1 supports M0–M3 only and inherits all-false Simulation effect flags.
- `V4_SILK_ADMISSIBLE` may be simulated as readiness at M0–M3, but it does not create a SILK handoff, settlement intent, or obligation.
- Qualified time cannot discharge or substitute for a statutory wage or other payable obligation; R0.1 exposes no wage-offset/payment-discharge operation.
- No currency, monetary amount, wallet balance, exchange rate, transfer, redemption, merchant-acceptance, payment or settlement field belongs in R0.1 tables/contracts, except the explicitly typed null sentinels `economicValue` and `settlementRef` on the T4 result.
- No import from `modules/silk/**`, `modules/silk-dam/**`, or provider/payment adapters.
- Tests are written before implementation and each task ends with a focused commit.

---

## File Map

**Create**
- `modules/qualified-time/contracts.ts` — T0–T4, contribution and economic-readiness contracts.
- `modules/qualified-time/contracts.test.ts` — compile-time prohibition of monetary/settlement/live-effect fields.
- `modules/qualified-time/canonical.ts` — stable hashes for every chain record.
- `modules/qualified-time/time-observation.ts` / `.test.ts` — T0 observed duration.
- `modules/qualified-time/time-attribution.ts` / `.test.ts` — T1 principal/activity attribution.
- `modules/qualified-time/contribution-record.ts` / `.test.ts` — objective/capability/scope contribution context.
- `modules/qualified-time/contribution-verification.ts` / `.test.ts` — T2 evidence-backed verified contribution.
- `modules/qualified-time/qualification-compiler.ts` / `.test.ts` — T3 qualified contribution time.
- `modules/qualified-time/economic-eligibility.ts` / `.test.ts` — T4 pre-economic readiness classification.
- `modules/qualified-time/postgres-qualified-time-store.ts` / `.test.ts` — append-only durable chain.
- `modules/qualified-time/sql/001_qualified_time_ledger.sql` — PostgreSQL chain schema/invariants.

**Modify**
- `package.json` — add `test:qualified-time` and `lint:qualified-time`.
- `.github/workflows/qualification-simulation-r0.1.yml` — add Qualified Time checks.
- `.vsr/module-bindings.yaml` — register `MOD-QUALIFIED-TIME-001` without SILK runtime dependency.
- `.vsr/repository-components.yaml` — register contribution/T0–T4 compiler/store components.
- `modules/contracts.test.ts` — prove economic eligibility is distinct from settlement finality.

## Public Interfaces

Create these exact foundations in `modules/qualified-time/contracts.ts`:

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

type PreLiveMaturityV1 = Extract<RealityMaturityV1,
  "M0_MODELLED" | "M1_SYNTHETIC" | "M2_REPLAYED" | "M3_SHADOW">;

export interface TimeObservationV1 {
  observationRef: string;
  startAt: string;
  endAt: string;
  durationMillis: number;
  sourceRef: string;
  sourceEvidenceRefs: readonly string[];
  realityMaturity: PreLiveMaturityV1;
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
  realityMaturity: PreLiveMaturityV1;
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}

export interface ContributionRecordV1 {
  contributionRef: string;
  attributionRef: string;
  principalRef: string;
  taskObjectiveRef: string;
  capabilityRef: string;
  scopeRef: string;
  attributedMillis: number;
  evidenceBundleRef: string;
  sourceEvidenceRefs: readonly string[];
  realityMaturity: PreLiveMaturityV1;
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}

export interface VerifiedContributionTimeV1 {
  verificationRef: string;
  contributionRef: string;
  principalRef: string;
  capabilityRef: string;
  scopeRef: string;
  verifiedMillis: number;
  evidenceBundleRef: string;
  sourceEvidenceRefs: readonly string[];
  realityMaturity: PreLiveMaturityV1;
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
  realityMaturity: PreLiveMaturityV1;
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}
```

The T4 result is deliberately restrictive:

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
  realityMaturity: PreLiveMaturityV1;
  effectFlags: SimulationEffectFlagsV1;
  sourceDigest: string;
}
```

Also define `EconomicEligibilityPolicyV1` with explicit capability, scope, minimum qualification level, evidence grade/readiness requirements and policy validity, but no monetary amount, exchange rate or settlement fields.

---

### Task 1: Contracts and compile-time pre-economic boundary

**Files:** Create `modules/qualified-time/contracts.ts`, `modules/qualified-time/contracts.test.ts`; modify `modules/contracts.test.ts`.

**Interfaces:** Consumes Simulation public maturity/effect contracts; produces all T0–T4 contracts.

- [ ] **Step 1: Write a valid T4 object and forbidden-shape tests:**

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
  effectFlags: { mayCreateAuthority: false, mayCreateQualification: false, mayCreateObligation: false, mayCreatePayment: false, mayTriggerExecution: false },
  sourceDigest: "sha256:economic-eligibility-001",
};

// @ts-expect-error R0.1 eligibility cannot carry value.
const invalidValue: EconomicEligibilityResultV1 = { ...eligible, economicValue: 100 };
// @ts-expect-error R0.1 cannot create a settlement ref.
const invalidSettlement: EconomicEligibilityResultV1 = { ...eligible, settlementRef: "SETTLEMENT:001" };
// @ts-expect-error R0.1 eligibility is not payable.
const invalidPayable: EconomicEligibilityResultV1 = { ...eligible, payable: true };
```

- [ ] **Step 2: Add a cross-boundary assertion in `modules/contracts.test.ts` that T4 `createsObligation === false` while the existing SILK settlement finality type remains separate.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/contracts.test.ts modules/contracts.test.ts`; expect RED because contracts are absent.**
- [ ] **Step 4: Implement the exact named contracts and blocker-code union including `QUALIFICATION_REQUIRED`, `QUALIFICATION_LEVEL_INSUFFICIENT`, `VERIFIED_TIME_EXCEEDS_ATTRIBUTED_TIME`, and `QUALIFIED_TIME_EXCEEDS_VERIFIED_TIME`.**
- [ ] **Step 5: Re-run focused tests + `npm run -s type-check`; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): define t0-t4 pre-economic contracts`.**

### Task 2: T0 observed duration with deterministic identity

**Files:** Create `modules/qualified-time/canonical.ts`, `modules/qualified-time/time-observation.test.ts`, `modules/qualified-time/time-observation.ts`.

**Interfaces:** Produces `createTimeObservationV1(input): TimeObservationV1` and `qualifiedTimeDigestV1(value): string`.

- [ ] **Step 1: Write a 90-minute fixture; assert `durationMillis === 5_400_000`, stable sorted evidence refs, all-false effect flags and deterministic digest.**
- [ ] **Step 2: Add failures for invalid timestamps, end before start, unsafe duration, missing `sourceRef`, missing source evidence and M4+ maturity.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/time-observation.test.ts`; expect RED.**
- [ ] **Step 4: Implement duration from parsed instants; never accept caller-supplied duration as authoritative.**
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): add observed duration records`.**

### Task 3: T1 attributable time bounded by observation

**Files:** Create `modules/qualified-time/time-attribution.test.ts`, `modules/qualified-time/time-attribution.ts`.

**Interfaces:** Consumes `TimeObservationV1`; produces `createTimeAttributionV1(input): TimeAttributionV1`.

- [ ] **Step 1: Write a test attributing 4,800,000 ms of a 5,400,000 ms observation to one principal/activity with explicit method/evidence refs.**
- [ ] **Step 2: Add failures for negative attribution, attribution > observation, missing principal/activity/evidence and maturity mismatch.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/time-attribution.test.ts`; expect RED.**
- [ ] **Step 4: Implement exact parent-lineage and deterministic hash validation.**
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): add attributable time boundary`.**

### Task 4: Contribution record before verification

**Files:** Create `modules/qualified-time/contribution-record.test.ts`, `modules/qualified-time/contribution-record.ts`.

**Interfaces:** Consumes `TimeAttributionV1` and evidence bundle ref; produces `createContributionRecordV1(input): ContributionRecordV1`.

- [ ] **Step 1: Write a test binding attribution, principal, task/objective, capability, scope, attributed duration and evidence bundle ref.**
- [ ] **Step 2: Add failures for principal mismatch with attribution, changed attributedMillis, missing task/capability/scope, missing evidence bundle and maturity mismatch.**
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/contribution-record.test.ts`; expect RED.**
- [ ] **Step 4: Implement immutable contribution identity from the exact attribution + work-context refs.** Do not claim verification or qualification in this object.
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): record contribution context`.**

### Task 5: T2 verified contribution time bounded by attribution and evidence

**Files:** Create `modules/qualified-time/contribution-verification.test.ts`, `modules/qualified-time/contribution-verification.ts`.

**Interfaces:** Consumes `ContributionRecordV1` and `QualificationEvidenceBundleV1`; produces `verifyContributionTimeV1(input): VerifiedContributionTimeV1`.

- [ ] **Step 1: Write a test verifying 4,200,000 ms from a contribution carrying 4,800,000 attributed ms; bind contribution/principal/capability/scope/evidence.**
- [ ] **Step 2: Add failures:** verified > attributed → `VERIFIED_TIME_EXCEEDS_ATTRIBUTED_TIME`; bundle principal mismatch → `verified_time_principal_mismatch`; integrity unresolved → `EVIDENCE_INTEGRITY_UNKNOWN`; M4+ → `REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY`.
- [ ] **Step 3: Run `npx vitest run modules/qualified-time/contribution-verification.test.ts`; expect RED.**
- [ ] **Step 4: Implement evidence-bound verification; never infer verified duration from task completion alone.**
- [ ] **Step 5: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 6: Commit `feat(qualified-time): verify contribution time`.**

### Task 6: T3 qualification compiler with exact scope/capability binding

**Files:** Create `modules/qualified-time/qualification-compiler.test.ts`, `modules/qualified-time/qualification-compiler.ts`.

**Interfaces:** Consumes `VerifiedContributionTimeV1`, `QualificationAssertionV1` and policy binding; produces `compileQualifiedTimeClaimV1(input): QualifiedTimeClaimV1`.

- [ ] **Step 1: Write a passing test where verified contribution, simulated qualification assertion and policy share principal/capability/scope/scheme revision and M1 maturity; assert qualifiedMillis ≤ verifiedMillis.**
- [ ] **Step 2: Add failures for principal/scope/capability/scheme mismatch, assertion not valid at contribution time and qualified > verified.**
- [ ] **Step 3: Add a test proving a long verified duration cannot compensate for missing/insufficient qualification; expect `QUALIFICATION_REQUIRED` or `QUALIFICATION_LEVEL_INSUFFICIENT`.**
- [ ] **Step 4: Run `npx vitest run modules/qualified-time/qualification-compiler.test.ts`; expect RED.**
- [ ] **Step 5: Implement exact binding; consume the assertion without creating or modifying it.**
- [ ] **Step 6: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualified-time): compile qualified contribution time`.**

### Task 7: T4 economic eligibility with no economic effect

**Files:** Create `modules/qualified-time/economic-eligibility.test.ts`, `modules/qualified-time/economic-eligibility.ts`.

**Interfaces:** Consumes `QualifiedTimeClaimV1`, `EconomicEligibilityPolicyV1`, readiness facts and reality admission; produces `evaluateEconomicEligibilityV1(input): EconomicEligibilityResultV1`.

- [ ] **Step 1: Write V0, V1, V2, V3 and simulated V4 readiness tests; every result keeps economic/settlement fields null/false.**
- [ ] **Step 2: Add a V4 test requiring `SIMULATED_SILK_READINESS_ONLY` and proving the module exports no SILK handoff/settlement-intent factory.**
- [ ] **Step 3: Add failures for policy revision mismatch, insufficient qualification, unverified evidence and M4+ reality request.**
- [ ] **Step 4: Run `npx vitest run modules/qualified-time/economic-eligibility.test.ts`; expect RED.**
- [ ] **Step 5: Implement the pure classifier with one hard-coded pre-economic effect constant:**

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

- [ ] **Step 6: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 7: Commit `feat(qualified-time): classify pre-economic eligibility`.**

### Task 8: Append-only PostgreSQL T0–T4 chain

**Files:** Create `modules/qualified-time/postgres-qualified-time-store.test.ts`, `modules/qualified-time/postgres-qualified-time-store.ts`, `modules/qualified-time/sql/001_qualified_time_ledger.sql`.

**Interfaces:** Define local `QualifiedTimeQueryExecutorV1`; persist observations, attributions, contribution records, verified contributions, qualified claims, eligibility policies/results.

- [ ] **Step 1: Write scripted-DB tests for insert-once, idempotent replay, conflicting replay and full T0→T4 reconstruction by claim/result ref.**
- [ ] **Step 2: Write SQL-file tests requiring parent FKs T1→T0, contribution→T1, T2→contribution, T3→T2 and T4→T3/policy.**
- [ ] **Step 3: Enforce non-negative millis and parent-child duration bounds using duplicated parent-bound duration columns validated at write time plus SQL CHECKs; store methods must transactionally verify the parent row before insert.**
- [ ] **Step 4: Require T4 tables to omit monetary-value and settlement-reference columns entirely; persist only `eligible`, readiness, reasons and false booleans `creates_obligation`, `payable`, `transferable`, `redeemable`, each constrained false.**
- [ ] **Step 5: Add a schema test that rejects tables/standalone columns named `wallet`, `currency`, `exchange_rate`, `transfer`, `redemption`, `payment`, or `settlement_intent`.**
- [ ] **Step 6: Run `npx vitest run modules/qualified-time/postgres-qualified-time-store.test.ts`; expect RED.**
- [ ] **Step 7: Implement local query interfaces, SHA-256 source digests, conflict/readback behavior and reconstruction.**
- [ ] **Step 8: Re-run focused test + type-check; expect PASS.**
- [ ] **Step 9: Commit `feat(qualified-time): add durable t0-t4 ledger`.**

### Task 9: Manifests, scoped CI and complete R0.1 proof

**Files:** Modify `package.json`, `.github/workflows/qualification-simulation-r0.1.yml`, `.vsr/module-bindings.yaml`, `.vsr/repository-components.yaml`.

- [ ] **Step 1: Add exact scripts:**

```json
"test:qualified-time": "vitest run modules/qualified-time/contracts.test.ts modules/qualified-time/time-observation.test.ts modules/qualified-time/time-attribution.test.ts modules/qualified-time/contribution-record.test.ts modules/qualified-time/contribution-verification.test.ts modules/qualified-time/qualification-compiler.test.ts modules/qualified-time/economic-eligibility.test.ts modules/qualified-time/postgres-qualified-time-store.test.ts",
"lint:qualified-time": "eslint modules/qualified-time --ext .ts"
```

- [ ] **Step 2: Extend the shared workflow to run Simulation, Qualification and Qualified Time focused tests/lint plus repo-wide type-check.**
- [ ] **Step 3: Register `MOD-QUALIFIED-TIME-001` with dependencies on Simulation contracts, Qualification contracts, River evidence refs, objective/capability refs and versioned pre-economic policy only; no `SILK-001` or `SILK-DAM-001`.**
- [ ] **Step 4: Add forbidden rules:** `create-monetary-value`, `create-stored-value`, `discharge-wage-or-payable-obligation`, `create-transfer-or-redemption`, `create-settlement-intent`, `call-silk-runtime`, `treat-v4-readiness-as-settlement-admission`.
- [ ] **Step 5: Add component entries for T0, T1, contribution record, T2, T3, T4 and store with `activation_implied: false`, `activation_gate: r0.1-pre-economic-simulation-only`.**
- [ ] **Step 6: Run `npm run test:simulation`; expect PASS.**
- [ ] **Step 7: Run `npm run test:qualification`; expect PASS.**
- [ ] **Step 8: Run `npm run test:qualified-time`; expect PASS.**
- [ ] **Step 9: Run `npm run lint:simulation && npm run lint:qualification && npm run lint:qualified-time`; expect PASS.**
- [ ] **Step 10: Run `npm run -s type-check`; expect PASS.**
- [ ] **Step 11: Run `grep -R -nE 'from .*\/(silk|silk-dam)\/|SettlementIntent|SettlementState|EconomicConsequenceDraft' modules/qualified-time`; expect no implementation match.**
- [ ] **Step 12: Inspect any negative test fixtures separately and verify no production implementation can emit `payable: true`, `transferable: true`, `createsObligation: true`, value, wallet, transfer, redemption, payment or settlement semantics.**
- [ ] **Step 13: Inspect the plan and implementation for unresolved placeholder markers; none may remain.**
- [ ] **Step 14: Commit `chore(qualified-time): register complete r0.1 acceptance surface`.**

## Completion Gate

R0.1 is complete only when the exact branch head passes all three focused subsystem suites, focused lint and repo type-check, and the durable T0–T4 chain can be replayed from immutable inputs without any monetary value, stored value, wage discharge, obligation, transfer, redemption, payment, settlement intent or SILK runtime effect. Promotion to M4 advisory or any live/economic release requires a separate reviewed design and implementation plan.