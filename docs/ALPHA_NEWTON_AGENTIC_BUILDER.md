# Alpha Node / Newton Agentic Builder Tool Surface

Status: first implementation slice  
Tool pack: `ALPHA-NEWTON-METAL-TOOLS-001`  
Authority state: planning-only until a Warden-issued capability is supplied

## Purpose

This package exposes the Apple Metal / Metal Performance Shaders material as governed MCP tools that an agentic DevOps builder can reason over. Newton is treated as a builder/operator surface, not as a canonical registry, policy engine, evidence store, or execution authority.

The canonical boundary remains:

`DigitalMe -> Alpha Registry -> Warden -> tool capability -> runner -> evidence -> effect`

The builder may discover tools, create plans, request authority, route work, and later invoke provider adapters. It must not become a second source of truth.

## Current tools

| Tool | Function | Side effect |
| --- | --- | --- |
| `alphaNewtonListCapabilities` | Discover Metal/MPS capability families and execution boundary | None |
| `alphaNewtonPlanMetalWorkload` | Select Metal/MPS framework candidates and produce build/test/evidence checks | None |
| `alphaNewtonRouteExecutionTarget` | Decide whether work stays local or needs a remote Apple runner | None |
| `alphaNewtonPlanDevOpsRun` | Produce a governed DevOps run plan using the Alpha network grammar | None |
| `alphaNewtonCreateAuthorityEnvelope` | Produce a pending Warden authority request envelope | None |

Every tool in this first slice is read-only. `executionAllowed` is deliberately `false` in generated plans/envelopes.

## Metal documentation -> agentic tool mapping

The uploaded Metal documentation is represented as reusable workload classes rather than one-off prompts:

- Compute workflows -> `workloadClass=compute`
- Argument buffers, buffers, textures, heaps and synchronization -> `workloadClass=resource-management`
- Metal Performance Shaders image/filter primitives -> `workloadClass=image-processing`
- MPSGraph tensor, FFT, inference and training workflows -> `tensor-graph`, `ml-inference`, or `ml-training`
- Render pipelines and MetalFX opportunities -> `render`
- Ray tracing and intersection workloads -> `ray-tracing`

This preserves the distinction between a capability description and an authorized execution.

## Host/runtime split

Metal execution requires an Apple platform with Metal support. A Linux or Windows Alpha control-plane machine can still:

1. inspect and plan the workload;
2. generate a governed DevOps run;
3. resolve an Apple runner;
4. request a Warden capability;
5. send the authorized change/run to the runner through a later provider adapter;
6. receive build, test, timing and correctness evidence;
7. record the resulting effect back through the Alpha evidence/runtime path.

The non-Apple host must never pretend to have executed Metal locally.

## Start the standalone MCP surface

```bash
npm start -- start-alpha-newton-server
```

The standalone command intentionally avoids Algolia authentication and starts only the Alpha/Newton tool pack over stdio.

A generic MCP client entry can use:

```json
{
  "mcpServers": {
    "alpha-newton": {
      "command": "npm",
      "args": ["start", "--", "start-alpha-newton-server"]
    }
  }
}
```

Run it from this repository or replace the command with the packaged executable once a release artifact exists.

## Newton builder connection modes

Use the least-coupled option supported by the builder environment:

1. **Native MCP** — point the builder at the `alpha-newton` stdio/server adapter.
2. **Workflow bridge** — if the builder uses n8n/Make or an equivalent workflow engine, place the MCP invocation behind a controlled workflow node; pass only Registry references and Warden capability references, never raw estate secrets.
3. **OpenAPI/HTTP adapter** — add a transport adapter around the same tool contracts if the builder cannot consume MCP directly. The HTTP layer remains an adapter, not a new tool authority.

No public Newton-specific builder API is assumed by this repository. A Newton workspace endpoint, API contract, or supported MCP configuration should be added only when it is available from the user's actual workspace or Newton documentation.

## Warden gate

A future executing adapter must reject a request unless all of the following resolve:

- `digitalMeId`
- represented entity / workspace context
- `authorityRef`
- requested tool and operation scope
- target repository/environment/runner
- validity window
- evidence requirements
- revocation state

The agent can recommend and prepare. Warden authorizes. The runner executes. River/evidence records what happened.

## First executable follow-up

Do not jump directly to production deployment. The next implementation slice should add one Apple runner adapter with a synthetic workload only:

1. generate a tiny Metal compute fixture;
2. compile on a declared macOS runner;
3. run a deterministic input/output test;
4. capture Xcode/SDK, OS, device, commit, build log, test output and timing;
5. hash/store those artifacts;
6. return an effect object;
7. keep deployment and production writes disabled.

That thin slice proves the control-plane-to-Apple-runner boundary without giving the builder arbitrary shell or infrastructure authority.
