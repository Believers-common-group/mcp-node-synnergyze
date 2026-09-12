# SYNNERGYZE-RUNTIME-ACTIVATION-R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the bounded Genesis → Synnergyze → Warden → River → Synnergyze → River conformance runtime with deterministic human-readable Proof IDs while keeping external effects, settlement finality, and Registry truth promotion disabled.

**Architecture:** Strengthen the existing River action envelope so the Genesis device dependency remains cryptographically bound after Warden authorization, add deterministic issuer-bound Proof Reference factories, compose the existing Warden/River/Synnergyze engines into one device-bound controlled activation service, and expose that service through an explicitly gated MCP tool. Existing native refs and SHA-256 hashes remain authoritative; Proof IDs index those native objects and never replace them.

**Tech Stack:** TypeScript 5.8, Node.js `v22.14.0`, Vitest 3, Zod, Node `crypto` SHA-256, existing Warden/River/Synnergyze conformance modules.

**Spec:** `docs/superpowers/specs/2026-09-12-synnergyze-runtime-activation-r01-design.md`

## Global Constraints

- `Proof ID != cryptographic digest`.
- Proof IDs use `<SCOPE>-<ISSUER>-<CLAIM>-<ID8>` where `ID8` is derived from the canonical proof digest.
- Callers cannot choose `proofFrom`; issuer-specific factory functions own provenance.
- Proof `createdAt` is taken from the native source event/receipt so replay is stable.
- R0.1 qualification is device-bound and requires both Genesis device provenance and transient device-security context.
- Genesis remains canonical for device identity/binding/attestation/resolution.
- Warden remains the only authorization/policy decision authority.
- River remains reservation/seal/causal-trace authority.
- Synnergyze remains orchestration/execution/effect-verification authority for its own stages.
- Reuse the existing River seal/causal-trace path; do not create another evidence engine.
- `CONTROLLED_ACTIVE` does not mean production `ACTIVE`.
- Every runtime result reports `externalEffects:false`, `settlementFinality:false`, and `registryTruthPromoted:false`.
- Next gate: `EXTERNAL-EFFECT-ACTIVATION-R0.1`.
- Existing device-security execution-gate checks must not be weakened.
- Do not merge PR #129 or the runtime PR without explicit user instruction.

---

### Task 1: Bind Genesis device provenance into River action identity

**Files:**
- Modify: `modules/river/contracts.ts`
- Modify: `modules/river/reservation-service.ts`
- Modify: `modules/river/reservation-service.test.ts`
- Modify: `modules/synnergyze/execution-gate.ts`
- Modify: `modules/synnergyze/execution-gate.test.ts`

**Interfaces:**
- Consumes: `WardenDecisionRequestV1.genesisDevice`.
- Produces: `ActionEnvelopeV1.genesisDeviceRequestDigest?: string`.

- [ ] **Step 1: Write the failing River tests**

Add this fixture to `modules/river/reservation-service.test.ts`:

```ts
const genesisDevice = {
  resolutionRef: "GENESIS-DEVICE-RESOLUTION:alpha001",
  deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
  estateRef: "GENESIS-ESTATE-001",
  attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
  assuranceLevel: "L3" as const,
  evidenceRefs: ["RIVER-DEVICE-EVIDENCE-002", "RIVER-DEVICE-EVIDENCE-001"],
  resolvedAt: "2026-09-12T05:00:00.000Z",
  validUntil: "2026-09-12T06:00:00.000Z",
};
```

Add assertions proving:

```ts
expect(action.genesisDeviceRequestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
expect(action.genesisDeviceRequestDigest).toBe(
  actionWithReorderedEvidence.genesisDeviceRequestDigest,
);
expect(actionWithChangedResolution.actionRef).not.toBe(action.actionRef);
expect(() => river.reserve({
  request,
  decision,
  action: { ...action, genesisDeviceRequestDigest: "sha256:deadbeef" },
  reservedAt,
})).toThrow("river_action_envelope_mismatch:genesisDeviceRequestDigest");
```

Also add a test asserting a device-bound request without `genesisDevice` throws `river_genesis_device_dependency_required` when building the action envelope.

- [ ] **Step 2: Run the focused River test and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/river/reservation-service.test.ts
```

Expected: compile/assertion failure because `genesisDeviceRequestDigest` does not exist yet.

- [ ] **Step 3: Extend the River contract**

In `ActionEnvelopeV1`, insert this property immediately after `executionDeviceRef?: string;`:

```ts
genesisDeviceRequestDigest?: string;
```

In `modules/river/reservation-service.ts`, add:

```ts
function requestGenesisDeviceDigest(request: WardenDecisionRequestV1): string | undefined {
  if (!request.executionDeviceRef) {
    if (request.genesisDevice) throw new Error("river_genesis_device_context_unexpected");
    return undefined;
  }

  const device = request.genesisDevice;
  if (!device) throw new Error("river_genesis_device_dependency_required");
  if (device.deviceRef !== request.executionDeviceRef) {
    throw new Error("river_genesis_device_ref_mismatch");
  }
  if (!device.resolutionRef.startsWith("GENESIS-DEVICE-RESOLUTION:")) {
    throw new Error("river_genesis_device_resolution_invalid");
  }
  if (!device.attestationRef || device.evidenceRefs.length === 0) {
    throw new Error("river_genesis_device_evidence_required");
  }

  return `sha256:${digest(JSON.stringify({
    resolutionRef: device.resolutionRef,
    deviceRef: device.deviceRef,
    estateRef: device.estateRef,
    attestationRef: device.attestationRef,
    assuranceLevel: device.assuranceLevel,
    evidenceRefs: stableUnique(device.evidenceRefs),
    resolvedAt: device.resolvedAt,
    validUntil: device.validUntil ?? null,
  }))}`;
}
```

Add this exact field to `canonicalActionPayload()`:

```ts
genesisDeviceRequestDigest: requestGenesisDeviceDigest(request),
```

Add `"genesisDeviceRequestDigest"` to the `assertExactAction()` field list immediately after `"executionDeviceRef"`.

- [ ] **Step 4: Bind the digest into Synnergyze execution replay identity**

In `executionFingerprint()` add:

```ts
genesisDeviceRequestDigest: input.action.genesisDeviceRequestDigest ?? null,
```

Add a regression test that reuses the same action ref with a changed Genesis digest and expects `execution_idempotency_conflict`.

- [ ] **Step 5: Run focused tests and type-check**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  modules/river/reservation-service.test.ts \
  modules/synnergyze/execution-gate.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add modules/river/contracts.ts modules/river/reservation-service.ts \
  modules/river/reservation-service.test.ts modules/synnergyze/execution-gate.ts \
  modules/synnergyze/execution-gate.test.ts
git commit -m "feat: bind Genesis device provenance into River actions"
```

---

### Task 2: Add deterministic issuer-owned Proof References

**Files:**
- Create: `modules/proof/proof-reference.ts`
- Create: `modules/proof/proof-reference.test.ts`

**Interfaces:**
- Produces: `ProofReferenceV1`, `ProofScopeV1`, `ProofTypeV1`, `assertProofReferenceIntegrityV1()` and eight issuer-specific creation functions.
- No public API accepts a caller-supplied issuer.

- [ ] **Step 1: Write the failing Proof Reference tests**

Create `modules/proof/proof-reference.test.ts` and import:

```ts
import {
  assertProofReferenceIntegrityV1,
  createGenesisDeviceProofReferenceV1,
  createRiverRuntimeCompositeProofReferenceV1,
  createWardenAuthorizationProofReferenceV1,
} from "./proof-reference.ts";
```

Use:

```ts
const base = {
  subjectRef: "GENESIS-DEVICE-ALPHA-LG-001",
  scope: "ESTATE" as const,
  scopeRef: "GENESIS-ESTATE-001",
  sourceRefs: ["REF-B", "REF-A", "REF-A"],
  createdAt: "2026-09-12T05:00:00.000Z",
  synthetic: true,
};
```

Assert:

```ts
const proof = createGenesisDeviceProofReferenceV1(base);
expect(proof.proofFrom).toBe("GENESIS");
expect(proof.proofId).toMatch(/^E-GEN-DEVICE-[0-9A-F]{8}$/);
expect(proof.integrityDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
expect(createGenesisDeviceProofReferenceV1(base)).toEqual(
  createGenesisDeviceProofReferenceV1({ ...base, sourceRefs: ["REF-A", "REF-B"] }),
);
expect(
  createGenesisDeviceProofReferenceV1({ ...base, sourceRefs: ["REF-C"] }).proofId,
).not.toBe(proof.proofId);
expect(() => assertProofReferenceIntegrityV1({
  ...proof,
  proofId: "E-GEN-DEVICE-DEADBEEF",
})).toThrow("proof_id_digest_mismatch");
expect(createWardenAuthorizationProofReferenceV1({
  ...base,
  subjectRef: "WARDEN-DECISION:001",
}).proofFrom).toBe("WARDEN");
expect(createRiverRuntimeCompositeProofReferenceV1({
  ...base,
  scope: "GROUP",
  scopeRef: "GROUP:ALPHA-RUNTIME-QUALIFICATION-001",
  subjectRef: "CORR:RUNTIME-001",
}).proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
```

- [ ] **Step 2: Run and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/proof/proof-reference.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the Proof Reference types**

Create `modules/proof/proof-reference.ts` with:

```ts
import { createHash } from "node:crypto";

export type ProofScopeV1 = "ESTATE" | "GROUP" | "MISSION";
export type ProofIssuerV1 = "GENESIS" | "SYNNERGYZE" | "WARDEN" | "RIVEROS";
export type ProofTypeV1 =
  | "GENESIS_DEVICE_RESOLUTION"
  | "SYNNERGYZE_COMPOSITION"
  | "WARDEN_AUTHORIZATION"
  | "RIVER_RESERVATION"
  | "SYNNERGYZE_EXECUTION"
  | "SYNNERGYZE_VERIFICATION"
  | "RIVER_SEAL"
  | "RIVER_RUNTIME_COMPOSITE";

export interface ProofReferenceV1 {
  proofId: string;
  proofFrom: ProofIssuerV1;
  proofType: ProofTypeV1;
  claim: string;
  subjectRef: string;
  scope: ProofScopeV1;
  scopeRef: string;
  sourceRefs: readonly string[];
  integrityDigest: `sha256:${string}`;
  createdAt: string;
  synthetic: boolean;
  supersedesProofId?: string;
}

export interface ProofReferenceInputV1 {
  subjectRef: string;
  scope: ProofScopeV1;
  scopeRef: string;
  sourceRefs: readonly string[];
  createdAt: string;
  synthetic: boolean;
  supersedesProofId?: string;
}
```

Define this exact metadata table:

```ts
const DEFINITIONS = {
  GENESIS_DEVICE_RESOLUTION: ["GENESIS", "GEN", "DEVICE", "the execution device/context was canonically resolved"],
  SYNNERGYZE_COMPOSITION: ["SYNNERGYZE", "SYN", "COMPOSE", "the governed runtime request was composed with required lineage"],
  WARDEN_AUTHORIZATION: ["WARDEN", "WAR", "AUTH", "the exact runtime request was authorized under Warden policy"],
  RIVER_RESERVATION: ["RIVEROS", "RIV", "RESERVE", "evidence capacity was reserved for the exact authorized action"],
  SYNNERGYZE_EXECUTION: ["SYNNERGYZE", "SYN", "EXEC", "the reserved authorized action passed controlled execution"],
  SYNNERGYZE_VERIFICATION: ["SYNNERGYZE", "SYN", "VERIFY", "post-execution observation produced a verified effect"],
  RIVER_SEAL: ["RIVEROS", "RIV", "SEAL", "the verified effect was bound into the River evidence seal and causal trace"],
  RIVER_RUNTIME_COMPOSITE: ["RIVEROS", "RIV", "RUNTIME", "the required controlled-runtime proofs are causally bound at the terminal River seal"],
} as const;
```

Implement a private builder that deduplicates/sorts `sourceRefs`, serializes the canonical payload with fixed key ordering, computes SHA-256, maps scope to `E|G|M`, and generates `<SCOPE>-<ISSUER>-<CLAIM>-<HEX8>`.

- [ ] **Step 4: Export issuer-specific factories and integrity assertion**

Export exactly:

```ts
createGenesisDeviceProofReferenceV1
createSynnergyzeCompositionProofReferenceV1
createWardenAuthorizationProofReferenceV1
createRiverReservationProofReferenceV1
createSynnergyzeExecutionProofReferenceV1
createSynnergyzeVerificationProofReferenceV1
createRiverSealProofReferenceV1
createRiverRuntimeCompositeProofReferenceV1
assertProofReferenceIntegrityV1
```

`assertProofReferenceIntegrityV1()` must rebuild the proof from `proofType` and throw these errors where applicable:

```text
proof_issuer_mismatch
proof_scope_prefix_mismatch
proof_integrity_digest_mismatch
proof_id_digest_mismatch
```

Do not export a generic factory that accepts `proofFrom`.

- [ ] **Step 5: Run tests and type-check**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/proof/proof-reference.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add modules/proof/proof-reference.ts modules/proof/proof-reference.test.ts
git commit -m "feat: add deterministic system-owned Proof IDs"
```

---

### Task 3: Build the device-bound controlled runtime activation service

**Files:**
- Create: `modules/synnergyze/runtime-activation.ts`
- Create: `modules/synnergyze/runtime-activation.test.ts`

**Interfaces:**
- Consumes: `WardenDecisionRequestV1`, `SyntheticWardenDecisionPolicyV1`, `ResolvedDeviceSecurityContextV1`, River reservation, controlled execution, effect verification, River RC1 seal adapters, and Task 2 proof factories.
- Produces: `SynnergyzeRuntimeActivationResultV1`.

- [ ] **Step 1: Write the failing happy-path and failure-path tests**

Use this exact device-bound request fixture:

```ts
const request: WardenDecisionRequestV1 = {
  requestRef: "WARDEN-REQUEST:RUNTIME-R01-001",
  actorRef: "DIGITALME-ALPHA-TEST-001",
  representedPrincipalRef: "LAB-COMPANY-001",
  actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
  contextRef: "ALPHA-NODE-001",
  programRef: "SYNNERGYZE-PROGRAM:001",
  eventRef: "SYNNERGYZE-EVENT:RUNTIME-001",
  action: "service_request.create",
  capabilityRef: "service_request.create",
  targetRef: "SERVICE-REQUEST-TARGET:001",
  executionDeviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
  genesisDevice: {
    resolutionRef: "GENESIS-DEVICE-RESOLUTION:alpha001",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    estateRef: "GENESIS-ESTATE-001",
    attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
    assuranceLevel: "L3",
    evidenceRefs: ["RIVER-DEVICE-EVIDENCE-001"],
    resolvedAt: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
  },
  deviceSecurityState: "ACTIVE",
  deviceSecurityPolicyRef: "DEVICE-SECURITY-POLICY-001",
  deviceSecuritySourceRefs: ["DEVICE-SECURITY-RESOLUTION-001", "DEVICE-SECURITY-EVIDENCE-001"],
  deviceSecurityResolvedAt: "2026-09-12T05:00:00.000Z",
  deviceSecurityValidUntil: "2026-09-12T06:00:00.000Z",
  authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
  policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
  representationSourceRefs: ["GENESIS-REPRESENTATION-001"],
  requestedAt: "2026-09-12T05:10:00.000Z",
  correlationId: "CORR:RUNTIME-R01-001",
};
```

Use this transient context:

```ts
const executionDeviceSecurity: ResolvedDeviceSecurityContextV1 = {
  resolutionRef: "DEVICE-SECURITY-RESOLUTION-001",
  deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
  state: "ACTIVE",
  policyRef: "DEVICE-SECURITY-POLICY-001",
  evidenceRef: "DEVICE-SECURITY-EVIDENCE-001",
  assuranceLevel: "L3",
  resolvedAt: "2026-09-12T05:00:00.000Z",
  validUntil: "2026-09-12T06:00:00.000Z",
};
```

Use this timeline:

```ts
const timeline = {
  decidedAt: "2026-09-12T05:11:00.000Z",
  reservedAt: "2026-09-12T05:11:00.000Z",
  checkedAt: "2026-09-12T05:12:00.000Z",
  executedAt: "2026-09-12T05:13:00.000Z",
  observedAt: "2026-09-12T05:14:00.000Z",
  verifiedAt: "2026-09-12T05:15:00.000Z",
};
```

Assert the successful result has this issuer order:

```ts
expect(result.state).toBe("CONTROLLED_ACTIVE_PROOF");
expect(result.proofChain.map((proof) => proof.proofFrom)).toEqual([
  "GENESIS",
  "SYNNERGYZE",
  "WARDEN",
  "RIVEROS",
  "SYNNERGYZE",
  "SYNNERGYZE",
  "RIVEROS",
]);
expect(result.compositeProof?.proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
expect(result.externalEffects).toBe(false);
expect(result.settlementFinality).toBe(false);
expect(result.registryTruthPromoted).toBe(false);
```

Add tests for:

```text
missing Genesis dependency -> BLOCKED, no composite proof
mismatched transient device-security context -> BLOCKED, no composite proof
Warden DENY -> no reservation/execution/seal/composite proof
expired Warden/device validity -> BLOCKED
verification EXCEPTION -> no River seal proof/composite proof
causal-trace mismatch -> no composite proof
exact replay -> identical Proof IDs and adapter invocation count remains 1
same requestRef with mutated security context -> runtime_activation_replay_conflict
every emitted proof -> assertProofReferenceIntegrityV1() succeeds
```

- [ ] **Step 2: Run and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/runtime-activation.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Define runtime contracts**

Create:

```ts
export interface RuntimeActivationTimelineV1 {
  decidedAt: string;
  reservedAt: string;
  checkedAt: string;
  executedAt: string;
  observedAt: string;
  verifiedAt: string;
}

export interface SynnergyzeRuntimeActivationInputV1 {
  request: WardenDecisionRequestV1;
  policy: SyntheticWardenDecisionPolicyV1;
  executionDeviceSecurity: ResolvedDeviceSecurityContextV1;
  estateScopeRef: string;
  groupScopeRef: string;
  timeline: RuntimeActivationTimelineV1;
}

export interface SynnergyzeRuntimeActivationResultV1 {
  state: "CONTROLLED_ACTIVE_PROOF" | "BLOCKED";
  proofChain: readonly ProofReferenceV1[];
  compositeProof?: ProofReferenceV1;
  requestRef: string;
  correlationId: string;
  externalEffects: false;
  settlementFinality: false;
  registryTruthPromoted: false;
  blockedReason?: string;
}
```

Use a stateful service:

```ts
export class SynnergyzeRuntimeActivationServiceV1 {
  execute(input: SynnergyzeRuntimeActivationInputV1): SynnergyzeRuntimeActivationResultV1;
  adapterInvocationCount(): number;
}
```

Internally instantiate one `SyntheticRiverReservationServiceV1`, one `SyntheticServiceRequestCreateAdapterV1`, one `ControlledExecutionGateV1`, one `EffectVerificationServiceV1`, one `SyntheticServiceRequestObservationSourceV1`, and one `Map<string, StoredRuntimeActivationV1>`.

- [ ] **Step 4: Implement preconditions and replay fingerprint**

Before Warden evaluation, require:

```ts
if (!request.executionDeviceRef) return blocked("runtime_activation_device_required");
if (!request.genesisDevice) return blocked("runtime_activation_genesis_device_required");
if (request.genesisDevice.deviceRef !== request.executionDeviceRef) return blocked("runtime_activation_genesis_device_mismatch");
if (input.estateScopeRef !== request.genesisDevice.estateRef) return blocked("runtime_activation_estate_scope_mismatch");
if (executionDeviceSecurity.deviceRef !== request.executionDeviceRef) return blocked("runtime_activation_device_security_mismatch");
if (executionDeviceSecurity.state !== "ACTIVE") return blocked("runtime_activation_device_security_not_active");
```

Also require exact equality between request security fields and `executionDeviceSecurity`, and require `request.deviceSecuritySourceRefs` to contain both the resolution and evidence refs.

Validate:

```text
requestedAt <= decidedAt <= reservedAt <= checkedAt <= executedAt <= observedAt <= verifiedAt
```

Build the replay fingerprint from canonical request material, policy material, canonical Genesis evidence refs, transient-security context, `estateScopeRef`, and `groupScopeRef`. Exclude the execution timeline from that fingerprint. Same `requestRef` plus a different fingerprint throws `runtime_activation_replay_conflict`; exact replay returns the stored result.

- [ ] **Step 5: Compose the existing engines in order**

Run:

```ts
const decision = evaluateSyntheticWardenDecisionV1({
  request,
  policy,
  decidedAt: timeline.decidedAt,
});
```

Return `BLOCKED` immediately for `DENY` or `ESCALATE`.

For `ALLOW`:

```ts
const action = buildAuthorizedActionEnvelopeV1(request, decision);
const reservation = this.river.reserve({
  request,
  decision,
  action,
  reservedAt: timeline.reservedAt,
});
```

Create the checkpoint:

```ts
const checkpoint: WardenExecutionCheckpointV1 = {
  checkpointRef: `WARDEN-EXEC-CHECK:${digest(
    [decision.decisionRef, reservation.reservationRef, timeline.checkedAt].join("|"),
  ).slice(0, 24)}`,
  decisionRef: decision.decisionRef,
  wardenRef: decision.wardenRef,
  correlationId: decision.correlationId,
  state: "VALID",
  checkedAt: timeline.checkedAt,
  reasonCodes: ["runtime_activation_r0.1_checkpoint_valid"],
};
```

Execute:

```ts
const executionReceipt = this.gate.execute({
  action,
  reservation,
  decision,
  checkpoint,
  executionDeviceSecurity: input.executionDeviceSecurity,
  executedAt: timeline.executedAt,
});
```

Observe and verify:

```ts
const observation = this.observer.observe(executionReceipt, timeline.observedAt);
const verification = this.verifier.verify({
  receipt: executionReceipt,
  observation,
  verifiedAt: timeline.verifiedAt,
});
```

Return `BLOCKED` if verification is not `VERIFIED_EFFECT`.

Build RC1 evidence entries exactly as the existing `registerWardenRiverEffectConformance.ts` path does, then call:

```ts
const seal = adaptRc1EvidenceSeal(reservation, verification.effect, entries);
const causalTrace = adaptRc1CausalTrace(request.correlationId, entries);
```

Require exact match on reservation, effect and seal refs before a composite proof can be minted.

- [ ] **Step 6: Build stage Proof References from native timestamps**

Create seven proofs in this order:

```text
Genesis device resolution
Synnergyze composition
Warden authorization
River reservation
Synnergyze execution
Synnergyze verification
River seal
```

Use these subject refs and timestamps:

```text
Genesis: subject=request.genesisDevice.deviceRef, createdAt=request.genesisDevice.resolvedAt
Composition: subject=request.requestRef, createdAt=request.requestedAt
Warden: subject=decision.decisionRef, createdAt=decision.decidedAt
Reservation: subject=reservation.reservationRef, createdAt=reservation.reservedAt
Execution: subject=executionReceipt.receiptRef, createdAt=executionReceipt.executedAt
Verification: subject=verification.effect.effectRef, createdAt=verification.effect.verifiedAt
Seal: subject=seal.sealRef, createdAt=seal.sealedAt
```

Each proof must include the immediately preceding proof ID plus the native refs needed to prove its claim. The reservation proof must include `action.genesisDeviceRequestDigest`, and the seal proof must include `seal.traceDigest` plus the verified effect ref.

Call `assertProofReferenceIntegrityV1()` on all seven proofs before creating the composite.

- [ ] **Step 7: Mint the composite proof only after terminal River seal**

Create the composite with:

```ts
const compositeProof = createRiverRuntimeCompositeProofReferenceV1({
  subjectRef: request.correlationId,
  scope: "GROUP",
  scopeRef: input.groupScopeRef,
  sourceRefs: [
    ...proofChain.map((proof) => proof.proofId),
    seal.sealRef,
    seal.traceDigest,
    causalTrace.reservationRef,
    causalTrace.effectRef!,
  ],
  createdAt: seal.sealedAt,
  synthetic: true,
});
```

Return:

```ts
{
  state: "CONTROLLED_ACTIVE_PROOF",
  proofChain,
  compositeProof,
  requestRef: request.requestRef,
  correlationId: request.correlationId,
  externalEffects: false,
  settlementFinality: false,
  registryTruthPromoted: false,
}
```

- [ ] **Step 8: Run focused tests and type-check**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  modules/proof/proof-reference.test.ts \
  modules/river/reservation-service.test.ts \
  modules/synnergyze/execution-gate.test.ts \
  modules/synnergyze/effect-verification.test.ts \
  modules/synnergyze/runtime-activation.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add modules/synnergyze/runtime-activation.ts modules/synnergyze/runtime-activation.test.ts
git commit -m "feat: activate bounded Synnergyze proof runtime"
```

---

### Task 4: Expose R0.1 through the existing explicitly gated MCP surface

**Files:**
- Modify: `src/tools/registerWardenConformanceDecision.ts`
- Modify: `src/tools/registerWardenConformanceDecision.test.ts`
- Create: `src/tools/registerSynnergyzeRuntimeActivation.ts`
- Create: `src/tools/registerSynnergyzeRuntimeActivation.test.ts`
- Modify: `src/commands/start-server.ts`
- Modify: `src/commands/start-server.synnergyze.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces MCP operation: `synnergyzeActivateControlledRuntimeR01`.

- [ ] **Step 1: Write a failing transport test for `genesisDevice`**

Add a device-bound request containing the complete `genesisDevice` object from Task 3 to the Warden conformance parser test. Assert `parseWardenConformanceDecisionInput()` preserves the object unchanged.

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run src/tools/registerWardenConformanceDecision.test.ts
```

Expected: RED because the current strict schema rejects `genesisDevice`.

- [ ] **Step 2: Extend the transport schema**

Add:

```ts
const genesisDeviceSchema = z.object({
  resolutionRef: z.string().min(1),
  deviceRef: z.string().min(1),
  estateRef: z.string().min(1),
  attestationRef: z.string().min(1),
  assuranceLevel: z.enum(["L0", "L1", "L2", "L3", "L4"]),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  resolvedAt: z.string().min(1),
  validUntil: z.string().min(1).optional(),
}).strict();
```

Add `genesisDevice: genesisDeviceSchema.optional()` to the Zod request and the equivalent nested JSON schema. Do not change `WARDEN_CONFORMANCE_POLICY`.

- [ ] **Step 3: Write failing MCP registration and invocation tests**

Create `src/tools/registerSynnergyzeRuntimeActivation.test.ts` and prove:

```text
tool absent by default
tool absent when any prerequisite env flag is missing
tool absent for allow-tools=all
tool present only when all five env flags are 1 and exact tool name is allow-listed
successful invocation returns CONTROLLED_ACTIVE_PROOF
successful invocation returns G-RIV-RUNTIME-* composite proof
externalEffects=false
settlementFinality=false
registryTruthPromoted=false
exact replay returns the same Proof IDs
mismatched transient device-security input fails closed
```

- [ ] **Step 4: Implement the MCP tool**

Create `src/tools/registerSynnergyzeRuntimeActivation.ts` with:

```ts
export const operationId = "synnergyzeActivateControlledRuntimeR01";
export const enableEnvironmentVariable = "VSR_SYNNERGYZE_RUNTIME_ACTIVATION_R01";
```

Create a strict schema for `executionDeviceSecurity` matching `ResolvedDeviceSecurityContextV1` and accept `groupScopeRef` as a non-empty string.

Use one long-lived `SynnergyzeRuntimeActivationServiceV1` per tool registration. On each call, read the injected clock once and use that value for all six timeline fields. Reject inputs without `executionDeviceRef` or `genesisDevice` before calling the service.

Registration requires:

```text
VSR_WARDEN_MCP_CONFORMANCE=1
VSR_RIVER_MCP_CONFORMANCE=1
VSR_SYNNERGYZE_MCP_CONFORMANCE=1
VSR_EFFECT_MCP_CONFORMANCE=1
VSR_SYNNERGYZE_RUNTIME_ACTIVATION_R01=1
explicit allow-list membership for synnergyzeActivateControlledRuntimeR01
```

- [ ] **Step 5: Wire startup and package script**

In `src/commands/start-server.ts`, call `maybeRegisterSynnergyzeRuntimeActivation()` with the existing tool filter and environment object.

Add:

```json
"test:runtime-activation": "vitest run modules/proof/proof-reference.test.ts modules/synnergyze/runtime-activation.test.ts src/tools/registerSynnergyzeRuntimeActivation.test.ts"
```

- [ ] **Step 6: Run transport/startup tests and type-check**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  src/tools/registerWardenConformanceDecision.test.ts \
  src/tools/registerSynnergyzeRuntimeActivation.test.ts \
  src/commands/start-server.synnergyze.test.ts
npm run test:runtime-activation
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/registerWardenConformanceDecision.ts \
  src/tools/registerWardenConformanceDecision.test.ts \
  src/tools/registerSynnergyzeRuntimeActivation.ts \
  src/tools/registerSynnergyzeRuntimeActivation.test.ts \
  src/commands/start-server.ts src/commands/start-server.synnergyze.test.ts package.json
git commit -m "feat: expose proof-bound controlled runtime activation"
```

---

### Task 5: Promote only the controlled conformance state and issue the qualification receipt

**Files:**
- Modify: `modules/synnergyze/client-control-plane.ts`
- Modify: `modules/synnergyze/client-control-plane.test.ts`
- Modify: `config/synnergyze/client-bootstrap-r0.1.json`
- Modify: `.vsr/module-bindings.yaml`
- Create: `docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md`

- [ ] **Step 1: Write failing state assertions**

Require:

```ts
expect(readiness.executionState).toBe("CONTROLLED_ACTIVE");
expect(readiness.proofChain).toBe("REQUIRED");
expect(readiness.externalEffects).toBe(false);
expect(client.executable).toBe(false);
expect(workflow.executable).toBe(false);
```

- [ ] **Step 2: Run and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/client-control-plane.test.ts
```

Expected: failures against `BLOCKED_RUNTIME_ACTIVATION`.

- [ ] **Step 3: Update readiness typing**

Set:

```ts
executionState: "CONTROLLED_ACTIVE";
proofChain: "REQUIRED";
externalEffects: false;
```

Return those exact values from `readiness()`. Leave client/workflow `executable:false` unchanged.

- [ ] **Step 4: Update config and module bindings**

Set the config execution object to:

```json
{
  "state": "CONTROLLED_ACTIVE",
  "external_effects": false,
  "proof_chain": "REQUIRED",
  "activation_gate": "EXTERNAL-EFFECT-ACTIVATION-R0.1"
}
```

Set River config to:

```json
{
  "execution_evidence": "REQUIRED",
  "seal": "REQUIRED"
}
```

For `MOD-SYNNERGYZE-001`, set:

```yaml
state: conformance_implemented
runtime_state: CONTROLLED_ACTIVE
warden_binding: FIT_QUALIFIED
proof_chain: REQUIRED
external_effects: false
activation_gate: EXTERNAL-EFFECT-ACTIVATION-R0.1
```

Add dependencies on `WARDEN-RUNTIME-001`, `RIVEROS-001`, `GENESIS-DEVICE-RESOLUTION`, and `RIVER-EVIDENCE-SEAL`. Add public outputs `SynnergyzeRuntimeActivationResultV1` and `ProofReferenceV1`. Add the three new test files to the module test list.

Do not mark any module `AUTHORIZED` or `ACTIVE`.

- [ ] **Step 5: Run the fresh qualification suite on Node 22.14.0**

```bash
npm run test:runtime-activation
npm run test
npm run type-check
npm run lint
git diff --check
git status --short
```

Also run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  modules/warden/decision-service.test.ts \
  modules/river/reservation-service.test.ts \
  modules/synnergyze/warden-request-bridge.test.ts \
  modules/synnergyze/execution-gate.test.ts \
  modules/synnergyze/effect-verification.test.ts \
  modules/genesis-node-builder/device-registry.test.ts
```

Record the exact test counts from the command output.

- [ ] **Step 6: Capture actual Proof IDs and native refs from the deterministic fixture**

Run a one-off Node/tsx invocation that imports the deterministic fixture used by `runtime-activation.test.ts` and prints:

```ts
console.log(JSON.stringify({
  proofIds: result.proofChain.map((proof) => proof.proofId),
  compositeProofId: result.compositeProof?.proofId,
  requestRef: result.requestRef,
  correlationId: result.correlationId,
}, null, 2));
```

If the fixture is not exported, temporarily export it from the test helper, run the command, then remove that temporary export before committing. Do not commit debug logging.

- [ ] **Step 7: Write the qualification receipt using only real captured values**

Create `docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md` and record:

```text
Stage: SYNNERGYZE-RUNTIME-ACTIVATION-R0.1
Runtime state: CONTROLLED_ACTIVE
Warden binding: FIT_QUALIFIED
Device-bound qualification: REQUIRED
Proof chain: REQUIRED
River seal: REQUIRED
External effects: false
Settlement finality: false
Registry truth promoted: false
Next gate: EXTERNAL-EFFECT-ACTIVATION-R0.1
```

Also record the exact final commit SHA, exact full/focused test counts, actual Proof IDs from Step 6, and the actual Genesis resolution, Warden decision, River reservation, Synnergyze execution receipt, verified effect, River seal, and causal-trace refs from the deterministic qualification run.

For each material proof statement use:

```text
<actual Proof ID> — Proof from <actual proving system>: <exact claim proven by that record>.
```

Do not invent or preallocate a Proof ID in the receipt.

- [ ] **Step 8: Commit**

```bash
git add modules/synnergyze/client-control-plane.ts \
  modules/synnergyze/client-control-plane.test.ts \
  config/synnergyze/client-bootstrap-r0.1.json .vsr/module-bindings.yaml \
  docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md
git commit -m "chore: qualify controlled Synnergyze runtime R0.1"
```

---

### Task 6: Publish the stacked runtime PR and verify exact-head evidence

**Files:**
- No production files added in this task.

- [ ] **Step 1: Verify final lineage**

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse HEAD^{tree}
git log --oneline -8
```

Require the branch to descend from `1608cfa803df2ffec41434b30aadfb65603bf408`.

- [ ] **Step 2: Review exact diff scope**

```bash
git diff --name-status 1608cfa803df2ffec41434b30aadfb65603bf408...HEAD
```

Confirm the diff contains only proof, River lineage, controlled runtime, transport, conformance metadata, tests, and docs. Confirm it contains no real provider connector, payment rail, SILK settlement adapter, ERP write adapter, or production credential file.

- [ ] **Step 3: Push and open the stacked PR**

Open with:

```text
base = feat/synnergyze-client-bootstrap-r0.1
head = feat/synnergyze-runtime-activation-r0.1
title = feat: activate proof-bound Synnergyze controlled runtime R0.1
```

PR body must state:

```text
stacked on PR #129
runtime state = CONTROLLED_ACTIVE
Proof ID doctrine = deterministic issuer-owned human ID over full native digest
qualification path = device-bound Genesis + transient device security
externalEffects = false
settlementFinality = false
registryTruthPromoted = false
next gate = EXTERNAL-EFFECT-ACTIVATION-R0.1
```

Include the exact final head SHA and exact test counts from Task 5.

- [ ] **Step 4: Verify exact-head CI**

Require success on the exact runtime head for:

```text
test
type-check
lint
Runtime AuthZ Bridge
Datadog Synthetic tests
```

Verify the focused runtime/proof suites are either present in the full `test` run or separately recorded from `npm run test:runtime-activation`.

- [ ] **Step 5: Perform final verification before any completion claim**

Invoke `superpowers:verification-before-completion` and verify:

```text
full suite has zero failures
focused runtime/proof suite has zero failures
type-check success
lint success
PR head equals the qualified SHA
PR base equals feat/synnergyze-client-bootstrap-r0.1
PR is not merged
external-effects flags remain false
```

Only then report the stage as qualified. Do not merge either PR without explicit user instruction.
