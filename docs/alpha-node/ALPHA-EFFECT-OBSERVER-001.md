# ALPHA-EFFECT-OBSERVER-001

Status: VERIFIED CONTINUOUS EFFECT OBSERVATION

Node: `ALPHA-NODE-001`

Observer: `alpha-effect-observer/1.0.0`

Scheduler: `pg_cron:alpha-effect-observer-minute`

Runtime source: `NEON_VSR_PUBLIC_SERVICES / uoe_app_bridge.action_requests`

## Boundary

The observer cannot execute runtime actions, grant authority, refresh Warden authority, or infer effect from delivery/acceptance.

It may inspect only Registry handoffs already in `ACKNOWLEDGED` state with a `CONSUMED` execution lease. It advances finality only when the corresponding Neon runtime row contains both an explicit `effect_ref` and `effected_at`.

`ACKNOWLEDGED != EFFECT_OBSERVED`

## Effect flow

`ACKNOWLEDGED + CONSUMED LEASE -> EXPLICIT NEON EFFECT -> EFFECT_OBSERVED RECEIPT -> EFFECT_CONFIRMED`

A separate `river_event_ref`, when present, is recorded as effect-lineage evidence rather than being collapsed into the effect identity.

## Verification — 12 Aug 2026

Positive synthetic canary:

- Registry request: `REG-REQ-20260812185030-6978DA3C`
- Handoff: `86244fdf-55cb-4d5f-909f-cbfb8f0d5164`
- Runtime reference: `NEON-ACTION:5`
- Lease: `016c6898-546f-4566-87cf-2a9bda9f4bf1` — remained `CONSUMED`
- Synthetic effect: `SYNTHETIC-EFFECT:REG-REQ-20260812185030-6978DA3C:EFFECT-001`
- Synthetic River lineage: `RIVER-SYNTHETIC:REG-REQ-20260812185030-6978DA3C:EFFECT-001`
- Registry handoff finality: `EFFECT_CONFIRMED`
- Effect receipts created: exactly one

Negative verification:

- accepted runtime actions without effect fields remain `PENDING_EFFECT`
- no `EFFECT_OBSERVED` receipt is fabricated

Replay verification:

- after finality, the effect canary is no longer an observation candidate
- replay observed `0` new effects
- no authority or execution lease was consumed a second time

## Standing invariant

`REQUEST != AUTHORITY != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT != RIVER LINEAGE`
