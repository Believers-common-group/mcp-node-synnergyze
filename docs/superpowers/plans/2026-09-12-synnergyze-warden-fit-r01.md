# Synnergyze Warden Fit R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit the existing Synnergyze device-bound authorization path to Warden so every device-bound request carries a current Genesis device dependency while preserving transient device-security as a separate optional safety overlay.

**Architecture:** Extend the Warden public request contract with a first-class `WardenGenesisDeviceDependencyV1`, extend Warden policy with `WardenDeviceRequirementV1`, teach the Synnergyze Warden bridge to carry `ResolvedGenesisDeviceContextV1`, and teach Warden to fail closed on missing, mismatched, malformed, stale, expired, or insufficient-assurance Genesis device dependencies. River stays unchanged and runtime external effects remain separately gated.

**Tech Stack:** TypeScript 5.8, Node 22.x target (`v22.14.0`), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-12-synnergyze-warden-fit-r01-design.md`

## Global Constraints

- Genesis remains canonical for device identity, binding, attestation, lifecycle, and device resolution.
- Synnergyze carries device dependencies but cannot create authority.
- Warden evaluates authority/policy and does not query or mutate the Genesis device registry.
- River implementation and contracts remain unchanged in R0.1.
- Device-bound requests always require a matching Genesis device dependency.
- Transient `ResolvedDeviceSecurityContextV1` is optional; if supplied, its existing fail-closed validation remains active.
- Assurance ordering is exactly `L0 < L1 < L2 < L3 < L4`.
- Device resolution time must satisfy `resolvedAt <= requestedAt <= decidedAt <= validUntil` when `validUntil` exists.
- Non-device-bound requests remain backward compatible unless policy declares `deviceRequirement.required: true`.
- Passing tests, Warden `ALLOW`, or repository presence does not activate external effects.

---

### Task 1: Warden device dependency contracts

**Files:**
- Modify: `modules/warden/contracts.ts`
- Modify: `modules/warden/decision-service.test.ts`

**Interfaces:**
- Produces: `WardenGenesisDeviceDependencyV1`, `WardenDeviceAssuranceLevelV1`, and `WardenDecisionRequestV1.genesisDevice?: WardenGenesisDeviceDependencyV1`.
- Consumed by: Task 2 bridge and Task 3 Warden evaluator.

- [ ] **Step 1: Add failing contract/evaluator test fixtures**

Add a helper in `modules/warden/decision-service.test.ts` that can build a request with:

```ts
const genesisDevice = {
  resolutionRef: "GENESIS-DEVICE-RESOLUTION:abc123",
  deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
  estateRef: "GENESIS-ESTATE-001",
  attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
  assuranceLevel: "L3" as const,
  evidenceRefs: ["RIVER-DEVICE-ATTESTATION-001"],
  resolvedAt: "2026-09-12T04:00:00Z",
  validUntil: "2026-09-12T05:00:00Z",
};
```

Create one failing test that assigns `genesisDevice` to `WardenDecisionRequestV1` and one policy fixture with `deviceRequirement: { required: true, minimumAssuranceLevel: "L2" }`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/warden/decision-service.test.ts
```

Expected: TypeScript/test transform failure because `genesisDevice` and `deviceRequirement` are not defined yet.

- [ ] **Step 3: Add the minimal public contract types**

In `modules/warden/contracts.ts` add:

```ts
export type WardenDeviceAssuranceLevelV1 = "L0" | "L1" | "L2" | "L3" | "L4";

export interface WardenGenesisDeviceDependencyV1 {
  resolutionRef: string;
  deviceRef: string;
  estateRef: string;
  attestationRef: string;
  assuranceLevel: WardenDeviceAssuranceLevelV1;
  evidenceRefs: readonly string[];
  resolvedAt: string;
  validUntil?: string;
}
```

Add to `WardenDecisionRequestV1`:

```ts
genesisDevice?: WardenGenesisDeviceDependencyV1;
```

Do not remove or rename existing `deviceSecurity*` fields.

- [ ] **Step 4: Re-run the focused test and type-check**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/warden/decision-service.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: contract typing succeeds; evaluator assertions that depend on policy behavior may remain RED until Task 3.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add modules/warden/contracts.ts modules/warden/decision-service.test.ts
git commit -m "feat: add Warden Genesis device dependency contract"
```

---

### Task 2: Synnergyze bridge carries Genesis dependency

**Files:**
- Modify: `modules/synnergyze/warden-request-bridge.ts`
- Modify: `modules/synnergyze/warden-request-bridge.test.ts`
- Read-only dependency: `modules/synnergyze/genesis-device-bridge.ts`

**Interfaces:**
- Consumes: `ResolvedGenesisDeviceContextV1` from `genesis-device-bridge.ts`.
- Produces: `WardenDecisionRequestV1.genesisDevice` with deterministic request identity binding.

- [ ] **Step 1: Write failing bridge tests**

Extend bridge input with:

```ts
genesisDevice?: ResolvedGenesisDeviceContextV1;
```

Add tests proving all of the following before implementation:

```ts
expect(resultWithoutGenesis).toMatchObject({
  ok: false,
  code: "GENESIS_DEVICE_REQUIRED",
});

expect(resultWithWrongDevice).toMatchObject({
  ok: false,
  code: "GENESIS_DEVICE_CONTEXT_MISMATCH",
});

expect(validWithoutDeviceSecurity.ok).toBe(true);
expect(validWithoutDeviceSecurity.request.genesisDevice?.resolutionRef)
  .toBe("GENESIS-DEVICE-RESOLUTION:abc123");

expect(changedResolution.request.requestRef).not.toBe(original.request.requestRef);
```

Also add RED cases for empty attestation/evidence, future `resolvedAt`, expired `validUntil`, and stray Genesis context on a non-device-bound event.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/warden-request-bridge.test.ts
```

Expected: failures because bridge input and error codes do not yet support Genesis device context and because legacy device-security is still mandatory.

- [ ] **Step 3: Implement the minimal bridge changes**

Import:

```ts
import type { ResolvedGenesisDeviceContextV1 } from "./genesis-device-bridge.ts";
```

Add these error codes:

```ts
| "GENESIS_DEVICE_REQUIRED"
| "GENESIS_DEVICE_CONTEXT_MISMATCH"
| "GENESIS_DEVICE_RESOLUTION_INVALID"
| "GENESIS_DEVICE_EVIDENCE_MISSING"
| "GENESIS_DEVICE_TIME_INVALID"
| "GENESIS_DEVICE_FROM_FUTURE"
| "GENESIS_DEVICE_EXPIRED"
```

For `event.executionDeviceRef`, require `genesisDevice` and validate:

```ts
genesisDevice.deviceRef === event.executionDeviceRef
genesisDevice.genesisResolutionRef.startsWith("GENESIS-DEVICE-RESOLUTION:")
genesisDevice.attestationRef.length > 0
genesisDevice.sourceEvidenceRefs.length > 0
resolvedAt <= requestedAt
requestedAt <= validUntil // when present
```

Map it into the Warden request:

```ts
genesisDevice: {
  resolutionRef: genesisDevice.genesisResolutionRef,
  deviceRef: genesisDevice.deviceRef,
  estateRef: genesisDevice.estateRef,
  attestationRef: genesisDevice.attestationRef,
  assuranceLevel: genesisDevice.assuranceLevel,
  evidenceRefs: [...genesisDevice.sourceEvidenceRefs],
  resolvedAt: genesisDevice.resolvedAt,
  validUntil: genesisDevice.validUntil,
}
```

Include that object in `canonicalRequestIdentity`.

Change the legacy security branch so `deviceSecurity` is optional for a device-bound event; if supplied, preserve all existing validation and request fields. Continue rejecting any `deviceSecurity` or `genesisDevice` context supplied to a non-device-bound event.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/warden-request-bridge.test.ts modules/synnergyze/genesis-device-bridge.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: bridge and Genesis-device projection tests pass.

- [ ] **Step 5: Commit the bridge fit**

```bash
git add modules/synnergyze/warden-request-bridge.ts modules/synnergyze/warden-request-bridge.test.ts
git commit -m "feat: bind Genesis device context into Warden requests"
```

---

### Task 3: Warden evaluates Genesis device dependency

**Files:**
- Modify: `modules/warden/decision-service.ts`
- Modify: `modules/warden/decision-service.test.ts`

**Interfaces:**
- Consumes: `WardenDecisionRequestV1.genesisDevice` from Tasks 1-2.
- Produces: deterministic DENY/ALLOW behavior and `WardenDeviceRequirementV1` policy semantics.

- [ ] **Step 1: Add the policy type and failing behavior tests**

In `decision-service.ts`, define/export:

```ts
export interface WardenDeviceRequirementV1 {
  required: boolean;
  minimumAssuranceLevel?: WardenDeviceAssuranceLevelV1;
}
```

Add to `SyntheticWardenDecisionPolicyV1`:

```ts
deviceRequirement?: WardenDeviceRequirementV1;
```

Before implementation, add tests for these exact reason codes:

```ts
"genesis_device_dependency_required"
"genesis_device_policy_requires_device"
"genesis_device_ref_mismatch"
"genesis_device_resolution_invalid"
"genesis_device_evidence_missing"
"genesis_device_resolution_from_future"
"genesis_device_resolution_expired"
"genesis_device_assurance_insufficient"
```

Add an allow test for a matching L3 dependency under an L2 minimum policy and a regression test that non-device-bound requests still allow when no device policy is present.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/warden/decision-service.test.ts
```

Expected: new denial/allow assertions fail because the evaluator does not inspect `genesisDevice` yet.

- [ ] **Step 3: Implement deterministic assurance and temporal checks**

Add a fixed rank map:

```ts
const DEVICE_ASSURANCE_RANK: Record<WardenDeviceAssuranceLevelV1, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
};
```

Evaluate device requirements after identity/time-policy validity and before capability ALLOW:

```ts
if (request.executionDeviceRef && !request.genesisDevice) {
  return deny(request, policy, decidedAt, "genesis_device_dependency_required");
}

if (!request.executionDeviceRef && policy.deviceRequirement?.required) {
  return deny(request, policy, decidedAt, "genesis_device_policy_requires_device");
}
```

When `genesisDevice` exists, fail closed unless:

```ts
genesisDevice.deviceRef === request.executionDeviceRef
genesisDevice.resolutionRef.startsWith("GENESIS-DEVICE-RESOLUTION:")
genesisDevice.attestationRef.length > 0
genesisDevice.evidenceRefs.length > 0
resolvedAt <= requestedAt
resolvedAt <= decidedAt
decidedAt <= validUntil // when present
DEVICE_ASSURANCE_RANK[actual] >= DEVICE_ASSURANCE_RANK[minimum] // when minimum present
```

Include `genesisDevice.evidenceRefs` in canonical sorted request material inside `baseDecision` so evidence order does not change the decision identity.

- [ ] **Step 4: Verify GREEN and compatibility**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/warden/decision-service.test.ts modules/synnergyze/warden-request-bridge.test.ts
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: Warden device dependency and bridge tests pass; non-device-bound regressions remain green.

- [ ] **Step 5: Commit the evaluator fit**

```bash
git add modules/warden/decision-service.ts modules/warden/decision-service.test.ts
git commit -m "feat: enforce Genesis device dependency in Warden"
```

---

### Task 4: Fit-qualified conformance state and qualification receipt

**Files:**
- Modify: `.vsr/module-bindings.yaml`
- Modify: `config/synnergyze/client-bootstrap-r0.1.json`
- Modify: `modules/synnergyze/client-control-plane.test.ts`
- Create: `docs/alpha-node/SYNNERGYZE-WARDEN-FIT-R0.1.md`

**Interfaces:**
- Consumes: verified bridge/evaluator behavior from Tasks 1-3.
- Produces: auditable `SYNNERGYZE-WARDEN-FIT-R0.1` state without enabling external effects.

- [ ] **Step 1: Write failing conformance assertions**

Update `modules/synnergyze/client-control-plane.test.ts` to require:

```ts
expect(profile.warden.binding).toBe("FIT_QUALIFIED");
expect(profile.execution.state).toBe("BLOCKED_RUNTIME_ACTIVATION");
expect(bindings).toContain("GENESIS-DEVICE-RESOLUTION");
expect(bindings).toContain("warden_binding: FIT_QUALIFIED");
expect(bindings).toContain("activation_gate: SYNNERGYZE-RUNTIME-ACTIVATION-R0.1");
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/synnergyze/client-control-plane.test.ts
```

Expected: current `UNBOUND` / `BLOCKED_WARDEN_UNBOUND` metadata fails the new assertions.

- [ ] **Step 3: Update conformance metadata without activating execution**

Change `config/synnergyze/client-bootstrap-r0.1.json`:

```json
"warden": {
  "binding": "FIT_QUALIFIED",
  "fit_stage": "SYNNERGYZE-WARDEN-FIT-R0.1"
},
"execution": {
  "state": "BLOCKED_RUNTIME_ACTIVATION",
  "external_effects": false
}
```

Update `.vsr/module-bindings.yaml` so:

```yaml
MOD-WARDEN-001:
  depends_on:
    - GENESIS-DEVICE-RESOLUTION

MOD-SYNNERGYZE-001:
  warden_binding: FIT_QUALIFIED
  activation_gate: SYNNERGYZE-RUNTIME-ACTIVATION-R0.1
```

Do not mark Warden, Synnergyze, River, or SILK as `ACTIVE` merely because the fit passes.

- [ ] **Step 4: Run full qualification**

Run on Node `v22.14.0`:

```bash
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run modules/warden modules/synnergyze modules/genesis-node-builder
npx -y node@22.14.0 ./node_modules/vitest/vitest.mjs run
npx -y node@22.14.0 ./node_modules/typescript/bin/tsc --noEmit
git diff --check
git status --short
git diff --name-only HEAD~1..HEAD -- modules/river
```

Require zero test failures, type-check exit 0, diff-check exit 0, and no River implementation/contract changes.

- [ ] **Step 5: Write the qualification receipt**

Create `docs/alpha-node/SYNNERGYZE-WARDEN-FIT-R0.1.md` recording:

```text
Stage: SYNNERGYZE-WARDEN-FIT-R0.1
Genesis device dependency: REQUIRED for device-bound authorization
Transient device security: OPTIONAL overlay, fail-closed when supplied
Warden binding: FIT_QUALIFIED
Execution state: BLOCKED_RUNTIME_ACTIVATION
External effects: false
River changes: none
```

Include exact focused/full test counts from Step 4 rather than estimates.

- [ ] **Step 6: Commit qualification metadata**

```bash
git add .vsr/module-bindings.yaml config/synnergyze/client-bootstrap-r0.1.json modules/synnergyze/client-control-plane.test.ts docs/alpha-node/SYNNERGYZE-WARDEN-FIT-R0.1.md
git commit -m "chore: qualify Synnergyze Warden fit R0.1"
```

---

### Task 5: Publish and verify PR #129

**Files:**
- No new code changes expected.

**Interfaces:**
- Consumes: the verified fit-qualified branch.
- Produces: PR #129 with exact tested content and green CI.

- [ ] **Step 1: Verify local worktree is clean and capture tree SHA**

```bash
git status --short --branch
git rev-parse HEAD^{tree}
git log --oneline -5
```

- [ ] **Step 2: Publish without rewriting history**

If local HTTPS credentials remain unavailable, recreate the exact tested Git tree through the authenticated GitHub connector, verify the remote tree SHA equals the local tree SHA, create a commit whose parent is the current PR head, and fast-forward `feat/synnergyze-client-bootstrap-r0.1` without force.

- [ ] **Step 3: Verify remote compare**

Require:

```text
base = genesis
head = feat/synnergyze-client-bootstrap-r0.1
behind_by = 0
status = ahead
```

Confirm only the planned Warden/Synnergyze/conformance/qualification files were added or modified in this stage and no River file changed.

- [ ] **Step 4: Update PR metadata**

Update PR #129 title/body to include `SYNNERGYZE-WARDEN-FIT-R0.1`, the mandatory Genesis dependency, optional transient security overlay, exact verification counts, and the explicit `BLOCKED_RUNTIME_ACTIVATION` state.

- [ ] **Step 5: Verify CI on the new PR head**

Require the new head's `test`, `lint`, `type-check`, and Datadog Synthetic workflows to complete successfully before reporting the fit as qualified.
