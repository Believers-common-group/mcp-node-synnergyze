# Apple MPP native compile gate

This directory prepares the first native Apple Metal Performance Primitives compile proof for `ALPHA-NODE-001`.

## What this proves

`npm run compile:apple-mpp` is intended to run only on an enrolled Apple-silicon macOS runner. It:

1. verifies macOS + arm64;
2. resolves the active Xcode Metal compiler with `xcrun`;
3. compiles `AlphaMppGemmProbe.metal` to Metal IR;
4. links the IR into a `.metallib`;
5. hashes the source and compiled library;
6. emits `compile-evidence.json` with `activation_allowed: false`.

A successful compile proves only that the selected native toolchain accepts the probe source. It does **not** prove GPU dispatch, Neural Accelerator execution, result correctness, runner attestation, Warden authorization, or RiverOS evidence sealing.

## Probe kernel

The kernel uses Metal tensor parameters and the MPP tensor-ops matrix multiplication API. It tiles the output in 64 x 64 blocks, uses four SIMD groups for each threadgroup-scoped operation, accumulates into a cooperative tensor, and stores the result to the output tensor.

The implementation follows the architecture described by Apple's MPP Programming Guide and Apple's `Running inline ML operations in a shader with Metal 4` sample, while remaining an Alpha-owned probe rather than a vendored copy of Apple's sample project.

## Run sequence

On the future enrolled runner:

```bash
export ALPHA_NODE_ID=ALPHA-NODE-001
export COMPUTE_APPLE_MPP_RUNNER_ID=GENESIS-APPLE-RUNNER-001
npm run probe:apple-mpp
npm run compile:apple-mpp
```

Expected artifact directory:

```text
.alpha/mpp-build/
  AlphaMppGemmProbe.ir
  AlphaMppGemmProbe.metallib
  compile-evidence.json
```

The `.alpha/` directory is local proof output and must not become Registry truth by itself. Its evidence is promotable only after Warden/Registry ingestion under the compute-proof workflow.

## Next gate

`ALPHA-COMPUTE-MPP-PROOF-001` must add an actual host-side Metal dispatch that:

- creates/binds tensors;
- dispatches the native kernel;
- verifies a known GEMM result against a CPU reference;
- seals the governed compute evidence envelope;
- keeps `apple-mpp-local` disabled on any failure.
