# ALPHA-RUNTIME-WORKER-001

Status: VERIFIED CONTINUOUS TRANSPORT

Node: `ALPHA-NODE-001`

Bridge contract: `REG-BRIDGE-001`

Worker: `alpha-runtime-worker/1.1.0`

Scheduler: `pg_cron:alpha-runtime-worker-minute`

Runtime target: `NEON_VSR_PUBLIC_SERVICES / uoe_app_bridge.action_requests`

## Boundary

This is a public-safe operating contract. It contains no database credentials, service-role credentials, Warden token bodies, worker authentication keys, private Registry rows, or participant data.

Supabase Registry/Warden remains canonical for request, authority, execution-lease and governance state. Neon is the runtime action plane. Supporting surfaces cannot independently authorize an action.

## Continuous transport

`REGISTRY REQUEST -> WARDEN (when required) -> EXECUTION LEASE -> WORKER CLAIM -> NEON INSERT/RECONCILE -> REGISTRY SENT -> NEON ACCEPTED -> REGISTRY ACK -> LEASE CONSUMED`

Effect remains a separate later transition:

`ACKNOWLEDGED != EFFECT_OBSERVED`

The worker never fabricates an effect from delivery or runtime acceptance.

## Idempotency

Runtime identity is bound to:

`REGISTRY-HANDOFF:<handoff_id>`

Neon enforces uniqueness for `(source_app, idempotency_key)`. A retry reconciles the existing row and verifies that the significant payload fields match. A same-key/different-payload collision fails closed.

## Authority and recovery

- Runtime acknowledgement consumes a single-use Warden authority only after the runtime action is accepted.
- A `SENT` handoff may be reconciled if a runtime row already exists.
- An expired SENT execution lease may be refreshed only when the request is explicitly `NOT_REQUIRED` for authority, or when Warden authority is still valid at reconciliation time.
- Expired or revoked Warden authority is never revived by the worker.
- Legacy bridge handoffs without an execution lease are not eligible for the SENT reconciliation path.

## Scheduler authentication

The minute scheduler and the Edge Function use a dedicated worker credential stored outside source code. The Neon runtime connection is likewise resolved server-side. Neither credential belongs in this repository.

## Verification — 12 Aug 2026

Continuous-worker canary:

- Registry request: `REG-REQ-20260812184201-87505DE1`
- Runtime handoff: `06775a0f-1961-486c-bf81-5016d7f3b5ca`
- Neon runtime reference: `NEON-ACTION:4`
- Runtime state: `accepted`
- Registry handoff state: `ACKNOWLEDGED`
- Execution lease state: `CONSUMED`
- Registry request roll-up: `ACKNOWLEDGED / COMPLETED`
- Effect: not asserted

Replay verification:

- second worker invocation processed `0` items
- exactly one Neon action exists for the handoff
- no effect reference or effected timestamp was created

## Standing invariant

`REQUEST != AUTHORITY != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT`
