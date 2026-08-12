# ALPHA-NODE-001 Cross-Surface Manifest Contract

Status: public-safe operating contract

This document defines how ALPHA-NODE-001 projects one governed Registry request across supporting work surfaces without creating competing sources of truth.

## Canonical boundaries

- Supabase Registry / Warden: canonical identity, relationship, authority, licence, consent, request state and governance configuration.
- Neon / RiverOS runtime: runtime actions, acknowledgements, event/evidence flow and rebuildable projections.
- Box: restricted evidence and file artifacts.
- GitHub: public-safe code, schemas, adapters, contracts and non-secret manifests only.
- Notion: internal human-readable operating knowledge, runbooks and decision context.
- Airtable: optional human operational queue/interface; never canonical authority or workflow state.

## Manifest lifecycle

A cross-surface manifest is generated from the canonical Registry request and may be versioned as the request progresses.

`REQUEST -> WARDEN -> EXECUTION LEASE -> RUNTIME HANDOFF -> ACKNOWLEDGEMENT -> RECEIPT -> EFFECT (if any) -> REGISTRY UPDATE`

Important separations:

- REQUEST != AUTHORITY != EXECUTION
- DELIVERY != ACKNOWLEDGEMENT != EFFECT
- ACKNOWLEDGED does not imply EFFECT_OBSERVED
- GitHub content must never contain Warden tokens, service secrets, private Registry rows, participant private data, or restricted Box evidence bodies.

## Cross-surface reference rules

Each surface stores or exposes only a reference appropriate to its classification. The Registry manifest stores surface references and their state (`ACTIVE`, `BLOCKED`, `SUPERSEDED`, `FAILED`). Supporting surfaces cannot independently grant authority or overwrite canonical Registry state.

## Anti-replay requirement

Every executable handoff is bound to one execution lease and, when authority is required, one single-use Warden decision token/change envelope. Runtime acknowledgement consumes that authority exactly once. Retries before acknowledgement must reconcile by idempotency key; replay after consumption must fail closed.

## Alpha Node standing rule

ALPHA-NODE-001 is the reference/incubation node. This contract is additive to the existing node architecture and does not supersede Registry/Warden/RiverOS boundaries.