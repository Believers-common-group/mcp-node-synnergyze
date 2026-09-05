-- ALPHA-CLIENT-ACQUISITION-REGISTRY-001
-- Public-safe canonical SQL contract for ALPHA-NODE-001.
-- Real client rows, private BC/VSR/CC data, credentials, Warden token bodies,
-- and restricted River evidence MUST NOT be committed to this repository.

begin;

create sequence registry_desk.alpha_acquisition_key_seq;
create sequence registry_desk.alpha_acquisition_event_key_seq;
create sequence registry_desk.alpha_t01_qualification_key_seq;

create table registry_desk.alpha_client_acquisitions (
  acquisition_id uuid primary key default gen_random_uuid(),
  acquisition_key text not null unique default (
    'ALPHA-ACQ-' || lpad(nextval('registry_desk.alpha_acquisition_key_seq'::regclass)::text, 6, '0')
  ),
  client_candidate_ref text not null,
  issuer_node text not null default 'ALPHA-NODE-001',
  current_state text not null default 'DISCOVERED',
  cohort_id text not null default 'ALPHA-T01',
  first_100_candidate boolean not null default true,
  state_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alpha_client_acquisitions_key_ck
    check (acquisition_key ~ '^ALPHA-ACQ-[0-9]{6}$'),
  constraint alpha_client_acquisitions_issuer_ck
    check (issuer_node = 'ALPHA-NODE-001'),
  constraint alpha_client_acquisitions_cohort_ck
    check (cohort_id = 'ALPHA-T01'),
  constraint alpha_client_acquisitions_state_ck
    check (current_state in (
      'DISCOVERED',
      'SELECTED_FOR_OUTREACH',
      'CONTACTED',
      'ENGAGED',
      'DISCOVERY_ACTIVE',
      'QUALIFIED',
      'SOLUTION_MAPPED',
      'PROPOSAL_ACTIVE',
      'COMMERCIAL_AGREED',
      'PROVISIONING_READY',
      'PROVISIONING',
      'WARDEN_ADMISSION',
      'NODE_REGISTERED',
      'NODE_ACTIVE',
      'DISQUALIFIED',
      'DEFERRED',
      'WITHDRAWN',
      'LOST',
      'SUSPENDED'
    ))
);

create table registry_desk.alpha_acquisition_source_refs (
  source_ref_id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null
    references registry_desk.alpha_client_acquisitions(acquisition_id)
    on delete restrict,
  ref_role text not null default 'PRIMARY',
  source_registry text not null,
  source_object_type text not null,
  source_object_id text,
  source_node_id text,
  source_relationship_id text,
  supersedes_source_ref_id uuid
    references registry_desk.alpha_acquisition_source_refs(source_ref_id)
    on delete restrict,
  superseded_at timestamptz,
  superseded_by_source_ref_id uuid
    references registry_desk.alpha_acquisition_source_refs(source_ref_id)
    on delete restrict
    deferrable initially deferred,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint alpha_acquisition_source_refs_role_ck
    check (ref_role in ('PRIMARY', 'ASSISTING')),
  constraint alpha_acquisition_source_refs_registry_ck
    check (source_registry in ('BC', 'VSR', 'CC', 'EXTERNAL')),
  constraint alpha_acquisition_source_refs_object_type_ck
    check (source_object_type in (
      'NODE', 'PRINCIPAL', 'ORGANISATION', 'LOCATION',
      'PROGRAMME', 'ROUTE', 'OTHER'
    )),
  constraint alpha_acquisition_source_refs_object_required_ck
    check (
      source_registry = 'EXTERNAL'
      or nullif(btrim(source_object_id), '') is not null
    ),
  constraint alpha_acquisition_source_refs_supersession_pair_ck
    check (
      (superseded_at is null and superseded_by_source_ref_id is null)
      or
      (superseded_at is not null and superseded_by_source_ref_id is not null)
    ),
  constraint alpha_acquisition_source_refs_no_self_supersede_ck
    check (
      supersedes_source_ref_id is null
      or supersedes_source_ref_id <> source_ref_id
    )
);

create unique index alpha_acquisition_one_active_primary_uq
  on registry_desk.alpha_acquisition_source_refs(acquisition_id)
  where ref_role = 'PRIMARY' and superseded_at is null;

create index alpha_acquisition_source_refs_acquisition_idx
  on registry_desk.alpha_acquisition_source_refs(acquisition_id);

create index alpha_acquisition_source_refs_source_node_idx
  on registry_desk.alpha_acquisition_source_refs(source_registry, source_node_id)
  where source_node_id is not null;

create table registry_desk.alpha_acquisition_events (
  event_id uuid primary key default gen_random_uuid(),
  event_key text not null unique default (
    'ALPHA-ACQ-EVT-' || lpad(nextval('registry_desk.alpha_acquisition_event_key_seq'::regclass)::text, 8, '0')
  ),
  acquisition_id uuid not null
    references registry_desk.alpha_client_acquisitions(acquisition_id)
    on delete restrict,
  event_type text not null,
  from_state text,
  to_state text,
  actor_ref text,
  warden_decision_ref text,
  river_receipt_ref text,
  idempotency_key text not null unique,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint alpha_acquisition_events_key_ck
    check (event_key ~ '^ALPHA-ACQ-EVT-[0-9]{8}$'),
  constraint alpha_acquisition_events_type_ck
    check (event_type in (
      'STATE_TRANSITION',
      'PROVENANCE_CORRECTION',
      'TOOLKIT_REQUIREMENT',
      'PROVISIONING',
      'QUALIFICATION',
      'NOTE'
    )),
  constraint alpha_acquisition_events_state_pair_ck
    check (
      (event_type = 'STATE_TRANSITION' and from_state is not null and to_state is not null)
      or
      (event_type <> 'STATE_TRANSITION' and from_state is null and to_state is null)
    )
);

create index alpha_acquisition_events_acquisition_time_idx
  on registry_desk.alpha_acquisition_events(acquisition_id, occurred_at);

create table registry_desk.alpha_acquisition_toolkit_requirements (
  requirement_id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null
    references registry_desk.alpha_client_acquisitions(acquisition_id)
    on delete restrict,
  toolkit_id text not null,
  purpose text,
  requirement_state text not null default 'REQUIRED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alpha_acquisition_toolkit_requirements_state_ck
    check (requirement_state in ('REQUIRED', 'PLANNED', 'PROVISIONED', 'REMOVED')),
  constraint alpha_acquisition_toolkit_requirements_uq
    unique (acquisition_id, toolkit_id)
);

create index alpha_acquisition_toolkit_requirements_toolkit_idx
  on registry_desk.alpha_acquisition_toolkit_requirements(toolkit_id, requirement_state);

create table registry_desk.alpha_provisioning_refs (
  provisioning_ref_id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null
    references registry_desk.alpha_client_acquisitions(acquisition_id)
    on delete restrict,
  provision_id text not null unique,
  destination_node_id text,
  provision_state text not null default 'PLANNED',
  independently_provisioned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alpha_provisioning_refs_state_ck
    check (provision_state in (
      'PLANNED', 'READY', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'CANCELLED'
    ))
);

create index alpha_provisioning_refs_acquisition_idx
  on registry_desk.alpha_provisioning_refs(acquisition_id);

create index alpha_provisioning_refs_destination_node_idx
  on registry_desk.alpha_provisioning_refs(destination_node_id)
  where destination_node_id is not null;

create table registry_desk.alpha_t01_qualifications (
  qualification_id uuid primary key default gen_random_uuid(),
  qualification_key text not null unique default (
    'ALPHA-T01-QUAL-' || lpad(nextval('registry_desk.alpha_t01_qualification_key_seq'::regclass)::text, 6, '0')
  ),
  cohort_id text not null default 'ALPHA-T01',
  acquisition_id uuid not null
    references registry_desk.alpha_client_acquisitions(acquisition_id)
    on delete restrict,
  provision_id text not null
    references registry_desk.alpha_provisioning_refs(provision_id)
    on delete restrict,
  destination_node_id text not null,
  independently_provisioned boolean not null default false,
  canonical_node_exists boolean not null default false,
  warden_admitted boolean not null default false,
  river_evidenced boolean not null default false,
  duplicate_check text not null default 'FAIL',
  placeholder_check text not null default 'FAIL',
  warden_decision_ref text,
  river_receipt_ref text,
  countable boolean not null default false,
  sequence_no smallint,
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alpha_t01_qualifications_key_ck
    check (qualification_key ~ '^ALPHA-T01-QUAL-[0-9]{6}$'),
  constraint alpha_t01_qualifications_cohort_ck
    check (cohort_id = 'ALPHA-T01'),
  constraint alpha_t01_qualifications_duplicate_ck
    check (duplicate_check in ('PASS', 'FAIL')),
  constraint alpha_t01_qualifications_placeholder_ck
    check (placeholder_check in ('PASS', 'FAIL')),
  constraint alpha_t01_qualifications_sequence_ck
    check (
      (countable = false and sequence_no is null)
      or
      (countable = true and sequence_no between 1 and 100)
    )
);

create index alpha_t01_qualifications_acquisition_idx
  on registry_desk.alpha_t01_qualifications(acquisition_id);

create unique index alpha_t01_countable_destination_uq
  on registry_desk.alpha_t01_qualifications(destination_node_id)
  where countable = true;

create unique index alpha_t01_countable_acquisition_uq
  on registry_desk.alpha_t01_qualifications(acquisition_id)
  where countable = true;

create unique index alpha_t01_sequence_uq
  on registry_desk.alpha_t01_qualifications(sequence_no)
  where countable = true;

create or replace function registry_desk.alpha_acquisition_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_from
    when 'DISCOVERED' then p_to in ('SELECTED_FOR_OUTREACH', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'SELECTED_FOR_OUTREACH' then p_to in ('CONTACTED', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'CONTACTED' then p_to in ('ENGAGED', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'ENGAGED' then p_to in ('DISCOVERY_ACTIVE', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'DISCOVERY_ACTIVE' then p_to in ('QUALIFIED', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'QUALIFIED' then p_to in ('SOLUTION_MAPPED', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'SOLUTION_MAPPED' then p_to in ('PROPOSAL_ACTIVE', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'PROPOSAL_ACTIVE' then p_to in ('COMMERCIAL_AGREED', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'COMMERCIAL_AGREED' then p_to in ('PROVISIONING_READY', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'PROVISIONING_READY' then p_to in ('PROVISIONING', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'PROVISIONING' then p_to in ('WARDEN_ADMISSION', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'WARDEN_ADMISSION' then p_to in ('NODE_REGISTERED', 'DISQUALIFIED', 'DEFERRED', 'WITHDRAWN', 'LOST')
    when 'NODE_REGISTERED' then p_to in ('NODE_ACTIVE', 'SUSPENDED')
    when 'NODE_ACTIVE' then p_to = 'SUSPENDED'
    else false
  end;
$$;

create or replace function registry_desk.alpha_guard_acquisition_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.acquisition_id is distinct from old.acquisition_id
     or new.acquisition_key is distinct from old.acquisition_key
     or new.client_candidate_ref is distinct from old.client_candidate_ref
     or new.issuer_node is distinct from old.issuer_node
     or new.cohort_id is distinct from old.cohort_id
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable ALPHA acquisition identity fields cannot be changed';
  end if;

  if new.current_state is distinct from old.current_state then
    if pg_trigger_depth() < 2 then
      raise exception 'ALPHA acquisition state changes require an acquisition event';
    end if;

    if not registry_desk.alpha_acquisition_transition_allowed(old.current_state, new.current_state) then
      raise exception 'illegal ALPHA acquisition transition: % -> %', old.current_state, new.current_state;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger alpha_client_acquisitions_guard_update
before update on registry_desk.alpha_client_acquisitions
for each row
execute function registry_desk.alpha_guard_acquisition_update();

create or replace function registry_desk.alpha_prevent_source_ref_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ALPHA acquisition source references are append-only';
  end if;

  if pg_trigger_depth() < 2 then
    raise exception 'ALPHA acquisition source references may only be superseded by appending a new source reference';
  end if;

  if new.source_ref_id is distinct from old.source_ref_id
     or new.acquisition_id is distinct from old.acquisition_id
     or new.ref_role is distinct from old.ref_role
     or new.source_registry is distinct from old.source_registry
     or new.source_object_type is distinct from old.source_object_type
     or new.source_object_id is distinct from old.source_object_id
     or new.source_node_id is distinct from old.source_node_id
     or new.source_relationship_id is distinct from old.source_relationship_id
     or new.supersedes_source_ref_id is distinct from old.supersedes_source_ref_id
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at then
    raise exception 'immutable ALPHA source provenance fields cannot be changed';
  end if;

  return new;
end;
$$;

create trigger alpha_acquisition_source_refs_prevent_mutation
before update or delete on registry_desk.alpha_acquisition_source_refs
for each row
execute function registry_desk.alpha_prevent_source_ref_mutation();

create or replace function registry_desk.alpha_prepare_source_ref_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old registry_desk.alpha_acquisition_source_refs%rowtype;
begin
  if new.supersedes_source_ref_id is null then
    return new;
  end if;

  select *
    into v_old
  from registry_desk.alpha_acquisition_source_refs
  where source_ref_id = new.supersedes_source_ref_id
  for update;

  if not found then
    raise exception 'superseded ALPHA source reference does not exist';
  end if;

  if v_old.acquisition_id <> new.acquisition_id then
    raise exception 'ALPHA source correction must remain within the same acquisition';
  end if;

  if v_old.ref_role <> new.ref_role then
    raise exception 'ALPHA source correction must preserve source reference role';
  end if;

  if v_old.superseded_at is not null then
    raise exception 'ALPHA source reference is already superseded';
  end if;

  update registry_desk.alpha_acquisition_source_refs
  set superseded_at = now(),
      superseded_by_source_ref_id = new.source_ref_id
  where source_ref_id = v_old.source_ref_id;

  return new;
end;
$$;

create trigger alpha_acquisition_source_refs_prepare_insert
before insert on registry_desk.alpha_acquisition_source_refs
for each row
execute function registry_desk.alpha_prepare_source_ref_insert();

create or replace function registry_desk.alpha_prevent_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'ALPHA acquisition events are append-only';
end;
$$;

create trigger alpha_acquisition_events_prevent_mutation
before update or delete on registry_desk.alpha_acquisition_events
for each row
execute function registry_desk.alpha_prevent_event_mutation();

create or replace function registry_desk.alpha_apply_acquisition_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_state text;
begin
  if new.event_type <> 'STATE_TRANSITION' then
    return new;
  end if;

  select current_state
    into v_current_state
  from registry_desk.alpha_client_acquisitions
  where acquisition_id = new.acquisition_id
  for update;

  if not found then
    raise exception 'ALPHA acquisition does not exist';
  end if;

  if v_current_state <> new.from_state then
    raise exception 'ALPHA acquisition transition expected %, found %', new.from_state, v_current_state;
  end if;

  if not registry_desk.alpha_acquisition_transition_allowed(new.from_state, new.to_state) then
    raise exception 'illegal ALPHA acquisition transition: % -> %', new.from_state, new.to_state;
  end if;

  update registry_desk.alpha_client_acquisitions
  set current_state = new.to_state,
      state_changed_at = new.occurred_at,
      updated_at = now()
  where acquisition_id = new.acquisition_id;

  return new;
end;
$$;

create trigger alpha_acquisition_events_apply_transition
before insert on registry_desk.alpha_acquisition_events
for each row
execute function registry_desk.alpha_apply_acquisition_event();

create trigger alpha_acquisition_toolkit_requirements_updated_at
before update on registry_desk.alpha_acquisition_toolkit_requirements
for each row
execute function registry_desk.set_updated_at();

create trigger alpha_provisioning_refs_updated_at
before update on registry_desk.alpha_provisioning_refs
for each row
execute function registry_desk.set_updated_at();

create or replace function registry_desk.alpha_prepare_t01_qualification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_provision_acquisition_id uuid;
  v_eligible boolean;
  v_next_sequence integer;
begin
  if tg_op = 'UPDATE' and old.countable = true then
    raise exception 'countable ALPHA-T01 qualification records are immutable';
  end if;

  select acquisition_id
    into v_provision_acquisition_id
  from registry_desk.alpha_provisioning_refs
  where provision_id = new.provision_id;

  if not found then
    raise exception 'ALPHA provisioning reference does not exist';
  end if;

  if v_provision_acquisition_id <> new.acquisition_id then
    raise exception 'ALPHA-T01 qualification provision does not belong to acquisition';
  end if;

  v_eligible :=
    new.independently_provisioned
    and new.canonical_node_exists
    and new.warden_admitted
    and nullif(btrim(new.warden_decision_ref), '') is not null
    and new.river_evidenced
    and nullif(btrim(new.river_receipt_ref), '') is not null
    and new.duplicate_check = 'PASS'
    and new.placeholder_check = 'PASS'
    and nullif(btrim(new.destination_node_id), '') is not null;

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

create trigger alpha_t01_qualifications_prepare
before insert or update on registry_desk.alpha_t01_qualifications
for each row
execute function registry_desk.alpha_prepare_t01_qualification();

create or replace function registry_desk.alpha_prevent_t01_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'ALPHA-T01 qualification records cannot be deleted';
end;
$$;

create trigger alpha_t01_qualifications_prevent_delete
before delete on registry_desk.alpha_t01_qualifications
for each row
execute function registry_desk.alpha_prevent_t01_delete();

create view registry_desk.alpha_source_node_yield_v
with (security_invoker = true)
as
with active_sources as (
  select
    s.acquisition_id,
    s.source_registry,
    s.source_node_id
  from registry_desk.alpha_acquisition_source_refs s
  where s.ref_role = 'PRIMARY'
    and s.superseded_at is null
    and s.source_node_id is not null
), milestones as (
  select
    e.acquisition_id,
    bool_or(e.to_state in (
      'ENGAGED', 'DISCOVERY_ACTIVE', 'QUALIFIED', 'SOLUTION_MAPPED',
      'PROPOSAL_ACTIVE', 'COMMERCIAL_AGREED', 'PROVISIONING_READY',
      'PROVISIONING', 'WARDEN_ADMISSION', 'NODE_REGISTERED', 'NODE_ACTIVE'
    )) filter (where e.event_type = 'STATE_TRANSITION') as engaged,
    bool_or(e.to_state in (
      'QUALIFIED', 'SOLUTION_MAPPED', 'PROPOSAL_ACTIVE', 'COMMERCIAL_AGREED',
      'PROVISIONING_READY', 'PROVISIONING', 'WARDEN_ADMISSION',
      'NODE_REGISTERED', 'NODE_ACTIVE'
    )) filter (where e.event_type = 'STATE_TRANSITION') as qualified,
    bool_or(e.to_state in (
      'COMMERCIAL_AGREED', 'PROVISIONING_READY', 'PROVISIONING',
      'WARDEN_ADMISSION', 'NODE_REGISTERED', 'NODE_ACTIVE'
    )) filter (where e.event_type = 'STATE_TRANSITION') as commercial_agreed,
    bool_or(e.to_state in ('NODE_REGISTERED', 'NODE_ACTIVE'))
      filter (where e.event_type = 'STATE_TRANSITION') as provisioned,
    bool_or(e.to_state = 'NODE_ACTIVE')
      filter (where e.event_type = 'STATE_TRANSITION') as active_node
  from registry_desk.alpha_acquisition_events e
  group by e.acquisition_id
), qualification as (
  select acquisition_id, bool_or(countable) as countable
  from registry_desk.alpha_t01_qualifications
  group by acquisition_id
)
select
  s.source_registry,
  s.source_node_id,
  count(*)::bigint as opportunities,
  count(*) filter (where coalesce(m.engaged, false))::bigint as engaged,
  count(*) filter (where coalesce(m.qualified, false))::bigint as qualified,
  count(*) filter (where coalesce(m.commercial_agreed, false))::bigint as commercial_agreed,
  count(*) filter (where coalesce(m.provisioned, false))::bigint as provisioned,
  count(*) filter (where coalesce(q.countable, false))::bigint as countable_nodes,
  count(*) filter (where coalesce(m.active_node, false))::bigint as active_nodes
from active_sources s
left join milestones m on m.acquisition_id = s.acquisition_id
left join qualification q on q.acquisition_id = s.acquisition_id
group by s.source_registry, s.source_node_id;

create view registry_desk.alpha_t01_progress_v
with (security_invoker = true)
as
select
  'ALPHA-T01'::text as cohort_id,
  count(*) filter (where countable)::bigint as countable_nodes,
  greatest(100 - count(*) filter (where countable), 0)::bigint as remaining_nodes,
  (count(*) filter (where countable) = 100) as complete,
  max(sequence_no) filter (where countable) as latest_sequence
from registry_desk.alpha_t01_qualifications;

create view registry_desk.alpha_toolkit_forward_demand_v
with (security_invoker = true)
as
select
  toolkit_id,
  count(*) filter (where requirement_state in ('REQUIRED', 'PLANNED'))::bigint as forward_demand,
  count(*) filter (where requirement_state = 'PROVISIONED')::bigint as provisioned_requirements
from registry_desk.alpha_acquisition_toolkit_requirements
where requirement_state <> 'REMOVED'
group by toolkit_id;

create view registry_desk.alpha_acquisition_funnel_v
with (security_invoker = true)
as
select
  current_state,
  count(*)::bigint as candidate_count
from registry_desk.alpha_client_acquisitions
group by current_state;

alter table registry_desk.alpha_client_acquisitions enable row level security;
alter table registry_desk.alpha_acquisition_source_refs enable row level security;
alter table registry_desk.alpha_acquisition_events enable row level security;
alter table registry_desk.alpha_acquisition_toolkit_requirements enable row level security;
alter table registry_desk.alpha_provisioning_refs enable row level security;
alter table registry_desk.alpha_t01_qualifications enable row level security;

revoke all on table registry_desk.alpha_client_acquisitions from public, anon, authenticated;
revoke all on table registry_desk.alpha_acquisition_source_refs from public, anon, authenticated;
revoke all on table registry_desk.alpha_acquisition_events from public, anon, authenticated;
revoke all on table registry_desk.alpha_acquisition_toolkit_requirements from public, anon, authenticated;
revoke all on table registry_desk.alpha_provisioning_refs from public, anon, authenticated;
revoke all on table registry_desk.alpha_t01_qualifications from public, anon, authenticated;

revoke all on table registry_desk.alpha_source_node_yield_v from public, anon, authenticated;
revoke all on table registry_desk.alpha_t01_progress_v from public, anon, authenticated;
revoke all on table registry_desk.alpha_toolkit_forward_demand_v from public, anon, authenticated;
revoke all on table registry_desk.alpha_acquisition_funnel_v from public, anon, authenticated;

revoke all on sequence registry_desk.alpha_acquisition_key_seq from public, anon, authenticated;
revoke all on sequence registry_desk.alpha_acquisition_event_key_seq from public, anon, authenticated;
revoke all on sequence registry_desk.alpha_t01_qualification_key_seq from public, anon, authenticated;

grant select, insert, update on table registry_desk.alpha_client_acquisitions to service_role;
grant select, insert on table registry_desk.alpha_acquisition_source_refs to service_role;
grant select, insert on table registry_desk.alpha_acquisition_events to service_role;
grant select, insert, update on table registry_desk.alpha_acquisition_toolkit_requirements to service_role;
grant select, insert, update on table registry_desk.alpha_provisioning_refs to service_role;
grant select, insert, update on table registry_desk.alpha_t01_qualifications to service_role;

grant select on table registry_desk.alpha_source_node_yield_v to service_role;
grant select on table registry_desk.alpha_t01_progress_v to service_role;
grant select on table registry_desk.alpha_toolkit_forward_demand_v to service_role;
grant select on table registry_desk.alpha_acquisition_funnel_v to service_role;

grant usage, select on sequence registry_desk.alpha_acquisition_key_seq to service_role;
grant usage, select on sequence registry_desk.alpha_acquisition_event_key_seq to service_role;
grant usage, select on sequence registry_desk.alpha_t01_qualification_key_seq to service_role;

revoke execute on function registry_desk.alpha_acquisition_transition_allowed(text, text) from public, anon, authenticated;
revoke execute on function registry_desk.alpha_guard_acquisition_update() from public, anon, authenticated;
revoke execute on function registry_desk.alpha_prevent_source_ref_mutation() from public, anon, authenticated;
revoke execute on function registry_desk.alpha_prepare_source_ref_insert() from public, anon, authenticated;
revoke execute on function registry_desk.alpha_prevent_event_mutation() from public, anon, authenticated;
revoke execute on function registry_desk.alpha_apply_acquisition_event() from public, anon, authenticated;
revoke execute on function registry_desk.alpha_prepare_t01_qualification() from public, anon, authenticated;
revoke execute on function registry_desk.alpha_prevent_t01_delete() from public, anon, authenticated;

grant execute on function registry_desk.alpha_acquisition_transition_allowed(text, text) to service_role;
grant execute on function registry_desk.alpha_guard_acquisition_update() to service_role;
grant execute on function registry_desk.alpha_prevent_source_ref_mutation() to service_role;
grant execute on function registry_desk.alpha_prepare_source_ref_insert() to service_role;
grant execute on function registry_desk.alpha_prevent_event_mutation() to service_role;
grant execute on function registry_desk.alpha_apply_acquisition_event() to service_role;
grant execute on function registry_desk.alpha_prepare_t01_qualification() to service_role;
grant execute on function registry_desk.alpha_prevent_t01_delete() to service_role;

commit;
