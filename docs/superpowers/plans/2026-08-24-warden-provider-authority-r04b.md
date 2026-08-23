# Warden Provider Authority R0.4-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate provider-authority, uncertain-effect recovery, reconciliation, replay protection, evidence integrity, and compensation lineage into the existing Warden → River → Synnergyze execution path.

**Architecture:** Extend existing contracts rather than creating parallel Warden, River, execution, or reconciliation engines. Provider authority is checked before controlled execution; provider attempts remain children of the existing execution receipt; uncertain effects are routed through `ReconciliationFabricV1`; remedies remain proposals requiring fresh Warden authority unless explicitly pre-authorized by a future contract.

**Tech Stack:** TypeScript 5.8, Node 22, Vitest 3, existing Warden/River/Synnergyze modules.

**Spec:** `WARDEN-PROVIDER-AUTHORITY-BRIDGE-001 R0.4-B` from the 2026-08-24 design sequence.

## Global Constraints

- No parallel Warden authority engine.
- No parallel River evidence store.
- Reuse `ControlledExecutionGateV1`, `EffectVerificationServiceV1`, and `ReconciliationFabricV1`.
- Provider credentials and bearer tokens are never persisted in River receipts.
- Provider execution fails closed on expired/revoked authority, principal mismatch, purpose/capability drift, or provider mismatch.
- Unknown external effect is never blindly retried; reconciliation is mandatory first.
- Same effect/idempotency key plus mutated governed intent fails closed.
- Compensation is a second governed execution, not mutation of the original execution.

---

### Task 1: Provider authority contracts and gate

**Files:**
- Create: `modules/provider-authority/contracts.ts`
- Create: `modules/provider-authority/runtime.ts`
- Test: `modules/provider-authority/runtime.test.ts`

**Interfaces:**
- Consumes: existing Warden decision/checkpoint lineage and Synnergyze action identity.
- Produces: `ProviderAuthorityGrantV1`, `ProviderPrincipalBindingV1`, `ProviderExecutionRequestV1`, `validateProviderAuthorityV1()`.

- [ ] **Step 1: Write failing tests A-C**

Cover valid authority, wrong AgentMe/provider binding, and expired authority before retry. Assert provider code is not invoked on rejected authority.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/runtime.test.ts`
Expected: FAIL because provider-authority runtime does not exist.

- [ ] **Step 3: Implement minimal authority contracts and gate**

Implement strict equality for delegated agent, capability, purpose, provider, and validity window. Do not resolve provider credentials here.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/runtime.test.ts`
Expected: A-C PASS.

### Task 2: Provider attempts, failure classification, and recovery decisions

**Files:**
- Modify: `modules/provider-authority/contracts.ts`
- Modify: `modules/provider-authority/runtime.ts`
- Modify: `modules/provider-authority/runtime.test.ts`

**Interfaces:**
- Produces: `ProviderAttemptV1`, `ProviderExceptionV1`, `classifyProviderFailureV1()`, `determineProviderRecoveryV1()`.

- [ ] **Step 1: Write failing tests D-H**

Cover timeout-after-send with effect present, transient credential failure, IAM/provider denial, identity/context mismatch, and timeout with no external effect.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/runtime.test.ts`
Expected: D-H FAIL for missing classification/recovery behavior.

- [ ] **Step 3: Implement minimal classification**

Map unknown effects to `RECONCILE_FIRST`; transient credential failures with no effect to bounded `RETRY`; provider denial to `ABORT`; identity mismatch to `CONTAIN`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/runtime.test.ts`
Expected: A-H PASS.

### Task 3: Bind provider uncertain effects to existing ReconciliationFabricV1

**Files:**
- Create: `modules/provider-authority/reconciliation-bridge.ts`
- Test: `modules/provider-authority/reconciliation-bridge.test.ts`
- Modify only if required by a failing integration test: `modules/synnergyze/reconciliation-fabric.ts`

**Interfaces:**
- Consumes: existing `ExpectedEffectContractV1`, execution receipt, observation, verification, seal, causal trace.
- Produces: provider recovery interpretation without replacing `ReconciliationFabricV1` classifications.

- [ ] **Step 1: Write failing bridge tests**

Prove effect-present timeout resolves to existing `MATCH` and suppresses retry; no-effect timeout resolves to existing missing-effect recovery proposal; evidence insufficiency cannot close.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/reconciliation-bridge.test.ts`
Expected: FAIL because bridge does not exist.

- [ ] **Step 3: Implement bridge**

Translate provider exception context into the existing reconciliation inputs/outputs. Preserve existing requirement that remedies are proposals with `requiresFreshWardenDecision: true` and `authorized: false`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/reconciliation-bridge.test.ts modules/synnergyze/effect-verification.test.ts`
Expected: PASS.

### Task 4: Replay, evidence integrity, and compensation lineage

**Files:**
- Modify: `modules/provider-authority/runtime.ts`
- Modify: `modules/provider-authority/runtime.test.ts`

**Interfaces:**
- Produces exact-replay reuse, mutated-intent conflict, request/response digest verification, and compensation parent/original execution references.

- [ ] **Step 1: Write failing tests I-N**

Cover partial-effect compensation proposal, exact replay, mutated-intent conflict, evidence hash tampering, failed-compensation secondary exception lineage, and revoked Warden authority despite still-valid external OAuth.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/runtime.test.ts`
Expected: new tests FAIL for missing behavior.

- [ ] **Step 3: Implement minimal behavior**

Use stable governed-intent digest; never persist credential material; require fresh authority for compensation execution; preserve parent exception and original/compensation execution IDs.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/runtime.test.ts`
Expected: A-N PASS.

### Task 5: Repository integration verification

**Files:**
- Modify: `package.json` to add `test:provider-authority` only after focused suite exists.

**Interfaces:**
- Produces repository-level verification evidence.

- [ ] **Step 1: Add focused test script**

`"test:provider-authority": "vitest run modules/provider-authority/runtime.test.ts modules/provider-authority/reconciliation-bridge.test.ts"`

- [ ] **Step 2: Run focused suite**

Run: `npm run test:provider-authority`
Expected: PASS.

- [ ] **Step 3: Run existing critical lineage suites**

Run: `npm run test:warden-decision && npm run test:river-reservation && npm run test:controlled-execution && npm run test:effect-verification && npm run test:reconciliation-conformance`
Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run: `npm run type-check && npm run lint && npm test -- --run`
Expected: all commands exit 0.

- [ ] **Step 5: Inspect diff and publish only scoped files**

Confirm no unrelated files are changed. Create a draft PR against `genesis` only after fresh verification evidence is available.
