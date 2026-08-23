# Amazon BNR-001 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing governed Amazon Orders provider integration into canonical `BNR-001` with machine-resolved partner lifecycle, readiness, service isolation, and fail-closed activation while preserving the existing Warden/River/Registry/SILK boundaries.

**Architecture:** Extend the existing BNR contracts rather than create a parallel provider model. `BNR-001` is Amazon in `PROPOSED_PARTNER` + `INACTIVE`; a deterministic readiness resolver derives `INACTIVE | ELIGIBLE | ACTIVE | SUSPENDED` from external authority, commercial, runtime, River, Registry, Warden-policy, service-resolution and activation-evidence inputs. The current Amazon Orders runtime becomes the first service binding (`AMAZON-SPAPI-ORDERS`) and remains read-only/non-final economically.

**Tech Stack:** TypeScript 5.8, Node 22, Vitest, existing Postgres query adapters, GitHub Actions (`test`, `type-check`, `lint`, Datadog synthetic checks).

**Spec:** `docs/superpowers/specs/2026-08-23-amazon-bnr-node-001-design.md`

## Global Constraints

- `BNR-001` starts as `PROPOSED_PARTNER` and `INACTIVE`.
- Partner relationship lifecycle and operational activation are separate state machines.
- No API credential, office meeting, physical proximity, cloud account, provider account, CI result, or source-code integration may independently create `ACTIVE`.
- Amazon service authority is service-scoped; SP-API authority does not imply AWS, Ads, Listings, Fulfilment or Procurement authority.
- Amazon credentials remain provider-native and secret-store/environment held.
- DigitalMe remains represented-principal context; Warden remains authorization authority.
- River seal may not be claimed until a real River publisher acknowledges/persists the event.
- SILK remains `moneyMoved=false` and `settlementFinality=false` for the Orders R0.1 proof.
- Restricted Amazon fields (`BUYER`, `RECIPIENT`, `TAX`, `PAYMENT`) remain excluded from ordinary `amazon.orders.search`.
- No repository secrets or synthetic production authority artifacts.

---

### Task 1: Extend BNR contracts and deterministic readiness

**Files:**
- Modify: `modules/bnr/contracts.ts`
- Create: `modules/bnr/readiness.ts`
- Create: `modules/bnr/readiness.test.ts`

**Interfaces:**
- Produces `BnrPartnerLifecycleV1`, `BnrActivationStateV1`, `BnrCommercialStateV1`, `BnrActivationInputsV1`, and `resolveBnrReadinessV1(input)`.
- Existing `BnrNodeManifestV1` remains compatible for current callers; new partner-aware fields are additive or supplied by an extended manifest type.

- [ ] **Step 1: Write the failing readiness tests**

Create tests that assert:

```ts
expect(resolveBnrReadinessV1({
  nodeRef: "BNR-001",
  partnerLifecycle: "PROPOSED_PARTNER",
  runtimeReadiness: "BLOCKED",
  authorityState: "EXTERNAL_UNRESOLVED",
  evidenceState: "UNRESOLVED",
  commercialState: "UNRESOLVED",
  requiredServicesResolved: false,
  wardenPolicyActive: false,
  riverOperational: false,
  registryDurable: false,
  activationEvidenceValid: false,
  suspended: false,
  readinessCheckedAt: "2026-08-23T05:30:00Z",
}).activationState).toBe("INACTIVE");
```

and separately:

```ts
const eligible = resolveBnrReadinessV1({ ...allReadyInputs, activationEvidenceValid: false });
expect(eligible.activationState).toBe("ELIGIBLE");

const active = resolveBnrReadinessV1({ ...allReadyInputs, activationEvidenceValid: true });
expect(active.activationState).toBe("ACTIVE");
```

Also assert blockers for unresolved authority, commercial evidence, River readiness, Registry durability, Warden policy and unresolved services; assert `suspended: true` resolves to `SUSPENDED` even when readiness is otherwise complete.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/bnr/readiness.test.ts`

Expected: FAIL because `readiness.ts`/new types do not exist.

- [ ] **Step 3: Implement minimal contract additions**

Add exact unions:

```ts
export type BnrPartnerLifecycleV1 =
  | "PROPOSED_PARTNER"
  | "ENGAGEMENT"
  | "CONTRACTED"
  | "AUTHORITY_EVIDENCED"
  | "TECHNICALLY_READY"
  | "RETIRED";

export type BnrActivationStateV1 = "INACTIVE" | "ELIGIBLE" | "ACTIVE" | "SUSPENDED";
export type BnrCommercialStateV1 = "UNRESOLVED" | "EVIDENCED";
```

Define the resolver input and extend readiness output with `partnerLifecycle`, `commercialState`, `activationState`.

- [ ] **Step 4: Implement `resolveBnrReadinessV1`**

Eligibility requires all of:

```ts
partnerLifecycle === "TECHNICALLY_READY"
runtimeReadiness === "READY"
authorityState === "EXTERNAL_EVIDENCED"
evidenceState === "READY"
commercialState === "EVIDENCED"
requiredServicesResolved
wardenPolicyActive
riverOperational
registryDurable
```

Resolution order:

```ts
if (input.suspended) return SUSPENDED;
if (!eligible) return INACTIVE;
if (!input.activationEvidenceValid) return ELIGIBLE;
return ACTIVE;
```

Blockers must be deterministic stable codes, e.g. `BNR_AUTHORITY_UNRESOLVED`, `BNR_COMMERCIAL_UNRESOLVED`, `BNR_RIVER_UNREADY`.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run modules/bnr/readiness.test.ts`
Expected: PASS.

- [ ] **Step 6: Run contract regression**

Run: `npx vitest run modules/contracts.test.ts modules/bnr/readiness.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit only the three Task 1 files with message: `feat: add BNR partner readiness model`.

---

### Task 2: Define canonical Amazon BNR-001 manifest and service isolation

**Files:**
- Create: `modules/providers/amazon/bnr-node-001.ts`
- Create: `modules/providers/amazon/bnr-node-001.test.ts`

**Interfaces:**
- Produces `AMAZON_BNR_NODE_001` and `resolveAmazonBnrServiceBindingV1(serviceRef)`.
- Consumes BNR contract types from Task 1.

- [ ] **Step 1: Write RED tests for initial state and service boundaries**

Assert:

```ts
expect(AMAZON_BNR_NODE_001.nodeRef).toBe("BNR-001");
expect(AMAZON_BNR_NODE_001.partnerRef).toBe("PARTNER:AMAZON");
expect(AMAZON_BNR_NODE_001.partnerLifecycle).toBe("PROPOSED_PARTNER");
expect(AMAZON_BNR_NODE_001.activationState).toBe("INACTIVE");
```

Assert exact service refs:

```ts
[
  "AMAZON-SPAPI-ORDERS",
  "AMAZON-MARKETPLACE-LISTINGS",
  "AMAZON-FULFILMENT",
  "AMAZON-ADS",
  "AMAZON-BUSINESS-PROCUREMENT",
  "AWS-COMPUTE",
]
```

Only `AMAZON-SPAPI-ORDERS` is configured as the current R0.1 read-only service. Tests must prove resolving Orders never returns the Listings/AWS authority refs.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/providers/amazon/bnr-node-001.test.ts`
Expected: FAIL because manifest module is absent.

- [ ] **Step 3: Implement minimal manifest**

Create a frozen manifest containing node/partner identifiers, initial lifecycle/activation state, Registry/policy/release refs, evidence arrays initialized empty, and service bindings with separate capability refs.

The Orders binding must identify:

```ts
serviceRef: "AMAZON-SPAPI-ORDERS"
capabilityRef: "amazon.orders.search"
effectClass: "READ_ONLY_PROVIDER_EFFECT"
settlementFinality: false
```

- [ ] **Step 4: Implement service resolver**

`resolveAmazonBnrServiceBindingV1(serviceRef)` returns only the exact service binding or throws `amazon_bnr_service_not_found`; it never inherits authority/capabilities from sibling bindings.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run modules/providers/amazon/bnr-node-001.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit Task 2 files with message: `feat: define Amazon BNR-001 manifest`.

---

### Task 3: Bind Amazon Orders runtime to BNR-001

**Files:**
- Modify: `modules/providers/amazon/governed-orders-runtime.ts`
- Modify: `modules/providers/amazon/governed-orders-runtime.test.ts`

**Interfaces:**
- Consumes `AMAZON_BNR_NODE_001` and Orders service binding from Task 2.
- Existing external Amazon Orders runtime API remains source-compatible.

- [ ] **Step 1: Write RED assertions**

Extend the existing successful sync test to require:

```ts
expect(result.provider.bnrNodeRef).toBe("BNR-001");
expect(result.provider.serviceRef).toBe("AMAZON-SPAPI-ORDERS");
expect(result.realWorldWriteEffectOccurred).toBe(false);
expect(result.silk.moneyMoved).toBe(false);
expect(result.silk.settlementFinality).toBe(false);
```

Add a negative test proving an action with any capability other than `amazon.orders.search` is rejected before provider invocation.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/providers/amazon/governed-orders-runtime.test.ts`
Expected: FAIL because provider receipt lacks BNR fields.

- [ ] **Step 3: Implement minimal BNR binding**

Extend `AmazonProviderReceiptV1` with literal fields:

```ts
bnrNodeRef: "BNR-001";
serviceRef: "AMAZON-SPAPI-ORDERS";
```

Populate both success and exception receipts from the canonical Task 2 binding rather than duplicate freehand constants.

- [ ] **Step 4: Run GREEN and security regression**

Run:

`npx vitest run modules/providers/amazon/governed-orders-runtime.test.ts modules/providers/amazon/governed-orders-security.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit Task 3 files with message: `feat: bind Amazon Orders runtime to BNR-001`.

---

### Task 4: Add canonical BNR readiness/outbox projection without fabricating River seal

**Files:**
- Create: `modules/providers/amazon/bnr-readiness-outbox.ts`
- Create: `modules/providers/amazon/bnr-readiness-outbox.test.ts`
- Modify only if required for interface reuse: `modules/providers/amazon/postgres-registry-outbox-writer.ts`

**Interfaces:**
- Consumes `BnrReadinessStateV1`/partner-aware readiness from Task 1 and `AMAZON_BNR_NODE_001` from Task 2.
- Produces a serializable `BNR_NODE_READINESS_EVALUATED` outbox envelope for `CWR-REGISTRY`.

- [ ] **Step 1: Write RED tests**

Assert that evaluating BNR-001 produces an outbox payload with:

```ts
sourceNodeCode: "CWR-REGISTRY"
eventCode: "BNR_NODE_READINESS_EVALUATED"
objectType: "BNR_NODE"
objectCode: "BNR-001"
```

and includes partner lifecycle, activation state, blockers and evidence refs, but contains no Amazon secret/token material.

Add a test that `ELIGIBLE` or provider success does **not** serialize a River seal or `ACTIVE` unless the resolver returned `ACTIVE` from valid activation evidence.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/providers/amazon/bnr-readiness-outbox.test.ts`
Expected: FAIL because module is absent.

- [ ] **Step 3: Implement minimal outbox envelope builder**

Create a pure function that returns a deterministic Registry outbox envelope. Do not write directly to River. Preserve the existing transactional-outbox architecture so the existing publisher/bridge owns delivery.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/providers/amazon/bnr-readiness-outbox.test.ts modules/providers/amazon/postgres-registry-outbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit Task 4 files with message: `feat: emit Amazon BNR readiness outbox evidence`.

---

### Task 5: Bind live-proof preflight to BNR readiness and update PR status

**Files:**
- Modify: `modules/providers/amazon/live-proof.ts`
- Modify: `modules/providers/amazon/live-proof.test.ts`
- Modify: `modules/providers/amazon/run-live-proof.ts`
- Update PR #73 body after code is green.

**Interfaces:**
- Consumes `resolveBnrReadinessV1` and `AMAZON_BNR_NODE_001`.
- Live proof remains read-only and requires externally issued Warden artifacts and environment-held Amazon credentials.

- [ ] **Step 1: Write RED tests**

Add assertions that live preflight returns/records:

```ts
bnrNodeRef === "BNR-001"
partnerLifecycle === "PROPOSED_PARTNER" // unless external evidence bundle advances it
activationState !== "ACTIVE" // without external commercial + authority + River + activation evidence
```

Add explicit tests showing `amazonCredentialsPresent: true` and `engagementContextPresent: true` cannot move activation from `INACTIVE` when authority/commercial/River prerequisites are missing.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/providers/amazon/live-proof.test.ts`
Expected: FAIL because live proof does not yet expose BNR readiness.

- [ ] **Step 3: Implement minimal preflight integration**

Feed only verifiable external evidence flags into the BNR resolver. Do not infer `CONTRACTED`, `AUTHORITY_EVIDENCED`, `TECHNICALLY_READY` or `ACTIVE` from environment credential presence.

If provider+Registry execution succeeds but River remains unpublished, return a distinct pending state and keep BNR activation non-active.

- [ ] **Step 4: Run GREEN and full provider test set**

Run:

`npx vitest run modules/providers/amazon`

Expected: PASS.

- [ ] **Step 5: Run repository verification**

Run:

- `npm test -- --run`
- `npm run type-check`
- `npm run lint`

Then verify current GitHub Actions for the head commit: `test`, `type-check`, `lint`, Datadog synthetic checks all green.

- [ ] **Step 6: Update PR #73 body**

Record:

- Amazon Orders is the first BNR-001 service adapter.
- `BNR-001` remains `PROPOSED_PARTNER` + `INACTIVE` absent external partner evidence.
- live Amazon credentials/Warden authority/River publisher remain external live-proof blockers.
- no Amazon partnership or ACTIVE claim is made by this PR.

- [ ] **Step 7: Final review**

Compare `genesis...agent/amazon-orders-e2e-r01`; inspect all changed files for accidental secrets, authority expansion, unrestricted PII access, non-final SILK changes, or unrelated edits.

- [ ] **Step 8: Commit documentation/status changes**

Commit with message: `docs: align Amazon runtime with BNR-001 closure state`.

---

## Completion Evidence

The implementation is complete only if fresh evidence shows:

1. `BNR-001` resolves initially to `PROPOSED_PARTNER` + `INACTIVE`.
2. Readiness resolver cannot create `ACTIVE` from credentials, proximity, provider success or CI alone.
3. Amazon Orders receipts carry `BNR-001` / `AMAZON-SPAPI-ORDERS` identity.
4. Sibling Amazon services do not inherit Orders authority.
5. Registry/outbox readiness events are deterministic and contain no secrets.
6. River sealing remains explicit and external; pending publication never equals activation.
7. SILK remains observational/non-final.
8. Provider tests, full tests, type-check, lint and current CI pass.
9. PR #73 accurately states the remaining external live blockers.
