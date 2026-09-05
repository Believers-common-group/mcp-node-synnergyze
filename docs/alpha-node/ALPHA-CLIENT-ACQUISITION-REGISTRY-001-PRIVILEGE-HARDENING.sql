-- ALPHA-CLIENT-ACQUISITION-REGISTRY-001 — privilege hardening
-- Supabase projects can carry default service_role grants. Narrow this subsystem
-- to the exact privileges required by the invoker-based registry contract.

begin;

revoke all on table registry_desk.alpha_client_acquisitions from service_role;
revoke all on table registry_desk.alpha_acquisition_source_refs from service_role;
revoke all on table registry_desk.alpha_acquisition_events from service_role;
revoke all on table registry_desk.alpha_acquisition_toolkit_requirements from service_role;
revoke all on table registry_desk.alpha_provisioning_refs from service_role;
revoke all on table registry_desk.alpha_t01_qualifications from service_role;

revoke all on table registry_desk.alpha_source_node_yield_v from service_role;
revoke all on table registry_desk.alpha_t01_progress_v from service_role;
revoke all on table registry_desk.alpha_toolkit_forward_demand_v from service_role;
revoke all on table registry_desk.alpha_acquisition_funnel_v from service_role;

revoke all on sequence registry_desk.alpha_acquisition_key_seq from service_role;
revoke all on sequence registry_desk.alpha_acquisition_event_key_seq from service_role;
revoke all on sequence registry_desk.alpha_t01_qualification_key_seq from service_role;

grant select, insert, update on table registry_desk.alpha_client_acquisitions to service_role;
grant select, insert, update on table registry_desk.alpha_acquisition_source_refs to service_role;
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

commit;
