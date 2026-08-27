# Observatory Ecosystem Health R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable, evidence-backed Synnergyze Observatory health compiler without allowing stale or missing evidence to appear healthy.

**Architecture:** Add a focused `modules/observatory` package alongside the existing Synnergyze/Warden/River modules. Keep contracts, deterministic health compilation, and dependency projection separate; integrate only through evidence references and adapter identities so SentinelX remains replaceable and Warden remains the authorization boundary.

**Tech Stack:** TypeScript 5.8, Node 22, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-28-observatory-ecosystem-health-design.md`

## Global Constraints

- Missing or stale evidence MUST NOT compile to `HEALTHY`.
- Desired, observed, derived, inferred, and verified states remain distinct.
- SentinelX host IDs are adapter identities, not canonical Genesis node identities.
- No automatic remediation in R0.1.
- No opaque universal percentage health score.

---

### Task 1: Evidence freshness and dimension health compiler

**Files:**
- Create: `modules/observatory/contracts.ts`
- Create: `modules/observatory/health-compiler.ts`
- Test: `modules/observatory/health-compiler.test.ts`

**Interfaces:**
- Produces `evaluateEvidenceFreshnessV1(observedAt, evaluatedAt, expectedIntervalSeconds)`.
- Produces `compileDimensionHealthV1(input)` returning a typed dimension result with evidence refs, freshness, confidence and health state.

- [ ] **Step 1: Write the failing test** proving missing and stale evidence cannot return `HEALTHY`.
- [ ] **Step 2: Run** `npx vitest run modules/observatory/health-compiler.test.ts` and verify RED because the compiler module does not exist.
- [ ] **Step 3: Implement contracts and the minimal deterministic compiler.**
- [ ] **Step 4: Re-run the focused test and verify GREEN.**
- [ ] **Step 5: Run** `npm run type-check` and the full `npm test -- --run` suite.

### Task 2: Multi-dimensional subject profile

**Files:**
- Modify: `modules/observatory/contracts.ts`
- Modify: `modules/observatory/health-compiler.ts`
- Modify: `modules/observatory/health-compiler.test.ts`

**Interfaces:**
- Produces `compileSubjectHealthProfileV1(subject, dimensionInputs, evaluatedAt)`.
- Summary state is deterministic from dimension states; dimension results remain preserved in full.

- [ ] **Step 1: Add failing tests** for fresh healthy evidence, critical negative evidence, and a subject with one stale dimension.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement the minimal profile compiler.**
- [ ] **Step 4: Re-run focused tests and verify GREEN.**
- [ ] **Step 5: Run type-check and full tests.**

### Task 3: Dependency impact projection

**Files:**
- Create: `modules/observatory/dependency-compiler.ts`
- Create: `modules/observatory/dependency-compiler.test.ts`

**Interfaces:**
- Produces `projectDependencyImpactV1(upstreamProfile, dependency, evaluatedAt)`.
- Output labels the downstream condition `DERIVED` and any root cause `SUSPECTED`, never `VERIFIED`.

- [ ] **Step 1: Add a failing test** where a critical database profile projects a degraded API dependency while preserving upstream evidence refs.
- [ ] **Step 2: Run focused test and verify RED.**
- [ ] **Step 3: Implement minimal dependency projection.**
- [ ] **Step 4: Re-run focused test and verify GREEN.**
- [ ] **Step 5: Run type-check and full tests.**

### Task 4: SentinelX observation adapter contract

**Files:**
- Create: `modules/observatory/sentinelx-adapter.ts`
- Create: `modules/observatory/sentinelx-adapter.test.ts`

**Interfaces:**
- Produces `projectSentinelXHostObservationV1(input)` mapping adapter host data to an Observatory observation.
- Requires both `genesisSubjectRef` and `sentinelxHostRef`; does not treat them as interchangeable.

- [ ] **Step 1: Add a failing test** proving the SentinelX host reference is retained as adapter lineage while the Genesis subject remains canonical.
- [ ] **Step 2: Run focused test and verify RED.**
- [ ] **Step 3: Implement the minimal adapter projection.**
- [ ] **Step 4: Re-run focused test and verify GREEN.**
- [ ] **Step 5: Run type-check and full tests.**

### Task 5: Package verification

**Files:**
- Modify: `package.json`

**Interfaces:**
- Adds `test:observatory` for the focused Observatory suite.

- [ ] **Step 1: Add the script** `vitest run modules/observatory`.
- [ ] **Step 2: Run** `npm run test:observatory`.
- [ ] **Step 3: Run** `npm run type-check`.
- [ ] **Step 4: Run the full test suite and verify no regressions.**
