import { createHash } from "node:crypto";
import type { PlaceReviewG2, PlaceReviewInputG2 } from "./warden-river-review.ts";
import { reviewPlaceContextG2 } from "./warden-river-review.ts";
import { resolvePlaceContextG1 } from "./resolver.ts";
import type { ResolveRequest, Resolution, ApplicabilityAdapter } from "./contracts.ts";
import {
  type ProofPurposeG3, type SignedSourceRecordG3, type SourceTrustAnchorG3,
  VerifiedSourceBundleG3,
} from "./verified-sources-g3.ts";

export interface PlaceSourceEndToEndInputG3 {
  context: ResolveRequest;
  signed_sources: readonly SignedSourceRecordG3[];
  trust_anchors: readonly SourceTrustAnchorG3[];
  review: Omit<PlaceReviewInputG2, "resolution">;
}
export interface PlaceSourceEndToEndResultG3 {
  state:"HOLD"|"REVIEW_ONLY";
  reason_codes: readonly string[];
  resolution?:Resolution;
  review?:PlaceReviewG2;
  source_assurance: "TEST_ANCHORS_ONLY_NOT_AUTHORITY";
  river_persistence:"NOT_PERSISTED";
  provider_effect:"DISABLED";
}
function sha(data:unknown) {
  return createHash("sha256").update(JSON.stringify(data),"utf8").digest("hex");
}
/** Snapshot digest is only a *scope commitment*, not legal proof of rule completeness. */
export function envelopeInventoryDigestG3(input:ResolveRequest):string {
  const e=input.envelope, a=input.activity;
  return sha({
    estate_id:a.estate_id,place_id:a.place_id,binding_id:e.binding_id,
    envelope_id:e.envelope_id,version:e.version,
    source_set_status:e.source_set_status,
    scope_factors:[...e.scope_factors].sort(),valid_from:e.valid_from,
    valid_until:e.valid_until??null,
    requirements:[...e.requirements].map(r=>({
      requirement_id:r.requirement_id,jurisdiction_ref:r.jurisdiction_ref,
      source_ref:r.source_ref,source_verified_at:r.source_verified_at??null,
      authority_class:r.authority_class,category:r.category,inheritance:r.inheritance,
      verification_state:r.verification_state,
      applicability_predicate_ref:r.applicability_predicate_ref,
      effective_from:r.effective_from,effective_until:r.effective_until??null,
      exception_refs:[...(r.exception_refs??[])].sort(),
    })).sort((a,b)=>a.requirement_id.localeCompare(b.requirement_id)),
  });
}
const hold=(...reason_codes:string[]):PlaceSourceEndToEndResultG3=>({
  state:"HOLD",reason_codes:reason_codes.sort(),source_assurance:"TEST_ANCHORS_ONLY_NOT_AUTHORITY",
  river_persistence:"NOT_PERSISTED",provider_effect:"DISABLED",
});

/**
 * End-to-end NON-EFFECT path. The signed *inventory* must match the candidate
 * envelope before inspecting any individual claim. Only one jurisdiction is
 * supported here; multi-jurisdiction coverage is HOLD, never silently collapsed.
 */
export async function runSignedPlaceReviewG3(input:PlaceSourceEndToEndInputG3):
  Promise<PlaceSourceEndToEndResultG3> {
  const {context,review}=input, {activity:a,envelope:e}=context;
  if(review.mode!=="SYNTHETIC_ONLY")return hold("G3_SYNTHETIC_ONLY");
  if (e.source_set_status!=="VERIFIED"||e.requirements.length===0)return hold("G3_INVENTORY_UNVERIFIED");
  const bindings=context.bindings.filter(b=>b.estate_id===a.estate_id&&b.place_id===a.place_id);
  if(bindings.length!==1||bindings[0].binding_id!==e.binding_id)return hold("G3_BINDING_AMBIGUOUS");
  const b=bindings[0];
  if(!b.legal_entity_refs.includes(review.representedPrincipalRef))return hold("G3_PRINCIPAL_NOT_BOUND_TO_PLACE");
  const jurisdictions=new Set([...b.jurisdiction_refs,...e.requirements.map(r=>r.jurisdiction_ref)]);
  if(jurisdictions.size!==1)return hold("G3_MULTI_JURISDICTION_UNSUPPORTED");
  const jurisdiction=[...jurisdictions][0];
  if(!jurisdiction)return hold("G3_NO_JURISDICTION");
  if(context.admitted_providers.length===0||input.trust_anchors.length===0)return hold("G3_NO_ADMITTED_TRUST");
  const purposes=new Map<string,ProofPurposeG3>();
  function expectPurpose(ref:string,purpose:ProofPurposeG3):boolean {
    if(!ref||(purposes.has(ref)&&purposes.get(ref)!==purpose))return false;
    purposes.set(ref,purpose);return true;
  }
  for(const ref of b.recognition_evidence_refs)
    if(!expectPurpose(ref,"RECOGNITION"))return hold("G3_DUPLICATE_SOURCE_ROLE");
  for(const r of e.requirements) {
    if(!expectPurpose(r.source_ref,"REQUIREMENT"))return hold("G3_DUPLICATE_SOURCE_ROLE");
    const predRef="G3-PREDICATE:"+r.applicability_predicate_ref+":"+a.activity_id;
    if(!expectPurpose(predRef,"PREDICATE"))return hold("G3_DUPLICATE_SOURCE_ROLE");
  }
  let bundle:VerifiedSourceBundleG3;
  try {
    bundle=new VerifiedSourceBundleG3(input.signed_sources,input.trust_anchors,
      a.evaluated_at,context.max_source_age_ms??86400000);
  }catch{return hold("G3_DUPLICATE_SOURCE_REF")}
  const inventoryRef="G3-INVENTORY:"+e.envelope_id+":"+e.version;
  const inventory=bundle.inspect(inventoryRef,jurisdiction,"INVENTORY");
  if(!inventory)return hold("G3_SIGNED_INVENTORY_MISSING_OR_INVALID");
  let doc:Record<string,unknown>;
  try {doc=JSON.parse(inventory.body.toString("utf8")) as Record<string,unknown>;}
  catch {return hold("G3_INVENTORY_PAYLOAD_INVALID")}
  if(doc.schema!=="G3-INVENTORY:1"||doc.complete!==true||
     doc.estate_id!==a.estate_id||doc.place_id!==a.place_id||
     doc.binding_id!==e.binding_id||doc.version!==e.version||
     doc.snapshot_digest!==envelopeInventoryDigestG3(context))
    return hold("G3_INVENTORY_SCOPE_OR_COMPLETENESS_MISMATCH");
  // Signed claims and source digest are not sufficient: the *payload* must
  // describe this exact estate, site, tenancy, and regulatory requirement.
  // No unsigned metadata or merely asserted verification flag is a substitute.
  const sameRefs = (a: readonly string[], b: readonly string[]) =>
    a.length===b.length && [...a].sort().every((ref,index)=>ref===[...b].sort()[index]);
  function documentFor(ref:string,purpose:ProofPurposeG3):Record<string,unknown>|undefined {
    const signed=bundle.inspect(ref,jurisdiction,purpose);
    if(!signed)return;
    try {
      const value:unknown=JSON.parse(signed.body.toString("utf8"));
      return value!==null && typeof value==="object" && !Array.isArray(value)
        ? value as Record<string,unknown>:undefined;
    }catch{return}
  }
  if(b.status!=="VERIFIED"||!b.verified_by||!b.verified_at||
     !b.legal_entity_refs.length||b.occupancy_basis==="UNKNOWN"||
     !b.physical_site_ref||!b.recognition_evidence_refs.length)
    return hold("G3_RECOGNITION_INCOMPLETE");
  for(const ref of b.recognition_evidence_refs){
    const signedRecognition=bundle.inspect(ref,jurisdiction,"RECOGNITION");
    const proof=documentFor(ref,"RECOGNITION");
    if(!signedRecognition || signedRecognition.claim.issued_at!==b.verified_at)
      return hold("G3_RECOGNITION_ISSUANCE_MISMATCH");
    if(!proof || proof.schema!=="G3-RECOGNITION:1"||
       proof.binding_id!==b.binding_id||proof.estate_id!==b.estate_id||
       proof.place_id!==b.place_id||proof.physical_site_ref!==b.physical_site_ref||
       proof.occupancy_basis!==b.occupancy_basis||
       proof.verified_by!==b.verified_by||proof.verified_at!==b.verified_at||
       !Array.isArray(proof.legal_entity_refs)||
       !sameRefs(proof.legal_entity_refs as string[],b.legal_entity_refs)||
       !Array.isArray(proof.jurisdiction_refs)||
       !sameRefs(proof.jurisdiction_refs as string[],b.jurisdiction_refs))
      return hold("G3_RECOGNITION_PAYLOAD_MISMATCH");
  }
  const usedPredicates=new Set<string>();
  for(const r of e.requirements) {
    if(usedPredicates.has(r.applicability_predicate_ref))
      return hold("G3_AMBIGUOUS_SHARED_PREDICATE");
    usedPredicates.add(r.applicability_predicate_ref);
    const signedRule=bundle.inspect(r.source_ref,jurisdiction,"REQUIREMENT");
    const proof=documentFor(r.source_ref,"REQUIREMENT");
    if(!signedRule||signedRule.claim.issued_at!==r.source_verified_at)
      return hold("G3_REQUIREMENT_ISSUANCE_MISMATCH");
    if(!proof||proof.schema!=="G3-REQUIREMENT:1"||
       proof.requirement_id!==r.requirement_id||
       proof.source_ref!==r.source_ref||proof.jurisdiction_ref!==r.jurisdiction_ref||
       proof.authority_class!==r.authority_class||proof.category!==r.category||
       proof.inheritance!==r.inheritance||
       proof.applicability_predicate_ref!==r.applicability_predicate_ref||
       proof.effective_from!==r.effective_from||
       (proof.effective_until??null)!==(r.effective_until??null)||
       proof.source_verified_at!==r.source_verified_at)
      return hold("G3_REQUIREMENT_PAYLOAD_MISMATCH");
  }
  // All context-specific evidence must be cryptographically verified by a
  // provider with an explicitly admitted purpose/jurisdiction/key.
  const source=bundle.asAdapter(purposes);
  const predicates:ApplicabilityAdapter={
    evaluate:async (predicate_ref,activity)=>{
      const ref="G3-PREDICATE:"+predicate_ref+":"+activity.activity_id;
      const result=bundle.inspect(ref,jurisdiction,"PREDICATE");
      if(!result)return;
      let p:Record<string,unknown>;
      try{p=JSON.parse(result.body.toString("utf8")) as Record<string,unknown>;}catch{return}
      const rule=e.requirements.find(r=>r.applicability_predicate_ref===predicate_ref);
      if(!rule||p.schema!=="G3-APPLICABILITY:1"||p.predicate_ref!==predicate_ref||
         p.requirement_id!==rule.requirement_id||p.jurisdiction_ref!==rule.jurisdiction_ref||
         p.activity_id!==activity.activity_id||p.activity_class!==activity.activity_class||
         p.activity_occurred_at!==activity.activity_occurred_at||
         p.evaluated_at!==activity.evaluated_at||
         p.actor_digitalme_ref!==activity.actor_digitalme_ref||
         p.estate_id!==activity.estate_id||p.place_id!==activity.place_id||
         p.binding_id!==b.binding_id||p.envelope_id!==e.envelope_id||
         p.envelope_version!==e.version||
         p.context_facts_ref!==activity.context_facts_ref||
         (p.result!=="APPLIES"&&p.result!=="DOES_NOT_APPLY"))return;
      return {predicate_ref,status:p.result,evidence_ref:ref,verified:true};
    },
  };
  const r=await resolvePlaceContextG1({
    ...context,sources:source,predicates,
    admitted_providers:context.admitted_providers.filter(p=>
      input.trust_anchors.some(anchor=>anchor.provider_ref===p&&anchor.status==="ADMITTED")),
  });
  // G2 uses synthetic Warden decisions. Any internal action token is discarded
  // before returning a dry-run River preview; no River state is mutated.
  const reviewed=reviewPlaceContextG2({...review,resolution:r});
  return {
    state:reviewed.reviewState,
    reason_codes:reviewed.reviewState==="REVIEW_ONLY"?[]:
      [...r.unresolved_requirement_refs, ...reviewed.evidencePreview.reasonCodes].sort(),
    resolution:r,review:reviewed,
    source_assurance:"TEST_ANCHORS_ONLY_NOT_AUTHORITY",
    river_persistence:"NOT_PERSISTED",provider_effect:"DISABLED",
  };
}
