# Genesis Node Builder R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a test-driven `GENESIS-NODE-BUILDER-001 R0.1` module that turns incomplete property intake into a provisional candidate, separates claims from evidence, reconciles conflicts, emits a deterministic MALL missing-evidence contract and readiness snapshot, and prevents Genesis admission without an explicit Warden allow decision.

**Architecture:** Add a focused `modules/genesis-node-builder/` domain module on the existing `genesis` branch architecture. The module owns candidate/evidence/readiness semantics only; it reuses existing Warden decision types and deterministic reconciliation conventions, stores no private evidence bodies, and does not write to the Registry. External API/MCP exposure remains out of scope until the domain module is proven.

**Tech Stack:** Node.js 22.x, TypeScript 5.8 strict mode, Vitest 3.1, Node `crypto` SHA-256, existing `modules/warden` contracts, existing Synnergyze reconciliation conventions.

**Spec:** `docs/superpowers/specs/2026-08-28-genesis-node-builder-r0-1-design.md`

## Global Constraints

- `DISCOVERY != CLAIM != EVIDENCE != VERIFICATION != ACQUISITION APPROVAL != GENESIS ADMISSION`.
- Public discovery never equals legal verification.
- Registration evidence alone never equals clean title.
- Geometry always carries provenance.
- Claims and evidence are distinct objects.
- Missing evidence is explicit and never guessed away.
- Conflicting authoritative evidence fails closed to review.
- Readiness percentage cannot override a mandatory Warden gate.
- Node Builder never self-authorizes acquisition or admission.
- Historical claim/evidence lineage is append-only.
- Only public evidence references and synthetic fixture data may be committed for Mall of Asia.
- Do not add live Kaveri/Bhoomi/e-Aasthi scraping or production government adapters in R0.1.
- Follow existing TypeScript style: ESM, `.ts` imports, strict types, deterministic refs from SHA-256 where generated.
- Every implementation task starts with a failing Vitest test and ends with targeted tests plus `npm run type-check` when types change.

---

## File Structure

Create these files:

```text
modules/genesis-node-builder/
  contracts.ts                 # versioned domain types and invariants
  candidate-store.ts           # idempotent candidate creation/intake identity resolution storage
  claim-engine.ts              # evidence/claim ingestion, versioning, supersession
  reconciliation.ts            # deterministic claim conflict classification
  requirement-engine.ts        # blueprint requirement evaluation and Warden waiver application
  readiness-engine.ts          # coverage + G0-G4 gate projection and admission guard
  blueprints/
    mall.ts                     # first MALL evidence requirement blueprint
  fixtures/
    mall-of-asia.public.ts      # synthetic/public-evidence reference asset fixture
  contracts.test.ts
  candidate-store.test.ts
  claim-engine.test.ts
  reconciliation.test.ts
  requirement-engine.test.ts
  readiness-engine.test.ts
  mall-of-asia.public.test.ts
```

Modify:

```text
package.json                    # add test:node-builder script only after module tests exist
```

Do not modify `api/registry-bridge.ts`, MCP tools, `site-handoff`, or production adapters in R0.1.

---

### Task 1: Domain Contracts and Compile-Time Authority Invariants

**Files:**
- Create: `modules/genesis-node-builder/contracts.ts`
- Create: `modules/genesis-node-builder/contracts.test.ts`

**Interfaces:**
- Consumes: `WardenDecisionV1` later, but Task 1 must not import Warden yet.
- Produces: `GenesisCandidateV1`, `CandidateIdentityV1`, `CandidateClaimV1`, `CandidateEvidenceV1`, `CandidateConflictV1`, `EvidenceRequirementV1`, `AcquisitionReadinessSnapshotV1`, supporting union types.

- [ ] **Step 1: Write the failing contract test**

Create `modules/genesis-node-builder/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type {
  AcquisitionReadinessSnapshotV1,
  CandidateClaimV1,
  GenesisCandidateV1,
} from "./contracts.ts";

const candidate: GenesisCandidateV1 = {
  candidateRef: "GENESIS-CANDIDATE:MOA-001",
  candidateType: "PROPERTY",
  displayName: "Phoenix Mall of Asia",
  jurisdictionRef: "JURISDICTION:KA-BLR",
  assetClass: "MALL",
  lifecycle: "DISCOVERED",
  createdAt: "2026-08-28T00:00:00Z",
  sourceEvidenceRefs: [],
  correlationId: "CORR:MOA-001",
};

const publicClaim: CandidateClaimV1 = {
  claimRef: "CLAIM:MOA:SITE-AREA:PUBLIC",
  candidateRef: candidate.candidateRef,
  claimType: "PROPERTY_ATTRIBUTE",
  subjectRef: candidate.candidateRef,
  predicate: "site_area_acres",
  value: "13",
  valueUnit: "acre",
  sourceEvidenceRefs: ["EVIDENCE:PUBLIC:001"],
  claimState: "CORROBORATED_PUBLIC",
  confidenceBand: "MEDIUM",
};

const readiness: AcquisitionReadinessSnapshotV1 = {
  snapshotRef: "READINESS:MOA:001",
  candidateRef: candidate.candidateRef,
  gate: { highestPassedGate: "G0", blockedAtGate: "G1", status: "BLOCKED" },
  categoryScores: { identity: 1, jurisdiction: 0 },
  blockingRequirementRefs: ["REQ:JURISDICTION"],
  blockingConflictRefs: [],
  evidenceCoverage: 0.5,
  computedAt: "2026-08-28T00:01:00Z",
  sourceDigest: "sha256:test",
  projectionOnly: true,
};

// @ts-expect-error Node Builder snapshots are projections and can never be authority.
const invalidAuthoritySnapshot: AcquisitionReadinessSnapshotV1 = {
  ...readiness,
  projectionOnly: false,
};
void invalidAuthoritySnapshot;

describe("Genesis Node Builder contracts", () => {
  it("keeps public corroboration below authoritative verification", () => {
    expect(publicClaim.claimState).toBe("CORROBORATED_PUBLIC");
    expect(readiness.projectionOnly).toBe(true);
  });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npx vitest run modules/genesis-node-builder/contracts.test.ts
```

Expected: FAIL because `./contracts.ts` does not exist.

- [ ] **Step 3: Implement the contract types**

Create `modules/genesis-node-builder/contracts.ts` with these exact public shapes:

```ts
export type GenesisAssetClassV1 =
  | "LAND"
  | "MALL"
  | "RETAIL"
  | "OFFICE"
  | "INDUSTRIAL"
  | "WAREHOUSE"
  | "HOTEL"
  | "RESIDENTIAL"
  | "HOSPITAL"
  | "EDUCATION"
  | "DATA_CENTRE"
  | "MIXED_USE";

export type GenesisCandidateLifecycleV1 =
  | "DISCOVERED"
  | "IDENTIFIED"
  | "DILIGENCE_READY"
  | "ACQUISITION_READY_CANDIDATE"
  | "ADMISSION_REVIEW"
  | "ADMITTED"
  | "REJECTED"
  | "SUPERSEDED";

export interface GenesisCandidateV1 {
  candidateRef: string;
  candidateType: "PROPERTY";
  displayName: string;
  jurisdictionRef: string;
  assetClass: GenesisAssetClassV1;
  lifecycle: GenesisCandidateLifecycleV1;
  createdAt: string;
  sourceEvidenceRefs: readonly string[];
  correlationId: string;
}

export type CandidateIdentityKindV1 =
  | "ADDRESS"
  | "GEO_POINT"
  | "GEO_POLYGON"
  | "SURVEY_NUMBER"
  | "PID"
  | "EID"
  | "MUNICIPAL_ID"
  | "REGISTERED_DOCUMENT_REF"
  | "OWNER_IDENTIFIER"
  | "DOCUMENT_REF";

export interface CandidateIdentityV1 {
  identityRef: string;
  candidateRef: string;
  kind: CandidateIdentityKindV1;
  normalizedValue: string;
  sourceEvidenceRefs: readonly string[];
  observedAt: string;
}

export type CandidateClaimStateV1 =
  | "OBSERVED"
  | "EVIDENCED"
  | "CORROBORATED_PUBLIC"
  | "AUTHORITATIVELY_VERIFIED"
  | "INFERRED"
  | "DISPUTED"
  | "SUPERSEDED"
  | "REJECTED";

export type ConfidenceBandV1 = "LOW" | "MEDIUM" | "HIGH";

export interface CandidateClaimV1 {
  claimRef: string;
  candidateRef: string;
  claimType: "IDENTITY" | "PROPERTY_ATTRIBUTE" | "RELATIONSHIP" | "APPROVAL" | "GEOMETRY";
  subjectRef: string;
  predicate: string;
  value: string;
  valueUnit?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  sourceEvidenceRefs: readonly string[];
  claimState: CandidateClaimStateV1;
  confidenceBand: ConfidenceBandV1;
  supersedesClaimRef?: string;
}

export type EvidenceStateV1 =
  | "DISCOVERED"
  | "RETRIEVED"
  | "SEALED"
  | "VALIDATED"
  | "STALE"
  | "SUPERSEDED"
  | "REJECTED";

export type EvidenceAccessClassV1 = "PUBLIC" | "CONTROLLED" | "CONFIDENTIAL" | "REGULATED";

export interface CandidateEvidenceV1 {
  evidenceRef: string;
  candidateRef: string;
  evidenceClass: string;
  sourceAuthorityRef?: string;
  sourceSystemRef?: string;
  documentRef?: string;
  retrievedAt: string;
  effectiveAt?: string;
  evidenceState: EvidenceStateV1;
  contentDigest?: string;
  accessClass: EvidenceAccessClassV1;
  sourceLocatorRef?: string;
}

export type CandidateConflictClassificationV1 =
  | "IDENTITY_CONFLICT"
  | "BOUNDARY_CONFLICT"
  | "AREA_CONFLICT"
  | "PARTY_CONFLICT"
  | "CHRONOLOGY_CONFLICT"
  | "APPROVAL_CONFLICT"
  | "USE_CONFLICT"
  | "EVIDENCE_INSUFFICIENT";

export interface CandidateConflictV1 {
  conflictRef: string;
  candidateRef: string;
  claimRefs: readonly string[];
  evidenceRefs: readonly string[];
  classification: CandidateConflictClassificationV1;
  severity: "INFO" | "REVIEW" | "BLOCKING";
  resolutionState: "OPEN" | "RESOLVED" | "WAIVED";
  requiredReviewCapabilityRef: string;
}

export type AcquisitionGateV1 = "G0" | "G1" | "G2" | "G3" | "G4";

export interface EvidenceRequirementV1 {
  requirementRef: string;
  candidateRef: string;
  requirementClass: string;
  assetClass: GenesisAssetClassV1;
  jurisdictionRef: string;
  mandatoryForGate: AcquisitionGateV1;
  waivable: boolean;
  acceptableEvidenceClasses: readonly string[];
  status: "MISSING" | "PARTIAL" | "SATISFIED" | "WAIVED_BY_WARDEN" | "NOT_APPLICABLE";
  reasonCode: string;
  satisfiedByEvidenceRefs: readonly string[];
  waiverDecisionRef?: string;
}

export interface AcquisitionGateProjectionV1 {
  highestPassedGate: AcquisitionGateV1 | "NONE";
  blockedAtGate?: AcquisitionGateV1;
  status: "PASS" | "BLOCKED";
}

export interface AcquisitionReadinessSnapshotV1 {
  snapshotRef: string;
  candidateRef: string;
  gate: AcquisitionGateProjectionV1;
  categoryScores: Readonly<Record<string, number>>;
  blockingRequirementRefs: readonly string[];
  blockingConflictRefs: readonly string[];
  evidenceCoverage: number;
  computedAt: string;
  sourceDigest: string;
  projectionOnly: true;
}
```

- [ ] **Step 4: Run contract tests and type-check**

Run:

```bash
npx vitest run modules/genesis-node-builder/contracts.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add -- modules/genesis-node-builder/contracts.ts modules/genesis-node-builder/contracts.test.ts
git commit -m "feat: define Genesis Node Builder contracts"
```

---

### Task 2: Idempotent Candidate Intake Store

**Files:**
- Create: `modules/genesis-node-builder/candidate-store.ts`
- Create: `modules/genesis-node-builder/candidate-store.test.ts`

**Interfaces:**
- Consumes: `GenesisCandidateV1`, `CandidateIdentityV1`, `GenesisAssetClassV1`.
- Produces:
  - `createCandidateV1(input: CreateCandidateInputV1): CandidateCreateResultV1`
  - `addCandidateIdentityV1(input: AddCandidateIdentityInputV1): CandidateIdentityResultV1`
  - `getCandidateV1(candidateRef: string): GenesisCandidateV1 | undefined`
  - `listCandidateIdentitiesV1(candidateRef: string): readonly CandidateIdentityV1[]`

- [ ] **Step 1: Write failing candidate-store tests**

Test exact behaviors:

```ts
import { describe, expect, it } from "vitest";
import { GenesisCandidateStoreV1 } from "./candidate-store.ts";

describe("GenesisCandidateStoreV1", () => {
  it("creates the same candidate ref for an idempotent replay", () => {
    const store = new GenesisCandidateStoreV1();
    const input = {
      displayName: "Phoenix Mall of Asia",
      jurisdictionRef: "JURISDICTION:KA-BLR",
      assetClass: "MALL" as const,
      createdAt: "2026-08-28T00:00:00Z",
      correlationId: "CORR:MOA-001",
      sourceEvidenceRefs: ["EVIDENCE:PUBLIC:001"],
    };

    const first = store.createCandidateV1(input);
    const replay = store.createCandidateV1(input);

    expect(first.state).toBe("CREATED");
    expect(replay.state).toBe("REPLAY");
    expect(replay.candidate.candidateRef).toBe(first.candidate.candidateRef);
  });

  it("rejects a changed payload under the same correlation id", () => {
    const store = new GenesisCandidateStoreV1();
    store.createCandidateV1({
      displayName: "Phoenix Mall of Asia",
      jurisdictionRef: "JURISDICTION:KA-BLR",
      assetClass: "MALL",
      createdAt: "2026-08-28T00:00:00Z",
      correlationId: "CORR:MOA-002",
      sourceEvidenceRefs: [],
    });

    expect(() =>
      store.createCandidateV1({
        displayName: "Different Asset",
        jurisdictionRef: "JURISDICTION:KA-BLR",
        assetClass: "MALL",
        createdAt: "2026-08-28T00:00:00Z",
        correlationId: "CORR:MOA-002",
        sourceEvidenceRefs: [],
      }),
    ).toThrow("CANDIDATE_IDEMPOTENCY_CONFLICT");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npx vitest run modules/genesis-node-builder/candidate-store.test.ts
```

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Implement deterministic candidate and identity refs**

Use Node SHA-256 and canonical JSON. Implement:

```ts
export interface CreateCandidateInputV1 {
  displayName: string;
  jurisdictionRef: string;
  assetClass: GenesisAssetClassV1;
  createdAt: string;
  correlationId: string;
  sourceEvidenceRefs: readonly string[];
}

export type CandidateCreateResultV1 =
  | { state: "CREATED"; candidate: GenesisCandidateV1 }
  | { state: "REPLAY"; candidate: GenesisCandidateV1 };
```

Canonicalize `sourceEvidenceRefs` with sorted unique values. Key idempotency by `correlationId`; store the canonical input digest. Generate:

```ts
candidateRef = `GENESIS-CANDIDATE:${sha256(canonicalInput).slice(0, 24)}`;
```

For identity ingestion, define:

```ts
export interface AddCandidateIdentityInputV1 {
  candidateRef: string;
  kind: CandidateIdentityKindV1;
  normalizedValue: string;
  sourceEvidenceRefs: readonly string[];
  observedAt: string;
}
```

Generate identity refs from candidate + kind + normalized value + source refs. Reject unknown candidate refs and empty normalized values.

- [ ] **Step 4: Add tests for identity replay and multiple unresolved identity clues**

Add assertions that duplicate identity ingestion is replay-safe and that two distinct survey-number identities remain separately visible; Task 4 will classify the conflict rather than the store guessing.

- [ ] **Step 5: Run targeted tests and type-check**

```bash
npx vitest run modules/genesis-node-builder/candidate-store.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add -- modules/genesis-node-builder/candidate-store.ts modules/genesis-node-builder/candidate-store.test.ts
git commit -m "feat: add idempotent Genesis candidate intake"
```

---

### Task 3: Evidence and Claim Versioning Engine

**Files:**
- Create: `modules/genesis-node-builder/claim-engine.ts`
- Create: `modules/genesis-node-builder/claim-engine.test.ts`

**Interfaces:**
- Consumes: candidate/evidence/claim contract types.
- Produces:
  - `ingestEvidenceV1(input: CandidateEvidenceV1): EvidenceIngestResultV1`
  - `ingestClaimV1(input: CandidateClaimV1): ClaimIngestResultV1`
  - `supersedeClaimV1(input: SupersedeClaimInputV1): CandidateClaimV1`
  - `listClaimsV1(candidateRef: string): readonly CandidateClaimV1[]`
  - `listEvidenceV1(candidateRef: string): readonly CandidateEvidenceV1[]`

- [ ] **Step 1: Write failing evidence idempotency tests**

```ts
it("replays identical evidence and rejects changed content under one evidence ref", () => {
  const engine = new CandidateClaimEngineV1();
  const evidence = {
    evidenceRef: "EVIDENCE:PUBLIC:AREA:001",
    candidateRef: "GENESIS-CANDIDATE:MOA",
    evidenceClass: "PUBLIC_CORPORATE_DISCLOSURE",
    retrievedAt: "2026-08-28T00:00:00Z",
    evidenceState: "VALIDATED" as const,
    contentDigest: "sha256:aaa",
    accessClass: "PUBLIC" as const,
  };

  expect(engine.ingestEvidenceV1(evidence).state).toBe("INGESTED");
  expect(engine.ingestEvidenceV1(evidence).state).toBe("REPLAY");
  expect(() => engine.ingestEvidenceV1({ ...evidence, contentDigest: "sha256:bbb" }))
    .toThrow("EVIDENCE_IDEMPOTENCY_CONFLICT");
});
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run modules/genesis-node-builder/claim-engine.test.ts
```

- [ ] **Step 3: Implement evidence and claim stores with canonical digests**

Use maps keyed by `evidenceRef` / `claimRef`, store canonical digests, clone arrays on read. Do not store document bodies.

- [ ] **Step 4: Write failing supersession test**

```ts
it("preserves the old claim and creates an append-only superseding claim", () => {
  const oldClaim = engine.ingestClaimV1({
    claimRef: "CLAIM:AREA:PUBLIC",
    candidateRef: "GENESIS-CANDIDATE:MOA",
    claimType: "PROPERTY_ATTRIBUTE",
    subjectRef: "GENESIS-CANDIDATE:MOA",
    predicate: "site_area_acres",
    value: "13",
    valueUnit: "acre",
    sourceEvidenceRefs: ["EVIDENCE:PUBLIC:AREA:001"],
    claimState: "CORROBORATED_PUBLIC",
    confidenceBand: "MEDIUM",
  });
  expect(oldClaim.state).toBe("INGESTED");

  const newClaim = engine.supersedeClaimV1({
    priorClaimRef: "CLAIM:AREA:PUBLIC",
    claimRef: "CLAIM:AREA:SURVEY",
    sourceEvidenceRefs: ["EVIDENCE:SURVEY:001"],
    value: "12.96",
    claimState: "AUTHORITATIVELY_VERIFIED",
    confidenceBand: "HIGH",
  });

  const claims = engine.listClaimsV1("GENESIS-CANDIDATE:MOA");
  expect(claims.find((claim) => claim.claimRef === "CLAIM:AREA:PUBLIC")?.claimState)
    .toBe("SUPERSEDED");
  expect(newClaim.supersedesClaimRef).toBe("CLAIM:AREA:PUBLIC");
});
```

- [ ] **Step 5: Implement append-only supersession**

`supersedeClaimV1` must require the prior claim, create a replacement record for the prior claim with `claimState: "SUPERSEDED"`, and add a new claim copying invariant subject/predicate fields from the prior claim. It must never delete the prior claim ref or evidence refs.

- [ ] **Step 6: Run tests and type-check**

```bash
npx vitest run modules/genesis-node-builder/claim-engine.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add -- modules/genesis-node-builder/claim-engine.ts modules/genesis-node-builder/claim-engine.test.ts
git commit -m "feat: add evidence and claim lineage engine"
```

---

### Task 4: Deterministic Candidate Reconciliation

**Files:**
- Create: `modules/genesis-node-builder/reconciliation.ts`
- Create: `modules/genesis-node-builder/reconciliation.test.ts`

**Interfaces:**
- Consumes: `CandidateClaimV1[]`, `CandidateEvidenceV1[]`.
- Produces:
  - `reconcileCandidateClaimsV1(input: ReconcileCandidateInputV1): CandidateReconciliationResultV1`

Exact result:

```ts
export interface CandidateReconciliationResultV1 {
  reconciliationRef: string;
  candidateRef: string;
  conflicts: readonly CandidateConflictV1[];
  reconciledClaimRefs: readonly string[];
  sourceDigest: string;
}
```

- [ ] **Step 1: Write failing public-area conflict test**

Create two active claims on the same subject/predicate, values `13` and `12.8`, both `CORROBORATED_PUBLIC`. Expect one `AREA_CONFLICT` with `severity: "REVIEW"` and `requiredReviewCapabilityRef: "genesis.node_builder.conflict.review"`.

- [ ] **Step 2: Write failing authoritative-boundary conflict test**

Create two active `GEOMETRY` claims with predicate `parcel_boundary_digest`, distinct values, both `AUTHORITATIVELY_VERIFIED`. Expect `BOUNDARY_CONFLICT`, `severity: "BLOCKING"`.

- [ ] **Step 3: Run and verify failure**

```bash
npx vitest run modules/genesis-node-builder/reconciliation.test.ts
```

- [ ] **Step 4: Implement deterministic grouping and conflict mapping**

Group only active claims (`SUPERSEDED` and `REJECTED` excluded) by:

```ts
`${claim.subjectRef}|${claim.predicate}`
```

If a group has one unique value, add its claim refs to `reconciledClaimRefs`.

If values differ, classify with this initial R0.1 map:

```ts
function classificationForPredicate(predicate: string): CandidateConflictClassificationV1 {
  if (predicate.includes("boundary")) return "BOUNDARY_CONFLICT";
  if (predicate.includes("area")) return "AREA_CONFLICT";
  if (predicate.includes("party") || predicate.includes("owner")) return "PARTY_CONFLICT";
  if (predicate.includes("approval")) return "APPROVAL_CONFLICT";
  if (predicate.includes("use")) return "USE_CONFLICT";
  return "EVIDENCE_INSUFFICIENT";
}
```

Severity rule:

```ts
const authoritative = group.filter((claim) => claim.claimState === "AUTHORITATIVELY_VERIFIED");
const severity = authoritative.length >= 2 ? "BLOCKING" : "REVIEW";
```

Generate `conflictRef` and `reconciliationRef` from sorted canonical inputs using SHA-256. Gather `evidenceRefs` from the group using sorted unique values.

- [ ] **Step 5: Add replay determinism test**

Feed claims/evidence in reversed order and assert identical `reconciliationRef`, `sourceDigest`, and conflict refs.

- [ ] **Step 6: Run tests and type-check**

```bash
npx vitest run modules/genesis-node-builder/reconciliation.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add -- modules/genesis-node-builder/reconciliation.ts modules/genesis-node-builder/reconciliation.test.ts
git commit -m "feat: reconcile Genesis candidate claims"
```

---

### Task 5: MALL Blueprint and Missing Evidence Requirement Engine

**Files:**
- Create: `modules/genesis-node-builder/blueprints/mall.ts`
- Create: `modules/genesis-node-builder/requirement-engine.ts`
- Create: `modules/genesis-node-builder/requirement-engine.test.ts`

**Interfaces:**
- Consumes: `CandidateEvidenceV1[]`, `CandidateClaimV1[]`, `WardenDecisionV1` for explicit waivers.
- Produces:
  - `MALL_REQUIREMENT_DEFINITIONS_V1`
  - `evaluateEvidenceRequirementsV1(input: EvaluateRequirementsInputV1): readonly EvidenceRequirementV1[]`
  - `applyWardenRequirementWaiverV1(requirement: EvidenceRequirementV1, decision: WardenDecisionV1): EvidenceRequirementV1`

- [ ] **Step 1: Define the MALL blueprint in the test first**

The test must expect at least these stable requirement definitions:

```ts
const expectedRequirementClasses = [
  "IDENTITY_EVIDENCE",
  "JURISDICTION_EVIDENCE",
  "REGISTRATION_EVIDENCE",
  "TITLE_CHAIN_EVIDENCE",
  "ENCUMBRANCE_EVIDENCE",
  "PARCEL_BOUNDARY_EVIDENCE",
  "MUNICIPAL_IDENTIFIER_EVIDENCE",
  "BUILDING_APPROVAL_EVIDENCE",
  "AS_BUILT_GEOMETRY_EVIDENCE",
  "OCCUPANCY_COMPLETION_EVIDENCE",
  "FIRE_STATUTORY_EVIDENCE",
  "TENANCY_REGISTER_EVIDENCE",
  "ENGINEERING_UTILITY_EVIDENCE",
];
```

- [ ] **Step 2: Implement `blueprints/mall.ts`**

Define:

```ts
export interface EvidenceRequirementDefinitionV1 {
  requirementClass: string;
  category: string;
  mandatoryForGate: AcquisitionGateV1;
  waivable: boolean;
  acceptableEvidenceClasses: readonly string[];
  reasonCode: string;
}
```

Set `TITLE_CHAIN_EVIDENCE` and `PARCEL_BOUNDARY_EVIDENCE` to `mandatoryForGate: "G3"`, `waivable: false` in R0.1. Keep exact evidence-class strings explicit, e.g. `REGISTERED_DOCUMENT`, `TITLE_CHAIN_DOCUMENT`, `AUTHORITATIVE_SURVEY`, `MUNICIPAL_PROPERTY_RECORD`, `SANCTIONED_BUILDING_PLAN`, `OCCUPANCY_CERTIFICATE`, `FIRE_APPROVAL`, `TENANT_REGISTER`, `ENGINEERING_AS_BUILT`.

- [ ] **Step 3: Write failing deterministic missing-evidence test**

Provide evidence satisfying identity, jurisdiction, and registration only. Expect all 13 requirements returned in blueprint order, those three `SATISFIED`, the rest `MISSING`, with stable `requirementRef`s.

- [ ] **Step 4: Implement requirement evaluation**

For each definition, select evidence for the same candidate where:

- evidence state is `VALIDATED` or `SEALED`;
- evidence class is in `acceptableEvidenceClasses`.

Set:

- no matches -> `MISSING`;
- one or more valid matches -> `SATISFIED`;
- reserve `PARTIAL` for a later multi-part definition; do not invent partiality in R0.1.

Generate requirement refs from candidate + requirement definition, not from current evidence, so the same logical requirement keeps a stable identity as evidence arrives.

- [ ] **Step 5: Write failing Warden waiver tests**

Construct `WardenDecisionV1` values directly.

Allowed waiver:

```ts
const allowWaiver: WardenDecisionV1 = {
  decisionRef: "WARDEN-DECISION:WAIVER-001",
  requestRef: "REQUEST:WAIVER-001",
  wardenRef: "WARDEN:ALPHA",
  decision: "ALLOW",
  action: "genesis.node_builder.requirement.waive",
  targetRef: requirement.requirementRef,
  reasonCodes: ["bounded_policy_allow"],
  constraints: [],
  decidedAt: "2026-08-28T01:00:00Z",
  correlationId: "CORR:WAIVER-001",
  actionToken: "SYNTHETIC-ACTION-TOKEN",
};
```

Expect a waivable missing requirement to become `WAIVED_BY_WARDEN` with `waiverDecisionRef`.

Expect a non-waivable `TITLE_CHAIN_EVIDENCE` requirement to throw `REQUIREMENT_NOT_WAIVABLE` even with an ALLOW decision.

Expect DENY, wrong action, or wrong target to throw explicit errors and leave the original object unchanged.

- [ ] **Step 6: Implement waiver guard**

Require all of:

```ts
requirement.waivable === true
decision.decision === "ALLOW"
decision.action === "genesis.node_builder.requirement.waive"
decision.targetRef === requirement.requirementRef
```

Return a cloned requirement; never mutate input.

- [ ] **Step 7: Run tests and type-check**

```bash
npx vitest run modules/genesis-node-builder/requirement-engine.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add -- modules/genesis-node-builder/blueprints/mall.ts modules/genesis-node-builder/requirement-engine.ts modules/genesis-node-builder/requirement-engine.test.ts
git commit -m "feat: add Mall acquisition evidence blueprint"
```

---

### Task 6: Readiness Projection and Warden-Gated Admission

**Files:**
- Create: `modules/genesis-node-builder/readiness-engine.ts`
- Create: `modules/genesis-node-builder/readiness-engine.test.ts`

**Interfaces:**
- Consumes: candidate, identities, evidence, requirements, conflicts, `WardenDecisionV1`.
- Produces:
  - `computeAcquisitionReadinessV1(input: ComputeReadinessInputV1): AcquisitionReadinessSnapshotV1`
  - `admitGenesisCandidateV1(input: AdmitCandidateInputV1): GenesisCandidateV1`

- [ ] **Step 1: Write failing G0/G1 readiness test**

For an address-only candidate with no authoritative jurisdiction evidence, expect:

```ts
expect(snapshot.gate).toEqual({
  highestPassedGate: "G0",
  blockedAtGate: "G1",
  status: "BLOCKED",
});
```

Use at least one `CandidateIdentityV1` to make G0 discoverable.

- [ ] **Step 2: Write failing G3 mandatory blocker test**

Construct requirements where every item is `SATISFIED` except `TITLE_CHAIN_EVIDENCE`, which remains `MISSING`, and no conflicts. Expect G3 blocked even if `evidenceCoverage > 0.9`.

- [ ] **Step 3: Implement readiness algorithm**

Define exact input:

```ts
export interface ComputeReadinessInputV1 {
  candidate: GenesisCandidateV1;
  identities: readonly CandidateIdentityV1[];
  evidence: readonly CandidateEvidenceV1[];
  requirements: readonly EvidenceRequirementV1[];
  conflicts: readonly CandidateConflictV1[];
  computedAt: string;
}
```

Coverage:

```ts
const applicable = requirements.filter((r) => r.status !== "NOT_APPLICABLE");
const covered = applicable.filter((r) =>
  r.status === "SATISFIED" || r.status === "WAIVED_BY_WARDEN",
);
const evidenceCoverage = applicable.length === 0 ? 0 : covered.length / applicable.length;
```

Gate rules:

- G0 passes when at least one identity exists.
- G1 passes when G0 passes, candidate jurisdiction is non-empty, `JURISDICTION_EVIDENCE` is satisfied/waived, and there is no open blocking `IDENTITY_CONFLICT`.
- G2 passes when G1 passes and every requirement with `mandatoryForGate` G0/G1/G2 is satisfied/waived.
- G3 passes when G2 passes and every requirement with `mandatoryForGate` up through G3 is satisfied/waived and there is no open `BLOCKING` conflict.
- G4 is never produced by readiness computation; readiness tops out at G3.

Category scores: group requirements by blueprint category. Export category on evaluated requirements by adding `category` to `EvidenceRequirementV1` now if it was omitted in Task 1; if added, update Task 1 contract test in the same Task 6 commit. Compute each category as satisfied-or-waived / applicable.

Snapshot digest must canonicalize sorted requirement status tuples and sorted open conflicts so input order does not change the digest.

- [ ] **Step 4: Write failing admission guard tests**

Admission must reject:

- readiness below G3 -> `CANDIDATE_NOT_ACQUISITION_READY`;
- Warden `DENY` or `ESCALATE` -> `WARDEN_ADMISSION_NOT_ALLOWED`;
- ALLOW with wrong action -> `WARDEN_ADMISSION_ACTION_MISMATCH`;
- ALLOW with wrong target -> `WARDEN_ADMISSION_TARGET_MISMATCH`.

Admission succeeds only for:

```ts
decision.decision === "ALLOW"
decision.action === "genesis.node_builder.admit"
decision.targetRef === candidate.candidateRef
readiness.candidateRef === candidate.candidateRef
readiness.gate.highestPassedGate === "G3"
readiness.gate.status === "PASS"
```

The returned clone has `lifecycle: "ADMITTED"`; no Registry write occurs.

- [ ] **Step 5: Implement `admitGenesisCandidateV1`**

Define:

```ts
export interface AdmitCandidateInputV1 {
  candidate: GenesisCandidateV1;
  readiness: AcquisitionReadinessSnapshotV1;
  decision: WardenDecisionV1;
}
```

Do not inspect or expose `actionToken`; presence is guaranteed by the ALLOW union shape and Node Builder does not execute with it.

- [ ] **Step 6: Add deterministic replay test for readiness**

Reverse evidence/requirement/conflict order and assert identical snapshot ref/source digest when `computedAt` is unchanged.

- [ ] **Step 7: Run tests and type-check**

```bash
npx vitest run modules/genesis-node-builder/readiness-engine.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add -- modules/genesis-node-builder/contracts.ts modules/genesis-node-builder/contracts.test.ts modules/genesis-node-builder/readiness-engine.ts modules/genesis-node-builder/readiness-engine.test.ts
git commit -m "feat: add acquisition readiness and admission gates"
```

---

### Task 7: Mall of Asia Public Fixture, End-to-End Proof, and Verification Script

**Files:**
- Create: `modules/genesis-node-builder/fixtures/mall-of-asia.public.ts`
- Create: `modules/genesis-node-builder/mall-of-asia.public.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all prior Node Builder interfaces.
- Produces: `MALL_OF_ASIA_PUBLIC_FIXTURE_V1` and a repeatable end-to-end synthetic/public-evidence proof.

- [ ] **Step 1: Create a public-only fixture with intentional incompleteness**

Use exact fixture identity:

```ts
export const MALL_OF_ASIA_PUBLIC_FIXTURE_V1 = {
  candidate: {
    candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
    candidateType: "PROPERTY",
    displayName: "Phoenix Mall of Asia",
    jurisdictionRef: "JURISDICTION:KA-BLR",
    assetClass: "MALL",
    lifecycle: "DISCOVERED",
    createdAt: "2026-08-28T00:00:00Z",
    sourceEvidenceRefs: ["EVIDENCE:MOA:PUBLIC:PROJECT"],
    correlationId: "CORR:MOA-PUBLIC-001",
  },
  identities: [
    {
      identityRef: "IDENTITY:MOA:ADDRESS",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      kind: "ADDRESS",
      normalizedValue: "Byatarayanapura, Yelahanka Hobli, Bengaluru, Karnataka",
      sourceEvidenceRefs: ["EVIDENCE:MOA:PUBLIC:PROJECT"],
      observedAt: "2026-08-28T00:00:00Z",
    },
  ],
  evidence: [
    // PUBLIC metadata only; no private documents or personal data.
  ],
  claims: [
    // Include two conflicting public site-area claims to exercise AREA_CONFLICT.
  ],
} as const;
```

Evidence must be metadata records only, with `accessClass: "PUBLIC"`. Include classes sufficient for identity/jurisdiction/public project description but intentionally omit `TITLE_CHAIN_DOCUMENT`, `AUTHORITATIVE_SURVEY`, and private owner evidence.

- [ ] **Step 2: Write failing end-to-end fixture test**

The test should:

1. ingest the fixture evidence and claims;
2. reconcile claims;
3. evaluate the MALL requirements;
4. compute readiness;
5. assert one `AREA_CONFLICT` exists;
6. assert `TITLE_CHAIN_EVIDENCE` is `MISSING`;
7. assert readiness is below G3;
8. assert fixture data alone cannot be admitted.

Use an ALLOW admission decision deliberately and expect `admitGenesisCandidateV1` to reject because readiness is not G3. This proves Warden ALLOW cannot override missing prerequisite state inside Node Builder.

- [ ] **Step 3: Add the package test script**

Modify `package.json` scripts with:

```json
"test:node-builder": "vitest run modules/genesis-node-builder"
```

Do not alter existing scripts.

- [ ] **Step 4: Run the Node Builder suite**

```bash
npm run test:node-builder
```

Expected: all Node Builder tests PASS.

- [ ] **Step 5: Run repository verification**

Run:

```bash
npm run type-check
npm run lint
npm test -- --run
```

Expected: PASS. If an unrelated pre-existing failure exists, record the exact failing test/lint path and verify the Node Builder targeted suite separately; do not weaken Node Builder tests to accommodate unrelated failures.

- [ ] **Step 6: Inspect public-repository safety before commit**

Run:

```bash
git diff -- modules/genesis-node-builder package.json
```

Confirm there are no credentials, tokens, private title-document bodies, personal identifiers, private municipal/revenue records, confidential acquisition terms, or private valuation data.

- [ ] **Step 7: Commit Task 7**

```bash
git add -- package.json modules/genesis-node-builder/fixtures/mall-of-asia.public.ts modules/genesis-node-builder/mall-of-asia.public.test.ts
git commit -m "test: prove Mall of Asia acquisition candidate flow"
```

- [ ] **Step 8: Final implementation review**

Run:

```bash
git diff genesis...HEAD --stat
git log --oneline genesis..HEAD
npm run test:node-builder
npm run type-check
npm run lint
```

Expected: seven scoped task commits after the design/plan commits, targeted suite PASS, type-check PASS, lint PASS.

---

## Plan Self-Review

### Spec coverage

- Candidate creation/intake: Task 2.
- Claim/evidence separation: Tasks 1 and 3.
- Evidence states/access classes: Tasks 1 and 3.
- Append-only supersession: Task 3.
- Conflict classification/fail-closed behavior: Task 4.
- MALL blueprint: Task 5.
- Missing Evidence Contract: Task 5.
- Warden waivers: Task 5.
- Separate coverage vs gate status: Task 6.
- G0-G3 readiness and G4 admission separation: Task 6.
- Warden-only admission: Task 6.
- Mall of Asia public fixture: Task 7.
- No live government scraping/API work: preserved as out of scope.
- No direct Registry write/API exposure: preserved as out of scope.
- Deterministic digests/idempotency: Tasks 2, 3, 4 and 6.
- Public repository safety: Task 7.

### Type consistency

All later tasks consume names defined in Task 1. `WardenDecisionV1` is imported from `modules/warden/contracts.ts`; waiver and admission authorization are identified by exact `decision.action` and `decision.targetRef` because the existing decision output does not expose `capabilityRef`.

### Scope

This plan deliberately ends at the verified domain module and public fixture. Government source adapters, map/CAD UI, owner portal, Registry admission bridge, operational `Location -> Rooms -> Doors -> Pods`, and ARK installation remain separate future slices.
