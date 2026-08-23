# WORK-CAPABILITY-RECONCILIATION-BRIDGE-001 R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that one synthetic garment Work Unit can traverse the existing expected-effect, River evidence, effect-verification, and reconciliation lineage and emerge as either a closed Work result or a governed partial-effect exception with an exact, non-authorized recovery request requiring fresh Warden authority.

**Architecture:** Add one `modules/work-capability/reconciliation-bridge.ts` layer over the existing generic `ReconciliationFabricV1`. Extend the trusted expected-effect compiler surface only for `garment.waistband.attach`, add a synthetic evidence finalizer that emits the existing River seal/causal-trace contracts, then combine generic reconciliation with `CapabilityOutcomeV1` to determine Work closure without changing `ReconciliationFabricV1`.

**Tech Stack:** TypeScript 5.8, Node.js 22, Vitest 3, existing Warden/River/Synnergyze/Work-Capability modules.

**Spec:** `docs/superpowers/specs/2026-08-24-work-capability-reconciliation-bridge-r0.1-design.md`

## Global Constraints

- Base this stacked slice on `feat/work-capability-runtime-r0.1` head `2a0f627780e7ae97bee03bc8f30f4556c5ceff1d`.
- Do not modify or merge PR #83 as part of this slice.
- `ReconciliationFabricV1` remains generic and is not changed for garment quantity semantics.
- The original Warden `ALLOW` cannot authorize recovery execution.
- A recovery request is a proposal only: `requiresFreshWardenDecision: true`, `authorized: false`.
- No recovery Work Unit is executed by this bridge.
- The synthetic evidence finalizer reuses existing `EvidenceSealV1` / `CausalTraceV1` contracts and the `RC1-TRACE-V1` digest grammar; it is not a production River ledger.
- Quantity/quality closure is evaluated from `CapabilityOutcomeV1`, not inferred from the generic expected-effect matcher.
- Exact replay is stable; changed lineage or outcome material under the same identity fails closed.
- No live factory, worker credential, PLC/MES, payroll, SILK-finality, marketplace, or production River claim.

---

### Task 1: Register a trusted expected-effect compiler for the synthetic waistband capability

**Files:**
- Modify: `modules/synnergyze/effect-expectation.ts`
- Create: `modules/work-capability/reconciliation-bridge.test.ts`

**Interfaces:**
- Consumes: `EffectExpectationCompilerV1`, `EffectExpectationServiceV1`, `validateExpectedEffectContractV1`.
- Produces: `SyntheticGarmentWaistbandExpectationCompilerV1` with `capabilityRef = "garment.waistband.attach"`.

- [ ] **Step 1: Write the failing trusted-compiler test**

Add to `modules/work-capability/reconciliation-bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  EffectExpectationServiceV1,
  SyntheticGarmentWaistbandExpectationCompilerV1,
  validateExpectedEffectContractV1,
} from "../synnergyze/effect-expectation.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import { evaluateSyntheticWardenDecisionV1 } from "../warden/decision-service.ts";
import { validWaistbandFixtureV1 } from "./fixtures/garment.ts";

function compileWaistbandExpectationV1() {
  const fixture = validWaistbandFixtureV1();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: fixture.request,
    policy: fixture.policy,
    decidedAt: fixture.decidedAt,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow");

  const action = buildAuthorizedActionEnvelopeV1(fixture.request, decision);
  const reservation = new SyntheticRiverReservationServiceV1().reserve({
    request: fixture.request,
    decision,
    action,
    reservedAt: fixture.reservedAt,
  });
  const service = new EffectExpectationServiceV1([
    new SyntheticGarmentWaistbandExpectationCompilerV1(),
  ]);
  return service.compile({
    action,
    reservation,
    compiledAt: "2026-08-24T00:30:22.000Z",
  });
}

describe("WORK-CAPABILITY-RECONCILIATION-BRIDGE-001", () => {
  it("compiles and validates the bounded garment waistband expected-effect contract", () => {
    const expectation = compileWaistbandExpectationV1();

    expect(expectation.capabilityRef).toBe("garment.waistband.attach");
    expect(expectation.requestedEffect).toBe("GARMENT-STATE:waistband_attached");
    expect(expectation.matcher).toEqual({
      kind: "PREFIX",
      value: "GARMENT-WAISTBAND-OBSERVED:",
    });
    expect(validateExpectedEffectContractV1(expectation)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: FAIL because `SyntheticGarmentWaistbandExpectationCompilerV1` does not exist.

- [ ] **Step 3: Implement the minimum trusted compiler**

In `modules/synnergyze/effect-expectation.ts`, add:

```ts
export class SyntheticGarmentWaistbandExpectationCompilerV1
  implements EffectExpectationCompilerV1
{
  readonly compilerRef = "SYNTHETIC-GARMENT-WAISTBAND-EXPECTATION-COMPILER-001";
  readonly capabilityRef = "garment.waistband.attach";

  compile(requestedEffect: string): EffectMatcherV1 {
    if (requestedEffect !== "GARMENT-STATE:waistband_attached") {
      throw new Error("effect_expectation_unsupported_requested_effect");
    }
    return { kind: "PREFIX", value: "GARMENT-WAISTBAND-OBSERVED:" };
  }
}
```

Extend `trustedCompilerFor(...)` exactly as follows:

```ts
function trustedCompilerFor(capabilityRef: string): EffectExpectationCompilerV1 | undefined {
  if (capabilityRef === "service_request.create") {
    return new SyntheticServiceRequestExpectationCompilerV1();
  }
  if (capabilityRef === "garment.waistband.attach") {
    return new SyntheticGarmentWaistbandExpectationCompilerV1();
  }
  return undefined;
}
```

- [ ] **Step 4: Add fail-closed unsupported-effect test**

```ts
it("rejects an unsupported requested effect for the trusted garment compiler", () => {
  const compiler = new SyntheticGarmentWaistbandExpectationCompilerV1();
  expect(() => compiler.compile("GARMENT-STATE:anything-else")).toThrow(
    "effect_expectation_unsupported_requested_effect",
  );
});
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/synnergyze/effect-expectation.ts modules/work-capability/reconciliation-bridge.test.ts
git commit -m "feat(work-capability): add garment effect expectation compiler"
```

---

### Task 2: Add the synthetic Work evidence finalizer with exact replay and conflict safety

**Files:**
- Create: `modules/work-capability/reconciliation-bridge.ts`
- Modify: `modules/work-capability/reconciliation-bridge.test.ts`

**Interfaces:**
- Consumes: `EvidenceReservationV1`, `EvidenceSealV1`, `CausalTraceV1`, `VerifiedEffectV1`.
- Produces: `SyntheticWorkCapabilityEvidenceFinalizerV1.finalize(...)` returning `{ seal, causalTrace, idempotentReplay }`.

- [ ] **Step 1: Write the failing finalizer test**

Add:

```ts
import {
  SyntheticWorkCapabilityEvidenceFinalizerV1,
} from "./reconciliation-bridge.ts";
import { runVerifiedWaistbandFixtureV1 } from "./fixtures/garment.ts";

it("finalizes the verified Work effect into the existing River seal and causal-trace contracts", () => {
  const result = runVerifiedWaistbandFixtureV1({
    inputQuantity: 500,
    acceptedQuantity: 487,
    reworkQuantity: 6,
  });
  const finalizer = new SyntheticWorkCapabilityEvidenceFinalizerV1();
  const finalized = finalizer.finalize({
    reservationRef: result.execution.reservationRef,
    correlationId: result.execution.correlationId,
    effect: result.verification.effect,
    sealedAt: "2026-08-24T00:31:00.000Z",
  });

  expect(finalized.seal.state).toBe("SEALED");
  expect(finalized.seal.reservationRef).toBe(result.execution.reservationRef);
  expect(finalized.seal.traceDigest).toBe([
    "RC1-TRACE-V1",
    result.execution.reservationRef,
    finalized.seal.sealRef,
    result.verification.effect.effectRef,
    result.verification.effect.verificationRef,
  ].join("|"));
  expect(finalized.causalTrace.effectRef).toBe(result.verification.effect.effectRef);
  expect(finalized.causalTrace.sealRef).toBe(finalized.seal.sealRef);
  expect(finalized.causalTrace.sealed).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: FAIL because `SyntheticWorkCapabilityEvidenceFinalizerV1` is missing.

- [ ] **Step 3: Implement the finalizer**

Create `modules/work-capability/reconciliation-bridge.ts` beginning with:

```ts
import { createHash } from "node:crypto";

import type {
  CausalTraceV1,
  EvidenceSealV1,
} from "../river/contracts.ts";
import type { VerifiedEffectV1 } from "../synnergyze/effect-verification.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface StoredEvidenceFinalizationV1 {
  fingerprint: string;
  seal: EvidenceSealV1;
  causalTrace: CausalTraceV1;
}

export class SyntheticWorkCapabilityEvidenceFinalizerV1 {
  private readonly byEffectRef = new Map<string, StoredEvidenceFinalizationV1>();

  finalize(input: {
    reservationRef: string;
    correlationId: string;
    effect: VerifiedEffectV1;
    sealedAt: string;
  }): {
    seal: EvidenceSealV1;
    causalTrace: CausalTraceV1;
    idempotentReplay: boolean;
  } {
    const { reservationRef, correlationId, effect, sealedAt } = input;
    if (effect.reservationRef !== reservationRef) {
      throw new Error("work_capability_finalizer_reservation_mismatch");
    }
    if (effect.correlationId !== correlationId) {
      throw new Error("work_capability_finalizer_correlation_mismatch");
    }
    const verified = Date.parse(effect.verifiedAt);
    const sealed = Date.parse(sealedAt);
    if (!Number.isFinite(verified) || !Number.isFinite(sealed)) {
      throw new Error("work_capability_finalizer_invalid_time");
    }
    if (sealed < verified) {
      throw new Error("work_capability_finalizer_before_verification");
    }

    const fingerprint = digest(JSON.stringify({
      reservationRef,
      correlationId,
      effectRef: effect.effectRef,
      verificationRef: effect.verificationRef,
      verifiedAt: effect.verifiedAt,
      sealedAt,
    }));
    const existing = this.byEffectRef.get(effect.effectRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("work_capability_finalizer_idempotency_conflict");
      }
      return {
        seal: { ...existing.seal },
        causalTrace: {
          ...existing.causalTrace,
          eventReceiptRefs: [...existing.causalTrace.eventReceiptRefs],
        },
        idempotentReplay: true,
      };
    }

    const sealRef = `WORK-CAPABILITY-EVIDENCE-SEALED:${digest(
      `${reservationRef}|${effect.effectRef}|${effect.verificationRef}`,
    ).slice(0, 24)}`;
    const seal: EvidenceSealV1 = {
      sealRef,
      reservationRef,
      correlationId,
      state: "SEALED",
      traceDigest: [
        "RC1-TRACE-V1",
        reservationRef,
        sealRef,
        effect.effectRef,
        effect.verificationRef,
      ].join("|"),
      sealedAt,
    };
    const causalTrace: CausalTraceV1 = {
      correlationId,
      reservationRef,
      eventReceiptRefs: [],
      effectRef: effect.effectRef,
      sealRef,
      sealed: true,
    };
    this.byEffectRef.set(effect.effectRef, { fingerprint, seal, causalTrace });
    return {
      seal: { ...seal },
      causalTrace: { ...causalTrace, eventReceiptRefs: [] },
      idempotentReplay: false,
    };
  }
}
```

- [ ] **Step 4: Add exact-replay and conflict tests**

```ts
it("replays evidence finalization exactly and rejects changed sealing material", () => {
  const result = runVerifiedWaistbandFixtureV1({
    inputQuantity: 500,
    acceptedQuantity: 487,
    reworkQuantity: 6,
  });
  const finalizer = new SyntheticWorkCapabilityEvidenceFinalizerV1();
  const input = {
    reservationRef: result.execution.reservationRef,
    correlationId: result.execution.correlationId,
    effect: result.verification.effect,
    sealedAt: "2026-08-24T00:31:00.000Z",
  };

  const first = finalizer.finalize(input);
  const replay = finalizer.finalize(input);
  expect(replay.seal.sealRef).toBe(first.seal.sealRef);
  expect(replay.idempotentReplay).toBe(true);

  expect(() => finalizer.finalize({
    ...input,
    sealedAt: "2026-08-24T00:31:01.000Z",
  })).toThrow("work_capability_finalizer_idempotency_conflict");
});
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/work-capability/reconciliation-bridge.ts modules/work-capability/reconciliation-bridge.test.ts
git commit -m "feat(work-capability): finalize synthetic reconciliation evidence"
```

---

### Task 3: Compile the Work-level pre-execution expectation wrapper

**Files:**
- Modify: `modules/work-capability/reconciliation-bridge.ts`
- Modify: `modules/work-capability/reconciliation-bridge.test.ts`

**Interfaces:**
- Consumes: `WorkUnitV1`, `ExpectedEffectContractV1`.
- Produces: `WorkReconciliationExpectationV1`, `compileWorkReconciliationExpectationV1(...)`, `validateWorkReconciliationExpectationV1(...)`.

- [ ] **Step 1: Write the failing Work expectation test**

```ts
import {
  compileWorkReconciliationExpectationV1,
  validateWorkReconciliationExpectationV1,
} from "./reconciliation-bridge.ts";

it("binds Work quantity and quality semantics to the generic expectation before execution", () => {
  const fixture = validWaistbandFixtureV1();
  const expectedEffect = compileWaistbandExpectationV1();
  const workExpectation = compileWorkReconciliationExpectationV1({
    workUnit: fixture.workUnit,
    expectedEffectContract: expectedEffect,
    requiredQuantity: 500,
    compiledAt: "2026-08-24T00:30:23.000Z",
  });

  expect(workExpectation.state).toBe("BOUND_PRE_EXECUTION");
  expect(workExpectation.workUnitRef).toBe(fixture.workUnit.workUnitRef);
  expect(workExpectation.expectedEffectContractRef).toBe(expectedEffect.expectationRef);
  expect(workExpectation.requiredQuantity).toBe(500);
  expect(workExpectation.requiredFirstPassQuality).toBe(0.97);
  expect(validateWorkReconciliationExpectationV1(workExpectation)).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: FAIL because Work expectation contracts/compiler do not exist.

- [ ] **Step 3: Implement Work expectation contract and deterministic compiler**

Add to `reconciliation-bridge.ts`:

```ts
import type { ExpectedEffectContractV1 } from "../synnergyze/effect-expectation.ts";
import type { WorkUnitV1 } from "./contracts.ts";

export interface WorkReconciliationExpectationV1 {
  version: "WORK-RECONCILIATION-EXPECTATION-001";
  workExpectationRef: string;
  workUnitRef: string;
  objectiveRef: string;
  workflowRef: string;
  expectedEffectRef: string;
  expectedEffectContractRef: string;
  requiredQuantity: number;
  requiredFirstPassQuality: number;
  compiledAt: string;
  sourceDigest: string;
  state: "BOUND_PRE_EXECUTION";
  synthetic: true;
}
```

Implement `compileWorkReconciliationExpectationV1(...)` and `validateWorkReconciliationExpectationV1(...)` using one shared canonical source-material function. Enforce:

```ts
if (!Number.isInteger(requiredQuantity) || requiredQuantity <= 0) {
  throw new Error("work_reconciliation_required_quantity_invalid");
}
if (expectedEffectContract.eventRef !== workUnit.workUnitRef) {
  throw new Error("work_reconciliation_expectation_work_unit_mismatch");
}
if (expectedEffectContract.programRef !== workUnit.workflowRef) {
  throw new Error("work_reconciliation_expectation_workflow_mismatch");
}
if (expectedEffectContract.targetRef !== workUnit.targetRef) {
  throw new Error("work_reconciliation_expectation_target_mismatch");
}
if (!workUnit.requiredCapabilityRefs.includes(expectedEffectContract.capabilityRef)) {
  throw new Error("work_reconciliation_expectation_capability_mismatch");
}
if (expectedEffectContract.requestedEffect !== workUnit.requiredOutputStateRef) {
  throw new Error("work_reconciliation_expectation_effect_mismatch");
}
```

Use `workUnit.qualityThresholds.firstPassQuality ?? 0` for `requiredFirstPassQuality`.

- [ ] **Step 4: Add integrity and time-order tests**

```ts
it("fails validation when Work expectation material is mutated", () => {
  const fixture = validWaistbandFixtureV1();
  const expectedEffect = compileWaistbandExpectationV1();
  const compiled = compileWorkReconciliationExpectationV1({
    workUnit: fixture.workUnit,
    expectedEffectContract: expectedEffect,
    requiredQuantity: 500,
    compiledAt: "2026-08-24T00:30:23.000Z",
  });
  expect(validateWorkReconciliationExpectationV1({
    ...compiled,
    requiredQuantity: 499,
  })).toBe(false);
});
```

Add one test proving bridge reconciliation later rejects a Work expectation timestamp after `execution.executedAt` with `work_reconciliation_expectation_after_execution`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/work-capability/reconciliation-bridge.ts modules/work-capability/reconciliation-bridge.test.ts
git commit -m "feat(work-capability): bind Work reconciliation expectation"
```

---

### Task 4: Reconcile generic effect lineage with Work-level completion semantics

**Files:**
- Modify: `modules/work-capability/reconciliation-bridge.ts`
- Modify: `modules/work-capability/reconciliation-bridge.test.ts`
- Modify: `modules/work-capability/fixtures/garment.ts`

**Interfaces:**
- Consumes: `ReconciliationFabricV1`, `WorkReconciliationExpectationV1`, `WorkUnitV1`, `WorkAssignmentV1`, `CapabilityOutcomeV1`, `RemainingWorkProposalV1`, execution/observation/verification/seal/trace contracts.
- Produces: `WorkCapabilityReconciliationBridgeV1.reconcile(...)`, `WorkCapabilityReconciliationDeterminationV1`, `WorkRecoveryRequestV1`.

- [ ] **Step 1: Expose the assignment and Work Unit in the verified garment fixture result**

Modify `VerifiedWaistbandFixtureResultV1` in `modules/work-capability/fixtures/garment.ts` to include:

```ts
workUnit: WorkUnitV1;
assignment: WorkAssignmentV1;
```

Return them from `runVerifiedWaistbandFixtureV1(...)`:

```ts
return {
  workUnit: executionInput.workUnit,
  assignment: proof.assignment,
  execution: proof.execution,
  observation,
  verification: verificationResult,
  capabilityEvidence,
  outcome: reconciled.outcome,
  remainingWork: reconciled.remainingWork,
};
```

- [ ] **Step 2: Write the failing 500 → 493 → 7 acceptance test**

```ts
import {
  ReconciliationFabricV1,
} from "../synnergyze/reconciliation-fabric.ts";
import {
  WorkCapabilityReconciliationBridgeV1,
} from "./reconciliation-bridge.ts";

it("turns generic MATCH into a Work PARTIAL_EFFECT exception with an exact unauthorized 7-unit recovery request", () => {
  const verified = runVerifiedWaistbandFixtureV1({
    inputQuantity: 500,
    acceptedQuantity: 487,
    reworkQuantity: 6,
  });
  const expectedEffect = compileWaistbandExpectationV1();
  const workExpectation = compileWorkReconciliationExpectationV1({
    workUnit: verified.workUnit,
    expectedEffectContract: expectedEffect,
    requiredQuantity: 500,
    compiledAt: "2026-08-24T00:30:23.000Z",
  });
  const finalized = new SyntheticWorkCapabilityEvidenceFinalizerV1().finalize({
    reservationRef: verified.execution.reservationRef,
    correlationId: verified.execution.correlationId,
    effect: verified.verification.effect,
    sealedAt: "2026-08-24T00:31:00.000Z",
  });
  const bridge = new WorkCapabilityReconciliationBridgeV1(
    new ReconciliationFabricV1(),
  );
  const result = bridge.reconcile({
    workExpectation,
    expectedEffectContract: expectedEffect,
    workUnit: verified.workUnit,
    assignment: verified.assignment,
    execution: verified.execution,
    observation: verified.observation,
    verification: verified.verification,
    seal: finalized.seal,
    causalTrace: finalized.causalTrace,
    outcome: verified.outcome,
    remainingWork: verified.remainingWork,
    determinedAt: "2026-08-24T00:31:10.000Z",
  });

  expect(result.state).toBe("DETERMINED");
  if (result.state !== "DETERMINED") throw new Error("expected_determined");
  expect(result.determination.genericClassification).toBe("MATCH");
  expect(result.determination.state).toBe("EXCEPTION");
  expect(result.determination.classification).toBe("PARTIAL_EFFECT");
  expect(result.recoveryRequest?.remainingQuantity).toBe(7);
  expect(result.recoveryRequest?.requiresFreshWardenDecision).toBe(true);
  expect(result.recoveryRequest?.authorized).toBe(false);
  expect(result.recoveryRequest && "actionToken" in result.recoveryRequest).toBe(false);
  expect(result.recoveryRequest && "executionReceiptRef" in result.recoveryRequest).toBe(false);
  expect(result.recoveryRequest && "assignmentRef" in result.recoveryRequest).toBe(false);
});
```

- [ ] **Step 3: Implement bridge contracts**

Add:

```ts
import type { ReconciliationClassificationV1 } from "../synnergyze/reconciliation-fabric.ts";
import type {
  CapabilityOutcomeV1,
  RemainingWorkProposalV1,
  WorkAssignmentV1,
} from "./contracts.ts";

export interface WorkCapabilityReconciliationDeterminationV1 {
  version: "WORK-CAPABILITY-RECONCILIATION-BRIDGE-001";
  workReconciliationRef: string;
  workUnitRef: string;
  assignmentRef: string;
  executionReceiptRef: string;
  reconciliationRef: string;
  genericClassification: ReconciliationClassificationV1;
  workOutcomeRef: string;
  state: "CLOSED" | "EXCEPTION";
  classification:
    | "FULL_EFFECT"
    | "PARTIAL_EFFECT"
    | "FAILED_EFFECT"
    | "GENERIC_RECONCILIATION_EXCEPTION";
  remainingWorkProposalRef?: string;
  recoveryAuthorizationRequired: boolean;
  closedAt?: string;
  determinedAt: string;
  sourceDigest: string;
  synthetic: true;
}

export interface WorkRecoveryRequestV1 {
  recoveryRequestRef: string;
  parentWorkUnitRef: string;
  parentReconciliationRef: string;
  remainingWorkProposalRef: string;
  remainingQuantity: number;
  requiredCapabilityRefs: readonly string[];
  targetRef: string;
  requestedEffect: string;
  reasonCode: "PARTIAL_EFFECT_REMAINING_WORK";
  requiresFreshWardenDecision: true;
  authorized: false;
  synthetic: true;
}
```

Define bridge result:

```ts
export type WorkCapabilityReconciliationResultV1 =
  | {
      state: "DETERMINED";
      determination: WorkCapabilityReconciliationDeterminationV1;
      recoveryRequest?: WorkRecoveryRequestV1;
      idempotentReplay: boolean;
    }
  | {
      state: "REJECTED_INPUT";
      reasonCode: string;
    };
```

- [ ] **Step 4: Implement `WorkCapabilityReconciliationBridgeV1.reconcile(...)`**

Constructor:

```ts
export class WorkCapabilityReconciliationBridgeV1 {
  private readonly byExecutionReceiptRef = new Map<string, {
    fingerprint: string;
    determination: WorkCapabilityReconciliationDeterminationV1;
    recoveryRequest?: WorkRecoveryRequestV1;
  }>();

  constructor(private readonly reconciliation: ReconciliationFabricV1) {}

  reconcile(input: {
    workExpectation: WorkReconciliationExpectationV1;
    expectedEffectContract: ExpectedEffectContractV1;
    workUnit: WorkUnitV1;
    assignment: WorkAssignmentV1;
    execution: SynnergyzeExecutionReceiptV1;
    observation: PostExecutionObservationV1;
    verification: EffectVerificationResultV1;
    seal: EvidenceSealV1;
    causalTrace: CausalTraceV1;
    outcome: CapabilityOutcomeV1;
    remainingWork?: RemainingWorkProposalV1;
    determinedAt: string;
  }): WorkCapabilityReconciliationResultV1 {
    // validation + generic reconciliation + Work classification
  }
}
```

Validation before generic reconciliation must enforce:

```ts
if (!validateWorkReconciliationExpectationV1(workExpectation)) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_expectation_integrity_invalid" };
}
if (workExpectation.expectedEffectContractRef !== expectedEffectContract.expectationRef) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_expected_effect_mismatch" };
}
if (assignment.workUnitRef !== workUnit.workUnitRef) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_assignment_mismatch" };
}
if (execution.eventRef !== workUnit.workUnitRef) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_execution_mismatch" };
}
if (outcome.workUnitRef !== workUnit.workUnitRef) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_outcome_mismatch" };
}
if (Date.parse(workExpectation.compiledAt) > Date.parse(execution.executedAt)) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_expectation_after_execution" };
}
```

Call existing fabric exactly once:

```ts
const generic = this.reconciliation.reconcile({
  expectation: expectedEffectContract,
  receipt: execution,
  observation,
  verification,
  seal,
  causalTrace,
  reconciledAt: determinedAt,
});
```

If `generic.state === "REJECTED_INPUT"`, return:

```ts
return {
  state: "REJECTED_INPUT",
  reasonCode: `generic_reconciliation:${generic.reasonCode}`,
};
```

If `generic.determination.state === "EXCEPTION"`, return a Work determination with:

```ts
state: "EXCEPTION",
classification: "GENERIC_RECONCILIATION_EXCEPTION",
recoveryAuthorizationRequired: true,
```

but **no Work recovery request**.

For generic `RECONCILED/MATCH`:

```ts
switch (outcome.state) {
  case "FULL_EFFECT":
    // CLOSED, no recovery request
    break;
  case "PARTIAL_EFFECT":
    // EXCEPTION, validate remainingWork, emit recovery request
    break;
  case "FAILED_EFFECT":
    // EXCEPTION, no automatic recovery request in R0.1
    break;
}
```

For `PARTIAL_EFFECT`, require:

```ts
if (!remainingWork) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_remaining_work_required" };
}
const expectedRemaining = outcome.requiredQuantity - outcome.outputQuantity;
if (
  remainingWork.workUnitRef !== workUnit.workUnitRef ||
  remainingWork.remainingQuantity !== expectedRemaining ||
  remainingWork.automaticExecutionAllowed !== false
) {
  return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_remaining_work_invalid" };
}
```

Emit recovery request:

```ts
const recoveryRequest: WorkRecoveryRequestV1 = {
  recoveryRequestRef: `WORK-RECOVERY-REQUEST:${digest(
    `${workUnit.workUnitRef}|${generic.determination.reconciliationRef}|${remainingWork.proposalRef}|${remainingWork.remainingQuantity}`,
  ).slice(0, 24)}`,
  parentWorkUnitRef: workUnit.workUnitRef,
  parentReconciliationRef: generic.determination.reconciliationRef,
  remainingWorkProposalRef: remainingWork.proposalRef,
  remainingQuantity: remainingWork.remainingQuantity,
  requiredCapabilityRefs: [...workUnit.requiredCapabilityRefs],
  targetRef: workUnit.targetRef,
  requestedEffect: workUnit.requiredOutputStateRef,
  reasonCode: "PARTIAL_EFFECT_REMAINING_WORK",
  requiresFreshWardenDecision: true,
  authorized: false,
  synthetic: true,
};
```

- [ ] **Step 5: Add the full-success closure test**

```ts
it("closes Work when generic reconciliation matches and the Work outcome is FULL_EFFECT", () => {
  const verified = runVerifiedWaistbandFixtureV1({
    inputQuantity: 500,
    acceptedQuantity: 490,
    reworkQuantity: 10,
  });
  // use the same expectation/finalization/bridge setup as the partial test
  // but pass verified.outcome with no remainingWork
  // 490 + 10 = 500 and 490/500 >= 0.97

  expect(verified.outcome.state).toBe("FULL_EFFECT");
  const result = reconcileVerifiedFixtureV1(verified);
  expect(result.state).toBe("DETERMINED");
  if (result.state !== "DETERMINED") throw new Error("expected_determined");
  expect(result.determination.state).toBe("CLOSED");
  expect(result.determination.classification).toBe("FULL_EFFECT");
  expect(result.recoveryRequest).toBeUndefined();
});
```

If test setup becomes repetitive, add a local test helper `reconcileVerifiedFixtureV1(...)` inside the test file only; do not export it from production code.

- [ ] **Step 6: Add fail-closed reconciliation tests**

Cover each with an explicit assertion:

```ts
it("rejects PARTIAL_EFFECT without remaining work", ...)
it("rejects remaining-work quantity that differs from the exact shortfall", ...)
it("rejects a Work expectation compiled after execution", ...)
it("propagates missing seal as a generic reconciliation rejection", ...)
it("propagates invalid seal trace digest as a generic reconciliation rejection", ...)
it("propagates causal-trace mismatch as a generic reconciliation rejection", ...)
```

Expected reason codes:

```text
work_reconciliation_remaining_work_required
work_reconciliation_remaining_work_invalid
work_reconciliation_expectation_after_execution
generic_reconciliation:RECONCILIATION_SEAL_REQUIRED
generic_reconciliation:RECONCILIATION_SEAL_LINEAGE_MISMATCH
generic_reconciliation:RECONCILIATION_CAUSAL_TRACE_MISMATCH
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/work-capability/reconciliation-bridge.ts modules/work-capability/reconciliation-bridge.test.ts modules/work-capability/fixtures/garment.ts
git commit -m "feat(work-capability): reconcile Work outcomes and recovery demand"
```

---

### Task 5: Add Work-reconciliation replay/conflict protection

**Files:**
- Modify: `modules/work-capability/reconciliation-bridge.ts`
- Modify: `modules/work-capability/reconciliation-bridge.test.ts`

**Interfaces:**
- Consumes all Task 4 bridge input contracts.
- Produces stable `idempotentReplay` behavior and `work_capability_reconciliation_idempotency_conflict` failure.

- [ ] **Step 1: Write failing exact replay test**

```ts
it("replays the exact Work reconciliation without minting another determination or recovery request", () => {
  const setup = partialReconciliationSetupV1();
  const first = setup.bridge.reconcile(setup.input);
  const second = setup.bridge.reconcile(setup.input);

  expect(first.state).toBe("DETERMINED");
  expect(second.state).toBe("DETERMINED");
  if (first.state !== "DETERMINED" || second.state !== "DETERMINED") {
    throw new Error("expected_determined");
  }
  expect(second.determination.workReconciliationRef).toBe(
    first.determination.workReconciliationRef,
  );
  expect(second.recoveryRequest?.recoveryRequestRef).toBe(
    first.recoveryRequest?.recoveryRequestRef,
  );
  expect(second.idempotentReplay).toBe(true);
});
```

- [ ] **Step 2: Write failing mutated replay test**

```ts
it("fails closed when Work outcome material changes under the same reconciliation identity", () => {
  const setup = partialReconciliationSetupV1();
  const first = setup.bridge.reconcile(setup.input);
  expect(first.state).toBe("DETERMINED");

  expect(() => setup.bridge.reconcile({
    ...setup.input,
    outcome: {
      ...setup.input.outcome,
      acceptedQuantity: setup.input.outcome.acceptedQuantity - 1,
    },
  })).toThrow("work_capability_reconciliation_idempotency_conflict");
});
```

- [ ] **Step 3: Run focused test and verify RED**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: replay assertions fail until the bridge stores a deterministic fingerprint/determination.

- [ ] **Step 4: Implement fingerprinted storage**

Identity:

```ts
const identity = [
  workUnit.workUnitRef,
  assignment.assignmentRef,
  execution.receiptRef,
  generic.determination.reconciliationRef,
].join("|");
```

Fingerprint canonical material must include:

```ts
const fingerprint = digest(JSON.stringify({
  workExpectationSourceDigest: workExpectation.sourceDigest,
  expectedEffectSourceDigest: expectedEffectContract.sourceDigest,
  workUnitRef: workUnit.workUnitRef,
  requiredQuantity: workExpectation.requiredQuantity,
  requiredFirstPassQuality: workExpectation.requiredFirstPassQuality,
  assignmentRef: assignment.assignmentRef,
  executionReceiptRef: execution.receiptRef,
  observationRef: observation.observationRef,
  verificationIdentity:
    verification.state === "VERIFIED_EFFECT"
      ? verification.effect.verificationRef
      : verification.reasonCode,
  sealRef: seal.sealRef,
  traceDigest: seal.traceDigest,
  causalEffectRef: causalTrace.effectRef ?? null,
  causalSealRef: causalTrace.sealRef ?? null,
  outcome,
  remainingWork: remainingWork ?? null,
  determinedAt,
}));
```

After generic reconciliation determines the identity, compare any existing stored fingerprint. On exact match, return cloned stored result with `idempotentReplay: true`. On mismatch, throw:

```ts
throw new Error("work_capability_reconciliation_idempotency_conflict");
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run modules/work-capability/reconciliation-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/work-capability/reconciliation-bridge.ts modules/work-capability/reconciliation-bridge.test.ts
git commit -m "test(work-capability): close reconciliation replay conflicts"
```

---

### Task 6: Add focused scripts and run stacked repository acceptance gates

**Files:**
- Modify: `package.json`
- Modify: `modules/work-capability/reconciliation-bridge.test.ts` only if a missing acceptance case is found during final self-review.

**Interfaces:**
- Produces focused commands `test:work-capability-reconciliation` and preserves `test:work-capability`.

- [ ] **Step 1: Add the focused package script**

In `package.json`, add immediately after `test:work-capability`:

```json
"test:work-capability-reconciliation": "vitest run modules/work-capability/reconciliation-bridge.test.ts",
```

- [ ] **Step 2: Run the focused Work reconciliation suite**

Run:

```bash
npm run test:work-capability-reconciliation
```

Expected: PASS.

- [ ] **Step 3: Run the existing Work/Capability suite**

Run:

```bash
npm run test:work-capability
```

Expected: PASS.

- [ ] **Step 4: Run existing reconciliation conformance**

Run:

```bash
npm run test:reconciliation-conformance
```

Expected: PASS, proving `ReconciliationFabricV1` behavior was not broken.

- [ ] **Step 5: Run static gates**

Run:

```bash
npm run type-check
npm run lint
```

Expected: both PASS.

- [ ] **Step 6: Run the full repository suite**

Run:

```bash
npm test -- --run
```

Expected: all test files PASS on the same exact head.

- [ ] **Step 7: Verify final acceptance invariants**

Confirm with test assertions, not prose-only inspection:

```text
1. garment.waistband.attach expectation uses the bounded trusted compiler.
2. unsupported garment requested effects fail closed.
3. evidence finalization produces typed EvidenceSealV1 and CausalTraceV1.
4. 500 → 493 produces PARTIAL_EFFECT and exact remaining quantity 7.
5. generic ReconciliationFabricV1 determination is MATCH for that observed effect family.
6. Work reconciliation remains EXCEPTION / PARTIAL_EFFECT.
7. recovery request is authorized=false and requiresFreshWardenDecision=true.
8. recovery request contains no action token, execution receipt, or assignment.
9. 500 → 500 with quality threshold satisfied closes as FULL_EFFECT.
10. missing/invalid seal and causal trace fail closed.
11. partial outcome without an exact remaining-work proposal fails closed.
12. exact replay is stable.
13. mutated replay fails with work_capability_reconciliation_idempotency_conflict.
14. no change was required to ReconciliationFabricV1.
```

- [ ] **Step 8: Commit**

```bash
git add package.json modules/work-capability/reconciliation-bridge.test.ts
git commit -m "test(work-capability): gate reconciliation bridge R0.1"
```

- [ ] **Step 9: Open a stacked PR only after all local gates pass**

Base the PR on:

```text
feat/work-capability-runtime-r0.1
```

Head:

```text
feat/work-capability-reconciliation-bridge-r0.1
```

PR body must state explicitly:

```text
- stacked on PR #83 / Work-Capability R0.1;
- does not merge or modify PR #83;
- preserves ReconciliationFabricV1 generic semantics;
- recovery request is not executable authority;
- synthetic/reference only;
- CI status reported from the exact PR head before review-ready promotion.
```

## Final Plan Self-Review

- Spec coverage: all sections 1–15 are mapped to Tasks 1–6.
- No production recovery execution is planned.
- No caller-supplied generic matcher is introduced.
- Generic reconciliation remains upstream of Work outcome interpretation.
- Evidence finalizer implements only the synthetic compatibility surface required by the current reconciliation contract.
- Full-effect and partial-effect cases are both independently testable.
- Fresh Warden authority is proven structurally by the recovery-request contract and negative-field assertions.
- Replay/conflict safety covers both evidence finalization and Work reconciliation.
- No `TBD`, `TODO`, or unspecified implementation step remains in this plan.
