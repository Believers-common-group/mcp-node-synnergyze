# Synnergyze Client Bootstrap R0.1 Design

## Purpose

Bring Synnergyze up after the existing Genesis substrate without coupling the new client control plane to Warden during bootstrap.

## Fixed stage order

1. Genesis is authoritative for estate, principal, system, and instance identity.
2. Synnergyze registers client operating context and composes capabilities/workflows.
3. River/Warden-facing execution remains unavailable during this bootstrap.
4. Existing Warden is fitted only after the Synnergyze client plane is stable.

## Safety invariant

A connected or registered system never implies execution authority. Until the Warden binding is fitted, every client runtime reports `WARDEN_UNBOUND` and is non-executable.

## R0.1 deliverable

Add a Genesis-bound Synnergyze client-control-plane module that can:
- register one client contract against one Genesis estate,
- admit systems by canonical Genesis reference,
- declare discrete system capabilities,
- contract workflow definitions from those capabilities,
- expose deterministic bootstrap/readiness state,
- reject duplicate/conflicting identifiers,
- never invoke the existing Warden runtime.
