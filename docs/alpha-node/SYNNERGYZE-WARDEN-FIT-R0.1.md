# SYNNERGYZE-WARDEN-FIT-R0.1 Qualification

## Qualification state

- Stage: `SYNNERGYZE-WARDEN-FIT-R0.1`
- Genesis device dependency: `REQUIRED` for device-bound authorization.
- Transient device security: `OPTIONAL` overlay; fail-closed when supplied.
- Warden binding: `FIT_QUALIFIED`.
- Synnergyze runtime execution: `BLOCKED_RUNTIME_ACTIVATION`.
- External effects: `false`.
- Next activation gate: `SYNNERGYZE-RUNTIME-ACTIVATION-R0.1`.
- River implementation/contracts changed in this stage: `none`.

## Frozen authority boundary

Genesis remains canonical for device identity, estate/location binding, attestation, lifecycle, and point-in-time device resolution. Synnergyze carries that resolved dependency into the Warden request. Warden evaluates the dependency together with actor, representation, authority, policy, capability, target, time, and assurance requirements. Warden does not register, attest, resolve, or mutate devices.

A transient device-security context is separate from Genesis provenance. Its absence does not replace or weaken the mandatory Genesis dependency. When transient security context is supplied, existing security-state, evidence, device-match, freshness, and expiry checks remain fail-closed.

## Device authorization invariants

A request with `executionDeviceRef` is denied unless it carries a matching `WardenGenesisDeviceDependencyV1`. The resolution reference must be canonical, attestation/evidence must be present, and the device resolution must remain valid through Warden decision time.

The temporal invariant is:

`resolvedAt <= requestedAt <= decidedAt <= validUntil`

when `validUntil` is present. Assurance ordering is deterministic:

`L0 < L1 < L2 < L3 < L4`

A policy may require a device for otherwise non-device-bound work and may specify a minimum assurance level. Warden never infers either device identity or assurance from UI state, model output, connector state, or transient device-security status.

## Execution boundary

`FIT_QUALIFIED` is not runtime authorization. Client bootstrap and workflow records remain `executable: false`. Repository presence, passing tests, or a Warden `ALLOW` decision does not activate external effects. Runtime activation remains a separately reviewed stage.

## Verification receipt

Repository target runtime: Node `v22.14.0`.

Final code head verified: `9e362d91eecc9028fcdc7c4bd42e103cdf0d13ab`.

GitHub Actions results on that head:

- Full test suite: `77/77` test files passed; `448/448` tests passed (`test` run 945).
- Type-check: passed (`type-check` run 945).
- Lint: passed (`lint` run 945).
- Runtime AuthZ Bridge: passed (run 46).
- Datadog Synthetic tests: passed (run 627).

Focused suites included:

- Synnergyze Warden request bridge: `27/27` tests passed.
- Warden decision service: `20/20` tests passed.
- Controlled execution gate: `25/25` tests passed.
- Synnergyze client control plane: `9/9` tests passed.
- Genesis device registry: `5/5` tests passed.
- Synnergyze Genesis-device bridge: `3/3` tests passed.

Comparison from the prior Genesis-device head `2fbde1dbd5c23c335a442b03b2fd5450bd793e68` to the verified Warden-fit code head showed no changes under `modules/river/`.

## Promotion result

`SYNNERGYZE-WARDEN-FIT-R0.1` is qualified at the contract, request-bridge, policy-evaluation, control-plane-readiness, and conformance-metadata layers.

The next stage is `SYNNERGYZE-RUNTIME-ACTIVATION-R0.1` (or an explicitly superseding reviewed activation contract). No runtime/external-effect activation is granted by this qualification receipt.
