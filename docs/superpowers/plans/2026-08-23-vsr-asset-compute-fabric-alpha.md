# VSR Asset Compute Fabric Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first public-safe executable asset-compute transaction primitive for ALPHA-NODE-001, proving governed funding reservation, Warden-gated execution, explicit effect verification, derived-asset gating, and idempotent settlement.

**Architecture:** Implement a self-contained TypeScript module under `src/vsr/assetCompute/` without changing the legacy Algolia-facing application entrypoint. The module extends existing Alpha contracts: Registry/Genesis remains canonical for principals/assets/rights, Warden remains authority, Synnergyze coordinates routing/execution, River-style events record evidence, and SILK-compatible ledger semantics model reservation/settlement. Provider execution starts with a deterministic simulated adapter so no cloud credential is required.

**Tech Stack:** Node.js >=22, TypeScript 5.8, Vitest 3.1, existing repository lint/type-check/test scripts.

**Spec:** `docs/alpha-node/ALPHA-ASSET-COMPUTE-FABRIC-001.md`

## Global Constraints

- Preserve `REQUEST != ENTITLEMENT != AUTHORITY != FUNDING != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT != SETTLEMENT`.
- Payment/funding must never imply Warden authority.
- Provider acceptance must never imply effect.
- No live secrets, private Registry rows, Warden token bodies, participant private data, or live financial credentials may enter this public repository.
- Do not modify `src/app.ts` in Alpha 0.1.
- Use explicit `.ts` imports consistent with the existing test style.
- Every production behavior starts with a failing Vitest test and follows RED -> GREEN -> REFACTOR.
- All consequential mutation APIs must be replay-safe or fail closed on conflicting reuse.

---

### Task 1: Funding reservation ledger

**Files:**
- Create: `src/vsr/assetCompute/fundingLedger.test.ts`
- Create: `src/vsr/assetCompute/fundingLedger.ts`
- Create: `src/vsr/assetCompute/types.ts`

**Interfaces:**
- Produces: `FundingKind`, `FundingSource`, `FundingBalance`, `FundingReservation`, `FundingSettlement`, `ReserveFundingInput`.
- Produces: `class InMemoryFundingLedger` with `reserve(input)`, `settle(reservationId, actualAmount)`, `release(reservationId)`, and `balance(sourceId)`.

- [ ] **Step 1: Write the failing reservation/settlement test**

```ts
import { describe, expect, it } from "vitest";
import { InMemoryFundingLedger } from "./fundingLedger.ts";

const source = {
  sourceId: "FS-ASSET-ALLOWANCE",
  principalId: "DM-ALPHA-001",
  kind: "ASSET_ALLOWANCE" as const,
  currency: "INR",
  available: 100,
};

describe("InMemoryFundingLedger", () => {
  it("reserves a ceiling, settles actual cost, and releases unused funding", () => {
    const ledger = new InMemoryFundingLedger([source]);

    const reservation = ledger.reserve({
      reservationId: "RES-000001",
      executionId: "EXEC-000001",
      principalId: "DM-ALPHA-001",
      amount: 50,
      currency: "INR",
      sourcePriority: ["ASSET_ALLOWANCE"],
    });

    expect(reservation.amountReserved).toBe(50);
    expect(ledger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 50,
      reserved: 50,
      settled: 0,
      currency: "INR",
    });

    expect(ledger.settle("RES-000001", 32)).toEqual({
      reservationId: "RES-000001",
      amountReserved: 50,
      amountSettled: 32,
      amountReleased: 18,
      currency: "INR",
    });

    expect(ledger.balance("FS-ASSET-ALLOWANCE")).toEqual({
      available: 68,
      reserved: 0,
      settled: 32,
      currency: "INR",
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test -- src/vsr/assetCompute/fundingLedger.test.ts`

Expected: FAIL because `./fundingLedger.ts` does not exist yet.

- [ ] **Step 3: Define minimal funding types**

Create `src/vsr/assetCompute/types.ts` with exact unions/interfaces required by the test:

```ts
export type FundingKind = "ASSET_ALLOWANCE" | "ASSET_YIELD" | "PREPAID";

export interface FundingSource {
  sourceId: string;
  principalId: string;
  kind: FundingKind;
  currency: string;
  available: number;
}

export interface FundingBalance {
  available: number;
  reserved: number;
  settled: number;
  currency: string;
}

export interface ReserveFundingInput {
  reservationId: string;
  executionId: string;
  principalId: string;
  amount: number;
  currency: string;
  sourcePriority: FundingKind[];
}

export interface FundingReservation {
  reservationId: string;
  executionId: string;
  principalId: string;
  sourceId: string;
  amountReserved: number;
  currency: string;
  status: "RESERVED" | "SETTLED" | "RELEASED";
}

export interface FundingSettlement {
  reservationId: string;
  amountReserved: number;
  amountSettled: number;
  amountReleased: number;
  currency: string;
}
```

- [ ] **Step 4: Implement the minimum single-source ledger**

`InMemoryFundingLedger.reserve` must select the first source matching principal/currency/priority with sufficient available funds, atomically move `amount` into reserved state, reject duplicate reservation IDs with conflicting payload, and throw `INSUFFICIENT_FUNDING` when no source qualifies.

`settle` must reject `actualAmount > amountReserved`, move actual cost to settled, release the difference to available, and return the same result on an exact replay.

`release` must return the entire un-settled reservation to available and be idempotent.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npm run test -- src/vsr/assetCompute/fundingLedger.test.ts
npm run type-check
npm run lint
npm run test
```

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add -- src/vsr/assetCompute/types.ts src/vsr/assetCompute/fundingLedger.ts src/vsr/assetCompute/fundingLedger.test.ts
git commit -m "feat(alpha): add compute funding reservation ledger"
```

### Task 2: Warden decision validation and capability envelope

**Files:**
- Create: `src/vsr/assetCompute/wardenGate.test.ts`
- Create: `src/vsr/assetCompute/wardenGate.ts`
- Modify: `src/vsr/assetCompute/types.ts`

**Interfaces:**
- Consumes: `executionId`, `principalId`, maximum cost, and funding-independent request context.
- Produces: `WardenOutcome`, `WardenDecision`, `CapabilityGrant`.
- Produces: `validateWardenDecision(decision, now)` and `issueExecutionCapability(input)`.

- [ ] **Step 1: Write a failing test proving funding cannot substitute for authority**

Test an execution with sufficient funding but a Warden `DENY` decision. `issueExecutionCapability` must throw `WARDEN_NOT_AUTHORIZED`. Add a second test proving expired `ALLOW` throws `WARDEN_DECISION_EXPIRED`.

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm run test -- src/vsr/assetCompute/wardenGate.test.ts`

Expected: FAIL because the Warden gate does not exist.

- [ ] **Step 3: Implement exact Warden types and validation**

Use outcomes `ALLOW | DENY | REQUIRE_APPROVAL | REQUIRE_EVIDENCE`. An `ALLOW` must include an expiry and explicit maximum cost. Capability grants bind one execution, one principal, one asset, named operations, one selected route, one cost ceiling and expiry.

- [ ] **Step 4: Implement capability issuance**

Issue only from a valid, non-expired `ALLOW`; never infer an allow from funding, authentication or asset visibility. Capability expiry may not exceed the Warden decision expiry.

- [ ] **Step 5: Verify**

Run focused test, then `npm run type-check`, `npm run lint`, and `npm run test`; all must PASS.

- [ ] **Step 6: Commit**

Commit only the Warden gate/types/tests with `feat(alpha): add Warden execution capability gate`.

### Task 3: River-style event trail and transaction state machine

**Files:**
- Create: `src/vsr/assetCompute/stateMachine.test.ts`
- Create: `src/vsr/assetCompute/stateMachine.ts`
- Create: `src/vsr/assetCompute/eventLog.test.ts`
- Create: `src/vsr/assetCompute/eventLog.ts`
- Modify: `src/vsr/assetCompute/types.ts`

**Interfaces:**
- Produces: `ExecutionState`, `assertTransition(from, to)`.
- Produces: `RiverEvent`, `InMemoryEventLog.append(event)`, `eventsFor(executionId)`.

- [ ] **Step 1: Write failing transition tests**

Prove `AUTHORIZED -> FUNDS_RESERVED` is valid, while `REQUESTED -> DISPATCHED`, `AUTHORIZED -> EFFECT_VERIFIED`, and `DISPATCHED -> SETTLED` fail closed.

- [ ] **Step 2: Verify RED**

Run the state-machine test and confirm the implementation is missing.

- [ ] **Step 3: Implement the exact Alpha state graph from the spec**

No transition may bypass Warden, funding or effect gates. Include explicit `EXCEPTION`, `RECONCILIATION`, and `CLOSED` terminal/recovery states needed by Alpha failure tests.

- [ ] **Step 4: Write failing event-log replay test**

Appending the same `eventId` with the same significant payload must return the existing event; same ID with changed payload must throw `EVENT_IDEMPOTENCY_CONFLICT`.

- [ ] **Step 5: Implement append-only event log and verify**

The log is a public-safe in-memory projection for tests; it is not canonical RiverOS storage. Run focused tests plus type-check/lint/full test.

- [ ] **Step 6: Commit**

Commit with `feat(alpha): add transaction state and evidence event trail`.

### Task 4: Provider-neutral simulated execution adapter

**Files:**
- Create: `src/vsr/assetCompute/providerAdapter.test.ts`
- Create: `src/vsr/assetCompute/providerAdapter.ts`
- Modify: `src/vsr/assetCompute/types.ts`

**Interfaces:**
- Produces: `ProviderAdapter`, `ProviderExecutionRequest`, `ProviderReceipt`, `ProviderObservation`.
- Produces: `DeterministicProviderAdapter` configurable for success, provider failure, and accepted-but-effect-failed scenarios.

- [ ] **Step 1: Write failing success and provider-failure tests**

Success returns a provider receipt and explicit output reference. Provider failure throws `PROVIDER_EXECUTION_FAILED` and never fabricates an output/effect reference.

- [ ] **Step 2: Verify RED**

Run the provider-adapter test; expected missing implementation.

- [ ] **Step 3: Implement deterministic adapter**

No network or credentials. The adapter must preserve the distinction between provider receipt, output observation and effect verification.

- [ ] **Step 4: Verify and commit**

Run focused/full checks and commit `feat(alpha): add deterministic provider adapter`.

### Task 5: Asset-compute fabric orchestration

**Files:**
- Create: `src/vsr/assetCompute/fabric.test.ts`
- Create: `src/vsr/assetCompute/fabric.ts`
- Create: `src/vsr/assetCompute/index.ts`
- Modify: `src/vsr/assetCompute/types.ts`

**Interfaces:**
- Consumes: validated public-safe execution request, resolved asset/right facts, supplied Warden decision, funding ledger, provider adapter and event log.
- Produces: `AssetComputeFabric.execute(input)` returning transaction result, settlement result and optional `DerivedAssetCandidate` only after verified effect.

- [ ] **Step 1: Write failing happy-path acceptance test**

Use the canonical INR 100 -> reserve 50 -> actual 32 -> release 18 scenario. Assert a verified effect creates exactly one derived-asset candidate and the final available balance is INR 68.

- [ ] **Step 2: Verify RED**

Run: `npm run test -- src/vsr/assetCompute/fabric.test.ts`.

- [ ] **Step 3: Implement minimal orchestrator**

Advance states only through the state-machine API. Record correlated events at Warden validation, reservation, dispatch, provider receipt, effect verification, asset candidate creation and settlement. Do not issue Warden authority internally.

- [ ] **Step 4: Add provider-failure acceptance test**

Reserve INR 40, force provider failure, assert the full INR 40 is released, no derived asset exists, and an exception event remains.

- [ ] **Step 5: Add accepted-but-effect-failed test**

Assert provider acknowledgement does not settle as a successful asset-producing transaction and no derived asset is inferred.

- [ ] **Step 6: Add replay/idempotency acceptance test**

Replay the completed execution with the same idempotency identity; assert no second settlement and no second derived asset. Conflicting replay must fail closed.

- [ ] **Step 7: Verify all repository checks**

Run:

```bash
npm run type-check
npm run lint
npm run test
```

Expected: all PASS with no live external dependency.

- [ ] **Step 8: Commit**

Commit with `feat(alpha): implement asset compute transaction fabric`.

### Task 6: Public-safe integration documentation and Alpha evidence

**Files:**
- Modify: `docs/alpha-node/ALPHA-ASSET-COMPUTE-FABRIC-001.md`
- Create: `docs/alpha-node/ALPHA-ASSET-COMPUTE-FABRIC-001-VERIFICATION.md`

**Interfaces:**
- Consumes: actual test/CI evidence from Tasks 1-5.
- Produces: public-safe verification record with commit SHA, test commands, pass/fail counts, and explicit unverified production integrations.

- [ ] **Step 1: Record only observed verification evidence**

Include exact commands and CI run references. Do not claim GCP, Supabase, Neon, RiverOS, SILK or production Warden integration was exercised unless it actually was.

- [ ] **Step 2: Document next adapter seams**

List Registry/Genesis resolver, Warden decision source, SILK reservation backend, RiverOS event sink, and first GCP provider adapter as subsequent integrations, each behind the tested Alpha interfaces.

- [ ] **Step 3: Run final repository checks**

Run `npm run type-check && npm run lint && npm run test` and record the actual result.

- [ ] **Step 4: Commit**

Commit with `docs(alpha): record asset compute fabric verification`.
