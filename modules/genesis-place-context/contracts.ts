export type Timestamp = string;
export interface PlaceBinding {
  binding_id:string; estate_id:string; place_id:string; physical_site_ref:string;
  legal_entity_refs:readonly string[];occupancy_basis:"OWNER"|"TENANT"|"LICENSEE"|"MANAGER"|"OTHER"|"UNKNOWN";
  status:"PROPOSED"|"VERIFIED"|"SUSPENDED"|"REVOKED";
  jurisdiction_refs:readonly string[]; recognition_evidence_refs:readonly string[];
  verified_at?:string; verified_by?:string; valid_from:string; valid_until?:string;
}
export interface Requirement {
  requirement_id:string; jurisdiction_ref:string; source_ref:string; source_verified_at?:string;
  authority_class:"STATUTORY"|"CONTRACTUAL"|"ESTATE_POLICY";
  category:"TAX"|"LABOUR"|"LICENCE"|"SAFETY"|"ENVIRONMENT"|"PRIVACY"|"DATA_RESIDENCY"|"MUNICIPAL"|"OTHER";
  inheritance:"CONTEXTUAL"|"NONE";
  verification_state:"VERIFIED"|"UNVERIFIED"|"EXPIRED";
  applicability_predicate_ref:string; effective_from:string; effective_until?:string;
  exception_refs?:readonly string[];
}
export interface Envelope {
  envelope_id:string; binding_id:string; estate_id:string; place_id:string; version:string;
  source_set_status:"VERIFIED"|"PARTIAL"|"UNVERIFIED"; compiled_at:string;
  scope_factors:readonly ("ACTIVITY"|"LEGAL_ENTITY"|"ACTOR"|"PRODUCT"|"COUNTERPARTY"|"DESTINATION"|"DATA_FLOW"|"TIME")[];
  valid_from:string; valid_until?:string; requirements:readonly Requirement[];
}
export interface Activity {
  activity_id:string;activity_class:string;activity_occurred_at:string;evaluated_at:string;
  actor_digitalme_ref:string;estate_id:string;place_id:string;context_facts_ref:string;
}
/** An actual adapter MUST verify signature, trust root, source digest, credential and lifecycle.
 * A receipt object by itself is NOT legal or cryptographic proof. */
export interface VerifiedReceipt {
  source_ref:string;jurisdiction_ref:string;provider_ref:string;sha256:string;
  evidence_ref:string;verified_at:string;valid_from:string;valid_until?:string;
  signature_status:"VALID"|"INVALID"|"UNAVAILABLE";
}
export interface SourceAdapter { verify(ref:string,jurisdiction:string):Promise<VerifiedReceipt|undefined> }
export interface ApplicabilityAdapter {
  evaluate(ref:string,activity:Activity):Promise<{
    predicate_ref:string;status:"APPLIES"|"DOES_NOT_APPLY"|"UNKNOWN";
    evidence_ref:string;verified:boolean;
  }|undefined>;
}
export interface ResolveRequest {
  activity:Activity; bindings:readonly PlaceBinding[]; envelope:Envelope;
  sources?:SourceAdapter;predicates?:ApplicabilityAdapter;admitted_providers:readonly string[];
  max_source_age_ms?:number;
}
export interface Resolution {
  resolution_id:string;activity_id:string;activity_class:string;activity_occurred_at:string;
  evaluated_at:string;actor_digitalme_ref:string;estate_id:string;place_id:string;
  binding_id:string;envelope_id:string;envelope_version:string;context_facts_ref:string;
  applied_requirement_refs:readonly string[];unresolved_requirement_refs:readonly string[];
  source_set_verified:boolean;resolution_status:"COMPLETE"|"PARTIAL"|"UNRESOLVED";
  resolver_version:"G1-SANDBOX";source_digest:string;limitations:readonly string[];
}
