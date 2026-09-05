# ALPHA Client Acquisition Registry R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a governed Alpha acquisition spine that preserves BC/VSR/CC source provenance, validates client-candidate state progression, derives source-node yield, and admits only fully qualified destination nodes into ALPHA-T01.

**Architecture:** Extend the existing `registry_desk` Alpha boundary rather than reusing `alpha_rollout_sources`, because those records represent technical integration systems rather than client acquisition provenance. Keep canonical records in Supabase/Postgres, implement matching pure TypeScript rules in the MCP repo, and keep GitHub fixtures public-safe and synthetic.

**Tech Stack:** Node.js >=22, TypeScript 5.8, Vitest 3.1, Zod 3.24, PostgreSQL/Supabase, existing `registry_desk` schema.

**Spec:** `docs/superpowers/specs/2026-09-06-alpha-client-acquisition-registry-design.md`

## Global Constraints

- Believers Common, Virtual Silk Road, and Creators Common remain upstream registries; Alpha stores references, not wholesale copies.
- `SOURCE NODE != DESTINATION NODE` is invariant.
- Only BC, VSR, CC, and EXTERNAL are accepted source-registry families in R0.1.
- First meaningful source provenance is immutable; corrections append/supersede rather than silently overwrite.
- `ALPHA-T01` counts only independently provisioned, canonical, Warden-admitted, River-evidenced, non-duplicate, non-placeholder destination nodes.
- Supabase is canonical Registry truth; Warden is authority; RiverOS is evidence; GitHub is public-safe code/contracts only.
- The real 11 prospective-client records must never be committed to this public repository.
- All new `registry_desk` tables must have RLS enabled and no implicit `anon`/`authenticated` grants.
- Views must use `security_invoker = true`.
- No `SECURITY DEFINER` functions.

---

## File Structure

- `src/alpha/acquisition.ts` — acquisition states, source-registry types, transition validation, provenance validation.
- `src/alpha/acquisition.test.ts` — state-machine and provenance tests.
- `src/alpha/t01.ts` — pure T01 qualification evaluator.
- `src/alpha/t01.test.ts` — qualification gate tests.
- `src/alpha/projections.ts` — source-node yield, funnel, and toolkit-demand reducers.
- `src/alpha/projections.test.ts` — projection tests with synthetic fixtures.
- `docs/alpha-node/ALPHA-CLIENT-ACQUISITION-REGISTRY-001.sql` — public-safe canonical SQL contract matching the live Supabase migration.

### Task 1: Acquisition domain and state machine

**Files:**
- Create: `src/alpha/acquisition.test.ts`
- Create: `src/alpha/acquisition.ts`

**Interfaces:**
- Produces: `AcquisitionState`, `SourceRegistry`, `SourceObjectType`, `isAllowedTransition(from, to)`, `assertAllowedTransition(from, to)`, `validatePrimarySource(input)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  assertAllowedTransition,
  isAllowedTransition,
  validatePrimarySource,
} from "./acquisition.ts";

describe("acquisition transitions", () => {
  it("allows the canonical next step", () => {
    expect(isAllowedTransition("DISCOVERED", "SELECTED_FOR_OUTREACH")).toBe(true);
  });

  it("rejects skipping directly from discovered to qualified", () => {
    expect(isAllowedTransition("DISCOVERED", "QUALIFIED")).toBe(false);
    expect(() => assertAllowedTransition("DISCOVERED", "QUALIFIED")).toThrow(
      "Illegal acquisition transition: DISCOVERED -> QUALIFIED",
    );
  });

  it("allows terminal loss from active commercial states", () => {
    expect(isAllowedTransition("PROPOSAL_ACTIVE", "LOST")).toBe(true);
  });
});

describe("primary source provenance", () => {
  it("requires an object reference for BC, VSR, and CC", () => {
    expect(() =>
      validatePrimarySource({ registry: "VSR", sourceObjectType: "NODE", sourceObjectId: "" }),
    ).toThrow("VSR primary source requires sourceObjectId");
  });

  it("allows EXTERNAL without a network object id", () => {
    expect(
      validatePrimarySource({ registry: "EXTERNAL", sourceObjectType: "OTHER", sourceObjectId: null }),
    ).toEqual({ registry: "EXTERNAL", sourceObjectType: "OTHER", sourceObjectId: null });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/alpha/acquisition.test.ts --run`

Expected: FAIL because `src/alpha/acquisition.ts` does not exist.

- [ ] **Step 3: Implement the minimal state machine**

Define the canonical path:

`DISCOVERED -> SELECTED_FOR_OUTREACH -> CONTACTED -> ENGAGED -> DISCOVERY_ACTIVE -> QUALIFIED -> SOLUTION_MAPPED -> PROPOSAL_ACTIVE -> COMMERCIAL_AGREED -> PROVISIONING_READY -> PROVISIONING -> WARDEN_ADMISSION -> NODE_REGISTERED -> NODE_ACTIVE`.

Allow `DISQUALIFIED`, `DEFERRED`, `WITHDRAWN`, and `LOST` from pre-registration active states; allow `SUSPENDED` only after `NODE_REGISTERED` or `NODE_ACTIVE`.

`validatePrimarySource` must accept only `BC | VSR | CC | EXTERNAL` and require a non-empty `sourceObjectId` for BC/VSR/CC.

- [ ] **Step 4: Run acquisition tests and type-check**

Run:

```bash
npm test -- src/alpha/acquisition.test.ts --run
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(alpha): add acquisition state machine`

### Task 2: T01 qualification evaluator

**Files:**
- Create: `src/alpha/t01.test.ts`
- Create: `src/alpha/t01.ts`

**Interfaces:**
- Consumes: no database dependency.
- Produces: `T01QualificationInput`, `T01QualificationResult`, `evaluateT01Qualification(input)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { evaluateT01Qualification } from "./t01.ts";

const eligible = {
  independentlyProvisioned: true,
  canonicalNodeExists: true,
  wardenAdmitted: true,
  riverEvidenced: true,
  duplicateCheck: "PASS" as const,
  placeholderCheck: "PASS" as const,
  destinationNodeId: "GENESIS-NODE-000037",
  wardenDecisionRef: "WARDEN-DEC-037",
  riverReceiptRef: "RIVER-REC-037",
};

describe("T01 qualification", () => {
  it("qualifies only when every mandatory gate passes", () => {
    expect(evaluateT01Qualification(eligible)).toEqual({ countable: true, blockers: [] });
  });

  it("fails closed when River evidence is missing", () => {
    expect(evaluateT01Qualification({ ...eligible, riverEvidenced: false, riverReceiptRef: null })).toEqual({
      countable: false,
      blockers: ["RIVER_EVIDENCE_REQUIRED"],
    });
  });

  it("fails closed for a duplicate destination node", () => {
    expect(evaluateT01Qualification({ ...eligible, duplicateCheck: "FAIL" })).toEqual({
      countable: false,
      blockers: ["DUPLICATE_DESTINATION_NODE"],
    });
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/alpha/t01.test.ts --run`

Expected: FAIL because `src/alpha/t01.ts` does not exist.

- [ ] **Step 3: Implement minimal fail-closed evaluator**

Blocker codes are deterministic and emitted in this order:

1. `INDEPENDENT_PROVISION_REQUIRED`
2. `CANONICAL_NODE_REQUIRED`
3. `WARDEN_ADMISSION_REQUIRED`
4. `WARDEN_DECISION_REF_REQUIRED`
5. `RIVER_EVIDENCE_REQUIRED`
6. `RIVER_RECEIPT_REF_REQUIRED`
7. `DUPLICATE_DESTINATION_NODE`
8. `PLACEHOLDER_NOT_COUNTABLE`
9. `DESTINATION_NODE_ID_REQUIRED`

- [ ] **Step 4: Run tests and type-check**

```bash
npm test -- src/alpha/t01.test.ts --run
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(alpha): add T01 qualification evaluator`

### Task 3: Derived inventory projections

**Files:**
- Create: `src/alpha/projections.test.ts`
- Create: `src/alpha/projections.ts`

**Interfaces:**
- Produces: `sourceNodeYield(records)`, `acquisitionFunnel(records)`, `toolkitForwardDemand(requirements)`.

- [ ] **Step 1: Write failing tests with synthetic records only**

Test that two VSR-origin acquisitions from the same source node aggregate separately from one BC-origin acquisition, and that only `NODE_REGISTERED`/`NODE_ACTIVE` records marked countable contribute to `countableNodes`.

Test funnel counts by state and toolkit requirement counts by toolkit ID.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/alpha/projections.test.ts --run`

Expected: FAIL because `src/alpha/projections.ts` does not exist.

- [ ] **Step 3: Implement pure reducers**

No external I/O, no private identifiers in fixtures, and stable lexicographic output ordering for deterministic tests.

- [ ] **Step 4: Run tests and type-check**

```bash
npm test -- src/alpha/projections.test.ts --run
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(alpha): add acquisition inventory projections`

### Task 4: Additive `registry_desk` database contract

**Files:**
- Create: `docs/alpha-node/ALPHA-CLIENT-ACQUISITION-REGISTRY-001.sql`

**Interfaces:**
- Live target: connected Supabase project `mjoxznioshtfacxgyhbm`, selected because it already contains the canonical `registry_desk` Alpha rollout, Warden, and Genesis registry structures.
- Produces tables:
  - `registry_desk.alpha_client_acquisitions`
  - `registry_desk.alpha_acquisition_source_refs`
  - `registry_desk.alpha_acquisition_events`
  - `registry_desk.alpha_acquisition_toolkit_requirements`
  - `registry_desk.alpha_provisioning_refs`
  - `registry_desk.alpha_t01_qualifications`
- Produces views:
  - `registry_desk.alpha_source_node_yield_v`
  - `registry_desk.alpha_t01_progress_v`
  - `registry_desk.alpha_toolkit_forward_demand_v`
  - `registry_desk.alpha_acquisition_funnel_v`

- [ ] **Step 1: Write the SQL contract before live DDL**

The SQL must:

- use UUID primary keys plus stable text keys such as `ALPHA-ACQ-000001`;
- use CHECK constraints for source families, object types, lifecycle states, and T01 gate values;
- keep source and destination identifiers in distinct columns/tables;
- make primary source rows immutable by database trigger after insert, except explicit supersession fields;
- enforce one active `PRIMARY` source per acquisition with a partial unique index;
- enforce unique event idempotency keys;
- enforce unique T01 destination node and sequence values;
- enable RLS on every new table;
- revoke all table access from `anon` and `authenticated`;
- create all views with `security_invoker = true`;
- avoid `SECURITY DEFINER` entirely;
- revoke function execution from `PUBLIC`, `anon`, and `authenticated` for any helper/trigger function created in `registry_desk`.

- [ ] **Step 2: Apply the migration through Supabase**

Use the connected Supabase DDL migration action with migration name `alpha_client_acquisition_registry_r01` and the exact reviewed SQL contract.

- [ ] **Step 3: Verify live schema**

Run SQL checks confirming:

```sql
select table_name
from information_schema.tables
where table_schema = 'registry_desk'
  and table_name like 'alpha_%acquisition%';
```

and confirm RLS is enabled for all six new tables.

Insert only synthetic rows inside a transaction, exercise an allowed and a forbidden state/provenance path, then `rollback`.

- [ ] **Step 4: Run Supabase security and performance advisors**

Resolve any finding caused by this migration before declaring the database step complete.

- [ ] **Step 5: Commit the exact applied SQL**

Commit message: `feat(alpha): add acquisition registry database contract`

### Task 5: Full verification and controlled handoff

**Files:**
- No new production files unless verification identifies a defect.

- [ ] **Step 1: Run repository verification**

```bash
npm test -- --run
npm run type-check
npm run lint
```

Expected: all pass.

- [ ] **Step 2: Verify live T01 baseline**

Confirm the new tables contain zero real client rows immediately after migration. The real 11 prospects are not loaded as part of R0.1 schema rollout.

- [ ] **Step 3: Verify no repository secret/private-data exposure**

Search changed files for actual client domains, credentials, Warden token material, and private registry rows. Expected: none.

- [ ] **Step 4: Compare branch to main and prepare PR**

Review every changed file and ensure the design, TypeScript rules, SQL constraints, and live schema agree.

- [ ] **Step 5: Final commit/PR handoff**

Open a pull request from `alpha/client-acquisition-registry-r0.1` to `main` with a concise verification summary. Do not merge automatically unless explicitly requested.
