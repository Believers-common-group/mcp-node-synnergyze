# BNR-DB-GATE-MUTATION-001 — Controlled Mutation Contract

Status: SYNTHETIC CANARY / NOT PRODUCTION EFFECT

Parent: `BNR-DB-GATE-001`

Runtime: Cloudflare Worker -> cache-disabled Hyperdrive -> non-production Neon branch

## Purpose

This contract proves that a consequential database command can cross the Alpha/BNR gateway without giving callers arbitrary SQL or unrestricted database credentials.

The first mutation is intentionally synthetic:

`runtime.canary.record`

It writes only to dedicated canary tables created by `cloudflare/db-gate/migrations/001_bnr_db_gate_canary.sql`.

It MUST NOT write to production action, settlement, Registry, authority, consent, or effect tables.

## Required sequence

```text
REQUEST
  -> Registry/context resolution
  -> Warden authorization
  -> command fingerprint binding
  -> execution lease validation
  -> fixed SQL transaction
  -> runtime command accepted
  -> ACKNOWLEDGEMENT receipt created
  -> Warden execution lease consumed
  -> receipt consumption state reconciled
  -> later effect observation, if any, remains separate
```

Standing invariant:

`REQUEST != AUTHORITY != EXECUTION != ACKNOWLEDGEMENT != EFFECT`

## Command envelope

Endpoint:

`POST /v1/command`

Required governance headers:

- `x-warden-authority-ref`
- `x-digitalme-ref`
- `x-context-ref`
- `x-execution-lease-id`
- `x-idempotency-key`

Body:

```json
{
  "operation": "runtime.canary.record",
  "input": {
    "canary_ref": "CANARY-REFERENCE",
    "payload": {
      "probe": "alpha-db-gate"
    }
  }
}
```

The Worker canonicalizes the command body and computes a SHA-256 `command_fingerprint`.

Warden MUST authorize the exact operation and echo:

- `authority_ref`
- `operation`
- `execution_lease_id`
- `command_fingerprint`
- `expires_at`

Any mismatch fails closed before database mutation.

## Idempotency

Runtime idempotency is keyed by:

`(node_code, x-idempotency-key)`

The first accepted command stores the exact governed envelope, including:

- operation;
- canonical payload;
- command fingerprint;
- actor/context references;
- authority reference;
- execution lease ID.

A retry with the same idempotency key and identical envelope returns the existing command and receipt.

A retry with the same key but a different governed envelope fails with:

`idempotency_collision`

No overwrite is permitted.

## Transaction boundary

The canary command and its acknowledgement receipt are inserted in one Postgres transaction.

Therefore:

- command without receipt is not an accepted state;
- receipt without command is impossible by FK/transaction design;
- a network failure after commit can be reconciled by replaying the same idempotency key.

## Warden consumption boundary

Database acceptance occurs before Warden execution-lease consumption.

The acknowledgement receipt starts with:

`warden_consumption_state = pending`

After runtime commit, the Worker asks Warden to consume the exact authority/lease against the command ID, receipt reference, operation, and command fingerprint.

Warden consumption MUST be idempotent by receipt reference.

If Warden consumption succeeds, the receipt advances to:

`warden_consumption_state = consumed`

If Warden is unavailable after database commit, the command remains accepted but the receipt stays `pending`. The Worker returns a recoverable pending state and MUST NOT claim effect.

A replay of the same idempotency key retries Warden consumption without creating another command.

## Result states

### `200 accepted`

Command and acknowledgement exist, and Warden lease consumption is confirmed.

### `202 accepted_pending_authority_consumption`

Command and acknowledgement exist, but Warden lease consumption is not yet confirmed.

This is a reconciliation state, not failure and not effect.

### `409 idempotency_collision`

Same idempotency key was previously bound to a different governed envelope.

### `403 authority_*`

Warden denied the action, the lease/fingerprint mismatched, or the authority is expired/revoked.

## Receipt semantics

Receipt type is fixed to:

`ACKNOWLEDGED`

No `effect_ref`, `effected_at`, or synthetic effect field exists in the canary schema.

Effect evidence must arrive later through the appropriate RiverOS / observer path.

## Database-role rule

The Hyperdrive origin MUST use a dedicated least-privilege Neon role.

For the canary slice, grant only the minimum access necessary to:

- read/insert `bnr_db_gate_canary_commands`;
- read/insert/update `bnr_db_gate_command_receipts`;
- execute the already-approved read-only query operations.

Do not use a database owner/admin role and do not grant generic write access to production runtime tables.

## Promotion gate

This mutation remains synthetic until all of the following are demonstrated on a non-production Neon branch:

1. Warden allow/deny/expiry/revocation handling;
2. execution lease exact-match validation;
3. command-fingerprint exact-match validation;
4. first-write acceptance;
5. identical replay returns the same command/receipt;
6. same-key/different-payload collision fails closed;
7. post-commit Warden outage returns `202` and reconciles on replay;
8. no duplicate command or receipt rows;
9. no effect is asserted from acknowledgement;
10. structured logs contain references only and no secret/token bodies.

Only after this proof may a real named business mutation be proposed as a separate versioned command.
