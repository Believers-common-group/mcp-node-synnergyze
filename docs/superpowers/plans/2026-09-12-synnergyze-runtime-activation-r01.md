# SYNNERGYZE-RUNTIME-ACTIVATION-R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the bounded Genesis → Synnergyze → Warden → River → Synnergyze → River conformance runtime with deterministic human-readable Proof IDs while keeping external effects, settlement finality, and Registry truth promotion disabled.

**Architecture:** Strengthen the existing River action envelope so the Genesis device dependency remains cryptographically bound after Warden authorization, add deterministic issuer-bound Proof Reference factories, compose the existing Warden/River/Synnergyze engines into one device-bound controlled activation service, and expose that service through an explicitly gated MCP tool. Existing native refs and SHA-256 hashes remain authoritative; Proof IDs are a provenance index over them, never a replacement evidence engine.

**Tech Stack:** TypeScript 5.8, Node.js `v22.14.0`, Vitest 3, Zod, Node `crypto` SHA-256, existing Warden/River/Synnergyze conformance modules.

**Spec:** `docs/superpowers/specs/2026-09-12-synnergyze-runtime-activation-r01-design.md`

## Global Constraints

- `Proof ID != cryptographic digest`.
- Proof IDs use `<SCOPE>-<ISSUER>-<CLAIM>-<ID8>` with deterministic uppercase SHA-256 prefix suffixes.
- A caller MUST NOT be able to pass an arbitrary `proofFrom`; issuer-specific creation APIs hard-code issuer ownership.
- Proof `createdAt` comes from the native source event/receipt, never from the replay call time.
- R0.1 qualification is device-bound and requires both the Genesis device dependency and the existing transient device-security context.
- Genesis remains canonical for device identity/binding/attestation/resolution.
- Warden remains the only authorization/policy decision authority.
- River remains evidence reservation/seal/causal-trace authority.
- Synnergyze remains orchestration/execution/effect-verification authority for its own stages.
- The existing River seal/causal-trace path is reused; no second evidence seal is created.
- `CONTROLLED_ACTIVE` does not mean production `ACTIVE`.
- `externalEffects = false`, `settlementFinality = false`, `registryTruthPromoted = false` in every R0.1 runtime result.
- The next gate is `EXTERNAL-EFFECT-ACTIVATION-R0.1`.
- Do not weaken existing device-security execution-gate checks.
- Do not merge PR #129 or the runtime PR without explicit user instruction.

## File Structure

New focused units:

- `modules/proof/proof-reference.ts` — deterministic Proof Reference types, canonicalization, integrity assertion, and issuer-bound factory APIs.
- `modules/proof/proof-reference.test.ts` — Proof ID/digest/canonicalization/provenance tests.
- `modules/synnergyze/runtime-activation.ts` — device-bound controlled runtime orchestration using existing core engines and Proof Reference factories.
- `modules/synnergyze/runtime-activation.test.ts` — complete RED→GREEN runtime/proof-chain tests.
- `src/tools/registerSynnergyzeRuntimeActivation.ts` — explicit MCP exposure and opt-in gating for the controlled runtime only.
- `src/tools/registerSynnergyzeRuntimeActivation.test.ts` — MCP input/gating/replay tests.
- `docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md` — exact-head qualification receipt with real Proof IDs.

Existing files changed only where the new boundary genuinely needs them:

- `modules/river/contracts.ts` and `modules/river/reservation-service.ts` — bind Genesis device dependency digest into `ActionEnvelopeV1`.
- `modules/synnergyze/execution-gate.ts` — include the Genesis dependency digest in execution idempotency identity.
- `src/tools/registerWardenConformanceDecision.ts` — accept the already-approved `genesisDevice` request shape at the conformance transport boundary.
- `src/commands/start-server.ts` — conditionally register the runtime-activation tool.
- `modules/synnergyze/client-control-plane.ts`, config and `.vsr/module-bindings.yaml` — reflect `CONTROLLED_ACTIVE` while retaining `executable:false` for ordinary client/workflow external execution.

---

### Task 1: Bind the Genesis device dependency into the River action envelope

**Files:**
- Modify: `modules/river/contracts.ts`
- Modify: `modules/river/reservation-service.ts`
- Modify: `modules/river/reservation-service.test.ts`
- Modify: `modules/synnergyze/execution-gate.ts`
- Modify: `modules/synnergyze/execution-gate.test.ts`

**Interfaces:**
- Consumes: `WardenDecisionRequestV1.genesisDevice` from `modules/warden/contracts.ts`.
- Produces: `ActionEnvelopeV1.genesisDeviceRequestDigest?: string`.
- Later tasks rely on this digest as a native source ref for River reservation/execution proof identity.

- [ ] **Step 1: Add failing River tests for Genesis-device action binding**

In `modules/river/reservation-service.test.ts`, add device-bound fixtures using the current Warden request contract:

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

Add tests that prove:

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

Also prove a device-bound request with no `genesisDevice` fails closed at River action construction.

- [ ] **Step 2: Run the focused River test and verify RED**

Run on Node `v22.14.0`:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/river/reservation-service.test.ts
```

Expected: compile/assertion failures because `ActionEnvelopeV1` has no `genesisDeviceRequestDigest` and River does not bind Genesis device provenance yet.

- [ ] **Step 3: Extend the River contract and canonical action payload**

In `modules/river/contracts.ts`, add:

```ts
export interface ActionEnvelopeV1 {
  // existing fields...
  executionDeviceRef?: string;
  genesisDeviceRequestDigest?: string;
  deviceSecurityPolicyRef?: string;
  deviceSecurityRequestDigest?: string;
  // existing fields...
}
```

In `modules/river/reservation-service.ts`, add a deterministic helper:

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

Add `genesisDeviceRequestDigest: requestGenesisDeviceDigest(request)` to `canonicalActionPayload()` and include `genesisDeviceRequestDigest` in `assertExactAction()`.

- [ ] **Step 4: Bind the Genesis digest into Synnergyze execution identity**

In `modules/synnergyze/execution-gate.ts`, include:

```ts
genesisDeviceRequestDigest: input.action.genesisDeviceRequestDigest ?? null,
```

inside `executionFingerprint()`.

Add an execution-gate regression test that reuses the same `actionRef` with a mutated Genesis digest and proves `execution_idempotency_conflict` rather than treating it as an exact replay.

- [ ] **Step 5: Run focused River + execution tests and verify GREEN**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  modules/river/reservation-service.test.ts \
  modules/synnergyze/execution-gate.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all focused tests pass and type-check exits 0.

- [ ] **Step 6: Commit the strengthened action lineage**

```bash
git add modules/river/contracts.ts modules/river/reservation-service.ts \
  modules/river/reservation-service.test.ts modules/synnergyze/execution-gate.ts \
  modules/synnergyze/execution-gate.test.ts
git commit -m "feat: bind Genesis device provenance into River actions"
```

---

### Task 2: Add deterministic issuer-bound Proof References

**Files:**
- Create: `modules/proof/proof-reference.ts`
- Create: `modules/proof/proof-reference.test.ts`

**Interfaces:**
- Produces: `ProofReferenceV1`, `ProofScopeV1`, `ProofTypeV1`, `assertProofReferenceIntegrityV1()` and eight issuer-bound creation functions.
- No public API accepts `proofFrom` as an input parameter.
- Task 3 consumes these factories to build the runtime proof chain.

- [ ] **Step 1: Write failing Proof Reference tests**

Create `modules/proof/proof-reference.test.ts` with imports that do not exist yet:

```ts
import {
  assertProofReferenceIntegrityV1,
  createGenesisDeviceProofReferenceV1,
  createRiverRuntimeCompositeProofReferenceV1,
  createWardenAuthorizationProofReferenceV1,
} from "./proof-reference.ts";
```

Use this fixed input shape:

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

Prove:

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
```

Add ownership assertions:

```ts
expect(createWardenAuthorizationProofReferenceV1({ ...base, subjectRef: "WARDEN-DECISION:001" }).proofFrom)
  .toBe("WARDEN");
expect(createRiverRuntimeCompositeProofReferenceV1({
  ...base,
  scope: "GROUP",
  scopeRef: "GROUP:ALPHA-RUNTIME-QUALIFICATION-001",
  subjectRef: "CORR:RUNTIME-001",
}).proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
```

- [ ] **Step 2: Run the Proof Reference test and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/proof/proof-reference.test.ts
```

Expected: module-not-found/undefined-export failure.

- [ ] **Step 3: Implement the Proof Reference types and private canonical builder**

In `modules/proof/proof-reference.ts`, define:

```ts
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

Define internal fixed metadata:

```ts
const DEFINITIONS = {
  GENESIS_DEVICE_RESOLUTION: {
    issuer: "GENESIS", issuerCode: "GEN", claimCode: "DEVICE",
    claim: "the execution device/context was canonically resolved",
  },
  SYNNERGYZE_COMPOSITION: {
    issuer: "SYNNERGYZE", issuerCode: "SYN", claimCode: "COMPOSE",
    claim: "the governed runtime request was composed with required lineage",
  },
  WARDEN_AUTHORIZATION: {
    issuer: "WARDEN", issuerCode: "WAR", claimCode: "AUTH",
    claim: "the exact runtime request was authorized under Warden policy",
  },
  RIVER_RESERVATION: {
    issuer: "RIVEROS", issuerCode: "RIV", claimCode: "RESERVE",
    claim: "evidence capacity was reserved for the exact authorized action",
  },
  SYNNERGYZE_EXECUTION: {
    issuer: "SYNNERGYZE", issuerCode: "SYN", claimCode: "EXEC",
    claim: "the reserved authorized action passed controlled execution",
  },
  SYNNERGYZE_VERIFICATION: {
    issuer: "SYNNERGYZE", issuerCode: "SYN", claimCode: "VERIFY",
    claim: "post-execution observation produced a verified effect",
  },
  RIVER_SEAL: {
    issuer: "RIVEROS", issuerCode: "RIV", claimCode: "SEAL",
    claim: "the verified effect was bound into the River evidence seal and causal trace",
  },
  RIVER_RUNTIME_COMPOSITE: {
    issuer: "RIVEROS", issuerCode: "RIV", claimCode: "RUNTIME",
    claim: "the required controlled-runtime proofs are causally bound at the terminal River seal",
  },
} as const;
```

The private builder MUST:

```ts
const canonicalSourceRefs = [...new Set(input.sourceRefs.filter(Boolean))].sort();
const payload = JSON.stringify({
  proofFrom: definition.issuer,
  proofType,
  claim: definition.claim,
  subjectRef: input.subjectRef,
  scope: input.scope,
  scopeRef: input.scopeRef,
  sourceRefs: canonicalSourceRefs,
  createdAt: input.createdAt,
  synthetic: input.synthetic,
  supersedesProofId: input.supersedesProofId ?? null,
});
const hex = createHash("sha256").update(payload, "utf8").digest("hex");
```

Map scope to `E | G | M`, build `<SCOPE>-<ISSUER>-<CLAIM>-<HEX8>`, and retain the full `sha256:<hex>` digest.

- [ ] **Step 4: Expose only issuer-bound factory functions**

Export exactly these public creation APIs:

```ts
createGenesisDeviceProofReferenceV1(input)
createSynnergyzeCompositionProofReferenceV1(input)
createWardenAuthorizationProofReferenceV1(input)
createRiverReservationProofReferenceV1(input)
createSynnergyzeExecutionProofReferenceV1(input)
createSynnergyzeVerificationProofReferenceV1(input)
createRiverSealProofReferenceV1(input)
createRiverRuntimeCompositeProofReferenceV1(input)
```

Do NOT export a generic `(proofFrom, proofType, input)` creation function.

Implement `assertProofReferenceIntegrityV1(proof)` by reconstructing the proof from `proof.proofType`, asserting fixed issuer/type ownership, rebuilding the canonical digest, and checking both `integrityDigest` and the `ID8` suffix. Use explicit fail-closed errors:

```text
proof_issuer_mismatch
proof_scope_prefix_mismatch
proof_integrity_digest_mismatch
proof_id_digest_mismatch
```

- [ ] **Step 5: Run Proof Reference tests and type-check**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/proof/proof-reference.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all proof tests pass and no type errors.

- [ ] **Step 6: Commit the Proof Reference contract**

```bash
git add modules/proof/proof-reference.ts modules/proof/proof-reference.test.ts
git commit -m "feat: add deterministic system-owned Proof IDs"
```

---

### Task 3: Implement the device-bound controlled runtime activation service

**Files:**
- Create: `modules/synnergyze/runtime-activation.ts`
- Create: `modules/synnergyze/runtime-activation.test.ts`

**Interfaces:**
- Consumes: `WardenDecisionRequestV1`, `SyntheticWardenDecisionPolicyV1`, `ResolvedDeviceSecurityContextV1`, the River reservation service, controlled execution gate, effect verifier, RC1 River seal adapters, and Task 2 Proof Reference factories.
- Produces: `SynnergyzeRuntimeActivationResultV1` with a partial or complete proof chain and a `G-RIV-RUNTIME-*` composite only on terminal River seal success.

- [ ] **Step 1: Write the failing controlled-runtime test fixture**

Create a deterministic device-bound fixture in `modules/synnergyze/runtime-activation.test.ts`:

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

Use the existing transient context shape:

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

Use the fixed conformance identity/policy values and a monotonic timeline:

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

Add RED assertions for the successful chain:

```ts
expect(result.state).toBe("CONTROLLED_ACTIVE_PROOF");
expect(result.proofChain.map((proof) => proof.proofFrom)).toEqual([
  "GENESIS", "SYNNERGYZE", "WARDEN", "RIVEROS", "SYNNERGYZE", "SYNNERGYZE", "RIVEROS",
]);
expect(result.compositeProof?.proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
expect(result.externalEffects).toBe(false);
expect(result.settlementFinality).toBe(false);
expect(result.registryTruthPromoted).toBe(false);
```

Add RED tests proving:

- missing Genesis dependency -> `BLOCKED` and no composite proof;
- missing/mismatched transient device-security context -> `BLOCKED` and no composite proof;
- Warden `DENY` -> no River reservation/execution/verification/seal/composite proof;
- expired Warden/device validity -> blocked;
- verification exception -> no River seal proof/composite proof;
- causal trace mismatch -> no composite proof;
- exact replay returns identical proof IDs and adapter invocation count remains 1;
- changed device-security context with same requestRef throws `runtime_activation_replay_conflict`;
- every emitted proof passes `assertProofReferenceIntegrityV1()`.

- [ ] **Step 2: Run runtime activation tests and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/runtime-activation.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Define runtime activation input/result contracts**

In `modules/synnergyze/runtime-activation.ts`, define:

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

Use a class so exact replay preserves one in-memory execution journal:

```ts
export class SynnergyzeRuntimeActivationServiceV1 {
  private readonly river = new SyntheticRiverReservationServiceV1();
  private readonly adapter = new SyntheticServiceRequestCreateAdapterV1();
  private readonly gate = new ControlledExecutionGateV1([this.adapter]);
  private readonly verifier = new EffectVerificationServiceV1();
  private readonly observer = new SyntheticServiceRequestObservationSourceV1();
  private readonly byRequestRef = new Map<string, StoredRuntimeActivationV1>();

  execute(input: SynnergyzeRuntimeActivationInputV1): SynnergyzeRuntimeActivationResultV1;
  adapterInvocationCount(): number;
}
```

- [ ] **Step 4: Implement fail-closed preconditions and replay fingerprinting**

Before Warden evaluation, require:

```ts
request.executionDeviceRef
request.genesisDevice
request.genesisDevice.deviceRef === request.executionDeviceRef
input.estateScopeRef === request.genesisDevice.estateRef
executionDeviceSecurity.deviceRef === request.executionDeviceRef
executionDeviceSecurity.state === "ACTIVE"
```

Also require the transient context to match the flattened request security fields:

```ts
request.deviceSecurityPolicyRef === executionDeviceSecurity.policyRef
request.deviceSecurityResolvedAt === executionDeviceSecurity.resolvedAt
request.deviceSecurityValidUntil === executionDeviceSecurity.validUntil
new Set(request.deviceSecuritySourceRefs).has(executionDeviceSecurity.resolutionRef)
new Set(request.deviceSecuritySourceRefs).has(executionDeviceSecurity.evidenceRef)
```

Validate timeline order:

```text
request.requestedAt <= decidedAt <= reservedAt <= checkedAt <= executedAt <= observedAt <= verifiedAt
```

Create a replay fingerprint over canonical request material, canonical Genesis evidence refs, canonical transient-security context, full policy material, `estateScopeRef`, and `groupScopeRef`. Do not include `timeline`, so an exact retry at a later wall-clock time returns the original stored result. Same `requestRef` + different fingerprint throws `runtime_activation_replay_conflict`.

- [ ] **Step 5: Compose the existing core runtime engines**

Implement this exact order:

```ts
const decision = evaluateSyntheticWardenDecisionV1({
  request,
  policy,
  decidedAt: timeline.decidedAt,
});
```

If the decision is not `ALLOW`, return `BLOCKED` before River mutation.

For `ALLOW`:

```ts
const action = buildAuthorizedActionEnvelopeV1(request, decision);
const reservation = this.river.reserve({
  request,
  decision,
  action,
  reservedAt: timeline.reservedAt,
});

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

const executionReceipt = this.gate.execute({
  action,
  reservation,
  decision,
  checkpoint,
  executionDeviceSecurity: input.executionDeviceSecurity,
  executedAt: timeline.executedAt,
});
```

Then:

```ts
const observation = this.observer.observe(executionReceipt, timeline.observedAt);
const verification = this.verifier.verify({
  receipt: executionReceipt,
  observation,
  verifiedAt: timeline.verifiedAt,
});
```

If verification is not `VERIFIED_EFFECT`, return `BLOCKED` and do not seal.

Build the existing RC1-compatible reservation/seal entries exactly as the merged effect-conformance path does, then call:

```ts
const seal = adaptRc1EvidenceSeal(reservation, verification.effect, entries);
const causalTrace = adaptRc1CausalTrace(request.correlationId, entries);
```

Require:

```ts
seal.state === "SEALED"
causalTrace.sealed === true
causalTrace.reservationRef === reservation.reservationRef
causalTrace.effectRef === verification.effect.effectRef
causalTrace.sealRef === seal.sealRef
```

- [ ] **Step 6: Build the seven stage proofs from native timestamps**

Create proofs in this exact order:

```ts
const genesisProof = createGenesisDeviceProofReferenceV1({
  subjectRef: request.genesisDevice.deviceRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    request.genesisDevice.resolutionRef,
    request.genesisDevice.attestationRef,
    ...request.genesisDevice.evidenceRefs,
  ],
  createdAt: request.genesisDevice.resolvedAt,
  synthetic: true,
});
```

```ts
const compositionProof = createSynnergyzeCompositionProofReferenceV1({
  subjectRef: request.requestRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    request.programRef,
    request.eventRef,
    ...request.representationSourceRefs,
    genesisProof.proofId,
  ],
  createdAt: request.requestedAt,
  synthetic: true,
});
```

```ts
const wardenProof = createWardenAuthorizationProofReferenceV1({
  subjectRef: decision.decisionRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    request.requestRef,
    ...request.authorityRefs,
    ...request.policyRefs,
    genesisProof.proofId,
    compositionProof.proofId,
  ],
  createdAt: decision.decidedAt,
  synthetic: true,
});
```

```ts
const reservationProof = createRiverReservationProofReferenceV1({
  subjectRef: reservation.reservationRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    action.actionRef,
    decision.decisionRef,
    reservation.authorizationDigest,
    action.genesisDeviceRequestDigest!,
    wardenProof.proofId,
  ],
  createdAt: reservation.reservedAt,
  synthetic: true,
});
```

```ts
const executionProof = createSynnergyzeExecutionProofReferenceV1({
  subjectRef: executionReceipt.receiptRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    action.actionRef,
    reservation.reservationRef,
    decision.decisionRef,
    checkpoint.checkpointRef,
    executionReceipt.adapterRef,
    executionReceipt.adapterResultRef,
    reservationProof.proofId,
  ],
  createdAt: executionReceipt.executedAt,
  synthetic: true,
});
```

```ts
const verificationProof = createSynnergyzeVerificationProofReferenceV1({
  subjectRef: verification.effect.effectRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    verification.effect.verificationRef,
    observation.observationRef,
    observation.sourceEvidenceRef,
    executionReceipt.receiptRef,
    executionProof.proofId,
  ],
  createdAt: verification.effect.verifiedAt,
  synthetic: true,
});
```

```ts
const sealProof = createRiverSealProofReferenceV1({
  subjectRef: seal.sealRef,
  scope: "ESTATE",
  scopeRef: input.estateScopeRef,
  sourceRefs: [
    seal.reservationRef,
    verification.effect.effectRef,
    seal.traceDigest,
    causalTrace.sealRef!,
    verificationProof.proofId,
  ],
  createdAt: seal.sealedAt,
  synthetic: true,
});
```

Assert each proof with `assertProofReferenceIntegrityV1()` before creating the composite.

- [ ] **Step 7: Mint the composite River runtime proof only after terminal seal**

```ts
const proofChain = [
  genesisProof,
  compositionProof,
  wardenProof,
  reservationProof,
  executionProof,
  verificationProof,
  sealProof,
] as const;

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

Store this immutable result by `requestRef` for exact replay.

- [ ] **Step 8: Run focused runtime/proof/River tests and verify GREEN**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  modules/proof/proof-reference.test.ts \
  modules/river/reservation-service.test.ts \
  modules/synnergyze/execution-gate.test.ts \
  modules/synnergyze/effect-verification.test.ts \
  modules/synnergyze/runtime-activation.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all focused suites pass; the synthetic adapter invocation count remains 1 after exact replay.

- [ ] **Step 9: Commit the controlled runtime core**

```bash
git add modules/synnergyze/runtime-activation.ts modules/synnergyze/runtime-activation.test.ts
git commit -m "feat: activate bounded Synnergyze proof runtime"
```

---

### Task 4: Expose controlled activation through an explicitly gated MCP tool

**Files:**
- Modify: `src/tools/registerWardenConformanceDecision.ts`
- Modify: `src/tools/registerWardenConformanceDecision.test.ts`
- Create: `src/tools/registerSynnergyzeRuntimeActivation.ts`
- Create: `src/tools/registerSynnergyzeRuntimeActivation.test.ts`
- Modify: `src/commands/start-server.ts`
- Modify: `src/commands/start-server.synnergyze.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 3 `SynnergyzeRuntimeActivationServiceV1`.
- Produces MCP operation `synnergyzeActivateControlledRuntimeR01`.
- This operation remains synthetic/reference-only and cannot activate an external adapter.

- [ ] **Step 1: Add failing conformance-schema tests for `genesisDevice`**

Extend the request-schema tests so a device-bound request containing:

```ts
genesisDevice: {
  resolutionRef: "GENESIS-DEVICE-RESOLUTION:alpha001",
  deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
  estateRef: "GENESIS-ESTATE-001",
  attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
  assuranceLevel: "L3",
  evidenceRefs: ["RIVER-DEVICE-EVIDENCE-001"],
  resolvedAt: "2026-09-12T05:00:00.000Z",
  validUntil: "2026-09-12T06:00:00.000Z",
}
```

survives `parseWardenConformanceDecisionInput()` unchanged.

Run the focused Warden tool test and expect RED because the current strict schema rejects `genesisDevice`.

- [ ] **Step 2: Extend the Warden conformance request schema without changing authority semantics**

Add a strict nested Zod schema:

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

Add `genesisDevice: genesisDeviceSchema.optional()` to the Zod request and the equivalent nested object to `wardenConformanceRequestJsonSchema`.

Do not alter `WARDEN_CONFORMANCE_POLICY` merely to make device execution pass. The base Warden invariant already requires Genesis dependency for device-bound requests.

- [ ] **Step 3: Write the failing runtime-tool tests**

In `registerSynnergyzeRuntimeActivation.test.ts`, define the operation input as:

```ts
{
  request: <device-bound WardenDecisionRequestV1>,
  executionDeviceSecurity: {
    resolutionRef: "DEVICE-SECURITY-RESOLUTION-001",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    state: "ACTIVE",
    policyRef: "DEVICE-SECURITY-POLICY-001",
    evidenceRef: "DEVICE-SECURITY-EVIDENCE-001",
    assuranceLevel: "L3",
    resolvedAt: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
  },
  groupScopeRef: "GROUP:ALPHA-RUNTIME-QUALIFICATION-001"
}
```

Prove:

- tool is not registered unless every prerequisite conformance env flag plus the runtime flag is `1`;
- explicit allow-list membership is required; `all` does not expose it;
- successful invocation returns `CONTROLLED_ACTIVE_PROOF` and a `G-RIV-RUNTIME-*` composite;
- response flags external effects/settlement/Registry truth as false;
- exact replay returns the same Proof IDs;
- malformed/mismatched device security fails closed.

- [ ] **Step 4: Implement the runtime MCP tool**

Create `src/tools/registerSynnergyzeRuntimeActivation.ts` with:

```ts
export const operationId = "synnergyzeActivateControlledRuntimeR01";
export const enableEnvironmentVariable = "VSR_SYNNERGYZE_RUNTIME_ACTIVATION_R01";
```

Define a strict `executionDeviceSecurity` schema matching `ResolvedDeviceSecurityContextV1`.

Construct one long-lived `SynnergyzeRuntimeActivationServiceV1` per registration. For each call, use the injected clock once:

```ts
const now = clock();
const result = service.execute({
  request: parsed.request as WardenDecisionRequestV1,
  policy: WARDEN_CONFORMANCE_POLICY,
  executionDeviceSecurity: parsed.executionDeviceSecurity,
  estateScopeRef: parsed.request.genesisDevice!.estateRef,
  groupScopeRef: parsed.groupScopeRef,
  timeline: {
    decidedAt: now,
    reservedAt: now,
    checkedAt: now,
    executedAt: now,
    observedAt: now,
    verifiedAt: now,
  },
});
```

Before calling the service, reject requests without `executionDeviceRef` or `genesisDevice`; the R0.1 qualification tool is intentionally device-bound.

The registration gate MUST require all of:

```text
VSR_WARDEN_MCP_CONFORMANCE=1
VSR_RIVER_MCP_CONFORMANCE=1
VSR_SYNNERGYZE_MCP_CONFORMANCE=1
VSR_EFFECT_MCP_CONFORMANCE=1
VSR_SYNNERGYZE_RUNTIME_ACTIVATION_R01=1
explicit --allow-tools synnergyzeActivateControlledRuntimeR01
```

- [ ] **Step 5: Register the tool in server startup**

In `src/commands/start-server.ts`, import and call `maybeRegisterSynnergyzeRuntimeActivation()` alongside the existing conformance registrations. Preserve the explicit opt-in semantics.

Add startup tests proving the tool is absent by default and appears only under the full gate.

Add to `package.json`:

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

- [ ] **Step 7: Commit the controlled activation transport**

```bash
git add src/tools/registerWardenConformanceDecision.ts \
  src/tools/registerWardenConformanceDecision.test.ts \
  src/tools/registerSynnergyzeRuntimeActivation.ts \
  src/tools/registerSynnergyzeRuntimeActivation.test.ts \
  src/commands/start-server.ts src/commands/start-server.synnergyze.test.ts package.json
git commit -m "feat: expose proof-bound controlled runtime activation"
```

---

### Task 5: Promote conformance metadata to `CONTROLLED_ACTIVE` and issue the qualification receipt

**Files:**
- Modify: `modules/synnergyze/client-control-plane.ts`
- Modify: `modules/synnergyze/client-control-plane.test.ts`
- Modify: `config/synnergyze/client-bootstrap-r0.1.json`
- Modify: `.vsr/module-bindings.yaml`
- Create: `docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md`

**Interfaces:**
- Consumes: verified Task 1–4 behavior.
- Produces auditable metadata proving the bounded runtime is active while ordinary external client/workflow execution remains disabled.

- [ ] **Step 1: Write failing control-plane/conformance-state assertions**

Change the readiness test to require:

```ts
expect(readiness.executionState).toBe("CONTROLLED_ACTIVE");
expect(readiness.proofChain).toBe("REQUIRED");
expect(readiness.externalEffects).toBe(false);
```

Also assert that ordinary records remain non-executable:

```ts
expect(client.executable).toBe(false);
expect(workflow.executable).toBe(false);
```

Add config/binding assertions for:

```text
execution.state = CONTROLLED_ACTIVE
execution.external_effects = false
execution.proof_chain = REQUIRED
execution.activation_gate = EXTERNAL-EFFECT-ACTIVATION-R0.1
river.execution_evidence = REQUIRED
river.seal = REQUIRED
MOD-SYNNERGYZE-001 state = conformance_implemented
MOD-SYNNERGYZE-001 runtime_state = CONTROLLED_ACTIVE
MOD-SYNNERGYZE-001 activation_gate = EXTERNAL-EFFECT-ACTIVATION-R0.1
```

- [ ] **Step 2: Run client-control-plane tests and verify RED**

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/client-control-plane.test.ts
```

Expected: failures on current `BLOCKED_RUNTIME_ACTIVATION` metadata.

- [ ] **Step 3: Update the typed readiness surface**

Change `SynnergyzeClientReadinessV1` to:

```ts
export interface SynnergyzeClientReadinessV1 {
  clientRef: string;
  genesisBinding: "BOUND";
  synnergyzeState: "READY";
  wardenBinding: "FIT_QUALIFIED";
  executionState: "CONTROLLED_ACTIVE";
  proofChain: "REQUIRED";
  externalEffects: false;
  systemCount: number;
  capabilityCount: number;
  workflowCount: number;
  deviceCount: number;
}
```

Return those exact values from `readiness()`.

Do not change `SynnergyzeClientBootstrapV1.executable` or `SynnergyzeWorkflowContractV1.executable`; they stay `false` because R0.1 does not authorize ordinary external effects.

- [ ] **Step 4: Update bootstrap profile and module binding**

Set `config/synnergyze/client-bootstrap-r0.1.json`:

```json
"execution": {
  "state": "CONTROLLED_ACTIVE",
  "external_effects": false,
  "proof_chain": "REQUIRED",
  "activation_gate": "EXTERNAL-EFFECT-ACTIVATION-R0.1"
},
"river": {
  "execution_evidence": "REQUIRED",
  "seal": "REQUIRED"
}
```

In `.vsr/module-bindings.yaml`, update only the Synnergyze runtime lifecycle needed by this stage:

```yaml
state: conformance_implemented
runtime_state: CONTROLLED_ACTIVE
warden_binding: FIT_QUALIFIED
proof_chain: REQUIRED
external_effects: false
activation_gate: EXTERNAL-EFFECT-ACTIVATION-R0.1
```

Add dependencies:

```yaml
- WARDEN-RUNTIME-001
- RIVEROS-001
- GENESIS-DEVICE-RESOLUTION
- RIVER-EVIDENCE-SEAL
```

Add public output contracts:

```yaml
- SynnergyzeRuntimeActivationResultV1
- ProofReferenceV1
```

Add tests:

```yaml
- modules/proof/proof-reference.test.ts
- modules/synnergyze/runtime-activation.test.ts
- src/tools/registerSynnergyzeRuntimeActivation.test.ts
```

Do not mark any module `ACTIVE`, `AUTHORIZED`, or settlement-final.

- [ ] **Step 5: Run the fresh full qualification suite on Node 22.14.0**

Run:

```bash
npm run test:runtime-activation
npm run test
npm run type-check
npm run lint
git diff --check
git status --short
```

Also run the existing focused authority/evidence suites:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run \
  modules/warden/decision-service.test.ts \
  modules/river/reservation-service.test.ts \
  modules/synnergyze/warden-request-bridge.test.ts \
  modules/synnergyze/execution-gate.test.ts \
  modules/synnergyze/effect-verification.test.ts \
  modules/genesis-node-builder/device-registry.test.ts
```

Require zero failures, type-check exit 0, lint exit 0, and diff-check exit 0.

- [ ] **Step 6: Capture real Proof IDs from the deterministic runtime fixture**

Temporarily add a single test assertion message or use a one-off local Node/tsx invocation against the exact deterministic fixture from `runtime-activation.test.ts` to print:

```text
E-GEN-DEVICE-........
E-SYN-COMPOSE-........
E-WAR-AUTH-........
E-RIV-RESERVE-........
E-SYN-EXEC-........
E-SYN-VERIFY-........
E-RIV-SEAL-........
G-RIV-RUNTIME-........
```

Do not commit debug logging. Re-run `git diff --check` and confirm the debug output path left no source change.

- [ ] **Step 7: Write the qualification receipt with exact evidence**

Create `docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md` with:

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

Record:

- exact final commit SHA;
- exact full/focused test counts from fresh output;
- exact representative Proof IDs from Step 6;
- native Genesis resolution, Warden decision, River reservation, execution receipt, effect verification, River seal and causal-trace refs used by the deterministic qualification fixture;
- the spoken proof statements, e.g.:

```text
E-WAR-AUTH-XXXXXXXX — Proof from Warden: the exact runtime request was authorized under the fixed conformance policy.
E-RIV-SEAL-XXXXXXXX — Proof from RiverOS: the verified effect was accepted into the River evidence seal and causal trace.
G-RIV-RUNTIME-XXXXXXXX — Proof from RiverOS: all mandatory controlled-runtime proof stages reached the terminal River seal.
```

Never write merely “passed” when the receipt can name the Proof ID and proving system.

- [ ] **Step 8: Commit conformance state and qualification receipt**

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
- No additional production changes expected.

**Interfaces:**
- Consumes: verified runtime branch.
- Produces: a stacked PR whose base is PR #129's feature branch until PR #129 merges.

- [ ] **Step 1: Verify the final branch lineage**

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse HEAD^{tree}
git log --oneline -8
```

Require the runtime branch to descend from:

```text
1608cfa803df2ffec41434b30aadfb65603bf408
```

and contain no force-rewritten history.

- [ ] **Step 2: Compare runtime stage against the Warden-fit head**

Use the forge compare API or:

```bash
git diff --name-status 1608cfa803df2ffec41434b30aadfb65603bf408...HEAD
```

Review that changed files are limited to the planned proof, River lineage, runtime activation, transport, conformance metadata, tests and docs. Confirm no real provider connector, SILK settlement adapter, payment rail, ERP write adapter, or production credential file was changed.

- [ ] **Step 3: Publish without force and create a stacked PR**

Push `feat/synnergyze-runtime-activation-r0.1` and open a PR with:

```text
base = feat/synnergyze-client-bootstrap-r0.1
head = feat/synnergyze-runtime-activation-r0.1
```

Title:

```text
feat: activate proof-bound Synnergyze controlled runtime R0.1
```

The PR body MUST state:

- stacked on PR #129;
- exact Proof-ID doctrine;
- device-bound Genesis + transient security qualification;
- Warden/River/Synnergyze proof ownership;
- exact test counts and head SHA;
- `externalEffects:false`, `settlementFinality:false`, `registryTruthPromoted:false`;
- next gate `EXTERNAL-EFFECT-ACTIVATION-R0.1`.

- [ ] **Step 4: Run/observe exact-head CI**

Require success for the repository's standard PR workflows on the exact runtime head, including at minimum:

```text
test
type-check
lint
Runtime AuthZ Bridge
Datadog Synthetic tests
```

If the new `test:runtime-activation` script is not a standalone workflow, prove its suites are included in the full `test` run and cite their focused local/CI output in the receipt.

- [ ] **Step 5: Final verification before any completion claim**

Invoke `superpowers:verification-before-completion`, then verify:

```text
full suite = 0 failures
focused runtime/proof suite = 0 failures
type-check = success
lint = success
PR head = exact qualified SHA
PR base = feat/synnergyze-client-bootstrap-r0.1
PR merge state = not merged
external-effects flags = false
```

Only then report the stage as qualified. Do not merge either PR without explicit user instruction.
