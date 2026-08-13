-- BNR-DB-GATE-001 / controlled mutation proof
--
-- This migration creates an isolated canary command surface. It does not grant
-- mutation access to production action tables and it does not model an effect.
-- Apply only to a non-production Neon branch for the first integration slice.

create schema if not exists uoe_app_bridge;

create table if not exists uoe_app_bridge.bnr_db_gate_canary_commands (
  command_id uuid primary key,
  node_code text not null,
  gate_code text not null,
  idempotency_key text not null,
  operation_code text not null,
  command_fingerprint text not null,
  canary_ref text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_ref text not null,
  context_ref text not null,
  authority_ref text not null,
  execution_lease_id text not null,
  accepted_at timestamptz not null default now(),
  constraint bnr_db_gate_canary_operation_check
    check (operation_code = 'runtime.canary.record'),
  constraint bnr_db_gate_canary_idempotency_unique
    unique (node_code, idempotency_key)
);

create index if not exists bnr_db_gate_canary_ref_idx
  on uoe_app_bridge.bnr_db_gate_canary_commands (canary_ref, accepted_at desc);

create table if not exists uoe_app_bridge.bnr_db_gate_command_receipts (
  receipt_id uuid primary key,
  receipt_ref text not null unique,
  command_id uuid not null unique
    references uoe_app_bridge.bnr_db_gate_canary_commands(command_id)
    on delete restrict,
  receipt_type text not null default 'ACKNOWLEDGED',
  request_id text not null,
  warden_consumption_state text not null default 'pending',
  warden_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bnr_db_gate_receipt_type_check
    check (receipt_type = 'ACKNOWLEDGED'),
  constraint bnr_db_gate_warden_consumption_check
    check (warden_consumption_state in ('pending', 'consumed')),
  constraint bnr_db_gate_warden_consumed_at_check
    check (
      (warden_consumption_state = 'pending' and warden_consumed_at is null)
      or
      (warden_consumption_state = 'consumed' and warden_consumed_at is not null)
    )
);

comment on table uoe_app_bridge.bnr_db_gate_canary_commands is
  'Synthetic controlled-write proof for BNR-DB-GATE-001. Runtime acceptance only; not business effect evidence.';

comment on table uoe_app_bridge.bnr_db_gate_command_receipts is
  'Acknowledgement receipts for the BNR DB Gate canary. ACKNOWLEDGED is not EFFECT_OBSERVED.';

-- Deliberately no GRANT statements here. Provision a dedicated Hyperdrive origin
-- role separately and grant only the minimum SELECT/INSERT/UPDATE permissions on
-- these two canary tables for the test environment. Do not reuse an owner/admin role.
