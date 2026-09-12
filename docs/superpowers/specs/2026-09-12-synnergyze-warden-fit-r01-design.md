# Synnergyze Warden Fit R0.1 Design

## Purpose

Bind the existing Synnergyze client/device-dependency path to the existing Warden authorization boundary without moving device identity, attestation, orchestration, or evidence ownership into Warden.

## Authority model

1. Genesis remains canonical for device identity, estate/location binding, attestation, lifecycle, and device resolution.
2. Synnergyze remains the composition layer. It carries a resolved Genesis device dependency into authorization requests for device-bound work.
3. Warden remains the authority/policy decision engine. It evaluates whether the supplied Genesis device dependency is sufficient for the requested action.
4. The existing transient device-security context remains separate from Genesis device identity. It may independently block a request when supplied and the device is sealed, quarantined, reconnecting, or otherwise non-active.
5. River remains unchanged in R0.1 and continues to be the later evidence/execution boundary.

## Core invariant

If a Synnergyze event declares `executionDeviceRef`, the corresponding Warden request must contain a current Genesis device dependency whose `deviceRef` exactly matches that execution device. No raw device identifier, UI state, model output, or transient device-security status can substitute for a Genesis resolution.

## Separation of device concerns

Genesis answers: what device is this, where is it bound, what attestation supports it, and what current admitted trust state is resolved?

Synnergyze answers: which program/event/action depends on that resolved device?

Device-security context answers: if an operational-security resolution is supplied, is the device currently in a security state compatible with requesting authorization?

Warden answers: do the actor, authority, policy, capability, target, Genesis device dependency, and any supplied device-security conditions jointly permit this action?

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

For a device-bound request, Genesis device resolution is mandatory regardless of whether `deviceRequirement` is present or whether `required` is false.

For a non-device-bound request, `deviceRequirement.required: true` means policy itself requires a device-bound request; absence of `executionDeviceRef`/`genesisDevice` is denied. `minimumAssuranceLevel`, when present, is evaluated whenever a Genesis device dependency is present. This makes `required` a policy tightening mechanism rather than a way to relax the base device-bound invariant.

## Synnergyze bridge behavior

For a device-bound event, `buildWardenDecisionRequestV1` must consume a `ResolvedGenesisDeviceContextV1`.

`ResolvedDeviceSecurityContextV1` becomes a separate optional supplement in R0.1. Its absence alone does not block a device-bound authorization request once a valid Genesis device context is present. If it is supplied, all existing device-security validation remains fail-closed and it is bound into the Warden request identity as today.

The bridge must fail closed when:
- Genesis context is missing for a device-bound event.
- Genesis context `deviceRef` differs from `executionDeviceRef`.
- Genesis resolution reference is malformed or absent.
- Genesis evidence/attestation data is absent.
- Genesis resolution is from the future relative to `requestedAt`.
- Genesis resolution is expired relative to `requestedAt`.
- A Genesis device context is supplied for a non-device-bound event.
- A supplied transient device-security context belongs to another device, is non-active, malformed, future-dated, or expired under the existing validation rules.

The canonical Warden request identity must include the Genesis device dependency so a changed Genesis resolution produces a different request identity.

## Warden evaluation behavior

Warden must deny a device-bound request if any of the following applies:
- `genesisDevice` is missing.
- `genesisDevice.deviceRef` does not equal `executionDeviceRef`.
- `resolutionRef` is not a canonical Genesis device-resolution reference.
- Evidence references or attestation reference are absent.
- Resolution time is invalid.
- `resolvedAt` is later than `requestedAt` or `decidedAt`.
- `validUntil` is invalid or earlier than `decidedAt`.
- Policy requires a minimum assurance level and the resolved device is below it.

The temporal rule is explicit:

`resolvedAt <= requestedAt <= decidedAt <= validUntil` when `validUntil` exists.

If no `validUntil` exists, the resolution must still satisfy `resolvedAt <= requestedAt <= decidedAt`; R0.1 does not invent an implicit expiry window.

If `deviceRequirement.required` is true and the request is not device-bound, Warden denies it rather than inferring a device.

Recommended denial reasons:
- `genesis_device_dependency_required`
- `genesis_device_policy_requires_device`
- `genesis_device_ref_mismatch`
- `genesis_device_resolution_invalid`
- `genesis_device_evidence_missing`
- `genesis_device_resolution_from_future`
- `genesis_device_resolution_expired`
- `genesis_device_assurance_insufficient`

Existing device-security failures remain independent when a device-security context is supplied, including `device_security_not_active` where applicable.

## Assurance ordering

Assurance comparison is deterministic:

`L0 < L1 < L2 < L3 < L4`

No inference or provider-specific reinterpretation is allowed inside Warden.

## Backward compatibility

Non-device-bound Warden requests continue to work without `genesisDevice` unless policy explicitly declares `deviceRequirement.required: true`.

Device-bound requests are intentionally tightened: after this fit, a device-bound request without a Genesis device dependency is invalid even if legacy `deviceSecurity*` fields are present.

Existing transient device-security input is no longer the mandatory identity/trust prerequisite for device-bound authorization; it is an optional, separately validated security overlay. This is an intentional behavior change that reflects the newly established Genesis device dependency.

The request schema change is additive, while authorization behavior becomes stricter around Genesis provenance and clearer around the separation of identity/trust from transient security state.

## Conformance metadata

`MOD-WARDEN-001` gains an explicit dependency on `GENESIS-DEVICE-RESOLUTION` for device-bound authorization.

`MOD-SYNNERGYZE-001` transitions from `warden_binding: UNBOUND` to a fit-qualified state only after the new contract/evaluator/bridge tests pass. Runtime activation remains separately gated; this design does not imply production activation from repository presence alone.

## Failure and security posture

All device-bound identity/trust ambiguity fails closed. Warden never queries or mutates the Genesis device registry directly in R0.1; it evaluates the immutable dependency supplied in the request. Synnergyze cannot create authority by fabricating a raw device reference because the request requires a canonical Genesis resolution with attestation/evidence provenance.

A transient device-security context cannot substitute for Genesis provenance. Conversely, a valid Genesis dependency does not override a supplied device-security context that fails its own safety checks.

## Testing requirements

Tests must prove:
- device-bound Synnergyze request fails without Genesis device context;
- mismatched device references fail;
- expired/future Genesis resolutions fail;
- malformed/empty evidence fails;
- changed Genesis resolution changes Warden request identity;
- a valid device-bound request can be built without transient device-security context;
- supplied transient device-security blocking still works independently;
- Warden denies missing/mismatched/expired/insufficient-assurance dependencies;
- Warden denies non-device-bound work when policy requires a device;
- Warden denies a resolution that expires between request construction and decision time;
- Warden allows an otherwise valid request when the Genesis dependency satisfies policy;
- non-device-bound flows remain backward compatible when policy does not require a device;
- full repository tests and type-check remain green;
- River implementation and contracts remain unchanged in R0.1.

## Non-goals

R0.1 does not add hardware attestation providers, TPM/Secure Enclave integrations, River schema changes, settlement behavior, UI changes, device enrollment flows, or production activation. It does not make Warden a registry, attestation service, device-health service, or execution engine.

## Promotion boundary

Successful completion qualifies the contract and decision path as `SYNNERGYZE-WARDEN-FIT-R0.1`.

The next stage after this fit is a separately reviewed River/execution integration or activation stage. Repository presence, passing tests, or Warden ALLOW alone must not be interpreted as external-effect activation.
