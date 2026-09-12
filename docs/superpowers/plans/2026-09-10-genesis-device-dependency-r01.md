# Genesis Device Dependency R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Genesis-owned device registry/attestation/resolution boundary and expose only resolved Genesis device context to Synnergyze.

**Architecture:** Genesis owns device identity, lifecycle, binding and attestation. Synnergyze consumes a deterministic resolution projection. Warden and River remain unchanged and client execution stays blocked until the later Warden-fit stage.

**Tech Stack:** TypeScript 5.8, Node 22.x target, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-10-genesis-device-dependency-r01-design.md`

## Global Constraints

- Genesis is authoritative for device identity and lifecycle.
- Synnergyze cannot self-declare a resolved device state.
- Warden files and public contracts are not modified.
- River files and public contracts are not modified.
- Device registration does not imply trust or execution authority.
- Resolution requires an active device and valid attestation.
- No credential or hardware-secret material is stored.

---

### Task 1: Genesis device registry and resolution

**Files:**
- Create: `modules/genesis-node-builder/device-registry.test.ts`
- Create: `modules/genesis-node-builder/device-registry.ts`

**Interfaces:**
- Produces: `GenesisDeviceRecordV1`, `GenesisDeviceAttestationV1`, `GenesisDeviceResolutionV1`, `InMemoryGenesisDeviceRegistryV1`.

- [ ] Write failing tests for registration, estate binding, attestation, active resolution, lifecycle rejection, and expired attestation.
- [ ] Run `npx vitest run modules/genesis-node-builder/device-registry.test.ts` and confirm the module-missing RED state.
- [ ] Implement the minimal in-memory Genesis device registry and resolver.
- [ ] Re-run the focused tests and type-check.

### Task 2: Synnergyze Genesis device-resolution boundary

**Files:**
- Create: `modules/synnergyze/genesis-device-bridge.test.ts`
- Create: `modules/synnergyze/genesis-device-bridge.ts`
- Modify: `modules/synnergyze/client-control-plane.ts`
- Modify: `modules/synnergyze/client-control-plane.test.ts`

**Interfaces:**
- Consumes: `GenesisDeviceResolutionV1`.
- Produces: `ResolvedGenesisDeviceContextV1` and device-bound client-plane readiness counts.

- [ ] Write failing tests proving Synnergyze accepts only a Genesis resolution and rejects estate/client mismatch.
- [ ] Verify RED before implementation.
- [ ] Implement the minimal bridge and device dependency registration in the client control plane.
- [ ] Re-run focused Synnergyze tests and type-check.

### Task 3: Conformance metadata and qualification

**Files:**
- Modify: `.vsr/module-bindings.yaml`
- Create: `docs/alpha-node/GENESIS-DEVICE-DEPENDENCY-R0.1.md`

**Interfaces:**
- Consumes: Genesis device registry/resolution and Synnergyze bridge.
- Produces: operator-readable qualification record and explicit Warden-fit prerequisite.

- [ ] Add a conformance test/assertion that the Synnergyze module depends on `GENESIS-DEVICE-RESOLUTION` while `warden_binding` remains `UNBOUND`.
- [ ] Run full Genesis/Synnergyze focused suites on Node 22.14.0.
- [ ] Run full repository tests, type-check, `git diff --check`, and a source scan proving no Warden/River files changed.
- [ ] Record verification evidence and the next stage `SYNNERGYZE-WARDEN-FIT-R0.1`.
- [ ] Commit the device-dependency changes on `feat/synnergyze-client-bootstrap-r0.1`.
- [ ] Publish the new commit to PR #129 and verify remote compare/CI state.
