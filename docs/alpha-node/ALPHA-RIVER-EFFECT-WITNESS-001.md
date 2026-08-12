# ALPHA-RIVER-EFFECT-WITNESS-001

Status: VERIFIED CONTINUOUS RIVER EFFECT WITNESS

Node: `ALPHA-NODE-001`

Registry adapter: `registry_desk.witness_confirmed_effect`

Scheduler: `pg_cron:alpha-river-effect-witness-minute`

River route: `alpha-to-riveros-governed`

## Boundary

This adapter does not create an effect. It may witness only an effect already confirmed by the Registry after runtime acknowledgement and effect observation.

Eligibility is fail-closed:

- handoff state must be `EFFECT_CONFIRMED`
- execution lease must already be `CONSUMED`
- an `EFFECT_OBSERVED` Registry receipt with an explicit `effect_ref` must exist
- authority must be `GRANTED` with an authority reference, or explicitly `NOT_REQUIRED`
- the active Alpha-to-RiverOS route and namespace must resolve

The adapter writes to the existing `riveros.events`, `riveros.namespace_heads`, and `riveros.receipts` hash chain. It does not create a parallel ledger.

## Canonical witness flow

`EFFECT_CONFIRMED -> BUILD WITNESS ENVELOPE -> APPEND RIVER EVENT -> EXTEND NAMESPACE HASH CHAIN -> CREATE RIVER RECEIPT -> VERIFY FULL NAMESPACE CHAIN -> VERIFY RECEIPT HASH -> BIND EVENT + RECEIPT TO REGISTRY EVIDENCE`

## Identity and idempotency

The source event reference is derived from the Registry effect receipt:

`REGISTRY_EFFECT_RECEIPT:<effect_receipt_id>`

RiverOS uniqueness on `(namespace_id, source_system, source_event_reference)` makes the witness append single-shot. Replays return the existing River event and receipt.

## Verification — 12 Aug 2026 UTC / 13 Aug 2026 IST

Synthetic effect canary:

- Registry request: `REG-REQ-20260812185030-6978DA3C`
- Effect receipt: `b142ff5d-83b0-4f00-b92c-f08120399f27`
- Effect: `SYNTHETIC-EFFECT:REG-REQ-20260812185030-6978DA3C:EFFECT-001`
- Witness: `62847807-2c60-4f06-92bf-ff47ca0c91d6`
- River namespace: `c59e5db6-9bc3-4a0b-9d51-9ecdf0d920fc`
- River sequence: `1`
- River event: `6aa33a9e-c157-4216-b7f0-9f7d4e9cea33`
- Event hash: `d7d5a779aec2262b8f9c13498085aaa822106f4be16fc5f3db17ebba1e7af0ce`
- River receipt: `03b6a0ba-b51c-426c-851c-da0ec25739b9`
- Receipt hash: `cd399a46168bd196370b3261b24b0abc5c11b12d6e4272e11ad84fc25607a12a`
- Namespace verification: valid, event count `1`, last sequence `1`
- Receipt verification: valid
- Replay: same event/receipt returned with `existing=true`
- Negative gate: an acknowledged request without confirmed effect returned `EFFECT_NOT_CONFIRMED`
- Scheduler: cron job `10`, once per minute
- Immediate post-witness batch: processed `0`, verified `0`, failed `0`

## Assurance distinction

The current receipt is `HASH_CHAINED_INTERNAL` and its hash verifies. `signature_present=false`.

Therefore:

`HASH VERIFIED != DIGITALLY SIGNED`

This is a verified immutable-chain witness within the current RiverOS implementation, not yet a separately signed/notarized external witness.

## Standing invariant

`REQUEST != AUTHORITY != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT != RIVER EVENT != RIVER RECEIPT != DIGITAL SIGNATURE`

No credentials, Warden token bodies, database secrets, worker keys, or private Registry payloads belong in this public repository.
