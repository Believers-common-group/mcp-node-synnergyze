# Osiris / EFOM Policy Kernel R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed Osiris / EFOM policy-information layer that can inform Warden decisions without creating a second authority plane or bypassing River/Synnergyze execution controls.

**Architecture:** Add focused Osiris contracts and a deterministic policy evaluator, bind their result into the existing Warden decision service, extend River with typed governed evidence artifacts, and add a semantic operation-class guard to runtime authorization. Existing Warden `ALLOW | ESCALATE | DENY`, River reservation, execution checkpoint, containment, and effect-verification flows remain authoritative and unchanged in ownership.

**Tech Stack:** TypeScript 5.8, Node.js 22, Vitest 3.1, existing SHA-256 deterministic identity patterns, existing `modules/warden`, `modules/river`, `modules/synnergyze`, and `modules/genesis-node-builder` contracts.

**Spec:** `docs/superpowers/specs/2026-09-10-osiris-efom-policy-r0-1-design.md`

## Global Constraints

- Warden remains the sole policy decision point and sole source of action tokens.
- Observation is not identity; finding is not decision; discrepancy is not violation; inference is not authority.
- Consequential action still requires Warden `ALLOW`, a valid action token, River evidence reservation, a valid execution checkpoint, matching lineage, device-security checks where applicable, and containment allow.
- Existing `RuntimeEffectClass` values remain unchanged.
- All new Warden request fields are additive and optional at the TypeScript level; strict EFOM semantics activate only when EFOM context is present.
- Malformed or incomplete EFOM context must fail closed.
- Observation, derivation, issuance, decision, execution, and verification times stay distinct.
- Existing non-EFOM behavior must remain green.

---

### Task 1: Add Osiris / EFOM domain contracts

**Files:**
- Create: `modules/osiris/contracts.ts`
- Create: `modules/osiris/contracts.test.ts`

**Interfaces:**
- Produces: `EfomOperationClassV1`, `EfomVisibilityScopeV1`, `EfomObservationV1`, `EfomFindingV1`, `EfomDiscrepancyV1`, `EfomAttestationV1`, `EfomPhysicalWorldContextV1`.
- Consumes: no production modules.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";

import type {
  EfomObservationV1,
  EfomFindingV1,
  EfomPhysicalWorldContextV1,
} from "./contracts.ts";

describe("OSIRIS-EFOM-CONTRACTS-R0-1", () => {
  it("keeps observation and finding as distinct typed objects", () => {
    const observation: EfomObservationV1 = {
      observationRef: "EFOM-OBS:001",
      sourceRef: "SENTINEL-2:TILE-001",
      sourceType: "SATELLITE_OPTICAL",
      subjectCandidateRef: "GEN-NODE-CANDIDATE:001",
      observedAt: "2026-09-10T06:00:00.000Z",
      validUntil: "2026-09-10T12:00:00.000Z",
      contentDigest: "sha256:obs001",
      sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
      confidence: 0.92,
      visibilityScope: "ESTATE",
      purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
    };

    const finding: EfomFindingV1 = {
      findingRef: "EFOM-FINDING:001",
      findingType: "PRESENCE_CORRELATION",
      observationRefs: [observation.observationRef],
      statementDigest: "sha256:finding001",
      confidence: 0.91,
      derivedAt: "2026-09-10T06:05:00.000Z",
      sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
      status: "CORROBORATED",
    };

    const context: EfomPhysicalWorldContextV1 = {
      operationClass: "INFER",
      observations: [observation],
      findings: [finding],
      discrepancies: [],
      attestations: [],
    };

    expect(context.observations[0].observationRef).toBe("EFOM-OBS:001");
    expect(context.findings[0].findingRef).toBe("EFOM-FINDING:001");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run modules/osiris/contracts.test.ts
```

Expected: FAIL because `modules/osiris/contracts.ts` and its exported types do not exist.

- [ ] **Step 3: Add the minimal contracts**

Create `modules/osiris/contracts.ts` with these exact public type names and bounded enums:

```ts
export type EfomOperationClassV1 = "OBSERVE" | "INFER" | "DISCLOSE" | "ATTEST" | "ACT";
export type EfomVisibilityScopeV1 = "PUBLIC" | "NETWORK" | "PARTNER" | "ESTATE" | "REGULATOR" | "EMERGENCY";
export type EfomFindingStatusV1 = "HYPOTHESIS" | "SUPPORTED" | "CONFLICTED" | "CORROBORATED" | "REJECTED" | "SUPERSEDED";

export interface EfomObservationV1 {
  observationRef: string;
  sourceRef: string;
  sourceType: string;
  subjectCandidateRef?: string;
  locationRef?: string;
  terrainClass?: string;
  observedAt: string;
  validUntil?: string;
  contentDigest: string;
  sourceEvidenceRefs: readonly string[];
  confidence: number;
  assuranceLevel?: string;
  visibilityScope: EfomVisibilityScopeV1;
  jurisdictionRef?: string;
  purposeRef: string;
  synthetic?: boolean;
}

export interface EfomFindingV1 {
  findingRef: string;
  findingType: string;
  observationRefs: readonly string[];
  statementDigest: string;
  confidence: number;
  derivedAt: string;
  validUntil?: string;
  sourceEvidenceRefs: readonly string[];
  status: EfomFindingStatusV1;
  supersedesFindingRef?: string;
}

export interface EfomDiscrepancyV1 {
  discrepancyRef: string;
  discrepancyType: string;
  observationRefs: readonly string[];
  findingRefs: readonly string[];
  severity: "INFO" | "REVIEW" | "BLOCKING";
  material: boolean;
  openedAt: string;
  sourceEvidenceRefs: readonly string[];
}

export interface EfomAttestationV1 {
  attestationRef: string;
  attestorPrincipalRef: string;
  authorityRefs: readonly string[];
  evidenceRefs: readonly string[];
  statementDigest: string;
  issuedAt: string;
  validUntil?: string;
  supersedesAttestationRef?: string;
}

export interface EfomPhysicalWorldContextV1 {
  operationClass: EfomOperationClassV1;
  observations: readonly EfomObservationV1[];
  findings: readonly EfomFindingV1[];
  discrepancies: readonly EfomDiscrepancyV1[];
  attestations: readonly EfomAttestationV1[];
}
```

- [ ] **Step 4: Run the contract test and verify GREEN**

```bash
npx vitest run modules/osiris/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/osiris/contracts.ts modules/osiris/contracts.test.ts
git commit -m "feat(osiris): add EFOM physical-world contracts"
```

---

### Task 2: Add deterministic Osiris / EFOM policy evaluation

**Files:**
- Create: `modules/osiris/policy.ts`
- Create: `modules/osiris/policy.test.ts`

**Interfaces:**
- Consumes: `EfomPhysicalWorldContextV1`, `EfomOperationClassV1`, `EfomVisibilityScopeV1` from `modules/osiris/contracts.ts`.
- Produces: `EfomPolicyV1`, `EfomPolicyEvaluationV1`, `evaluateEfomPolicyV1()`.

- [ ] **Step 1: Write failing policy tests**

Add tests that assert these exact outcomes:

```ts
expect(evaluateEfomPolicyV1({ context, policy, evaluatedAt }).decision).toBe("ADMISSIBLE");
expect(evaluateEfomPolicyV1({ context: missingProvenance, policy, evaluatedAt }).reasonCodes).toContain("efom_provenance_missing");
expect(evaluateEfomPolicyV1({ context: expired, policy, evaluatedAt }).reasonCodes).toContain("efom_observation_expired");
expect(evaluateEfomPolicyV1({ context: lowConfidence, policy, evaluatedAt }).decision).toBe("REVIEW_REQUIRED");
expect(evaluateEfomPolicyV1({ context: conflictedAct, policy, evaluatedAt }).reasonCodes).toContain("efom_material_conflict");
expect(evaluateEfomPolicyV1({ context: bareObservationAct, policy, evaluatedAt }).reasonCodes).toContain("efom_action_from_unverified_observation");
expect(evaluateEfomPolicyV1({ context: wrongScope, policy, evaluatedAt }).reasonCodes).toContain("efom_visibility_scope_not_permitted");
expect(evaluateEfomPolicyV1({ context: wrongPurpose, policy, evaluatedAt }).reasonCodes).toContain("efom_purpose_not_permitted");
expect(evaluateEfomPolicyV1({ context: wrongJurisdiction, policy, evaluatedAt }).reasonCodes).toContain("efom_jurisdiction_not_permitted");
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/osiris/policy.test.ts
```

Expected: FAIL because `evaluateEfomPolicyV1` does not exist.

- [ ] **Step 3: Implement minimal deterministic evaluator**

Public interfaces:

```ts
export type EfomPolicyDecisionV1 = "ADMISSIBLE" | "REVIEW_REQUIRED" | "REJECTED";

export interface EfomPolicyV1 {
  policyRef: string;
  allowedOperationClasses: readonly EfomOperationClassV1[];
  minimumObservationConfidence: number;
  requireCorroborationForOperationClasses: readonly EfomOperationClassV1[];
  manualReviewOnConflict: boolean;
  allowedVisibilityScopes: readonly EfomVisibilityScopeV1[];
  allowedPurposeRefs: readonly string[];
  allowedJurisdictionRefs: readonly string[];
}

export interface EfomPolicyEvaluationV1 {
  decision: EfomPolicyDecisionV1;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
}
```

Implement `evaluateEfomPolicyV1({ context, policy, evaluatedAt })` with deterministic sorted reason codes and these precedence rules:

```text
malformed/future/missing provenance -> REJECTED
scope/purpose/jurisdiction mismatch -> REJECTED
expired observation + ACT/ATTEST/DISCLOSE -> REJECTED
below-confidence -> REVIEW_REQUIRED
material conflict -> REVIEW_REQUIRED when manualReviewOnConflict=true, otherwise REJECTED
ACT without at least one CORROBORATED finding or attestation -> REJECTED
otherwise -> ADMISSIBLE
```

Validate confidence in `[0,1]`; invalid values are rejected as `efom_invalid_confidence`.

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run modules/osiris/policy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/osiris/policy.ts modules/osiris/policy.test.ts
git commit -m "feat(osiris): add deterministic EFOM policy evaluator"
```

---

### Task 3: Extend Warden contracts and decision service

**Files:**
- Modify: `modules/warden/contracts.ts`
- Modify: `modules/warden/decision-service.ts`
- Modify: `modules/warden/decision-service.test.ts`

**Interfaces:**
- Consumes: `EfomOperationClassV1`, `EfomPhysicalWorldContextV1`, `EfomPolicyV1`, `evaluateEfomPolicyV1`.
- Produces: EFOM-aware `WardenDecisionRequestV1` and optional EFOM policy controls in `SyntheticWardenDecisionPolicyV1`.

- [ ] **Step 1: Add failing Warden decision tests**

Add tests for:

```ts
it("denies malformed EFOM context fail-closed", () => { /* expect efom_context_missing */ });
it("escalates material EFOM conflicts", () => { /* expect efom_material_conflict */ });
it("denies ACT from bare observation", () => { /* expect efom_action_from_unverified_observation */ });
it("allows corroborated EFOM context to continue through existing capability authorization", () => { /* expect ALLOW + bounded_policy_allow */ });
it("keeps non-EFOM request behavior unchanged", () => { expect(decide().decision).toBe("ALLOW"); });
```

Use a fully populated `EfomPhysicalWorldContextV1` fixture for positive cases and explicit mutations for negative cases.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/warden/decision-service.test.ts
```

Expected: FAIL because Warden request/policy types do not yet expose EFOM context and the decision service does not call the evaluator.

- [ ] **Step 3: Extend Warden request contract additively**

Add optional imports/types and fields:

```ts
operationClass?: EfomOperationClassV1;
physicalWorldContext?: EfomPhysicalWorldContextV1;
physicalWorldContextDigest?: string;
```

Do not add duplicate `observationRefs`, `findingRefs`, etc. to Warden when the typed physical-world context already carries those objects; keep one canonical binding surface.

- [ ] **Step 4: Extend synthetic Warden policy**

Add:

```ts
efomPolicy?: EfomPolicyV1;
```

The presence rule is strict:

```text
if any of operationClass, physicalWorldContext, or physicalWorldContextDigest is present,
all required EFOM bindings must be coherent and efomPolicy must exist.
```

- [ ] **Step 5: Integrate EFOM result before manual-review/capability allow**

Behavior:

```ts
if (efom.decision === "REJECTED") return deny(request, policy, decidedAt, efom.reasonCodes[0]);
if (efom.decision === "REVIEW_REQUIRED") return escalate(request, policy, decidedAt, efom.reasonCodes[0]);
```

If no EFOM context is present, preserve the current path byte-for-byte in behavior.

Include `operationClass`, `physicalWorldContextDigest`, and a canonicalized physical-world-context digest input in the deterministic decision identity so equivalent EFOM inputs produce stable identities and changed evidence changes the token.

- [ ] **Step 6: Verify GREEN**

```bash
npx vitest run modules/warden/decision-service.test.ts
```

Expected: PASS, including all existing tests.

- [ ] **Step 7: Commit**

```bash
git add modules/warden/contracts.ts modules/warden/decision-service.ts modules/warden/decision-service.test.ts
git commit -m "feat(warden): evaluate governed EFOM context"
```

---

### Task 4: Bind semantic operation class into runtime authorization

**Files:**
- Modify: `modules/warden/runtime-authz-bridge.ts`
- Modify: `modules/warden/runtime-authz-bridge.test.ts`

**Interfaces:**
- Consumes: EFOM-aware `WardenDecisionRequestV1`.
- Produces: runtime decision receipts whose request digest includes semantic operation class and physical-world context digest.

- [ ] **Step 1: Add failing runtime authorization tests**

Add tests asserting:

```text
READ + OBSERVE remains allowed when otherwise valid.
EXECUTE + OBSERVE throws "consequential runtime effect requires ACT operation class".
PHYSICAL + INFER throws the same error.
FINANCIAL + ACT can proceed when all existing authority/policy requirements are satisfied.
Changing operationClass changes request_digest.
Changing physicalWorldContextDigest changes request_digest.
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/warden/runtime-authz-bridge.test.ts
```

Expected: FAIL because the canonical digest and semantic actuation guard do not yet exist.

- [ ] **Step 3: Extend canonical request digest**

Add these canonical fields in stable order:

```ts
operationClass: request.operationClass ?? null,
physicalWorldContextDigest: request.physicalWorldContextDigest ?? null,
```

Do not serialize the entire observation payload into the runtime receipt; the digest is the runtime binding.

- [ ] **Step 4: Add consequential-effect guard**

Define:

```ts
const CONSEQUENTIAL_EFFECTS: readonly RuntimeEffectClass[] = [
  "EXECUTE",
  "FINANCIAL",
  "PHYSICAL",
  "EXTERNAL_PROVIDER",
];
```

Before building an ALLOW runtime receipt:

```ts
if (CONSEQUENTIAL_EFFECTS.includes(effectClass) && request.operationClass !== "ACT") {
  throw new Error("consequential runtime effect requires ACT operation class");
}
```

Existing non-EFOM consequential callers that do not yet supply `operationClass` must remain compatible only if their capability path is outside the activated EFOM context. Implement the guard as:

```ts
const efomActivated = Boolean(request.operationClass || request.physicalWorldContextDigest || request.physicalWorldContext);
if (efomActivated && CONSEQUENTIAL_EFFECTS.includes(effectClass) && request.operationClass !== "ACT") { ... }
```

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run modules/warden/runtime-authz-bridge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/warden/runtime-authz-bridge.ts modules/warden/runtime-authz-bridge.test.ts
git commit -m "feat(warden): bind EFOM operation class into runtime authz"
```

---

### Task 5: Add typed River governed-evidence artifacts

**Files:**
- Modify: `modules/river/contracts.ts`
- Create: `modules/river/governed-evidence.ts`
- Create: `modules/river/governed-evidence.test.ts`

**Interfaces:**
- Produces: `GovernedEvidenceArtifactTypeV1`, `GovernedEvidenceArtifactV1`, `buildGovernedEvidenceArtifactV1()`.
- Consumes: no Warden decision semantics beyond storing decision references as evidence/source refs when provided by callers.

- [ ] **Step 1: Write failing River tests**

Tests must verify:

```text
OBSERVATION artifacts preserve observedAt without inventing derivedAt.
FINDING artifacts preserve derivedAt separately from observedAt.
ATTESTATION artifacts preserve issuedAt and validUntil.
Supersession preserves the prior artifact ref.
Equivalent input yields the same artifactRef.
Different contentDigest yields a different artifactRef.
Empty sourceRefs/evidenceRefs fails closed.
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/river/governed-evidence.test.ts
```

Expected: FAIL because the governed-evidence builder does not exist.

- [ ] **Step 3: Add typed artifact contract**

In `modules/river/contracts.ts` add:

```ts
export type GovernedEvidenceArtifactTypeV1 =
  | "OBSERVATION"
  | "FINDING"
  | "DISCREPANCY"
  | "ATTESTATION"
  | "DECISION";

export interface GovernedEvidenceArtifactV1 {
  artifactRef: string;
  artifactType: GovernedEvidenceArtifactTypeV1;
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  contentDigest: string;
  observedAt?: string;
  derivedAt?: string;
  issuedAt?: string;
  validUntil?: string;
  correlationId: string;
  supersedesArtifactRef?: string;
}
```

- [ ] **Step 4: Implement deterministic builder**

`buildGovernedEvidenceArtifactV1()` must sort/deduplicate refs, validate all provided timestamps, require at least one source and one evidence reference, and compute:

```ts
artifactRef = `RIVER-GOVERNED-EVIDENCE:${sha256(canonical).slice(0, 24)}`;
```

No timestamp field is copied into another semantic timestamp field.

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run modules/river/governed-evidence.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/river/contracts.ts modules/river/governed-evidence.ts modules/river/governed-evidence.test.ts
git commit -m "feat(river): add typed governed evidence artifacts"
```

---

### Task 6: Add Genesis EFOM claim-state projection helper

**Files:**
- Create: `modules/genesis-node-builder/efom-claim-projection.ts`
- Create: `modules/genesis-node-builder/efom-claim-projection.test.ts`
- Do not modify `modules/genesis-node-builder/contracts.ts` unless TypeScript proves an existing state is insufficient.

**Interfaces:**
- Consumes: existing `CandidateClaimStateV1`; EFOM observation/finding/discrepancy types.
- Produces: `projectEfomClaimStateV1()`.

- [ ] **Step 1: Write failing projection tests**

Assert exact mappings:

```text
raw observation -> OBSERVED
observation with source evidence -> EVIDENCED
public corroborated finding -> CORROBORATED_PUBLIC
model-derived hypothesis -> INFERRED
material conflict -> DISPUTED
superseded finding -> SUPERSEDED
no EFOM path can produce AUTHORITATIVELY_VERIFIED without explicit authoritative=true
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/genesis-node-builder/efom-claim-projection.test.ts
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement the projection helper**

Export:

```ts
export function projectEfomClaimStateV1(input: {
  kind: "OBSERVATION" | "FINDING" | "DISCREPANCY";
  sourceEvidenceRefs: readonly string[];
  findingStatus?: EfomFindingStatusV1;
  publicCorroboration?: boolean;
  authoritative?: boolean;
  superseded?: boolean;
}): CandidateClaimStateV1
```

Precedence:

```text
superseded -> SUPERSEDED
material discrepancy/conflicted -> DISPUTED
authoritative -> AUTHORITATIVELY_VERIFIED
finding hypothesis -> INFERRED
public corroborated -> CORROBORATED_PUBLIC
has evidence -> EVIDENCED
otherwise -> OBSERVED
```

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run modules/genesis-node-builder/efom-claim-projection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/genesis-node-builder/efom-claim-projection.ts modules/genesis-node-builder/efom-claim-projection.test.ts
git commit -m "feat(genesis): project EFOM evidence into claim states"
```

---

### Task 7: Enforce the semantic actuation boundary in Synnergyze

**Files:**
- Modify: `modules/synnergyze/contracts.ts` only if the action envelope requires an additive operation-class binding.
- Modify: `modules/river/contracts.ts` only if `ActionEnvelopeV1` needs the additive `operationClass?: EfomOperationClassV1` or normalized string binding.
- Modify: `modules/synnergyze/execution-gate.ts`
- Modify: `modules/synnergyze/execution-gate.test.ts`

**Interfaces:**
- Consumes: existing `ActionEnvelopeV1`, Warden decision/checkpoint, River reservation, and optional semantic operation class.
- Produces: same `SynnergyzeExecutionReceiptV1` contract unless an additive audit field is required.

- [ ] **Step 1: Write failing execution-gate tests**

Add tests showing:

```text
an EFOM-activated action carrying OBSERVE cannot reach a registered adapter for a consequential capability;
a valid ACT action still requires Warden ALLOW;
a valid ACT action still requires matching River reservation;
a valid ACT action still requires VALID checkpoint;
a findingRef or attestationRef cannot substitute for actionToken;
existing non-EFOM service_request.create test remains green.
```

Use the existing `SyntheticServiceRequestCreateAdapterV1` and containment control to assert adapter invocation count remains zero on rejected semantic actuation.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/synnergyze/execution-gate.test.ts
```

Expected: FAIL on the new semantic-actuation test.

- [ ] **Step 3: Add the smallest necessary action binding**

Prefer adding only:

```ts
operationClass?: EfomOperationClassV1;
physicalWorldContextDigest?: string;
```

to `ActionEnvelopeV1`, then bind those fields into `executionFingerprint()`.

Do not carry full observation/finding payloads into the actuator envelope.

- [ ] **Step 4: Add fail-closed EFOM actuation guard**

Before adapter resolution, if the action carries EFOM context and `operationClass !== "ACT"`, reject with:

```text
execution_efom_act_operation_required
```

The existing Warden, reservation, checkpoint, device-security, containment, idempotency, and correlation checks remain in their current order unless a failing test proves a safer ordering is required.

- [ ] **Step 5: Verify GREEN**

```bash
npx vitest run modules/synnergyze/execution-gate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/river/contracts.ts modules/synnergyze/contracts.ts modules/synnergyze/execution-gate.ts modules/synnergyze/execution-gate.test.ts
git commit -m "feat(synnergyze): enforce EFOM actuation boundary"
```

---

### Task 8: Add end-to-end EFOM-informed conformance test

**Files:**
- Create: `modules/osiris/conformance.test.ts`

**Interfaces:**
- Consumes: Osiris policy evaluator, Warden decision service, River reservation service, Warden checkpoint flow already used by existing conformance tests, Synnergyze controlled execution, and effect verification.
- Produces: one executable proof that EFOM informs but does not replace authority.

- [ ] **Step 1: Write the failing conformance test**

Build this exact causal path:

```text
EFOM observation
-> corroborated finding
-> EFOM policy ADMISSIBLE
-> Warden request with operationClass=ACT
-> Warden ALLOW
-> River evidence reservation
-> VALID Warden checkpoint
-> Synnergyze execution
-> post-execution observation
-> VERIFIED_EFFECT
```

Also assert that replacing the corroborated finding with `HYPOTHESIS` makes the Warden decision non-ALLOW before any reservation or adapter execution.

- [ ] **Step 2: Verify RED if integration glue is missing**

```bash
npx vitest run modules/osiris/conformance.test.ts
```

Expected: either FAIL on missing integration binding or PASS if Tasks 1-7 fully compose. If it passes immediately, retain the test because it proves the composed behavior; do not add unnecessary production code.

- [ ] **Step 3: Add only missing integration glue**

No new authority service is permitted. Integration changes may only pass already-defined references/digests through existing Warden/River/Synnergyze boundaries.

- [ ] **Step 4: Verify GREEN**

```bash
npx vitest run modules/osiris/conformance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/osiris/conformance.test.ts
git commit -m "test(osiris): prove EFOM-informed governed execution"
```

---

### Task 9: Add package scripts and run affected suites

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `test:osiris` script for the new policy surface.

- [ ] **Step 1: Add script**

Add:

```json
"test:osiris": "vitest run modules/osiris modules/warden/decision-service.test.ts modules/warden/runtime-authz-bridge.test.ts modules/river/governed-evidence.test.ts modules/genesis-node-builder/efom-claim-projection.test.ts modules/synnergyze/execution-gate.test.ts"
```

- [ ] **Step 2: Run focused suite**

```bash
npm run test:osiris
```

Expected: PASS.

- [ ] **Step 3: Run existing affected regression suites**

```bash
npm run test:warden-decision
npm run test:controlled-execution
npm run test:effect-verification
npm run test:reconciliation-conformance
npm run test:pestel
npm run test:node-builder
```

Expected: all PASS.

- [ ] **Step 4: Run static verification**

```bash
npm run type-check
npm run lint
```

Expected: both exit 0 with no new errors.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore(osiris): add EFOM policy verification script"
```

---

### Task 10: PR verification and readiness

**Files:**
- No production file changes unless verification finds a defect.
- Update existing draft PR #128 metadata after verification.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: verified PR ready for human review.

- [ ] **Step 1: Compare branch against `genesis`**

```bash
git diff --check genesis...HEAD
git status --short
git log --oneline genesis..HEAD
```

Expected: no whitespace errors, clean working tree, task-scoped commit history.

- [ ] **Step 2: Run final full verification**

```bash
npm test -- --run
npm run type-check
npm run lint
```

Expected: all exit 0.

- [ ] **Step 3: Inspect PR diff for scope drift**

Review every changed file against `docs/superpowers/specs/2026-09-10-osiris-efom-policy-r0-1-design.md`. Reject any change that introduces a second authority plane, mints tokens outside Warden, or lets observations/findings bypass River reservation/checkpoint execution interlocks.

- [ ] **Step 4: Update draft PR #128 body**

The body must summarize:

```text
- Added Osiris/EFOM physical-world contracts and deterministic policy evaluation.
- Warden remains sole authority and token issuer.
- River now carries typed governed evidence artifacts with temporal provenance.
- Runtime authorization and Synnergyze enforce ACT semantics for EFOM-activated consequential effects.
- Genesis claim states are projected from EFOM evidence without inventing a parallel truth ontology.
- Verification commands and results are listed exactly.
```

- [ ] **Step 5: Mark PR ready only when checks are green**

Do not mark ready on partial test success or pending workflow failures.

## Plan self-review

- Spec coverage: all design sections are mapped to Tasks 1-10.
- No second Warden/Osiris authority service is introduced.
- PESTEL remains domain-specific and is only regression-tested, not rewritten.
- Existing runtime effect classes remain untouched.
- EFOM payloads are kept out of actuator envelopes; only semantic operation class and digest bindings cross into runtime execution.
- Genesis reuses its existing claim-state ontology through a projection helper.
- Every production change has a preceding failing test except pure package-script/documentation changes.
- Final readiness requires full test, type-check, and lint evidence.
