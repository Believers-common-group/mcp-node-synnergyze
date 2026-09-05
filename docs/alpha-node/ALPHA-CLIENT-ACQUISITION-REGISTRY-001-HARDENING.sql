-- ALPHA-CLIENT-ACQUISITION-REGISTRY-001 — qualification hardening
-- Additive hardening after the R0.1 base migration.
-- T01 eligibility is derived from canonical Warden, provisioning, acquisition,
-- and RiverOS records rather than caller-supplied booleans.

begin;

alter table registry_desk.alpha_provisioning_refs
  alter column destination_node_id type uuid
  using nullif(btrim(destination_node_id), '')::uuid;

alter table registry_desk.alpha_provisioning_refs
  add constraint alpha_provisioning_refs_destination_node_fkey
  foreign key (destination_node_id)
  references public.warden_operating_nodes(node_id)
  on delete restrict;

alter table registry_desk.alpha_t01_qualifications
  alter column destination_node_id type uuid
  using destination_node_id::uuid;

alter table registry_desk.alpha_t01_qualifications
  add constraint alpha_t01_qualifications_destination_node_fkey
  foreign key (destination_node_id)
  references public.warden_operating_nodes(node_id)
  on delete restrict;

alter table registry_desk.alpha_t01_qualifications
  alter column river_receipt_ref type uuid
  using nullif(btrim(river_receipt_ref), '')::uuid;

alter table registry_desk.alpha_t01_qualifications
  add constraint alpha_t01_qualifications_river_receipt_fkey
  foreign key (river_receipt_ref)
  references riveros.receipts(receipt_id)
  on delete restrict;

create or replace function registry_desk.alpha_prepare_t01_qualification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_provision_acquisition_id uuid;
  v_provision_state text;
  v_provision_independently_provisioned boolean;
  v_provision_destination_node_id uuid;
  v_acquisition_state text;
  v_warden_status text;
  v_warden_approved_at timestamptz;
  v_eligible boolean;
  v_next_sequence integer;
begin
  if tg_op = 'UPDATE' and old.countable = true then
    raise exception 'countable ALPHA-T01 qualification records are immutable';
  end if;

  select
    p.acquisition_id,
    p.provision_state,
    p.independently_provisioned,
    p.destination_node_id,
    a.current_state,
    w.status,
    w.approved_at
  into
    v_provision_acquisition_id,
    v_provision_state,
    v_provision_independently_provisioned,
    v_provision_destination_node_id,
    v_acquisition_state,
    v_warden_status,
    v_warden_approved_at
  from registry_desk.alpha_provisioning_refs p
  join registry_desk.alpha_client_acquisitions a
    on a.acquisition_id = p.acquisition_id
  join public.warden_operating_nodes w
    on w.node_id = new.destination_node_id
  where p.provision_id = new.provision_id
  for update of p, a, w;

  if not found then
    raise exception 'canonical ALPHA provisioning/acquisition/Warden node binding does not exist';
  end if;

  if v_provision_acquisition_id <> new.acquisition_id then
    raise exception 'ALPHA-T01 qualification provision does not belong to acquisition';
  end if;

  if v_provision_destination_node_id is distinct from new.destination_node_id then
    raise exception 'ALPHA-T01 destination node does not match the provisioning reference';
  end if;

  new.independently_provisioned := v_provision_independently_provisioned;
  new.canonical_node_exists := true;
  new.warden_admitted := (
    v_warden_status = 'active'
    and v_warden_approved_at is not null
  );
  new.river_evidenced := (new.river_receipt_ref is not null);

  v_eligible :=
    v_provision_state = 'PROVISIONED'
    and new.independently_provisioned
    and v_acquisition_state in ('NODE_REGISTERED', 'NODE_ACTIVE')
    and new.canonical_node_exists
    and new.warden_admitted
    and nullif(btrim(new.warden_decision_ref), '') is not null
    and new.river_evidenced
    and new.duplicate_check = 'PASS'
    and new.placeholder_check = 'PASS';

  new.countable := v_eligible;
  new.updated_at := now();

  if not v_eligible then
    new.sequence_no := null;
    new.qualified_at := null;
    return new;
  end if;

  perform pg_advisory_xact_lock(451001::bigint);

  if new.sequence_no is null then
    select coalesce(max(sequence_no), 0) + 1
      into v_next_sequence
    from registry_desk.alpha_t01_qualifications
    where countable = true;

    if v_next_sequence > 100 then
      raise exception 'ALPHA-T01 is complete; no sequence above 100 may be allocated';
    end if;

    new.sequence_no := v_next_sequence::smallint;
  end if;

  new.qualified_at := coalesce(new.qualified_at, now());
  return new;
end;
$$;

revoke execute on function registry_desk.alpha_prepare_t01_qualification()
  from public, anon, authenticated;
grant execute on function registry_desk.alpha_prepare_t01_qualification()
  to service_role;

commit;
