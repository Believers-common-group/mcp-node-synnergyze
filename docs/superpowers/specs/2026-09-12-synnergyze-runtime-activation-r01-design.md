# SYNNERGYZE-RUNTIME-ACTIVATION-R0.1 Design

Date: 2026-09-12
Status: APPROVED DESIGN — SPEC REVIEW REQUIRED BEFORE IMPLEMENTATION PLAN
Base: `feat/synnergyze-client-bootstrap-r0.1` @ `1608cfa803df2ffec41434b30aadfb65603bf408`
Stacked branch: `feat/synnergyze-runtime-activation-r0.1`

## 1. Purpose

Activate the bounded governed runtime chain after `SYNNERGYZE-WARDEN-FIT-R0.1` without activating real external effects, settlement, legal/commercial effect, or Registry truth promotion.

At the same time, make proof provenance human-readable and habitual by adding a typed Proof Reference layer over the repository's existing content-addressed hashes and canonical refs.

The design establishes a strict distinction:

```text
Proof ID != cryptographic digest

Proof ID = human-readable provenance/dictionary key
Digest   = full machine integrity anchor
```

Every material proof statement must be expressible in the form:

```text
<Proof ID> — Proof from <system>: <claim>.
```

The full digest need not be spoken in ordinary operation, but it MUST remain bound to the proof record.

## 2. Non-goals

R0.1 does NOT:

- enable a real provider/ERP/machine mutation;
- move money or create SILK settlement finality;
- create legal or contractual effect;
- promote synthetic/reference state to canonical Registry truth;
- replace any native Genesis, Warden, Synnergyze, or River identifier;
- create a second hashing/evidence engine;
- make River the semantic author of proofs produced by another system;
- allow Synnergyze to mint a proof claiming to be from Genesis, Warden, or RiverOS;
- turn a passing test, Warden ALLOW, execution receipt, or River seal into production activation.

The next explicit gate remains:

`EXTERNAL-EFFECT-ACTIVATION-R0.1`.

## 3. Canonical runtime boundary

R0.1 activates only this bounded chain:

```text
Genesis device resolution
  -> Synnergyze composition
  -> Warden decision
  -> River evidence reservation
  -> Warden execution checkpoint
  -> Synnergyze controlled execution
  -> post-execution observation
  -> Synnergyze effect verification
  -> River evidence seal + causal trace
  -> River composite runtime proof
```

The runtime state becomes:

```text
warden_binding      = FIT_QUALIFIED
runtime              = CONTROLLED_ACTIVE
proof_chain          = REQUIRED
effect_verification  = REQUIRED
river_seal           = REQUIRED
external_effects     = false
settlement            = false
registry_truth        = false
```

`CONTROLLED_ACTIVE` means the governed reference/conformance chain is executable. It does not mean production-active.

### 3.1 R0.1 qualification path is device-bound

The qualification execution used to promote this stage MUST be device-bound so it exercises the Genesis device dependency fitted in `SYNNERGYZE-WARDEN-FIT-R0.1`.

The qualification path therefore requires both:

1. a current Genesis device resolution carried into the Warden request; and
2. the existing transient device-security context required by the present River/execution path for device-bound action.

This does not mean every future governed runtime action must be device-bound. It means this R0.1 activation proof must exercise the newly established device-bound authority chain rather than qualifying only an easier non-device path.

## 4. Proof ownership rule

A proof is attributed to the system that actually establishes the claim.

Examples:

- Genesis resolves identity/device/estate context -> proof from Genesis.
- Synnergyze composes work or records controlled execution -> proof from Synnergyze.
- Warden evaluates authority/policy -> proof from Warden.
- River reserves evidence or seals the causal chain -> proof from RiverOS.

A downstream system may reference another system's proof but MUST NOT relabel itself as the proving authority.

Therefore:

```text
Warden ALLOW != River proof of authorization
River reservation != proof execution occurred
Synnergyze execution receipt != verified effect
Synnergyze verified effect != River sealed evidence
River seal != external production activation
```

## 5. Proof Reference contract and issuer-owned builders

Introduce a small, provider-neutral proof reference contract. Recommended shared contract boundary:

`modules/proof/contracts.ts`

Conceptual contract:

```ts
export type ProofScopeV1 = "ESTATE" | "GROUP" | "MISSION";

export type ProofIssuerV1 =
  | "GENESIS"
  | "SYNNERGYZE"
  | "WARDEN"
  | "RIVEROS";

export interface ProofReferenceV1 {
  proofId: string;
  proofFrom: ProofIssuerV1;
  proofType: string;
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
```

The shared module owns only types plus deterministic canonicalization/validation utilities. It MUST NOT expose a public API that accepts an arbitrary `proofFrom` and mints a proof on behalf of any system.

Proof construction is issuer-owned. Recommended boundaries:

```text
modules/genesis-node-builder/proof-reference.ts
modules/synnergyze/proof-reference.ts
modules/warden/proof-reference.ts
modules/river/proof-reference.ts
```

Each issuer-owned builder accepts only that subsystem's native output types and emits only that subsystem's `proofFrom` value.

Examples:

- Genesis builder consumes `GenesisDeviceResolutionV1` and emits `proofFrom: "GENESIS"`.
- Warden builder consumes `WardenDecisionV1` plus the exact request lineage and emits `proofFrom: "WARDEN"`.
- River reservation builder consumes `EvidenceReservationV1` and its exact action/decision lineage and emits `proofFrom: "RIVEROS"`.
- Synnergyze execution builder consumes `SynnergyzeExecutionReceiptV1` and emits `proofFrom: "SYNNERGYZE"`.
- River seal/composite builder consumes the native River seal + causal trace and required upstream Proof IDs and emits `proofFrom: "RIVEROS"`.

The builders are proof adapters over native authoritative outputs. They MUST NOT authorize action, verify identity outside their existing native source contract, create a new River seal, or create settlement state.

## 6. Proof ID grammar

Human-facing proof IDs use:

```text
<SCOPE>-<ISSUER>-<CLAIM>-<ID8>
```

Where:

- `SCOPE` = `E`, `G`, or `M` for Estate, Group, Mission;
- `ISSUER` = `GEN`, `SYN`, `WAR`, or `RIV`;
- `CLAIM` = bounded uppercase claim code;
- `ID8` = first 8 uppercase hex characters of SHA-256 over the canonical proof payload.

Examples:

```text
E-GEN-DEVICE-7F3A91C2
E-SYN-COMPOSE-A8430D19
E-WAR-AUTH-0C71B44F
E-RIV-RESERVE-198AAF20
E-SYN-EXEC-5D2B9E87
E-SYN-VERIFY-26F47C91
E-RIV-SEAL-6E14A0B7
G-RIV-RUNTIME-A12F03DD
```

The ID suffix is deterministic, not an allocated sequence. The full canonical digest remains in `integrityDigest`.

### 6.1 Estate masking

The spoken/display Proof ID MUST NOT require disclosure of the raw estate identifier. Estate identity remains in `scopeRef` inside the governed record.

This means an external reader may see:

`E-WAR-AUTH-0C71B44F`

while the internal record remains bound to an exact `GENESIS-ESTATE-*` scope reference.

A future export/presentation layer may add an estate-specific masked alias, but R0.1 does not introduce a second identity authority or reversible pseudonym scheme.

## 7. Canonicalization, timestamps, and digest rules

Proof identity is derived from a canonical payload containing at minimum:

```text
proofFrom
proofType
claim
subjectRef
scope
scopeRef
canonical sourceRefs
createdAt
synthetic
supersedesProofId | null
```

Rules:

1. `sourceRefs` MUST be deduplicated and sorted before hashing.
2. The canonical payload MUST use deterministic key ordering.
3. `integrityDigest = sha256(canonicalPayload)`.
4. `proofId.ID8 = first8(uppercase(hex(integrityDigest)))`.
5. `createdAt` MUST be derived from the native authoritative source event for that proof, not from the current wrapper/orchestrator invocation time.
6. Exact native-source replay MUST yield the same `createdAt`, Proof ID, and digest even if replay occurs later.
7. Mutated reuse of a Proof ID with different canonical material MUST fail closed.
8. A proof may reference existing native digest-bearing objects; it MUST NOT rewrite or truncate their native digest fields.

Recommended native timestamp mapping:

```text
Genesis device proof     -> resolution.resolvedAt
Warden auth proof        -> decision.decidedAt
River reservation proof -> reservation.reservedAt
Synnergyze exec proof    -> executionReceipt.executedAt
Synnergyze verify proof  -> verifiedEffect.verifiedAt
River seal proof         -> seal.sealedAt
River composite proof    -> seal.sealedAt
```

Synnergyze composition proof uses the request's canonical `requestedAt` because the request itself is the native composition output being indexed.

## 8. Required R0.1 proof chain

A successful controlled runtime qualification chain must surface these proof classes.

### 8.1 Genesis device dependency proof

```text
E-GEN-DEVICE-*
Proof from Genesis: the execution device was canonically resolved for the estate with the stated attestation/assurance at the relevant time.
```

Source refs include the Genesis resolution and its attestation/evidence refs.

This proof is mandatory for the R0.1 qualification execution because that execution is explicitly device-bound.

### 8.2 Synnergyze composition proof

```text
E-SYN-COMPOSE-*
Proof from Synnergyze: the governed event/workflow request was composed with the required principal, capability, target, context and Genesis dependency.
```

### 8.3 Warden authorization proof

```text
E-WAR-AUTH-*
Proof from Warden: the exact request was ALLOWed under the stated authority/policy/device requirements and validity window.
```

The proof references the Warden decision; it never exposes a reusable raw action token as human proof material.

### 8.4 River reservation proof

```text
E-RIV-RESERVE-*
Proof from RiverOS: evidence capacity was reserved for the exact authorized action before controlled execution.
```

Source refs include River reservation, Warden decision, action reference, and authorization digest.

### 8.5 Synnergyze execution proof

```text
E-SYN-EXEC-*
Proof from Synnergyze: the exact reserved/authorized action passed the execution gate and produced an EXECUTED_UNVERIFIED receipt.
```

This is explicitly NOT an effect-verification proof.

### 8.6 Synnergyze verification proof

```text
E-SYN-VERIFY-*
Proof from Synnergyze: a matching post-execution observation was evaluated and produced VERIFIED_EFFECT.
```

Until River seals that result, this remains a Synnergyze verification claim.

### 8.7 River seal proof

```text
E-RIV-SEAL-*
Proof from RiverOS: the reservation and verified effect were accepted into the River evidence seal/causal trace.
```

The existing River seal/causal-trace implementation is reused. No parallel seal is introduced.

### 8.8 Composite runtime proof

```text
G-RIV-RUNTIME-*
Proof from RiverOS: all required controlled-runtime proof stages are causally bound under the same governed lineage and have reached the R0.1 terminal seal state.
```

This proof is produced only by the River proof adapter from:

- the native `EvidenceSealV1`;
- the native `CausalTraceV1`;
- the mandatory upstream stage Proof IDs;
- the exact request/correlation lineage.

Synnergyze orchestration may request/collect this proof, but it cannot mint `G-RIV-RUNTIME-*` itself.

The composite proof does not create new authority and does not imply external activation.

## 9. Runtime orchestration

The current repository already provides:

- Warden decision contracts/evaluator;
- River authorized-action envelope and reservation;
- Warden execution checkpoint;
- Synnergyze controlled execution gate;
- post-execution observation and effect verification;
- River seal and causal trace conformance service.

R0.1 should compose these existing services rather than create a second runtime.

Recommended runtime activation service boundary:

`modules/synnergyze/runtime-activation.ts`

Responsibilities:

1. accept only a request valid for the qualified Warden-fit boundary;
2. require a device-bound reference request for R0.1 qualification;
3. require both Genesis device context and the present transient device-security context for that device-bound qualification request;
4. execute/reuse the canonical bounded Warden -> River -> Synnergyze -> verification -> River seal chain;
5. obtain each proof from the owning subsystem's proof adapter;
6. enforce same request/correlation/program/event/action/device lineage;
7. require terminal River seal + causal trace;
8. request/receive the River-owned composite runtime proof;
9. emit `CONTROLLED_ACTIVE_PROOF` only when every mandatory proof exists and validates;
10. preserve exact replay/idempotency;
11. reject mutated replay;
12. never call a real external-effect adapter in R0.1.

The orchestrator is not a proof authority. It collects and validates proofs from the systems that own the underlying native facts.

## 10. Runtime result

Conceptual result:

```ts
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

The result is proof of a bounded governed runtime path, not production authority.

## 11. Fail-closed conditions

The runtime MUST NOT issue a composite proof when any of these occur:

- Genesis resolution missing/malformed/stale/expired;
- Genesis device ref differs from the execution device ref;
- required transient device-security context is missing or non-ACTIVE for the R0.1 device-bound qualification path;
- Synnergyze request lineage mismatch;
- Warden result is DENY or ESCALATE;
- Warden validity expires before reservation/execution;
- River reservation absent or mismatched;
- execution checkpoint invalid/stale/future/mismatched;
- controlled execution does not produce `EXECUTED_UNVERIFIED`;
- post-execution observation absent or mismatched;
- effect verification returns EXCEPTION;
- River evidence seal absent or malformed;
- causal trace does not bind required reservation/effect lineage;
- any mandatory Proof ID is absent;
- a proof was not created by the adapter owned by its declared issuer;
- proof source refs cross correlation/request/device scope;
- proof digest does not reproduce the Proof ID suffix;
- exact Proof ID is reused with mutated canonical payload.

A partial chain may surface the proofs actually established, but MUST remain `BLOCKED` and MUST NOT mint `G-RIV-RUNTIME-*`.

## 12. Existing device-security interaction

R0.1 preserves the distinction between:

- Genesis device identity/attestation/resolution; and
- transient device-security/containment context.

For the device-bound R0.1 qualification execution, the existing transient device-security context remains mandatory because the current River reservation/execution path already treats it as a device-bound fail-closed dependency.

Proof references may cite its evidence, but transient device security does not become Genesis identity and it does not become Warden authority.

No R0.1 change may weaken the current device-security execution-gate checks merely to make runtime activation pass.

A later version may define policy-driven cases where Genesis device dependency exists without transient device-security, but that is not part of this activation stage.

## 13. Configuration and conformance state

After implementation qualification, the bootstrap/runtime metadata may advance from:

```text
execution.state = BLOCKED_RUNTIME_ACTIVATION
```

to:

```text
execution.state = CONTROLLED_ACTIVE
execution.external_effects = false
proof_chain = REQUIRED
activation_gate = EXTERNAL-EFFECT-ACTIVATION-R0.1
```

The Warden binding remains `FIT_QUALIFIED`.

No module is promoted to production `ACTIVE` merely because the R0.1 reference chain is executable.

## 14. Testing requirements

TDD must prove at least:

1. deterministic Proof ID/digest generation;
2. reordered duplicate source refs canonicalize identically;
3. native-source replay at a later wall-clock time preserves Proof ID because `createdAt` comes from the native source event;
4. changed source material changes Proof ID;
5. mismatched Proof ID/digest fails closed;
6. generic/shared proof code cannot mint arbitrary issuer provenance;
7. every required stage has correct `proofFrom` ownership;
8. the R0.1 qualification request is device-bound and carries a valid Genesis device resolution;
9. missing/inactive transient device-security blocks the device-bound qualification execution;
10. Warden DENY/ESCALATE cannot mint downstream runtime proof;
11. missing River reservation blocks execution/composite proof;
12. execution receipt remains `EXECUTED_UNVERIFIED` until observation/verification;
13. verification exception cannot mint River seal proof;
14. missing/mismatched causal trace blocks composite proof;
15. successful synthetic chain yields all required stage proofs plus River-owned `G-RIV-RUNTIME-*`;
16. exact replay yields identical proof IDs and no second adapter effect;
17. mutated replay fails closed;
18. runtime result always reports `externalEffects:false`;
19. runtime result always reports `settlementFinality:false`;
20. runtime result always reports `registryTruthPromoted:false`;
21. existing Warden-fit/device tests remain green;
22. existing River seal/causal-trace tests remain green;
23. no real external network/provider call is introduced.

## 15. Proof-language operating convention

This is an architectural doctrine, not a UI preference.

For material evidence statements in qualification records, runtime reports, operator summaries, and architecture discussions, prefer:

```text
<Proof ID> — Proof from <system>: <claim>.
```

Do not require humans to speak/read the full cryptographic digest unless performing integrity validation or forensic investigation.

When several systems contribute, name the final proving authority and cite the upstream Proof IDs/source refs rather than saying vaguely that “the system proved it.”

Example:

```text
G-RIV-RUNTIME-A12F03DD — Proof from RiverOS: the controlled runtime chain reached a valid River seal after Genesis resolution, Synnergyze composition, Warden authorization, River reservation, controlled execution and verified observation.
```

## 16. Branch and review boundary

This work is intentionally stacked from PR #129's qualified head.

PR #129 remains the Genesis-device + Warden-fit proof boundary.

`feat/synnergyze-runtime-activation-r0.1` is the runtime/proof-layer boundary.

After PR #129 merges, the runtime PR can be retargeted to `genesis` without rewriting the meaning of the earlier qualification.

## 17. Qualification receipt

Successful implementation must produce a versioned receipt:

`docs/alpha-node/SYNNERGYZE-RUNTIME-ACTIVATION-R0.1.md`

The receipt must state exact test counts, exact commit/head, native proof refs used, representative Proof IDs, external-effects status, and the next activation gate.

It must never state merely “passed” where a concrete Proof ID and proving system can be named.
