# Synnergyze Warden Fit R0.1 Design

## Purpose

Bind the existing Synnergyze client/device-dependency path to the existing Warden authorization boundary without moving device identity, attestation, orchestration, or evidence ownership into Warden.

## Authority model

1. Genesis remains canonical for device identity, estate/location binding, attestation, lifecycle, and device resolution.
2. Synnergyze remains the composition layer. It carries a resolved Genesis device dependency into authorization requests for device-bound work.
3. Warden remains the authority/policy decision engine. It evaluates whether the supplied Genesis device dependency is sufficient for the requested action.
4. The existing transient device-security context remains separate from Genesis device identity. It may independently block a request when the device is sealed, quarantined, reconnecting, or otherwise non-active.
5. River remains unchanged in R0.1 and continues to be the later evidence/execution boundary.

## Core invariant

If a Synnergyze event declares `executionDeviceRef`, the corresponding Warden request must contain a current Genesis device dependency whose `deviceRef` exactly matches that execution device. No raw device identifier, UI state, model output, or transient device-security status can substitute for a Genesis resolution.

## Separation of device concerns

Genesis answers: what device is this, where is it bound, what attestation supports it, and what current admitted trust state is resolved?

Synnergyze answers: which program/event/action depends on that resolved device?

Device-security context answers: is the device currently in an operational security state compatible with requesting authorization?

Warden answers: do the actor, authority, policy, capability, target, Genesis device dependency, and optional device-security conditions jointly permit this action?

River later answers: what authorization/execution/effect actually occurred and what evidence proves it?

## Warden public contract addition

Add a first-class additive device dependency object:

```ts
export interface WardenGenesisDeviceDependencyV1 {
  resolutionRef: string;
  deviceRef: string;
  estateRef: string;
  attestationRef: string;
  assuranceLevel: "L0" | "L1" | "L2" | "L3" | "L4";
  evidenceRefs: readonly string[];
  resolvedAt: string;
  validUntil?: string;
}
```

`WardenDecisionRequestV1` gains:

```ts
genesisDevice?: WardenGenesisDeviceDependencyV1;
```

Existing device-security fields remain supported in R0.1 for compatibility and containment-state evaluation. They are not treated as identity or attestation authority.

## Warden policy addition

Add an optional policy requirement:

```ts
export interface WardenDeviceRequirementV1 {
  required: boolean;
  minimumAssuranceLevel?: "L0" | "L1" | "L2" | "L3" | "L4";
}
```

`SyntheticWardenDecisionPolicyV1` gains:

```ts
deviceRequirement?: WardenDeviceRequirementV1;
```

For a device-bound request, Genesis device resolution is required regardless of whether `deviceRequirement` is explicitly present. `deviceRequirement` adds policy strictness such as a minimum assurance level; it does not disable the base Genesis dependency requirement.

## Synnergyze bridge behavior

For a device-bound event, `buildWardenDecisionRequestV1` must consume a `ResolvedGenesisDeviceContextV1` in addition to any existing `ResolvedDeviceSecurityContextV1`.

The bridge must fail closed when:
- Genesis context is missing for a device-bound event.
- Genesis context `deviceRef` differs from `executionDeviceRef`.
- Genesis resolution reference is malformed or absent.
- Genesis evidence/attestation data is absent.
- Genesis resolution is from the future relative to `requestedAt`.
- Genesis resolution is expired relative to `requestedAt`.
- A Genesis device context is supplied for a non-device-bound event.

The canonical Warden request identity must include the Genesis device dependency so a changed device resolution produces a different request identity.

## Warden evaluation behavior

Warden must deny a device-bound request if any of the following applies:
- `genesisDevice` is missing.
- `genesisDevice.deviceRef` does not equal `executionDeviceRef`.
- `resolutionRef` is not a canonical Genesis device-resolution reference.
- Evidence references or attestation reference are absent.
- Resolution time is invalid or later than the decision/request time context.
- `validUntil` is invalid or expired.
- Policy requires a minimum assurance level and the resolved device is below it.

Recommended denial reasons:
- `genesis_device_dependency_required`
- `genesis_device_ref_mismatch`
- `genesis_device_resolution_invalid`
- `genesis_device_evidence_missing`
- `genesis_device_resolution_from_future`
- `genesis_device_resolution_expired`
- `genesis_device_assurance_insufficient`

Existing device-security failures remain independent, including `device_security_not_active` where applicable.

## Assurance ordering

Assurance comparison is deterministic:

`L0 < L1 < L2 < L3 < L4`

No inference or provider-specific reinterpretation is allowed inside Warden.

## Backward compatibility

Non-device-bound Warden requests continue to work without `genesisDevice`.

Device-bound requests are intentionally tightened: after this fit, a device-bound request without a Genesis device dependency is invalid even if legacy `deviceSecurity*` fields are present.

The change is additive to the request type but behaviorally stricter for device-bound authorization.

## Conformance metadata

`MOD-WARDEN-001` gains an explicit dependency on `GENESIS-DEVICE-RESOLUTION` for device-bound authorization.

`MOD-SYNNERGYZE-001` transitions from `warden_binding: UNBOUND` to a fit-qualified state only after the new contract/evaluator/bridge tests pass. Runtime activation remains separately gated; this design does not imply production activation from repository presence alone.

## Failure and security posture

All device-bound ambiguity fails closed. Warden never queries or mutates the Genesis device registry directly in R0.1; it evaluates the immutable dependency supplied in the request. Synnergyze cannot create authority by fabricating a raw device reference because the request requires a canonical Genesis resolution with attestation/evidence provenance.

## Testing requirements

Tests must prove:
- device-bound Synnergyze request fails without Genesis device context;
- mismatched device references fail;
- expired/future Genesis resolutions fail;
- malformed/empty evidence fails;
- changed Genesis resolution changes Warden request identity;
- Warden denies missing/mismatched/expired/insufficient-assurance dependencies;
- Warden allows an otherwise valid request when the Genesis dependency satisfies policy;
- existing transient device-security blocking still works independently;
- non-device-bound flows remain backward compatible;
- full repository tests and type-check remain green;
- River implementation and contracts remain unchanged in R0.1.

## Non-goals

R0.1 does not add hardware attestation providers, TPM/Secure Enclave integrations, River schema changes, settlement behavior, UI changes, device enrollment flows, or production activation. It does not make Warden a registry, attestation service, device-health service, or execution engine.

## Promotion boundary

Successful completion qualifies the contract and decision path as `SYNNERGYZE-WARDEN-FIT-R0.1`.

The next stage after this fit is a separately reviewed River/execution integration or activation stage. Repository presence, passing tests, or Warden ALLOW alone must not be interpreted as external-effect activation.
