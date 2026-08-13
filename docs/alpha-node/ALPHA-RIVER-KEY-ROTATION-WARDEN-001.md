# ALPHA-RIVER-KEY-ROTATION-WARDEN-001

Status: **VERIFIED CONTROL WORKFLOW / PENDING WARDEN**

## Purpose

This contract governs authority resolution for River receipt signer-key lifecycle actions. It does not grant authority and does not activate any signer key.

Canonical chain:

`REGISTRY REQUEST -> RESOLVE PRINCIPAL -> WARDEN POLICY -> ACV -> DECISION TOKEN -> EXACT CHANGE ENVELOPE -> CONSUME -> KEY STATE TRANSITION -> VERIFY`

No step may be collapsed into another.

## Current activation request

- Registry request: `REG-REQ-20260813032719-B17110C9`
- Authority request: `cfc012ea-31cd-4141-8ffb-08a7201a193e`
- Target signer: `ALPHA-RIVER-RECEIPT-SIGNER-001`, key version `2`
- Target key state: **STAGED**
- Action: `riveros.signer_key.activate`
- Target: `RIVEROS:SIGNER_KEY:aadac578-2022-42e4-8d76-43a8c1bf785e`
- Current Warden resolution: **unresolved — `POLICY_NOT_FOUND`**
- Human gate: **required**
- Proposed change hash: **not bound**
- Decision token: **not issued**
- Execution: **not started**

The exact internal principal and role-context identifiers remain in the private Registry/authority evidence surfaces and are intentionally omitted from this public-safe contract.

## Requesting-principal boundary

Registry resolution found an active `vsr.network_principal` Alpha role context with authority basis `founder_operator_record`. That identity may request Warden evaluation. It does not inherit signer-key rotation authority merely because the role context exists.

`REQUESTING PRINCIPAL != WARDEN AUTHORITY`

## Authority profiles

The Registry Desk defines control requirements, not ALLOW policies:

| Action | Autonomy ceiling | Execution | Blast | Verification | Evidence | Reversibility | Human gate |
|---|---:|---:|---:|---:|---:|---|---|
| `riveros.signer_key.activate` | A0 | E2 | B2 | V3 | EV3 | PARTIALLY_REVERSIBLE | REQUIRED |
| `riveros.signer_key.retire` | A0 | E2 | B2 | V3 | EV3 | PARTIALLY_REVERSIBLE | REQUIRED |
| `riveros.signer_key.revoke` | A0 | E3 | B3 | V4 | EV4 | IRREVERSIBLE | REQUIRED |
| `riveros.signer_key.compromise` | A0 | E3 | B3 | V4 | EV4 | IRREVERSIBLE | REQUIRED |

These profiles are safeguards and evidence requirements. They do not create an executable GEE policy.

## Exact-change binding

The prior key transition routine used execution-time clock time inside the proposed change. That prevented a Warden change envelope from approving the exact bytes later executed.

The corrected path requires an explicit transition effective time. `registry_desk.signer_key_transition_proposal(...)` builds the deterministic proposed change. The approved change hash can then be placed in the GEE change envelope. Runtime `transition_signer_key(...)` must reproduce that same exact change before `gee.consume_runtime_action(...)` succeeds.

Therefore:

`APPROVED CHANGE HASH == EXECUTED CHANGE HASH`

A proposal may be bound before authority, but binding a proposal is explicitly **not authorization**.

## Fail-closed state

The exact v2 activation input was submitted to the existing Warden resolver using the Registry-resolved Alpha requesting principal. Result:

`POLICY_NOT_FOUND`

No ACV was created for the action, no decision token was issued, and key v2 remains STAGED. Key v1 remains the sole ACTIVE signer.

## Authority evidence

Private append-only evidence is recorded in `registry_desk.signer_key_authority_events`. Current events for the v2 activation request include:

1. `PREPARED`
2. `RESOLUTION_ATTEMPT`

The resolution input hash is:

`58b5c7695432555b33bc2f5ab239c97c66360f7e77634e3bee37cf19308c46dc`

## Required activation evidence

Before a Warden policy could legitimately permit activation, the control profile requires at least:

- staged-key proof;
- public-key fingerprint;
- current-active-key proof;
- rotation plan;
- post-cutover verification plan/evidence.

The Warden/human authority must still independently determine whether that evidence is sufficient and whether activation should be allowed.

## Security posture

The new Registry Desk authority tables are private, RLS-enabled and service-role-only. Post-DDL security lint did not introduce a new signed-in-user `SECURITY DEFINER` warning for this subsystem. Wider estate posture remains **AMBER** because pre-existing warnings and leaked-password-protection configuration remain unresolved.

## Invariants

`REQUEST != AUTHORITY`

`ROLE CONTEXT != ACTION AUTHORITY`

`POLICY PROFILE != ACTIVE POLICY`

`ACV != DECISION TOKEN`

`DECISION TOKEN != CHANGE ENVELOPE`

`BOUND PROPOSAL != AUTHORIZATION`

`AUTHORIZATION != EXECUTION`

`KEY V2 STAGED != KEY V2 ACTIVE`

## Next boundary

The next legitimate step is Warden policy/authority establishment by the appropriate authority source, followed by fresh resolution of the existing Registry request. Until that happens, the correct operational state is **PENDING_WARDEN / POLICY_NOT_FOUND**.