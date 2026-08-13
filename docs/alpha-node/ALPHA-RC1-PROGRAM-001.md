# ALPHA-RC1-PROGRAM-001

First executable synthetic Alpha operating slice.

## Boundary

`ALPHA-NODE-001 LOCAL REGISTRY → WARDEN DECISION → SYNNERGYZE PROGRAM/EVENT → TEST ACTION GATEWAY → SYNTHETIC RIVER EVIDENCE → REGISTRY EFFECT PROJECTION`

This package is a conformance fixture only. It does not represent a production Warden service, production RiverOS service, production Registry mutation service, payment rail, contract engine or legal authority.

## Provider posture

- Supabase is deferred optional and is not used by RC1.
- Neon is not required by RC1.
- The in-memory Action Gateway is deterministic and performs no external network request.
- Existing `/registry-bridge` remains separate and fail-closed.
- No secret material belongs in RC1 fixtures or evidence.

## Synthetic identities

- Entity: `LAB-COMPANY-001`
- Actor: `DIGITALME-ALPHA-TEST-001`
- Warden fixture: `WARDEN-ALPHA-RC1-001`
- Program: `ALPHA-RC1-PROGRAM-001`
- Allowed capability: `service_request.create`
- Forbidden capability: `contract.execute`

## Proofs

The RC1 suite must prove:

1. exact allowed action receives a bounded synthetic Warden decision;
2. River evidence reservation occurs before mutation;
3. read-after-write confirmation is required before synthetic effect recording;
4. duplicate correlation ids do not duplicate the service request;
5. `contract.execute` is denied with no connector mutation;
6. missing Warden decision produces no mutation;
7. missing/unavailable evidence reservation produces no mutation;
8. revocation prevents later controlled action;
9. read-after-write mismatch becomes `EXCEPTION`;
10. Front and Back Gate projections resolve the same canonical refs/effect state;
11. no external network call, legal effect, financial effect or settlement occurs.

## Event sequence

`RC1-E01 IDENTIFY → RC1-E02 RELATE → RC1-E03 REQUIREMENTS → RC1-E04 PREPARE_ALLOWED → RC1-E05 WARDEN_ALLOW → RC1-E06 RESERVE_EVIDENCE → RC1-E07 EXECUTE_ALLOWED → RC1-E08 VERIFY_ALLOWED → RC1-E09 SEAL_EVIDENCE → RC1-E10 PREPARE_FORBIDDEN → RC1-E11 WARDEN_DENY → RC1-E12 PROVE_NO_EFFECT → RC1-E13 REVOKE → RC1-E14 POST_REVOKE_DENY → RC1-E15 RECONSTRUCT → RC1-E16 CLOSE`

## Governance references

- `Believers-common-group/SynergyzeGovernance#10`
- `Believers-common-group/SynergyzeGovernance#11`
- `Believers-common-group/SynergyzeGovernance#12`
- `Believers-common-group/SynergyzeGovernance#13`
- `Believers-common-group/SynergyzeGovernance#17`
- `Believers-common-group/SynergyzeGovernance#24`

Promotion into `genesis` is allowed only after test, lint and type-check evidence is green and the change is reviewed as a synthetic conformance slice rather than a production authority implementation.
