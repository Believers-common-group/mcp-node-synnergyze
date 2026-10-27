# BNR Creator Door — Genesis Integration R0.2 (Source profile)

**Status: REVIEW ONLY / NO PRODUCTION AUTHORITY.** This document registers a public-safe, non-executable handoff contract for the Founding Believers River Voyage Source pilot. No external Creator community (including Metronome Bar) is enrolled or represented as a partner.

## Scope and source

The local Python Creator Door R0.2 prototype exposes `GET /api/integration/preview/{event-id}` to an authorized **synthetic** creator after an event has been submitted. It returns only stable references, an event payload SHA-256 commitment, and deterministic idempotency metadata. It does **not** send anything to a live service.

This repository currently hosts an Algolia-derived MCP implementation alongside Alpha Node governance documents. Its name **does not** make it the canonical Genesis Registry, a Warden issuer, or a RiverOS receipt service. Do not put production credentials or private data here.

## Canonical separation

| Surface | Responsibility |
| --- | --- |
| DigitalMe issuer | Server-side validated actor identity and representation |
| Supabase Registry | Canonical consent, membership, contract, request and authority references |
| Warden | Scoped approval/denial, single-use authorization |
| Execution worker / Neon | Lease-bound runtime handoff and idempotent acknowledgement |
| RiverOS | Event/effect witness, receipt, signature and independent verification |
| VSR | Public projection only after canonical authorization |
| GitHub | Non-secret schema, code and governance documentation |

`REQUEST != AUTHORITY != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT`

`LOCAL HASH != DIGITAL SIGNATURE != INDEPENDENTLY VERIFIED RECEIPT`

## Preview contract

The JSON schema is [BNR-CREATOR-DOOR-R02-PREVIEW.schema.json](./BNR-CREATOR-DOOR-R02-PREVIEW.schema.json). Every output must have `synthetic_only: true`, `executable: false`, `registry_state: NOT_SUBMITTED`, `warden_state: NOT_REQUESTED`, `execution_lease_state: NONE`, `runtime_ack_state: NONE` and `effect_state: NOT_OBSERVED`. The `river_receipt_ref` is `null`.

No real identity proof, raw title/description, bank data, Warden nonce/signature, service-role secret, participant evidence, or Box object body belongs in this envelope.

## Future real bridge (not implemented)

1. Resolve DigitalMe identity and representation server-side. A claim supplied by the browser is never enough.
2. Validate current Registry membership, consent and permitted operation.
3. Resolve a signed Warden decision bound to the actor, action, resource, scope, expiry and operation digest.
4. Issue a short-lived, single-use execution lease and consume authority only on verified acknowledgement.
5. Deliver via worker to Neon with `REGISTRY-HANDOFF:<handoff_id>` idempotency. Same key with differing payload must fail closed.
6. Distinguish accepted runtime handoff from an independently observed effect.
7. Emit RiverOS witness/receipt evidence separately; sign and verify receipts through distinct actors.
8. Project approved events to VSR only after Registry approves the public state.

Authoritative implementation notes: [CROSS-SURFACE-MANIFEST-CONTRACT](./CROSS-SURFACE-MANIFEST-CONTRACT.md), [ALPHA-NODE-001-OPERATING-BOUNDARY](./ALPHA-NODE-001-OPERATING-BOUNDARY.md), [ALPHA-RUNTIME-WORKER-001](./ALPHA-RUNTIME-WORKER-001.md), [ALPHA-RIVER-RECEIPT-SIGNING-001](./ALPHA-RIVER-RECEIPT-SIGNING-001.md).

## Promotion hold

Production is **BLOCKED** until the canonical Registry service and API are verified, DigitalMe/representation claims are authenticated server-side, Warden decisions can be independently validated, the transport worker and receipt chain have end-to-end tests, and operator consent, privacy, commercial and third-party integration rights are documented.

No VRChat, Discord, Boosty, Silk, Warden, Neon, Supabase or RiverOS integration is represented as live by this change.
