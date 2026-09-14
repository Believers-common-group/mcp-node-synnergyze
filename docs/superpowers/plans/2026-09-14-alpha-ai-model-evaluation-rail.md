# Alpha AI Model Evaluation Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the conformance-only Alpha AI Model Evaluation Rail (`ALPHA-AI-EVAL-RAIL-001`) inside `mcp-node-synnergyze` so model/protocol identity, Warden authorization, deterministic planning, synthetic execution, River evidence, scoring, finalization and capability-scoped qualification can be proven fail-closed before any live model or external GPU activation.

**Architecture:** The implementation is a bounded `modules/ai-eval` runtime slice that reuses the repository's existing Synnergyze/Warden/River contracts instead of creating a second authority path. The rail is synthetic/conformance-only in v0.1: Registry-like immutable identity services live in-memory for deterministic tests, Warden decisions are consumed through existing Warden contract types, execution goes through a synthetic adapter, and qualification can be produced only by a finalizer that reconciles all bound digests and evidence.

**Tech Stack:** Node.js 22.x, TypeScript 5.8.x, Vitest 3.1.x, built-in `node:crypto`; no new runtime dependencies.

**Spec:** `Believers-common-group/SynergyzeGovernance/docs/superpowers/specs/2026-09-14-alpha-ai-model-evaluation-rail-design.md`

## Global Constraints

- Preserve `ENTITY ≠ AGENT ≠ LLM ≠ AUTHORITY`.
- Registry/Genesis identity, Warden authority, Synnergyze orchestration and River evidence remain separate boundaries.
- No plaintext secrets in plans, receipts or tests.
- Scheduler/container success must never equal qualification.
- All authoritative record types are append/supersede oriented; do not silently mutate identity-defining fields.
- `E0_SMOKE`, `E1_FUNCTIONAL`, `E2_COMPARATIVE`, `E3_QUALIFICATION` remain distinct.
- `R0`..`R4` risk classification is carried in intent/authority context but does not itself grant authority.
- Only the finalizer may emit a qualified FER, and it must fail closed on any identity/evidence mismatch.
- First release is synthetic/conformance-only and must not call live external providers.
- v0.1 acceptance criterion is the deterministic 12-test conformance packet, not benchmark performance.

---

## File Structure

Create a new focused module tree:

```text
modules/ai-eval/
  contracts.ts                  # all v0.1 record and error/result contracts
  digest.ts                     # canonical JSON + sha256 helpers
  identity-service.ts           # immutable MIR/EPR registration + supersession checks
  identity-service.test.ts
  intent-service.ts             # EIR creation + risk/evaluation-class validation
  intent-service.test.ts
  plan-compiler.ts              # deterministic EPL DAG compiler
  plan-compiler.test.ts
  execution-adapter.ts          # synthetic executor + XAR/attestation
  execution-adapter.test.ts
  artifact-verifier.ts          # model/data/output/scorer/coverage checks
  artifact-verifier.test.ts
  scoring-service.ts            # deterministic synthetic score evidence
  scoring-service.test.ts
  finalizer.ts                  # fail-closed reconciliation + FER/ESR
  finalizer.test.ts
  capability-projection.ts      # rebuildable Capability Card projection
  capability-projection.test.ts
  conformance.test.ts           # T01..T12 end-to-end packet
```

Modify:

```text
package.json
.vsr/repository-components.yaml
```

Do not modify existing Warden or River semantics unless a real type incompatibility is found during implementation. If that occurs, stop and treat it as a separate design review rather than widening this task silently.

---

### Task 1: Define Rail Contracts and Canonical Digests

**Files:**
- Create: `modules/ai-eval/contracts.ts`
- Create: `modules/ai-eval/digest.ts`
- Create: `modules/ai-eval/contracts.test.ts`

**Interfaces:**
- Produces: `ModelIdentityRecordV1`, `EvaluationProtocolRecordV1`, `EvaluationIntentRecordV1`, `EvaluationAuthorityRecordV1`, `EvaluationPlanV1`, `ExecutionAttemptRecordV1`, `ScoreEvidenceRecordV1`, `FinalEvaluationRecordV1`, `ExceptionSupersessionRecordV1`, `EvaluationFailureCodeV1`, `EvaluationClassV1`, `EvaluationRiskClassV1`, `QualificationStateV1`, `canonicalJsonV1(value)`, `sha256DigestV1(value)`.
- Consumers: all later tasks.

- [ ] **Step 1: Write the failing contract/digest tests**

```ts
import { describe, expect, it } from "vitest";
import { canonicalJsonV1, sha256DigestV1 } from "./digest.ts";
import type { QualificationStateV1 } from "./contracts.ts";

describe("ALPHA-AI-EVAL-RAIL-001 contracts", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(canonicalJsonV1({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("produces stable sha256-prefixed digests", () => {
    expect(sha256DigestV1({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256DigestV1({ a: 1 })).toBe(sha256DigestV1({ a: 1 }));
  });

  it("supports the six frozen qualification states", () => {
    const states: QualificationStateV1[] = [
      "UNQUALIFIED",
      "PARTIALLY_QUALIFIED",
      "QUALIFIED_RESEARCH",
      "QUALIFIED_STAGING",
      "QUALIFIED_PRODUCTION",
      "REVOKED",
    ];
    expect(states).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npx vitest run modules/ai-eval/contracts.test.ts
```

Expected: FAIL because `contracts.ts` and `digest.ts` do not exist.

- [ ] **Step 3: Implement canonical digest helper**

`modules/ai-eval/digest.ts`:

```ts
import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
}

export function canonicalJsonV1(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256DigestV1(value: unknown): string {
  const hex = createHash("sha256").update(canonicalJsonV1(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}
```

- [ ] **Step 4: Implement the frozen v0.1 contracts**

`modules/ai-eval/contracts.ts` must define exactly these core unions:

```ts
export type EvaluationClassV1 = "E0_SMOKE" | "E1_FUNCTIONAL" | "E2_COMPARATIVE" | "E3_QUALIFICATION";
export type EvaluationRiskClassV1 = "R0" | "R1" | "R2" | "R3" | "R4";
export type QualificationStateV1 =
  | "UNQUALIFIED"
  | "PARTIALLY_QUALIFIED"
  | "QUALIFIED_RESEARCH"
  | "QUALIFIED_STAGING"
  | "QUALIFIED_PRODUCTION"
  | "REVOKED";

export type EvaluationFailureCodeV1 =
  | "IDENTITY_MISMATCH"
  | "MODEL_DIGEST_MISMATCH"
  | "DATASET_DIGEST_MISMATCH"
  | "PROTOCOL_MISMATCH"
  | "AUTHORIZATION_EXPIRED"
  | "EXECUTOR_NOT_AUTHORIZED"
  | "RUNTIME_MISMATCH"
  | "INFERENCE_FAILURE"
  | "TIMEOUT"
  | "RESOURCE_EXHAUSTED"
  | "OUTPUT_MISSING"
  | "OUTPUT_CORRUPTED"
  | "COVERAGE_INCOMPLETE"
  | "SCORER_MISMATCH"
  | "SCORING_FAILURE"
  | "AGGREGATE_MISMATCH"
  | "EVIDENCE_INCOMPLETE"
  | "FINALIZATION_FAILURE"
  | "POLICY_DENIED"
  | "OPERATOR_HOLD";
```

Then define record interfaces with explicit refs/digests and no `any` fields. Minimum field sets:

```ts
export interface ModelIdentityRecordV1 {
  modelRef: string;
  architectureRef: string;
  architectureDigest: string;
  checkpointDigest: string;
  tokenizerDigest: string;
  configDigest: string;
  runtimeProfileRefs: readonly string[];
  sourceRefs: readonly string[];
  version: number;
  registeredAt: string;
  supersedes?: string;
}

export interface EvaluationProtocolRecordV1 {
  protocolRef: string;
  benchmarkName: string;
  datasetDigest: string;
  promptDigest: string;
  scorerRef: string;
  scorerDigest: string;
  expectedSamples: number;
  decodingConfigDigest: string;
  version: number;
  registeredAt: string;
  supersedes?: string;
}

export interface EvaluationIntentRecordV1 {
  intentRef: string;
  evaluationRef: string;
  principalRef: string;
  purpose: string;
  modelRef: string;
  referenceModelRef?: string;
  protocolRefs: readonly string[];
  evaluationClass: EvaluationClassV1;
  riskClass: EvaluationRiskClassV1;
  createdAt: string;
  correlationId: string;
}

export interface EvaluationAuthorityRecordV1 {
  authorityRef: string;
  evaluationRef: string;
  wardenDecisionRef: string;
  decision: "ALLOW" | "DENY" | "HOLD";
  modelRefs: readonly string[];
  protocolRefs: readonly string[];
  executorRefs: readonly string[];
  runtimeProfileRefs: readonly string[];
  networkPolicy: "OFFLINE" | "RESTRICTED" | "ALLOWED";
  secretPolicy: "NONE" | "EXECUTION_TIME_ONLY";
  validUntil?: string;
  policyRef: string;
  decidedAt: string;
}
```

Also define EPL/XAR/SER/FER/ESR with all digest lineage required by the spec. FER must include `qualification`, `verificationState: "PASS"`, and `evidenceRootRef`.

- [ ] **Step 5: Run contract tests and type-check**

```bash
npx vitest run modules/ai-eval/contracts.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/ai-eval/contracts.ts modules/ai-eval/digest.ts modules/ai-eval/contracts.test.ts
git commit -m "feat(ai-eval): define rail contracts and canonical digests"
```

---

### Task 2: Implement Immutable MIR/EPR Registration

**Files:**
- Create: `modules/ai-eval/identity-service.ts`
- Create: `modules/ai-eval/identity-service.test.ts`

**Interfaces:**
- Consumes: `ModelIdentityRecordV1`, `EvaluationProtocolRecordV1`, `sha256DigestV1`.
- Produces: `registerModelIdentityV1`, `registerEvaluationProtocolV1`, `InMemoryEvaluationRegistryV1`.

- [ ] **Step 1: Write tests for T01–T04**

Cover:

```ts
it("T01 registers a valid model identity once", ...)
it("T02 rejects conflicting reuse of an immutable modelRef", ...)
it("T03 registers a valid protocol once", ...)
it("T04 requires a new version/ref when protocol identity changes", ...)
```

Use a registry instance created as:

```ts
const registry = new InMemoryEvaluationRegistryV1();
```

Expected duplicate semantics:

- exact replay of the same object is idempotent and returns the existing record;
- same `modelRef` or `protocolRef` with changed identity-defining content returns `{ ok: false, code: "IDENTITY_MISMATCH" }`;
- a changed identity with a new ref and `supersedes` is accepted.

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run modules/ai-eval/identity-service.test.ts
```

Expected: FAIL because service is absent.

- [ ] **Step 3: Implement registry service**

Use private `Map<string, record>` collections and compute an identity digest that excludes non-identity timestamps but includes all material model/protocol identity fields.

Required public API:

```ts
export type RegistrationResultV1<T> =
  | { ok: true; record: T; idempotentReplay: boolean }
  | { ok: false; code: "IDENTITY_MISMATCH"; reason: string };

export class InMemoryEvaluationRegistryV1 {
  registerModel(record: ModelIdentityRecordV1): RegistrationResultV1<ModelIdentityRecordV1>;
  registerProtocol(record: EvaluationProtocolRecordV1): RegistrationResultV1<EvaluationProtocolRecordV1>;
  getModel(modelRef: string): ModelIdentityRecordV1 | undefined;
  getProtocol(protocolRef: string): EvaluationProtocolRecordV1 | undefined;
}
```

- [ ] **Step 4: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/identity-service.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/identity-service.ts modules/ai-eval/identity-service.test.ts
git commit -m "feat(ai-eval): add immutable model and protocol registry"
```

---

### Task 3: Add Evaluation Intent Validation and Deterministic Plan Compiler

**Files:**
- Create: `modules/ai-eval/intent-service.ts`
- Create: `modules/ai-eval/intent-service.test.ts`
- Create: `modules/ai-eval/plan-compiler.ts`
- Create: `modules/ai-eval/plan-compiler.test.ts`

**Interfaces:**
- Consumes: MIR/EPR lookup results, EIR, EAR.
- Produces: `createEvaluationIntentV1(input)`, `compileEvaluationPlanV1(input)`.

- [ ] **Step 1: Write intent validation tests**

Validate:

```ts
expect(createEvaluationIntentV1({ ...valid, protocolRefs: [] })).toMatchObject({ ok: false });
expect(createEvaluationIntentV1(valid)).toMatchObject({ ok: true });
```

Rules:
- at least one protocol;
- `E2_COMPARATIVE` requires `referenceModelRef`;
- `E3_QUALIFICATION` cannot use `R0`;
- all refs/correlation ID must be non-empty.

- [ ] **Step 2: Write plan compiler tests**

Required behaviors:

```ts
it("T05 denies plan compilation when authority is not ALLOW", ...)
it("T06 denies plan compilation when authority has expired", ...)
it("is deterministic for identical identity/authority input", ...)
it("emits the frozen eight-step DAG in order", ...)
it("never embeds secret values", ...)
```

Frozen task order:

```ts
[
  "VERIFY_MODEL",
  "VERIFY_ASSETS",
  "ATTEST_ENVIRONMENT",
  "RUN_INFERENCE",
  "VERIFY_ARTIFACTS",
  "SCORE",
  "RECONCILE",
  "FINALIZE",
]
```

- [ ] **Step 3: Run and verify failure**

```bash
npx vitest run modules/ai-eval/intent-service.test.ts modules/ai-eval/plan-compiler.test.ts
```

- [ ] **Step 4: Implement intent service**

Return discriminated results:

```ts
export type EvaluationIntentResultV1 =
  | { ok: true; intent: EvaluationIntentRecordV1 }
  | { ok: false; code: "INVALID_INTENT"; reason: string };
```

Do not authorize anything in this function.

- [ ] **Step 5: Implement deterministic plan compiler**

Required API:

```ts
export type EvaluationPlanCompileResultV1 =
  | { ok: true; plan: EvaluationPlanV1 }
  | { ok: false; code: "POLICY_DENIED" | "AUTHORIZATION_EXPIRED" | "PROTOCOL_MISMATCH" | "IDENTITY_MISMATCH"; reason: string };

export function compileEvaluationPlanV1(input: {
  intent: EvaluationIntentRecordV1;
  authority: EvaluationAuthorityRecordV1;
  model: ModelIdentityRecordV1;
  protocols: readonly EvaluationProtocolRecordV1[];
  compiledAt: string;
}): EvaluationPlanCompileResultV1;
```

The plan digest must exclude `compiledAt` from identity so recompilation time does not change the logical plan identity. The emitted plan still records `compiledAt` for evidence.

- [ ] **Step 6: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/intent-service.test.ts modules/ai-eval/plan-compiler.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/ai-eval/intent-service.ts modules/ai-eval/intent-service.test.ts modules/ai-eval/plan-compiler.ts modules/ai-eval/plan-compiler.test.ts
git commit -m "feat(ai-eval): add intent validation and deterministic plan compiler"
```

---

### Task 4: Bind the Existing Warden Boundary Without Reimplementing Warden

**Files:**
- Create: `modules/ai-eval/warden-bridge.ts`
- Create: `modules/ai-eval/warden-bridge.test.ts`

**Interfaces:**
- Consumes: existing `WardenDecisionV1` and `WardenExecutionCheckpointV1` from `modules/warden/contracts.ts`.
- Produces: `toEvaluationAuthorityRecordV1(input)`.

- [ ] **Step 1: Write tests**

Required cases:

```ts
it("maps Warden ALLOW to evaluation ALLOW authority", ...)
it("maps Warden DENY to evaluation DENY authority", ...)
it("maps Warden ESCALATE to HOLD rather than ALLOW", ...)
it("does not carry the Warden actionToken into the EAR", ...)
it("rejects a checkpoint that is REVOKED, EXPIRED or SUPERSEDED", ...)
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/ai-eval/warden-bridge.test.ts
```

- [ ] **Step 3: Implement the bridge**

Required API:

```ts
export function toEvaluationAuthorityRecordV1(input: {
  evaluationRef: string;
  decision: WardenDecisionV1;
  checkpoint: WardenExecutionCheckpointV1;
  modelRefs: readonly string[];
  protocolRefs: readonly string[];
  executorRefs: readonly string[];
  runtimeProfileRefs: readonly string[];
  networkPolicy: "OFFLINE" | "RESTRICTED" | "ALLOWED";
  secretPolicy: "NONE" | "EXECUTION_TIME_ONLY";
  policyRef: string;
}):
  | { ok: true; authority: EvaluationAuthorityRecordV1 }
  | { ok: false; code: "AUTHORIZATION_EXPIRED" | "POLICY_DENIED"; reason: string };
```

Never persist `actionToken` in the EAR.

- [ ] **Step 4: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/warden-bridge.test.ts
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/warden-bridge.ts modules/ai-eval/warden-bridge.test.ts
git commit -m "feat(ai-eval): bind evaluation authority to Warden contracts"
```

---

### Task 5: Implement the Synthetic Executor Boundary and XAR

**Files:**
- Create: `modules/ai-eval/execution-adapter.ts`
- Create: `modules/ai-eval/execution-adapter.test.ts`

**Interfaces:**
- Consumes: `EvaluationPlanV1`, `EvaluationAuthorityRecordV1`.
- Produces: `SyntheticEvaluationExecutorV1`, `ExecutionAttemptRecordV1`, artifact refs/attestation.

- [ ] **Step 1: Write tests**

Required cases:

```ts
it("T07 executes a valid synthetic plan and returns EXECUTION_FINISHED", ...)
it("rejects an executor not named in EAR.executorRefs", ...)
it("rejects a runtime profile outside EAR.runtimeProfileRefs", ...)
it("does not mark an execution attempt as qualified", ...)
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/ai-eval/execution-adapter.test.ts
```

- [ ] **Step 3: Implement the executor**

Required interface:

```ts
export interface EvaluationExecutorV1 {
  readonly executorRef: string;
  prepare(plan: EvaluationPlanV1): Promise<void>;
  execute(plan: EvaluationPlanV1): Promise<ExecutionAttemptRecordV1>;
  observe(attempt: ExecutionAttemptRecordV1): Promise<readonly string[]>;
  collect(attempt: ExecutionAttemptRecordV1): Promise<readonly string[]>;
  terminate(attemptRef: string): Promise<void>;
  attest(attempt: ExecutionAttemptRecordV1): Promise<string>;
}
```

Implement `SyntheticEvaluationExecutorV1` only. It must generate deterministic synthetic artifact refs from the plan digest and attempt number; it must not call network/cloud/GPU providers.

- [ ] **Step 4: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/execution-adapter.test.ts
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/execution-adapter.ts modules/ai-eval/execution-adapter.test.ts
git commit -m "feat(ai-eval): add synthetic evaluation executor boundary"
```

---

### Task 6: Implement Artifact Verification and Score Evidence

**Files:**
- Create: `modules/ai-eval/artifact-verifier.ts`
- Create: `modules/ai-eval/artifact-verifier.test.ts`
- Create: `modules/ai-eval/scoring-service.ts`
- Create: `modules/ai-eval/scoring-service.test.ts`

**Interfaces:**
- Consumes: MIR, EPR, XAR and synthetic artifact manifest.
- Produces: verified artifact result and `ScoreEvidenceRecordV1`.

- [ ] **Step 1: Write artifact verifier tests for T08–T10**

Required cases:

```ts
it("T08 rejects a corrupted model digest", ...)
it("T09 rejects incomplete prediction coverage", ...)
it("T10 rejects an altered scorer identity", ...)
it("accepts exact model/data/runtime/scorer/coverage matches", ...)
```

Define a local manifest shape in `artifact-verifier.ts`:

```ts
export interface EvaluationArtifactManifestV1 {
  modelDigest: string;
  datasetDigest: string;
  runtimeDigest: string;
  scorerDigest: string;
  predictionDigest: string;
  sampleCount: number;
  outputRefs: readonly string[];
}
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/ai-eval/artifact-verifier.test.ts
```

- [ ] **Step 3: Implement verifier**

Return only one of:

```ts
{ ok: true; verificationDigest: string }
{ ok: false; code: EvaluationFailureCodeV1; reason: string }
```

Check model, dataset, runtime, scorer, outputs and coverage in that order so the first failure is deterministic.

- [ ] **Step 4: Write scoring tests**

Required behavior:

```ts
it("creates deterministic SER from bound prediction evidence", ...)
it("never accepts an externally supplied aggregate without recomputation", ...)
```

For synthetic v0.1 scoring, use a deterministic exact-match metric derived from an array of booleans or 0/1 values supplied by the test harness. Do not introduce a real benchmark scorer yet.

- [ ] **Step 5: Implement scoring service**

Required API:

```ts
export function scoreSyntheticEvaluationV1(input: {
  evaluationRef: string;
  protocol: EvaluationProtocolRecordV1;
  predictionDigest: string;
  sampleResults: readonly boolean[];
  scoredAt: string;
}): ScoreEvidenceRecordV1;
```

Store `correct`, `total`, `accuracy`, `predictionDigest`, `scorerDigest`, and a derived `aggregateDigest`.

- [ ] **Step 6: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/artifact-verifier.test.ts modules/ai-eval/scoring-service.test.ts
npm run type-check
```

- [ ] **Step 7: Commit**

```bash
git add modules/ai-eval/artifact-verifier.ts modules/ai-eval/artifact-verifier.test.ts modules/ai-eval/scoring-service.ts modules/ai-eval/scoring-service.test.ts
git commit -m "feat(ai-eval): verify artifacts and produce score evidence"
```

---

### Task 7: Add River Event Construction for Evaluation Evidence

**Files:**
- Create: `modules/ai-eval/river-events.ts`
- Create: `modules/ai-eval/river-events.test.ts`

**Interfaces:**
- Consumes: existing `EventEnvelopeV1` / `EventReceiptV1` contract shapes from `modules/river/contracts.ts`.
- Produces: `buildEvaluationEventV1` and the frozen event-name union.

- [ ] **Step 1: Write tests**

Required cases:

```ts
it("builds deterministic River-compatible event envelopes", ...)
it("links predecessor event refs into a causal chain", ...)
it("supports only frozen alpha.ai.eval.* event names", ...)
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/ai-eval/river-events.test.ts
```

- [ ] **Step 3: Implement the event builder**

Define:

```ts
export type EvaluationEventTypeV1 =
  | "alpha.ai.eval.intent.created"
  | "alpha.ai.eval.model.registered"
  | "alpha.ai.eval.protocol.registered"
  | "alpha.ai.eval.authorization.requested"
  | "alpha.ai.eval.authorization.allowed"
  | "alpha.ai.eval.authorization.denied"
  | "alpha.ai.eval.plan.compiled"
  | "alpha.ai.eval.plan.validated"
  | "alpha.ai.eval.execution.started"
  | "alpha.ai.eval.execution.heartbeat"
  | "alpha.ai.eval.execution.completed"
  | "alpha.ai.eval.execution.failed"
  | "alpha.ai.eval.artifact.received"
  | "alpha.ai.eval.artifact.verified"
  | "alpha.ai.eval.artifact.rejected"
  | "alpha.ai.eval.scoring.started"
  | "alpha.ai.eval.scoring.completed"
  | "alpha.ai.eval.scoring.failed"
  | "alpha.ai.eval.finalization.started"
  | "alpha.ai.eval.finalization.failed"
  | "alpha.ai.eval.finalization.passed"
  | "alpha.ai.eval.qualification.granted"
  | "alpha.ai.eval.qualification.rejected"
  | "alpha.ai.eval.qualification.held"
  | "alpha.ai.eval.result.superseded"
  | "alpha.ai.eval.result.revoked";
```

`buildEvaluationEventV1` must hash only the payload to `payloadDigest`; it must not store arbitrary payload blobs in the River contract.

- [ ] **Step 4: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/river-events.test.ts
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/river-events.ts modules/ai-eval/river-events.test.ts
git commit -m "feat(ai-eval): add River-compatible evaluation event lineage"
```

---

### Task 8: Implement Fail-Closed Finalizer and FER/ESR

**Files:**
- Create: `modules/ai-eval/finalizer.ts`
- Create: `modules/ai-eval/finalizer.test.ts`

**Interfaces:**
- Consumes: MIR, EPR, EAR, EPL, XAR, verified artifact digest, SER, River event/receipt refs.
- Produces: `FinalEvaluationRecordV1` on success or `ExceptionSupersessionRecordV1` on failure.

- [ ] **Step 1: Write the finalizer failure matrix tests**

Required cases:

```ts
it("fails on model identity mismatch", ...)
it("fails on protocol mismatch", ...)
it("fails on expired authority", ...)
it("fails when executor is unauthorized", ...)
it("fails on runtime mismatch", ...)
it("fails when evidence chain is incomplete", ...)
it("T11 rejects a falsified aggregate", ...)
it("T12 emits FER only for a fully reconciled evidence chain", ...)
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/ai-eval/finalizer.test.ts
```

- [ ] **Step 3: Implement the finalizer**

Required API:

```ts
export type FinalizationResultV1 =
  | { ok: true; finalRecord: FinalEvaluationRecordV1 }
  | { ok: false; exception: ExceptionSupersessionRecordV1 };

export function finalizeEvaluationV1(input: {
  model: ModelIdentityRecordV1;
  protocol: EvaluationProtocolRecordV1;
  authority: EvaluationAuthorityRecordV1;
  plan: EvaluationPlanV1;
  attempt: ExecutionAttemptRecordV1;
  verificationDigest: string;
  score: ScoreEvidenceRecordV1;
  riverReceiptRefs: readonly string[];
  finalizedAt: string;
  requestedQualification: Exclude<QualificationStateV1, "REVOKED">;
}): FinalizationResultV1;
```

The function must independently recompute the expected score aggregate digest from SER raw fields rather than trusting `aggregateDigest` as supplied.

The function must reject `QUALIFIED_PRODUCTION` unless the EAR explicitly carries a production policy marker such as `policyRef` ending with `/production`. This keeps production promotion separately authorized in v0.1.

- [ ] **Step 4: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/finalizer.test.ts
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/finalizer.ts modules/ai-eval/finalizer.test.ts
git commit -m "feat(ai-eval): add fail-closed evaluation finalizer"
```

---

### Task 9: Build Rebuildable Capability Card Projection

**Files:**
- Create: `modules/ai-eval/capability-projection.ts`
- Create: `modules/ai-eval/capability-projection.test.ts`

**Interfaces:**
- Consumes: one or more FERs.
- Produces: non-authoritative `CapabilityCardProjectionV1`.

- [ ] **Step 1: Write projection tests**

Required cases:

```ts
it("projects capability-scoped qualification from FERs", ...)
it("keeps NOT_EVALUATED distinct from UNQUALIFIED", ...)
it("does not expose mutation or authority methods", ...)
it("drops revoked/superseded FERs from effective capability state", ...)
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/ai-eval/capability-projection.test.ts
```

- [ ] **Step 3: Implement projection**

Example output shape:

```ts
export interface CapabilityCardProjectionV1 {
  modelRef: string;
  generatedAt: string;
  sourceFerRefs: readonly string[];
  capabilities: readonly {
    capabilityRef: string;
    qualification: QualificationStateV1 | "NOT_EVALUATED";
    protocolRefs: readonly string[];
    runtimeProfileRefs: readonly string[];
  }[];
  authoritative: false;
}
```

- [ ] **Step 4: Run tests/type-check**

```bash
npx vitest run modules/ai-eval/capability-projection.test.ts
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/capability-projection.ts modules/ai-eval/capability-projection.test.ts
git commit -m "feat(ai-eval): project capability cards from final records"
```

---

### Task 10: Add the 12-Test End-to-End Conformance Packet

**Files:**
- Create: `modules/ai-eval/conformance.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: one deterministic `12/12` conformance suite and package script.

- [ ] **Step 1: Write the exact end-to-end packet**

Create one `describe("ALPHA-AI-EVAL-RAIL-001 conformance packet", ...)` with exactly these named tests:

```text
T01 valid model registration
T02 duplicate immutable registration rejected
T03 valid protocol registration
T04 changed protocol creates new version
T05 unauthorized plan execution denied
T06 expired Warden grant denied
T07 correct synthetic execution succeeds
T08 corrupted model digest rejected
T09 incomplete prediction coverage rejected
T10 altered scorer identity rejected
T11 falsified aggregate rejected
T12 clean evidence chain produces FER
```

The T12 fixture must use:

```text
evaluationRef: AEVAL-CONFORMANCE-0001
modelRef: MODEL-CONFORMANCE-0001
protocolRef: EPR-CONFORMANCE-0001
executorRef: EXECUTOR-SYNTHETIC-001
runtimeProfileRef: RUNTIME-SYNTHETIC-001
```

and request `QUALIFIED_RESEARCH` only.

- [ ] **Step 2: Run the packet and confirm all pass**

```bash
npx vitest run modules/ai-eval/conformance.test.ts
```

Expected: `12 passed`.

- [ ] **Step 3: Add package scripts**

Add to `package.json`:

```json
"test:ai-eval": "vitest run modules/ai-eval",
"test:ai-eval:conformance": "vitest run modules/ai-eval/conformance.test.ts"
```

- [ ] **Step 4: Run the complete rail suite**

```bash
npm run test:ai-eval
npm run test:ai-eval:conformance
npm run type-check
npm run lint
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/ai-eval/conformance.test.ts package.json
git commit -m "test(ai-eval): add twelve-test Alpha conformance packet"
```

---

### Task 11: Register the Rail as a Repository Component Without Changing Authority

**Files:**
- Modify: `.vsr/repository-components.yaml`

**Interfaces:**
- Consumes: implemented module paths and governance spec.
- Produces: explicit repository-component declaration for `ALPHA-AI-EVAL-RAIL-001`.

- [ ] **Step 1: Add a component entry**

Append a component with these exact semantics:

```yaml
- component_id: CMP-ALPHA-AI-EVAL-RAIL-001
  network_object: ALPHA-AI-EVAL-RAIL-001
  role: governed-ai-model-evaluation-conformance-runtime
  state: conformance_implemented
  implementation_path: modules/ai-eval
  contract_path: modules/ai-eval/contracts.ts
  depends_on:
    - SYNNERGYZE-RUNTIME-001
    - WARDEN-RUNTIME-001
    - RIVEROS-001
  downstream_boundaries:
    - REGISTRY-CAPABILITY-STATE
  forbidden:
    - create-warden-authority
    - create-river-authority
    - treat-scheduler-success-as-qualification
    - call-live-external-gpu-provider
    - persist-plaintext-secret
    - imply-production-qualification-without-separate-policy
  tests:
    - modules/ai-eval/conformance.test.ts
  activation_gate: synthetic-conformance-only-live-model-evaluation-separately-authorized
  activation_implied: false
```

- [ ] **Step 2: Validate YAML and run tests**

Use the repository's normal YAML parser/CI path if present. At minimum:

```bash
npm run test:ai-eval:conformance
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add .vsr/repository-components.yaml
git commit -m "chore(vsr): register Alpha AI evaluation rail component"
```

---

### Task 12: Final Verification Before Any Live Evaluation Work

**Files:**
- No new source files.
- Review all changed files from Tasks 1–11.

**Interfaces:**
- Produces: evidence that v0.1 is conformance-complete and still non-live.

- [ ] **Step 1: Run focused suite**

```bash
npm run test:ai-eval
```

Expected: PASS.

- [ ] **Step 2: Run the frozen 12-test packet**

```bash
npm run test:ai-eval:conformance
```

Expected: exactly 12 named conformance tests PASS.

- [ ] **Step 3: Run repository checks**

```bash
npm run type-check
npm run lint
npm test -- --run
```

Expected: PASS, or if unrelated pre-existing failures exist, capture the exact failing test names and prove the AI rail suite itself remains green before proceeding.

- [ ] **Step 4: Confirm prohibited capabilities are absent**

Search the diff for cloud SDKs, credentials, external GPU endpoints, live benchmark downloads and plaintext secret fixtures. The expected result is none.

- [ ] **Step 5: Review the four deliberate fail-closed tamper cases**

Re-run or inspect tests proving rejection of:

```text
model digest tamper
coverage tamper
scorer identity tamper
aggregate tamper
```

All four must produce non-qualified failure results.

- [ ] **Step 6: Commit any final documentation-only corrections**

```bash
git add -A
git commit -m "docs(ai-eval): finalize Alpha rail conformance evidence"
```

Only create this commit if a real documentation correction was made; otherwise do not create an empty commit.

---

## Implementation Order Rationale

The plan intentionally builds identity and deterministic planning before execution, then evidence/scoring before finalization. This mirrors the Alpha control invariant already used by the repository: planning remains non-authoritative, Warden authority is consumed rather than recreated, execution is bounded and unverified, effect/evidence is observed separately, and final acceptance happens only after reconciliation.

The first practical release target is therefore not NCP or SMELT. It is a synthetic rail that proves it can reject corrupted evidence. Only after this plan is complete should a second plan introduce `AEVAL-NCP-OLMO-0001` as the first real research evaluation adapter.
