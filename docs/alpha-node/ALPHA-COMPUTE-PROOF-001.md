# ALPHA-COMPUTE-PROOF-001

Status: `SYNTHETIC CONFORMANCE PROOF`
Scope: `ALPHA-NODE-001`
Registry object: `REG-COMPUTE-001`

## Purpose

Prove the governance boundary between Warden-authorized cognition and a replaceable execution backend before any native Apple MPP runner is activated.

This proof is intentionally synthetic. It performs a deterministic 2 x 2 GEMM on an in-memory CPU runner and creates no external, legal, financial, participant, or settlement effect.

## Required sequence

`IDENTIFY -> RESOLVE CAPABILITY -> WARDEN COMPUTE GRANT -> VERIFY RUNNER -> RESERVE EVIDENCE -> EXECUTE -> VERIFY RESULT -> SEAL EVIDENCE -> RETURN RESULT`

Execution is forbidden when any of the following is absent or mismatched:

- Warden grant
- principal
- represented entity
- node
- provider
- operation
- model
- runner
- validity window
- evidence requirement
- enrolled + attested runner

## Why the first proof uses a synthetic CPU runner

The Ubuntu Alpha control host cannot execute Apple Metal Performance Primitives. The synthetic runner proves the control path without pretending to prove Metal or MPP hardware execution.

The Apple provider therefore remains:

`apple-mpp-local = UNAVAILABLE_UNTIL_RUNNER_ENROLLED`

A declaration in `REG-COMPUTE-001` is capability metadata only. It does not create an executable provider.

## Synthetic workload

Input:

```text
A = [1 2]      B = [5 6]
    [3 4]          [7 8]
```

Expected output:

```text
D = [19 22]
    [43 50]
```

The proof hashes the deterministic result and places only the governed execution envelope and result hash into the evidence journal.

## Evidence envelope

Minimum fields:

- evidence reference
- correlation id
- `ALPHA-NODE-001`
- DigitalMe principal reference
- represented entity reference
- Warden compute-grant reference
- provider
- runner
- model
- operation
- stage: `RESERVED | SEALED | DENIED`
- result hash when sealed
- reason when denied

Raw low-level tensor operations are not evidence objects.

## Promotion conditions for Apple MPP

The MPP backend may not be marked `READY` from configuration alone. A later native proof must establish:

1. supported Apple-silicon runner;
2. Metal 4 / MPP-capable toolchain readiness;
3. runner enrollment to `ALPHA-NODE-001`;
4. attestation evidence;
5. Warden compute grant scoped to `apple-mpp-local` and the runner id;
6. evidence reservation before dispatch;
7. successful non-sensitive native tensor workload;
8. result verification and evidence sealing;
9. no implicit provider fallback;
10. no direct MPP bypass around Warden.

## Relationship to ALPHA-RC1-PROGRAM-001

RC1 proves the broader `Registry -> Warden -> Synnergyze -> Action Gateway -> River -> Registry Effect` operating slice.

ALPHA-COMPUTE-PROOF-001 proves the narrower cognition/compute boundary beneath that operating slice:

`Warden -> Compute Grant -> Compute Plane -> Runner -> Result -> Evidence`.

The two proofs are complementary and neither is a production authority implementation.
