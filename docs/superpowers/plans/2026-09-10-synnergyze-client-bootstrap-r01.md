# Synnergyze Client Bootstrap R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a Genesis-bound, non-executable Synnergyze client control plane before the existing Warden is fitted.

**Architecture:** Add client contracts and an in-memory bootstrap control plane under `modules/synnergyze`. It accepts only canonical Genesis references, composes systems/capabilities/workflows, and exposes `WARDEN_UNBOUND` readiness; no new code imports or calls `modules/warden`.

**Tech Stack:** TypeScript 5.8, Node 22.x target, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-10-synnergyze-client-bootstrap-r01-design.md`

## Global Constraints

- Genesis owns canonical identity and state.
- Synnergyze composes work; it does not grant authority.
- Warden binding remains absent in R0.1.
- Client execution must fail closed while Warden is unbound.
- Existing Warden/River controlled-execution modules are not modified.
- No credential material is written to the repository.

---

### Task 1: Client bootstrap contracts

**Files:**
- Create: `modules/synnergyze/client-control-plane.test.ts`
- Create: `modules/synnergyze/client-control-plane.ts`

**Interfaces:**
- Produces: `SynnergyzeClientBootstrapV1`, `SynnergyzeSystemAdmissionV1`, `SynnergyzeCapabilityDeclarationV1`, `SynnergyzeWorkflowContractV1`, `SynnergyzeClientReadinessV1`.

- [x] Write failing tests for client registration, system/capability/workflow composition, duplicate rejection, and `WARDEN_UNBOUND` readiness.
- [x] Run `npx vitest run modules/synnergyze/client-control-plane.test.ts` and confirm failure because the module does not exist.
- [x] Implement the minimal contracts and in-memory control plane.
- [x] Re-run the focused test and require all tests to pass.

### Task 2: Bootstrap profile and conformance

**Files:**
- Create: `config/synnergyze/client-bootstrap-r0.1.json`
- Modify: `.vsr/module-bindings.yaml`
- Test: `modules/synnergyze/client-control-plane.test.ts`

**Interfaces:**
- Consumes: readiness state from Task 1.
- Produces: canonical bootstrap profile `SYNNERGYZE-CLIENT-BOOTSTRAP-001`.

- [x] Add a failing test that requires the bootstrap profile to declare Genesis authoritative and Warden unbound.
- [x] Run the focused test and verify the expected missing-profile failure.
- [x] Add the minimal JSON profile and module-binding metadata.
- [x] Re-run focused tests and type-check.

### Task 3: Verification receipt

**Files:**
- Create: `docs/alpha-node/SYNNERGYZE-CLIENT-BOOTSTRAP-R0.1.md`

**Interfaces:**
- Consumes: committed R0.1 implementation and test evidence.
- Produces: operator-readable qualification record and explicit deferred Warden-fit boundary.

- [x] Run focused Synnergyze tests, type-check, and `git diff --check`.
- [x] Record runtime-version and dependency-audit observations without auto-remediation.
- [x] Document the next stage as `SYNNERGYZE-WARDEN-FIT-R0.1`.
- [x] Commit only the Synnergyze bootstrap files on the feature branch.
