# Genesis Device Dependency R0.1 Design

## Purpose

Introduce a canonical Genesis-owned device identity and resolution boundary that Synnergyze can consume before the existing Warden is fitted.

## Fixed authority model

1. Genesis registers devices and owns canonical device identity/lifecycle.
2. Genesis records device bindings and attestations as evidence-bearing facts.
3. Genesis resolves the current device dependency for a client/runtime context.
4. Synnergyze may carry only a resolved Genesis device context into later authorization.
5. Warden remains unchanged in R0.1 and never becomes the device registry.

## Core invariant

A device-bound Warden request must eventually depend on a valid Genesis device resolution. Registration alone is insufficient; a device must be bound, attested, active, and resolvable.

## Separation of concerns

Genesis answers: what device is this, where does it belong, and what current admitted state is evidenced?
Synnergyze answers: which workflow/action depends on that resolved device?
Warden later answers: is that device state sufficient for this action?
River later proves the resulting execution and verification chain.

## R0.1 contracts

`GenesisDeviceRecordV1` holds canonical device identity, estate/location ownership, class, machine assertion, lifecycle, and provenance.

`GenesisDeviceAttestationV1` records assurance level, evidence references, validity window, and attested state without granting authority.

`GenesisDeviceResolutionV1` is a point-in-time projection produced only for a registered, estate-matching, active device with a currently valid attestation.

`ResolvedGenesisDeviceContextV1` is the Synnergyze-facing immutable projection derived from a Genesis resolution. It is not independently creatable by Synnergyze.

## Lifecycle

`DISCOVERED -> REGISTERED -> BOUND -> ATTESTED -> ACTIVE`, with `SUSPENDED`, `QUARANTINED`, `REVOKED`, and `RETIRED` non-executable states.

## Failure behavior

Resolution fails closed for unknown devices, estate mismatch, non-active lifecycle, missing/expired attestation, or malformed Genesis references. No fallback to user-supplied device security state is permitted.

## R0.1 non-goals

No hardware attestation provider integration, no TPM/Secure Enclave implementation, no Warden changes, no River schema changes, and no runtime execution enablement are included in this stage.
