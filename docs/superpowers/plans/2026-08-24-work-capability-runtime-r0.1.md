# WORK-CAPABILITY-RUNTIME-001 R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first synthetic closed-loop Work/Capability runtime that compiles a garment objective into unassigned Work Units, detects capability debt, selects only Warden-eligible human/agent/machine compositions, executes through the existing controlled-execution chain, verifies the realized effect, and appends capability evidence from observed work.

**Architecture:** Add one focused `modules/work-capability/` subsystem. It owns Work/Capability contracts, deterministic compilation/matching/selection, the synthetic garment reference fixture, and capability-evidence projection. It imports existing Warden, River, Synnergyze controlled-execution, effect-verification, and reconciliation boundaries; it does not duplicate them.

**Tech Stack:** TypeScript 5.8, Node.js 22, Vitest 3, existing Warden/River/Synnergyze modules.

**Spec:** `docs/superpowers/specs/2026-08-24-work-capability-runtime-r0.1-design.md`

## Global Constraints

- Reuse the existing Warden → River reservation → Synnergyze controlled execution → post-execution observation/effect verification → reconciliation/remedy lineage.
- Work Units contain no preselected assignment.
- Eligibility is fail-closed and precedes deterministic selection.
- Execution must pass through `ControlledExecutionGateV1`.
- Observed performance and formal qualification/capability status remain distinct.
- Exact replay is stable; mutated identity reuse fails closed.
- R0.1 remains synthetic/reference only.
- No live Doddaballapur, worker credential, PLC/MES, payroll, SILK-finality, or marketplace claim.

---

### Task 1: Work/Capability contracts and deterministic compiler

**Files:**
- Create: `modules/work-capability/contracts.ts`
- Create: `modules/work-capability/runtime.ts`
- Create: `modules/work-capability/runtime.test.ts`

**Interfaces:**
- Produces: `compileSyntheticGarmentWorkflowV1`, `resolveCapabilityDemandV1`, `selectCandidateCompositionV1`.
- Produces contract types: `ObjectiveWorkRefV1`, `WorkflowInstanceV1`, `WorkUnitV1`, `CapabilityV1`, `ActorCapabilityProfileV1`, `CapabilityDemandV1`, `CandidateCompositionV1`, `WorkAssignmentV1`, `CapabilityEvidenceV1`, `CapabilityOutcomeV1`.

- [ ] **Step 1: Write the failing compiler test**

```ts
import { describe, expect, it } from "vitest";
import { compileSyntheticGarmentWorkflowV1 } from "./runtime.ts";

describe("WORK-CAPABILITY-RUNTIME-001 compiler", () => {
  it("compiles at least ten unassigned work units for the garment reference objective", () => {
    const result = compileSyntheticGarmentWorkflowV1({
      objectiveRef: "OBJECTIVE:B124",
      principalRef: "ORG:DDB-01",
      requiredEffectRef: "EFFECT:B124:500-ACCEPTED",
      deadline: "2026-08-30T18:00:00+05:30",
    });

    expect(result.workUnits.length).toBeGreaterThanOrEqual(10);
    expect(result.workUnits.every((unit) => !("assignmentRef" in unit))).toBe(true);
    expect(result.workUnits.some((unit) => unit.action === "attach_waistband")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: FAIL because `./runtime.ts` does not yet export `compileSyntheticGarmentWorkflowV1`.

- [ ] **Step 3: Implement the minimum contracts/compiler**

Implement exact discriminated actor classes `HUMAN | AGENT | MACHINE | INSTITUTION`, capability-demand states `COVERED | CONSTRAINED | MISSING`, and a deterministic 10+ Work Unit garment workflow including `attach_waistband`.

- [ ] **Step 4: Re-run focused test and verify GREEN**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/work-capability/contracts.ts modules/work-capability/runtime.ts modules/work-capability/runtime.test.ts
git commit -m "feat(work-capability): add R0.1 contracts and compiler"
```

### Task 2: Capability debt and deterministic composition selection

**Files:**
- Modify: `modules/work-capability/runtime.ts`
- Modify: `modules/work-capability/runtime.test.ts`

**Interfaces:**
- Consumes: `CapabilityDemandV1`, `CandidateCompositionV1` from Task 1.
- Produces: `resolveCapabilityDemandV1(...)` and `selectCandidateCompositionV1(...)`.

- [ ] **Step 1: Write failing tests for missing capability and deterministic selection**

```ts
it("returns MISSING capability debt without fabricating a candidate", () => {
  const result = resolveCapabilityDemandV1({
    workUnit: waistbandWorkUnit,
    capabilities: [],
    candidates: [],
  });
  expect(result.state).toBe("MISSING");
  expect(result.candidateCompositionRefs).toEqual([]);
});

it("selects only eligible compositions by evidence, quality, cycle time, then ref", () => {
  const selected = selectCandidateCompositionV1([
    { ...candidateA, eligible: true, evidenceConfidence: 0.95, expectedFirstPassQuality: 0.98, expectedCycleSeconds: 44 },
    { ...candidateB, eligible: true, evidenceConfidence: 0.97, expectedFirstPassQuality: 0.98, expectedCycleSeconds: 45 },
  ]);
  expect(selected?.compositionRef).toBe(candidateB.compositionRef);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: FAIL because demand resolution/selection behavior is not implemented.

- [ ] **Step 3: Implement minimum matching/selection**

Hard-match explicit capability refs and context constraints. Never synthesize candidates. Sort eligible candidates by descending evidence confidence, descending expected first-pass quality, ascending cycle seconds, ascending composition ref.

- [ ] **Step 4: Re-run focused test and verify GREEN**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/work-capability/runtime.ts modules/work-capability/runtime.test.ts
git commit -m "feat(work-capability): resolve capability debt and composition selection"
```

### Task 3: Synthetic garment human-agent-machine execution fixture

**Files:**
- Create: `modules/work-capability/fixtures/garment.ts`
- Modify: `modules/work-capability/runtime.ts`
- Modify: `modules/work-capability/runtime.test.ts`

**Interfaces:**
- Consumes: existing `ControlledExecutionGateV1`, Warden decision/checkpoint types, River reservation/action envelope types, and `EffectVerificationServiceV1`.
- Produces: `SyntheticGarmentWorkAdapterV1`, `observeSyntheticGarmentWorkV1`, `executeAssignedWorkUnitV1`.

- [ ] **Step 1: Write failing test for a human+agent+machine assignment**

```ts
it("executes P17 + M04 + A2 only through the controlled execution gate", () => {
  const proof = executeAssignedWorkUnitV1(validWaistbandFixture());
  expect(proof.assignment.actorRefs).toEqual([
    "HUMAN:OPERATOR-P17",
    "AGENT:WORK-INSTRUCTION-A2",
    "MACHINE:LOCKSTITCH-M04",
  ]);
  expect(proof.execution.state).toBe("EXECUTED_UNVERIFIED");
  expect(proof.execution.capabilityRef).toBe("garment.waistband.attach");
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: FAIL because the fixture adapter/execution wrapper does not exist.

- [ ] **Step 3: Implement the synthetic fixture using existing execution primitives**

The fixture must construct a Work-bound Warden request/action lineage, obtain/use a current synthetic `ALLOW`, River reservation, valid execution checkpoint, and then call `ControlledExecutionGateV1`. The garment adapter may mutate only an in-memory batch state fixture.

- [ ] **Step 4: Add DENY/ESCALATE fail-closed tests**

```ts
it.each(["DENY", "ESCALATE"] as const)("does not assign or execute when Warden returns %s", (decision) => {
  expect(() => executeAssignedWorkUnitV1(invalidWardenFixture(decision))).toThrow();
});
```

- [ ] **Step 5: Re-run focused tests and verify GREEN**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/work-capability/fixtures/garment.ts modules/work-capability/runtime.ts modules/work-capability/runtime.test.ts
git commit -m "feat(work-capability): execute governed garment composition"
```

### Task 4: Verified effect, partial effect, and capability evidence

**Files:**
- Modify: `modules/work-capability/contracts.ts`
- Modify: `modules/work-capability/runtime.ts`
- Modify: `modules/work-capability/fixtures/garment.ts`
- Modify: `modules/work-capability/runtime.test.ts`

**Interfaces:**
- Consumes: existing post-execution observation and `EffectVerificationServiceV1`.
- Produces: `projectCapabilityEvidenceV1(...)`, `reconcileWorkUnitOutcomeV1(...)`, `RemainingWorkProposalV1`.

- [ ] **Step 1: Write failing success-evidence test**

```ts
it("projects actor and composite capability evidence only from verified effect lineage", () => {
  const result = runVerifiedWaistbandFixture({ inputQuantity: 500, acceptedQuantity: 490, reworkQuantity: 10 });
  expect(result.verification.state).toBe("VERIFIED_EFFECT");
  expect(result.capabilityEvidence.some((item) => item.actorOrCompositionRef === "HUMAN:OPERATOR-P17")).toBe(true);
  expect(result.capabilityEvidence.some((item) => item.actorOrCompositionRef === "COMPOSITION:P17-M04-A2")).toBe(true);
  expect(result.capabilityEvidence.every((item) => item.executionReceiptRef === result.execution.receiptRef)).toBe(true);
});
```

- [ ] **Step 2: Write failing partial-effect/recompilation test**

```ts
it("keeps a quantity shortfall open and proposes the exact remaining quantity", () => {
  const result = runVerifiedWaistbandFixture({ inputQuantity: 500, acceptedQuantity: 487, reworkQuantity: 6 });
  expect(result.outcome.state).toBe("PARTIAL_EFFECT");
  expect(result.remainingWork?.remainingQuantity).toBe(7);
});
```

- [ ] **Step 3: Run focused test and verify RED**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: FAIL because capability-evidence projection and partial-effect reconciliation are missing.

- [ ] **Step 4: Implement minimum evidence/outcome logic**

Require `VERIFIED_EFFECT` before capability evidence projection. Bind every evidence item to capability, actor/composition, Work Unit, execution receipt, verified effect, observed performance, evidence refs, observation time, and `synthetic: true`. Return `FULL_EFFECT | PARTIAL_EFFECT | FAILED_EFFECT`; for a quantity shortfall return an exact `remainingQuantity` proposal and do not auto-execute it.

- [ ] **Step 5: Re-run focused test and verify GREEN**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/work-capability/contracts.ts modules/work-capability/runtime.ts modules/work-capability/fixtures/garment.ts modules/work-capability/runtime.test.ts
git commit -m "feat(work-capability): verify outcomes and project capability evidence"
```

### Task 5: Replay/conflict safety and repository gate

**Files:**
- Modify: `modules/work-capability/runtime.ts`
- Modify: `modules/work-capability/runtime.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes all previous Task interfaces.
- Produces focused command `npm run test:work-capability`.

- [ ] **Step 1: Write failing replay/conflict tests**

```ts
it("returns stable exact replay without second execution", () => {
  const runtime = createWorkCapabilityRuntimeV1();
  const first = runtime.run(validWaistbandFixture());
  const second = runtime.run(validWaistbandFixture());
  expect(second.execution.receiptRef).toBe(first.execution.receiptRef);
  expect(second.execution.idempotentReplay).toBe(true);
});

it("fails closed when an existing work or assignment identity is reused with changed material input", () => {
  const runtime = createWorkCapabilityRuntimeV1();
  runtime.run(validWaistbandFixture());
  expect(() => runtime.run(mutatedWaistbandFixture())).toThrow("work_capability_idempotency_conflict");
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npx vitest run modules/work-capability/runtime.test.ts`
Expected: FAIL until the Work/Assignment fingerprint store exists.

- [ ] **Step 3: Implement fingerprinted replay/conflict guard**

Fingerprint objective/work/assignment/composition/capability/target/material quantities and the existing Warden/River execution lineage. Exact replay returns stored output; changed material input under the same identity throws `work_capability_idempotency_conflict` before a second adapter execution.

- [ ] **Step 4: Add focused package script**

Add exactly:

```json
"test:work-capability": "vitest run modules/work-capability/runtime.test.ts"
```

- [ ] **Step 5: Run focused and repository gates**

Run in order:

```bash
npm run test:work-capability
npm run type-check
npm run lint
npm test -- --run
```

Expected: all PASS on the same exact head.

- [ ] **Step 6: Commit**

```bash
git add modules/work-capability/runtime.ts modules/work-capability/runtime.test.ts package.json
git commit -m "test(work-capability): close replay and repository acceptance gates"
```

## Final acceptance review

- [ ] Confirm the garment workflow fixture contains at least 10 Work Units.
- [ ] Confirm HUMAN, AGENT, MACHINE profiles and a three-actor composition are exercised.
- [ ] Confirm one `MISSING` capability-debt case is tested.
- [ ] Confirm no Warden non-ALLOW path reaches assignment/execution.
- [ ] Confirm execution receipt remains the existing `EXECUTED_UNVERIFIED` type before observation.
- [ ] Confirm capability evidence is produced only after verified effect lineage exists.
- [ ] Confirm partial effect remains open and emits a remaining-work proposal.
- [ ] Confirm no formal human qualification is auto-promoted.
- [ ] Confirm exact replay does not call the adapter twice.
- [ ] Confirm mutated identity reuse fails closed.
- [ ] Confirm focused test, type-check, lint, and full test suite pass on one exact commit.
