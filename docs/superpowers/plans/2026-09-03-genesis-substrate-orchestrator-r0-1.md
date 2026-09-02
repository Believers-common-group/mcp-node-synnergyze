# GENESIS-SUBSTRATE-ORCHESTRATOR-001 R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, non-effectful Genesis workload placement and capacity-reservation layer that hands execution to the existing Warden/River/governed-compute boundary without creating a parallel authority path.

**Architecture:** Add `modules/genesis-substrate-orchestrator/` as a provider-neutral domain module. Pure placement compilation filters and ranks G0-G4/Terra capacity snapshots; a reservation service binds selected capacity to a workload; an orchestration coordinator requires a matching Warden decision and River evidence before constructing a compute handoff. `compute/runtime.ts` remains the execution proof boundary.

**Tech Stack:** TypeScript 5.8, Node 22, Vitest 3.1, Node `crypto` SHA-256, existing Warden contracts, existing River reservation contracts, existing governed compute runtime.

**Spec:** `docs/superpowers/specs/2026-09-03-genesis-substrate-orchestrator-r0-1-design.md`

## Global Constraints

- Canonical physical substrate classes are exactly `G0`, `G1`, `G2`, `G3`, `G4`.
- `TERRA` is a cloud projection kind and must never be represented as `G5`.
- `WORKLOAD INTENT != PLACEMENT PLAN != CAPACITY RESERVATION != WARDEN AUTHORITY != EXECUTION != EFFECT`.
- Placement and orchestration code must remain non-effectful; denied paths return `realWorldEffectOccurred: false`.
- The placement compiler cannot issue Warden decisions, reserve River evidence, invoke runners, or mutate external infrastructure.
- The module must reuse `modules/warden/contracts.ts`, `modules/river/reservation-service.ts`, and `compute/runtime.ts` boundaries rather than introducing a second authorization token model.
- No real AWS, Kubernetes, cloud, edge, or device runner is admitted in R0.1.
- Deterministic ranking must always end with `INSTANCE_REF_ASC`.
- Every execution handoff must reject identity, substrate, reservation, provider, expiry, or evidence mismatches.

---

## File Structure

Create:

- `modules/genesis-substrate-orchestrator/contracts.ts` — domain types, stable digest helper, validation primitives, canonical reason codes.
- `modules/genesis-substrate-orchestrator/placement-compiler.ts` — pure filtering, deterministic ranking, source digest, primary/alternate selection.
- `modules/genesis-substrate-orchestrator/placement-compiler.test.ts` — placement taxonomy, eligibility, deterministic selection, resilience tests.
- `modules/genesis-substrate-orchestrator/evidence-journal.ts` — append-only in-memory R0.1 evidence journal.
- `modules/genesis-substrate-orchestrator/reservation-service.ts` — capacity reservation construction, lifecycle, Warden binding validation.
- `modules/genesis-substrate-orchestrator/reservation-service.test.ts` — over-reservation, expiry, Warden mismatch, idempotency tests.
- `modules/genesis-substrate-orchestrator/orchestration-coordinator.ts` — non-effectful sequence from placement through authorization readiness.
- `modules/genesis-substrate-orchestrator/orchestration-coordinator.test.ts` — blocked/ready/evidence tests.
- `modules/genesis-substrate-orchestrator/compute-handoff.ts` — validated translation seam into existing `ComputeIntent`/`ComputeGrant` inputs.
- `modules/genesis-substrate-orchestrator/compute-handoff.test.ts` — substitution/expiry/evidence regression tests.

Modify:

- `package.json` — add `test:substrate-orchestrator` script only.

Do not modify `compute/runtime.ts` unless a test proves a minimal adapter-visible type export is missing. The preferred implementation imports its existing exported types/functions unchanged.

---

### Task 1: Define canonical substrate-orchestration contracts

**Files:**
- Create: `modules/genesis-substrate-orchestrator/contracts.ts`
- Test via: `modules/genesis-substrate-orchestrator/placement-compiler.test.ts`

**Interfaces:**
- Produces: `SubstrateKind`, `WorkloadRequirementV1`, `SubstrateCapacitySnapshotV1`, `PlacementPolicyV1`, `PlacementCandidateV1`, `PlacementPlanV1`, `CapacityReservationV1`, `SubstrateWardenBindingV1`, `OrchestrationAttemptV1`, `PlacementReasonCode`, `stableDigest()`.
- Consumes: no runtime authority service.

- [ ] **Step 1: Write the contract-consumer test first**

Create `placement-compiler.test.ts` with the first taxonomy assertion:

```ts
import { describe, expect, it } from "vitest";

import type { SubstrateKind } from "./contracts.ts";

function acceptSubstrateKind(kind: SubstrateKind): SubstrateKind {
  return kind;
}

describe("Genesis substrate taxonomy", () => {
  it("models G0-G4 plus Terra without a G5 class", () => {
    expect(["G0", "G1", "G2", "G3", "G4", "TERRA"].map(acceptSubstrateKind)).toEqual([
      "G0",
      "G1",
      "G2",
      "G3",
      "G4",
      "TERRA",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify the module is missing**

Run:

```bash
npx vitest run modules/genesis-substrate-orchestrator/placement-compiler.test.ts
```

Expected: FAIL because `./contracts.ts` does not exist.

- [ ] **Step 3: Implement the domain contracts**

Create `contracts.ts` with these exact core definitions:

```ts
import { createHash } from "node:crypto";

export type PhysicalSubstrateClass = "G0" | "G1" | "G2" | "G3" | "G4";
export type SubstrateKind = PhysicalSubstrateClass | "TERRA";
export type CapacityStatus = "AVAILABLE" | "DEGRADED" | "MAINTENANCE" | "SUSPENDED" | "REVOKED";
export type DataClass = "PUBLIC" | "COMMERCIAL" | "CONFIDENTIAL" | "REGULATED";
export type ResilienceProfile = "BRONZE" | "SILVER" | "GOLD";
export type GpuRequirement = "NONE" | "OPTIONAL" | "REQUIRED";
export type PlacementRankingKey =
  | "SUBSTRATE_PREFERENCE"
  | "LOCAL_BINDING"
  | "AVAILABLE_CPU_DESC"
  | "AVAILABLE_MEMORY_DESC"
  | "AVAILABLE_STORAGE_DESC"
  | "INSTANCE_REF_ASC";

export type PlacementReasonCode =
  | "capacity_snapshot_expired"
  | "substrate_status_ineligible"
  | "substrate_attestation_required"
  | "substrate_kind_not_allowed"
  | "provider_not_allowed"
  | "jurisdiction_not_allowed"
  | "required_capability_missing"
  | "cpu_capacity_insufficient"
  | "memory_capacity_insufficient"
  | "storage_capacity_insufficient"
  | "gpu_capability_missing"
  | "no_eligible_substrate"
  | "reservation_exceeds_snapshot"
  | "reservation_expired"
  | "warden_decision_missing"
  | "warden_decision_denied"
  | "warden_reservation_mismatch"
  | "warden_substrate_mismatch"
  | "warden_identity_mismatch"
  | "warden_decision_expired"
  | "evidence_requirement_missing";

export interface WorkloadRequirementV1 {
  workloadRef: string;
  correlationId: string;
  principalRef: string;
  representedEntityRef: string;
  editionRef: string;
  licenceRefs: readonly string[];
  requiredCapabilities: readonly string[];
  minimumCpuUnits: number;
  minimumMemoryMiB: number;
  minimumStorageMiB: number;
  gpuRequirement: GpuRequirement;
  allowedSubstrateKinds: readonly SubstrateKind[];
  preferredSubstrateKinds: readonly SubstrateKind[];
  allowedJurisdictionRefs: readonly string[];
  forbiddenJurisdictionRefs: readonly string[];
  dataClass: DataClass;
  resilienceProfile: ResilienceProfile;
  evidenceRequired: true;
}

export interface SubstrateCapacitySnapshotV1 {
  snapshotRef: string;
  substrateInstanceRef: string;
  substrateKind: SubstrateKind;
  providerRef: string;
  productRef?: string;
  ownerRef: string;
  operatorRef: string;
  locationRef?: string;
  jurisdictionRef: string;
  status: CapacityStatus;
  attested: boolean;
  availableCpuUnits: number;
  availableMemoryMiB: number;
  availableStorageMiB: number;
  gpuCapabilities: readonly string[];
  capabilityRefs: readonly string[];
  bindingRefs: readonly string[];
  observedAt: string;
  expiresAt: string;
  sourceDigest: string;
}

export interface PlacementPolicyV1 {
  policyRef: string;
  allowedSubstrateKinds: readonly SubstrateKind[];
  preferredSubstrateKinds: readonly SubstrateKind[];
  allowDegraded: boolean;
  requireAttestation: boolean;
  requiredCapabilityRefs: readonly string[];
  allowedProviderRefs?: readonly string[];
  forbiddenProviderRefs: readonly string[];
  allowedJurisdictionRefs: readonly string[];
  forbiddenJurisdictionRefs: readonly string[];
  preferLocalBinding: boolean;
  localBindingRef?: string;
  rankingOrder: readonly PlacementRankingKey[];
  effectiveFrom: string;
  effectiveUntil?: string;
  sourceDigest: string;
}

export interface PlacementCandidateV1 {
  substrateInstanceRef: string;
  eligible: boolean;
  rejectionReasons: readonly PlacementReasonCode[];
  rankVector: readonly (string | number)[];
  sourceSnapshotRef: string;
}

export interface PlacementPlanV1 {
  placementRef: string;
  correlationId: string;
  workloadRef: string;
  policyRef: string;
  sourceSnapshotRefs: readonly string[];
  primarySubstrateInstanceRef?: string;
  alternateSubstrateInstanceRefs: readonly string[];
  candidateResults: readonly PlacementCandidateV1[];
  blockingReasons: readonly PlacementReasonCode[];
  reservationRef?: string;
  computedAt: string;
  sourceDigest: string;
  projectionOnly: true;
}

export type CapacityReservationStatus =
  | "REQUESTED"
  | "AUTHORIZED"
  | "DENIED"
  | "EXPIRED"
  | "RELEASED"
  | "CONSUMED";

export interface CapacityReservationV1 {
  reservationRef: string;
  placementRef: string;
  correlationId: string;
  workloadRef: string;
  substrateInstanceRef: string;
  requestedCpuUnits: number;
  requestedMemoryMiB: number;
  requestedStorageMiB: number;
  status: CapacityReservationStatus;
  requestedAt: string;
  expiresAt: string;
  wardenDecisionRef?: string;
  riverEvidenceRef: string;
}

export interface SubstrateWardenBindingV1 {
  decisionRef: string;
  decision: "ALLOW" | "ESCALATE" | "DENY";
  correlationId: string;
  workloadRef: string;
  reservationRef: string;
  substrateInstanceRef: string;
  principalRef: string;
  representedEntityRef: string;
  decidedAt: string;
  validUntil: string;
  evidenceRequired: true;
}

export interface OrchestrationAttemptV1 {
  attemptRef: string;
  correlationId: string;
  workloadRef: string;
  placementRef: string;
  reservationRef?: string;
  wardenDecisionRef?: string;
  riverEvidenceRef: string;
  status:
    | "PLACEMENT_READY"
    | "BLOCKED_NO_ELIGIBLE_SUBSTRATE"
    | "BLOCKED_RESERVATION_REQUIRED"
    | "BLOCKED_WARDEN_REQUIRED"
    | "DENIED";
  reason?: PlacementReasonCode;
  realWorldEffectOccurred: false;
}

export function stableDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
```

- [ ] **Step 4: Run the taxonomy test**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/genesis-substrate-orchestrator/contracts.ts modules/genesis-substrate-orchestrator/placement-compiler.test.ts
git commit -m "feat: define genesis substrate orchestration contracts"
```

---

### Task 2: Implement deterministic placement compilation

**Files:**
- Create: `modules/genesis-substrate-orchestrator/placement-compiler.ts`
- Modify: `modules/genesis-substrate-orchestrator/placement-compiler.test.ts`

**Interfaces:**
- Consumes: `WorkloadRequirementV1`, `PlacementPolicyV1`, `SubstrateCapacitySnapshotV1`.
- Produces: `compilePlacementV1(input): PlacementPlanV1`.

- [ ] **Step 1: Add failing deterministic-placement tests**

Add fixtures and tests proving: expired snapshots rejected; forbidden jurisdiction rejected; missing capability rejected; insufficient CPU rejected; final tie-break by instance ref; Terra accepted only as `TERRA`; SILVER produces one alternate; GOLD requires up to two alternates from the eligible set.

Use this exact callable shape:

```ts
const plan = compilePlacementV1({
  workload,
  policy,
  snapshots,
  computedAt: "2026-09-03T03:00:00.000Z",
});
```

Tie-break assertion:

```ts
expect(plan.primarySubstrateInstanceRef).toBe("G2-INSTANCE-A");
expect(plan.candidateResults.filter((item) => item.eligible).map((item) => item.substrateInstanceRef)).toEqual([
  "G2-INSTANCE-A",
  "G2-INSTANCE-B",
]);
```

- [ ] **Step 2: Run tests and verify failure because `compilePlacementV1` is missing**

```bash
npx vitest run modules/genesis-substrate-orchestrator/placement-compiler.test.ts
```

Expected: FAIL with missing export/module implementation.

- [ ] **Step 3: Implement pure placement compiler**

Implement:

```ts
export interface CompilePlacementInputV1 {
  workload: WorkloadRequirementV1;
  policy: PlacementPolicyV1;
  snapshots: readonly SubstrateCapacitySnapshotV1[];
  computedAt: string;
}

export function compilePlacementV1(input: CompilePlacementInputV1): PlacementPlanV1;
```

Required implementation rules:

```ts
const MANDATORY_TIE_BREAKER = "INSTANCE_REF_ASC" as const;

function normalizedRankingOrder(policy: PlacementPolicyV1): readonly PlacementRankingKey[] {
  return [
    ...policy.rankingOrder.filter((key) => key !== MANDATORY_TIE_BREAKER),
    MANDATORY_TIE_BREAKER,
  ];
}
```

Use exact intersection semantics for substrate kind and jurisdiction. Reject a snapshot when either workload or policy forbids its jurisdiction. When an allowed-jurisdiction list is non-empty, require membership in that list. Required capabilities are the union of workload and policy requirements.

Rank only eligible candidates. Build `rankVector` in policy order; descending numeric metrics should be encoded as negative numbers so ordinary ascending tuple comparison stays deterministic. `INSTANCE_REF_ASC` must be the last element.

Build `sourceDigest` from a canonical object containing workload, policy, snapshots sorted by `snapshotRef`, and `computedAt`. Build `placementRef` as:

```ts
`GENESIS-PLACEMENT:${stableDigest(canonical).slice(0, 24)}`
```

If no eligible candidates exist, return no primary and `blockingReasons: ["no_eligible_substrate"]`.

- [ ] **Step 4: Run placement tests**

```bash
npx vitest run modules/genesis-substrate-orchestrator/placement-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/genesis-substrate-orchestrator/placement-compiler.ts modules/genesis-substrate-orchestrator/placement-compiler.test.ts
git commit -m "feat: add deterministic substrate placement compiler"
```

---

### Task 3: Add append-only placement evidence and capacity reservations

**Files:**
- Create: `modules/genesis-substrate-orchestrator/evidence-journal.ts`
- Create: `modules/genesis-substrate-orchestrator/reservation-service.ts`
- Create: `modules/genesis-substrate-orchestrator/reservation-service.test.ts`

**Interfaces:**
- Produces: `SubstrateEvidenceJournalV1`, `CapacityReservationServiceV1`.
- Reservation creation input: workload + placement + selected snapshot + request time + expiry + River evidence ref.
- Authorization input: reservation + workload + `SubstrateWardenBindingV1` + authorization time.

- [ ] **Step 1: Write failing reservation tests**

Tests must cover:

```ts
it("rejects a reservation that exceeds the selected capacity snapshot", ...)
it("creates the same reservation for the same canonical request", ...)
it("rejects authorization when Warden denies", ...)
it("rejects authorization when reservationRef mismatches", ...)
it("rejects authorization when substrateInstanceRef mismatches", ...)
it("rejects authorization when identity mismatches", ...)
it("rejects an expired Warden decision", ...)
it("rejects an expired reservation", ...)
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npx vitest run modules/genesis-substrate-orchestrator/reservation-service.test.ts
```

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement evidence journal**

Use:

```ts
export type SubstrateEvidenceStage =
  | "PLACEMENT_COMPUTED"
  | "PLACEMENT_BLOCKED"
  | "RESERVATION_REQUESTED"
  | "RESERVATION_AUTHORIZED"
  | "RESERVATION_DENIED"
  | "HANDOFF_READY"
  | "HANDOFF_DENIED";

export interface SubstrateEvidenceEnvelopeV1 {
  evidenceRef: string;
  correlationId: string;
  workloadRef: string;
  placementRef: string;
  substrateInstanceRef?: string;
  reservationRef?: string;
  wardenDecisionRef?: string;
  stage: SubstrateEvidenceStage;
  reason?: PlacementReasonCode;
  recordedAt: string;
}
```

`append()` must derive the `evidenceRef` from the stable digest of the envelope without `evidenceRef`. `list()` returns copies; no mutation/delete API exists.

- [ ] **Step 4: Implement reservation service**

Use this public API:

```ts
export class CapacityReservationServiceV1 {
  request(input: {
    workload: WorkloadRequirementV1;
    placement: PlacementPlanV1;
    snapshot: SubstrateCapacitySnapshotV1;
    requestedAt: string;
    expiresAt: string;
    riverEvidenceRef: string;
  }): CapacityReservationV1;

  authorize(input: {
    reservation: CapacityReservationV1;
    workload: WorkloadRequirementV1;
    binding: SubstrateWardenBindingV1;
    authorizedAt: string;
  }): CapacityReservationV1;
}
```

`request()` must require `placement.primarySubstrateInstanceRef`, exact snapshot instance match, quantities equal to workload minima, finite time window, and no quantity above source snapshot. Reservation identity must digest placement/workload/substrate/quantities/times.

`authorize()` must require binding `decision === "ALLOW"`, matching correlation/workload/reservation/substrate/principal/entity, valid decision window, unexpired reservation, and `evidenceRequired === true`. It returns a copy with `status: "AUTHORIZED"` and `wardenDecisionRef` populated.

- [ ] **Step 5: Run reservation tests**

```bash
npx vitest run modules/genesis-substrate-orchestrator/reservation-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/genesis-substrate-orchestrator/evidence-journal.ts modules/genesis-substrate-orchestrator/reservation-service.ts modules/genesis-substrate-orchestrator/reservation-service.test.ts
git commit -m "feat: add governed substrate capacity reservations"
```

---

### Task 4: Add non-effectful orchestration coordinator

**Files:**
- Create: `modules/genesis-substrate-orchestrator/orchestration-coordinator.ts`
- Create: `modules/genesis-substrate-orchestrator/orchestration-coordinator.test.ts`

**Interfaces:**
- Consumes: compiler, reservation service, evidence journal.
- Produces: `SubstrateOrchestrationCoordinatorV1.plan()`, `.requestReservation()`, `.authorizeReservation()` returning `OrchestrationAttemptV1` plus domain records.

- [ ] **Step 1: Write failing orchestration tests**

Required tests:

```ts
it("returns BLOCKED_NO_ELIGIBLE_SUBSTRATE with evidence and no effect", ...)
it("returns BLOCKED_RESERVATION_REQUIRED after a successful placement with no reservation", ...)
it("returns BLOCKED_WARDEN_REQUIRED for a requested reservation with no Warden binding", ...)
it("returns DENIED with evidence when Warden denies", ...)
it("returns PLACEMENT_READY only after an authorized matching reservation", ...)
```

Every result assertion must include:

```ts
expect(result.attempt.realWorldEffectOccurred).toBe(false);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npx vitest run modules/genesis-substrate-orchestrator/orchestration-coordinator.test.ts
```

Expected: FAIL because coordinator does not exist.

- [ ] **Step 3: Implement coordinator without runner invocation**

Use:

```ts
export class SubstrateOrchestrationCoordinatorV1 {
  constructor(
    private readonly reservations: CapacityReservationServiceV1,
    private readonly evidence: SubstrateEvidenceJournalV1,
  ) {}

  plan(input: CompilePlacementInputV1): {
    placement: PlacementPlanV1;
    attempt: OrchestrationAttemptV1;
  };

  requestReservation(input: {
    workload: WorkloadRequirementV1;
    placement: PlacementPlanV1;
    snapshot: SubstrateCapacitySnapshotV1;
    requestedAt: string;
    expiresAt: string;
  }): {
    reservation: CapacityReservationV1;
    attempt: OrchestrationAttemptV1;
  };

  authorizeReservation(input: {
    workload: WorkloadRequirementV1;
    placement: PlacementPlanV1;
    reservation: CapacityReservationV1;
    binding?: SubstrateWardenBindingV1;
    authorizedAt: string;
  }): {
    reservation?: CapacityReservationV1;
    attempt: OrchestrationAttemptV1;
  };
}
```

`plan()` records `PLACEMENT_COMPUTED` or `PLACEMENT_BLOCKED`. `requestReservation()` first writes `RESERVATION_REQUESTED` evidence and passes that evidence ref into the reservation service. `authorizeReservation()` records authorized/denied evidence. No method accepts a `ComputeRunner`, cloud client, shell, Kubernetes client, or provider SDK.

- [ ] **Step 4: Run orchestration tests**

```bash
npx vitest run modules/genesis-substrate-orchestrator/orchestration-coordinator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/genesis-substrate-orchestrator/orchestration-coordinator.ts modules/genesis-substrate-orchestrator/orchestration-coordinator.test.ts
git commit -m "feat: add non-effectful substrate orchestration coordinator"
```

---

### Task 5: Add validated compute handoff without bypassing governed compute

**Files:**
- Create: `modules/genesis-substrate-orchestrator/compute-handoff.ts`
- Create: `modules/genesis-substrate-orchestrator/compute-handoff.test.ts`
- Read only unless proven necessary: `compute/runtime.ts`

**Interfaces:**
- Consumes: authorized `CapacityReservationV1`, workload, placement, binding, existing `ComputeIntent`, existing `ComputeGrant`.
- Produces: `validateComputeHandoffV1()` returning the unchanged intent/grant pair when all bindings match.

- [ ] **Step 1: Write failing handoff tests**

Import existing helpers from `../../compute/runtime.ts` and add tests for:

```ts
it("accepts a fully matching authorized reservation and existing compute grant", ...)
it("rejects substrate/runner substitution", ...)
it("rejects provider substitution", ...)
it("rejects principal substitution", ...)
it("rejects represented-entity substitution", ...)
it("rejects an expired reservation", ...)
it("rejects an expired Warden binding", ...)
it("rejects missing evidence requirement", ...)
```

For R0.1 synthetic proof, map the selected substrate instance to the runner with an explicit handoff binding:

```ts
const runtimeBinding = {
  substrateInstanceRef: "G3-ALPHA-SYNTHETIC-001",
  runnerId: intent.runnerId,
  provider: intent.provider,
} as const;
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npx vitest run modules/genesis-substrate-orchestrator/compute-handoff.test.ts
```

Expected: FAIL because handoff validator does not exist.

- [ ] **Step 3: Implement handoff validator**

Use:

```ts
import type { ComputeGrant, ComputeIntent } from "../../compute/runtime.ts";

export interface SubstrateRuntimeBindingV1 {
  substrateInstanceRef: string;
  runnerId: string;
  provider: ComputeIntent["provider"];
}

export function validateComputeHandoffV1(input: {
  workload: WorkloadRequirementV1;
  placement: PlacementPlanV1;
  reservation: CapacityReservationV1;
  binding: SubstrateWardenBindingV1;
  runtimeBinding: SubstrateRuntimeBindingV1;
  intent: ComputeIntent;
  grant: ComputeGrant;
  handedOffAt: string;
}): { intent: ComputeIntent; grant: ComputeGrant };
```

Validation order must be deterministic: authorized reservation -> reservation expiry -> placement/substrate equality -> Warden binding equality and validity -> workload identity equality -> runtime runner/provider equality -> compute grant identity/provider/runner equality -> evidence requirement.

The function returns the exact `intent` and `grant` values; it must not instantiate `GovernedComputeCoordinator` or call `.attempt()`.

- [ ] **Step 4: Run handoff tests and existing compute proof**

```bash
npx vitest run modules/genesis-substrate-orchestrator/compute-handoff.test.ts
npm run test:compute-proof
```

Expected: both PASS; existing compute proof remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add modules/genesis-substrate-orchestrator/compute-handoff.ts modules/genesis-substrate-orchestrator/compute-handoff.test.ts
git commit -m "feat: add governed substrate compute handoff"
```

---

### Task 6: Add package script and full R0.1 conformance verification

**Files:**
- Modify: `package.json`
- Test: all `modules/genesis-substrate-orchestrator/*.test.ts`
- Regression: `compute/runtime.test.ts`

**Interfaces:**
- Produces: `npm run test:substrate-orchestrator`.

- [ ] **Step 1: Add package script**

Add exactly:

```json
"test:substrate-orchestrator": "vitest run modules/genesis-substrate-orchestrator"
```

Place it beside the existing `test:compute`/`test:compute-proof` scripts.

- [ ] **Step 2: Run dedicated suite**

```bash
npm run test:substrate-orchestrator
```

Expected: PASS.

- [ ] **Step 3: Run governed compute regression**

```bash
npm run test:compute-proof
```

Expected: PASS unchanged.

- [ ] **Step 4: Run Warden and River regressions used by the boundary**

```bash
npm run test:warden-decision
npm run test:river-reservation
```

Expected: PASS.

- [ ] **Step 5: Run static verification**

```bash
npm run type-check
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Inspect final diff for forbidden scope**

Run:

```bash
git diff genesis...HEAD -- modules/genesis-substrate-orchestrator compute package.json
```

Reject the implementation if the diff contains provider SDKs, network calls, shell execution, Kubernetes/cloud deployment, new Warden decision issuance, a `G5` substrate class, or direct runner execution from the substrate module.

- [ ] **Step 7: Commit final integration**

```bash
git add package.json
git commit -m "test: add substrate orchestrator conformance suite"
```

---

## Acceptance Checklist

The implementation is ready for review only when all of the following are true:

- G0-G4 and `TERRA` taxonomy tests pass.
- Repeated placement with identical canonical inputs produces the same primary, alternates, source digest, and placement ref.
- `INSTANCE_REF_ASC` resolves final ties.
- Expired/degraded/unattested/forbidden/under-capacity snapshots are handled exactly per policy.
- No eligible substrate creates an evidence-bearing blocked projection, not an exception-driven implicit fallback.
- Capacity reservation cannot exceed its selected snapshot.
- Warden denial, mismatch, missing authority, and expiry cannot produce an authorized reservation.
- Every denied orchestration attempt reports `realWorldEffectOccurred: false`.
- Compute handoff rejects substrate, provider, runner, identity, reservation, and authority substitutions.
- The substrate module never invokes a runner or external infrastructure API.
- Existing `npm run test:compute-proof`, `npm run test:warden-decision`, and `npm run test:river-reservation` remain green.
- `npm run type-check` and `npm run lint` are green.
