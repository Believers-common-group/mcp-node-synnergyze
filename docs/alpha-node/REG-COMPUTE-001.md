# REG-COMPUTE-001 — Compute Capability Registry

Status: `ALPHA-RELEASE-003 / FIRST-SLICE`
Scope: `ALPHA-NODE-001` only
Authority boundary: `Registry + Warden`

## Purpose

Introduce a hardware-neutral Compute Plane below the governed cognition layer. The Compute Plane describes where an authorized computation may run; it does not grant authority, choose legal purpose, or become a source of Registry truth.

Canonical separation:

`ENTITY != AGENT != MODEL != COMPUTE BACKEND != AUTHORITY`

The current Apple reference backend is Metal 4 + Metal Performance Primitives (MPP) Tensor Ops. MPP is treated as a replaceable execution backend, not as an Alpha, Genesis, Warden, RiverOS, or Synnergyze dependency.

## Placement

```text
DigitalMe
  -> Registry
  -> Warden
  -> Agent / Cerebral / Model
  -> REG-COMPUTE-001
  -> Warden Compute Grant
  -> Compute Orchestrator
  -> Execution Adapter
  -> MPP | CPU | future CUDA/ROCm/NPU/remote
  -> Silicon
  -> Result
  -> Warden
  -> RiverOS evidence envelope
  -> Registry Effect
```

## Alpha first-slice rules

1. `ALPHA-NODE-001` remains the containing governance/runtime environment. This work does not promote or rename Alpha as BNR.
2. The Ubuntu Alpha VM is the control-plane host. Apple MPP must not be installed or emulated there.
3. Apple MPP execution is optional and fail-closed. It becomes available only when a separately provisioned Apple-silicon runner passes the native readiness probe and is explicitly enabled.
4. No compute request may be dispatched merely because a backend is available. A valid Warden compute grant is a precondition.
5. Backend configuration may contain capability metadata only. Secrets, model payloads, participant data, and raw Warden credentials are forbidden in the registry manifest.
6. RiverOS records the governed compute envelope (principal, grant, model, backend, timestamps, result/effect references), not low-level tensor operations.
7. Provider-specific tuning parameters belong inside the provider adapter and must not leak into Registry identity or Warden policy semantics.
8. A provider failure must not silently fall back to another provider unless the grant explicitly permits a fallback class.

## Capability object

Minimum fields:

- `capability_id`
- `node_id`
- `provider`
- `execution_class`
- `runtime`
- `hardware_family`
- `locality`
- `status`
- `supported_datatypes`
- `supported_operations`
- `trust.attestation_required`
- `warden.required`
- `evidence.mode`
- `version`

## Apple MPP provider profile

Provider id: `apple-mpp-local`

Initial status on `ALPHA-NODE-001`: `UNAVAILABLE_UNTIL_RUNNER_ENROLLED`

Required native conditions:

- Apple silicon host running macOS
- Xcode toolchain with Metal 4 support
- Metal compiler available through `xcrun`
- supported Apple GPU/Neural Accelerator hardware
- runner identity enrolled into Alpha
- Warden compute grant validation active

MPP-specific tuning such as simdgroup/threadgroup tile size, walk order, synchronization interval, and static tensor extents remains provider-local. These are optimization parameters, not governance fields.

## Control-plane configuration

Environment variables:

- `COMPUTE_PLANE_MODE=governed`
- `COMPUTE_DEFAULT_PROVIDER=none`
- `COMPUTE_APPLE_MPP_ENABLED=false`
- `COMPUTE_APPLE_MPP_RUNNER_URL=`
- `COMPUTE_APPLE_MPP_RUNNER_ID=`
- `COMPUTE_REQUIRE_WARDEN_GRANT=true`
- `COMPUTE_EVIDENCE_MODE=envelope`

`COMPUTE_DEFAULT_PROVIDER=none` is deliberate. Alpha must not silently select a compute backend before Warden authorization and capability resolution.

## Activation gate

The Apple MPP backend may move from `UNAVAILABLE_UNTIL_RUNNER_ENROLLED` to `READY` only when all of the following are evidenced:

1. native readiness probe passes on the Apple runner;
2. runner identity and capability manifest are registered to `ALPHA-NODE-001`;
3. Warden compute-grant verification succeeds;
4. a synthetic non-sensitive tensor workload completes;
5. the result is returned through the governed adapter;
6. RiverOS records one compute envelope and Registry records the resulting test effect;
7. no direct provider bypass path exists.

Until then, MPP is configured but not activated.
