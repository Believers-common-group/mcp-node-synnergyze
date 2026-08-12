# ALPHA-NODE-001 — Governed Operating Boundary

Status: ACTIVE REFERENCE

## Canonical boundary

ALPHA-NODE-001 is the precursor/reference/incubation node for the future BNR family. It is Registry-bearing.

- Supabase: canonical Registry, licences, authority, consent, Warden policy and governed request state.
- Neon: runtime/public participation, action requests, projections and operational workload.
- RiverOS: governed event/evidence movement between sources and destinations.
- Warden: authority/policy boundary. Authentication alone is not authorization.
- Box: evidence/document/artifact store. Box object IDs are evidence references; Box is not authority.
- GitHub: code, schemas, adapters, contracts and deployment manifests. No production secrets or private registry data.
- Notion: human-readable operating knowledge, decisions, runbooks and reference views. Not canonical authority.
- Airtable: optional lightweight operating queues/interfaces. It must not become Registry truth.

## Execution invariant

REQUEST != AUTHORITY != EXECUTION != EFFECT

A consequential runtime path follows:

REQUEST -> REGISTRY RESOLUTION -> WARDEN DECISION -> SHORT-LIVED AUTHORITY -> EXECUTION LEASE -> RUNTIME HANDOFF -> ACKNOWLEDGEMENT -> EFFECT EVIDENCE -> RECEIPT/STATE UPDATE

## Cross-surface rule

Every external work surface should carry stable references back to the Registry Desk, for example:

- request_ref
- authority_ref (reference only; never expose secret/token body)
- handoff_id
- execution_lease_id
- Box evidence object ID
- Git commit/PR reference
- Notion page reference
- Airtable record reference
- RiverOS event/receipt reference

No external surface may grant or infer authority merely because a record exists there.

## Box root

Existing Box folder: ALPHA-NODE-001
Box folder ID: 408537078742

Governed subfolders created:
- 00-REGISTRY-DESK — 408585289562
- 01-WARDEN-AUTHORITY — 408582575100
- 02-RIVEROS-RECEIPTS — 408583230225
- 03-RUNTIME-RELEASES — 408585579615
- 04-OPERATING-DOCS — 408586463256

## Public-repository safety

This repository is public. Do not commit:
- credentials, API keys, service-role keys, connection strings or secrets;
- Warden token values/nonces/signatures;
- private participant information;
- private Box file bodies;
- private registry rows or regulated evidence.

Use references/IDs and redacted test fixtures only.
