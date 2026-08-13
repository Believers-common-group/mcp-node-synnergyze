# Alpha Node / Newton Agentic Builder — Metal Tool Pack

This slice exposes Apple Metal/MPS planning capabilities to the Newton agentic-builder surface through MCP while preserving Alpha Node governance boundaries.

## Architectural position

Newton is a builder/operator surface. It is not a Registry, Warden, or source of authority.

```text
Newton builder / DevOps surface
  -> Alpha/Newton MCP tools
  -> Registry context
  -> Warden authority/capability
  -> build or execution adapter
  -> evidence
  -> Registry Effect / River evidence path
```

Planning and recommendation do not imply authorization. All planning tools return `executionAllowed: false` and identify the next Warden gate.

## Planning tools

- `alphaNewtonListCapabilities`
- `alphaNewtonPlanMetalWorkload`
- `alphaNewtonRouteExecutionTarget`
- `alphaNewtonPlanDevOpsRun`
- `alphaNewtonCreateAuthorityEnvelope`

Workload classes map to Metal compute, Metal Performance Shaders, MPSGraph, rendering, MetalFX, ray tracing, and resource-management patterns.

## APPLE-RUNNER-001

`appleRunnerRunMetalCanary` is the first executing adapter. It is intentionally constrained to the deterministic `vector-add-f32-v1` Metal fixture.

Execution invariants:

1. The runner must be macOS.
2. The tool accepts no executable, script, path, or arbitrary command argument.
3. The process command is fixed to `xcrun swift <generated-fixed-fixture>` with `shell: false`.
4. Authority is supplied as an HMAC-SHA256 Warden capability token using `ALPHA_WARDEN_HMAC_SECRET` from the runner environment; the secret is never accepted as a tool argument.
5. Capability payload must be `ALPHA-WARDEN-CAPABILITY-001`, `issuedBy: WARDEN`, `status: AUTHORIZED`, scoped to `APPLE-RUNNER-001:METAL-CANARY`, bound to the requested runner and tool, and unexpired.
6. Each capability contains a nonce. The runner writes an exclusive-use replay marker before execution; reuse is rejected.
7. The generated fixture compiles an embedded Metal kernel at runtime, adds `[1,2,3,4]` to `[10,20,30,40]`, and requires `[11,22,33,44]`.
8. Evidence contains fixture identity, Metal device identity, OS version, correctness, CPU elapsed time, GPU elapsed time when available, capability identity/context, and execution timestamp.
9. Temporary source is removed after the run.
10. Output is bounded and execution is time-limited.

Default replay markers live under the runner temporary directory. Set `ALPHA_WARDEN_REPLAY_DIR` to a durable runner-local directory before using the canary for assurance beyond ephemeral testing.

## Execution topology

A Linux/Gram Alpha control-plane host may plan workloads, request Warden authority, dispatch work to an identified Apple runner, and ingest evidence. It must not claim local Metal execution. Metal workloads are routed to a macOS Apple runner.

## Current boundary

This slice does **not** add arbitrary shell execution, production deployment, raw Registry/database credentials, or a Newton-private API assumption. APPLE-RUNNER-001 proves only the smallest governed execution path required before broader build/deploy adapters are considered.
