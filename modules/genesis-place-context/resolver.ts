import {createHash} from "node:crypto";
import type {ResolveRequest,Resolution,VerifiedReceipt} from "./contracts.ts";
function date(s:string|undefined):number|undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s)) return undefined;
  const n=Date.parse(s);return Number.isFinite(n)?n:undefined;
}
function inWindow(from:string,until:string|undefined,at:number):boolean {
  const a=date(from),b=until===undefined?undefined:date(until);
  return a!==undefined&&a<=at&&(until===undefined||(b!==undefined&&b>=a&&at<=b));
}
const sorted=(v:readonly string[])=>[...new Set(v)].sort();
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v),"utf8").digest("hex");
export async function resolvePlaceContextG1(i:ResolveRequest):Promise<Resolution> {
  const a=i.activity,e=i.envelope,open:string[]=[],applied:string[]=[],verified:{ref:string;sha:string;evidence:string}[]=[];
  const flags=["CONTEXT_ONLY_NOT_AUTHORITY","NO_LIVE_SOURCE_ADAPTERS_BUNDLED"];
  const checked=date(a.evaluated_at),at=date(a.activity_occurred_at);
  const matches=i.bindings.filter(b=>b.estate_id===a.estate_id&&b.place_id===a.place_id);
  const b=matches.length===1?matches[0]:undefined;
  if(!b)open.push(matches.length?"CTX-BINDING-AMBIGUOUS":"CTX-PLACE-UNKNOWN");
  const matching=!!b&&e.binding_id===b.binding_id&&e.estate_id===a.estate_id&&e.place_id===a.place_id;
  if(!matching)open.push("CTX-CROSS_ESTATE_OR_ENVELOPE_MISMATCH");
  if(!b||b.status!=="VERIFIED"||!b.verified_by||!b.verified_at||
     !b.recognition_evidence_refs.length||!b.jurisdiction_refs.length||
     !b.legal_entity_refs?.length||!b.occupancy_basis||b.occupancy_basis==="UNKNOWN")open.push("CTX-RECOGNITION_NOT_VERIFIED");
  if(checked===undefined||at===undefined||checked<at||
     !b||!inWindow(b.valid_from,b.valid_until,at??0)||
     !inWindow(e.valid_from,e.valid_until,at??0)||
     date(e.compiled_at)===undefined||date(e.compiled_at)!> (checked??0))
     open.push("CTX_INVALID_TIME_OR_VERSION");
  if(e.source_set_status!=="VERIFIED"||!e.requirements.length||!e.scope_factors?.length)open.push("CTX-INVENTORY_NOT_VERIFIED");
  if(!i.sources||!i.predicates||!i.admitted_providers.length)open.push("CTX-ADAPTER_NOT_ADMITTED");
  const age=i.max_source_age_ms??86400000;
  if(!Number.isFinite(age)||age<=0)open.push("CTX-FRESHNESS_POLICY_INVALID");
  async function check(ref:string,jurisdiction:string):Promise<boolean> {
    let p:VerifiedReceipt|undefined;
    try{p=await i.sources!.verify(ref,jurisdiction)}catch{return false}
    if(!p||p.source_ref!==ref||p.jurisdiction_ref!==jurisdiction||
       !i.admitted_providers.includes(p.provider_ref)||p.signature_status!=="VALID"||
       !p.evidence_ref||!/^[0-9a-f]{64}$/i.test(p.sha256))return false;
    const v=date(p.verified_at);
    if(v===undefined||v>checked!||checked!-v>age||!inWindow(p.valid_from,p.valid_until,at!))return false;
    verified.push({ref,sha:p.sha256,evidence:p.evidence_ref});return true;
  }
  if(!open.length) {
    for(const ref of sorted(b!.recognition_evidence_refs)){
      let ok=false;
      for(const jurisdiction of sorted(b!.jurisdiction_refs)){
        if(await check(ref,jurisdiction)){ok=true;break}
      }
      if(!ok)open.push("CTX-RECOGNITION_PROOF:"+ref);
    }
    // No legal rule is evaluated if physical-site recognition is unresolved.
    if(!open.length)for(const r of e.requirements) {
      if(!r.requirement_id||!r.authority_class||!r.category||!r.inheritance||
         r.verification_state!=="VERIFIED"||
         !b!.jurisdiction_refs.includes(r.jurisdiction_ref)||
         !r.source_verified_at||date(r.source_verified_at)===undefined||
         date(r.source_verified_at)!>checked!||
         checked!-date(r.source_verified_at)!>age||
         !inWindow(r.effective_from,r.effective_until,at!)){
        open.push(r.requirement_id||"CTX-UNNAMED_RULE");continue;
      }
      if(!(await check(r.source_ref,r.jurisdiction_ref))){open.push(r.requirement_id);continue}
      if(r.exception_refs?.length){
        flags.push("EXCEPTION_REQUIRES_INDEPENDENT_REVIEW");
        open.push(r.requirement_id);continue;
      }
      let p:Awaited<ReturnType<NonNullable<ResolveRequest["predicates"]>["evaluate"]>>;
      try{p=await i.predicates!.evaluate(r.applicability_predicate_ref,a)}catch{p=undefined}
      if(!p||!p.verified||!p.evidence_ref||p.predicate_ref!==r.applicability_predicate_ref||
         p.status==="UNKNOWN"||!(await check(p.evidence_ref,r.jurisdiction_ref))){
        open.push(r.requirement_id);continue;
      }
      if(p.status==="APPLIES")applied.push(r.requirement_id);
    }
  }
  if(!applied.length&&!open.length)open.push("CTX-NO_APPLICABLE_VERIFIED_RULE");
  const ar=sorted(applied),ur=sorted(open);
  const resolution_status=ur.length===0&&ar.length?"COMPLETE":ar.length?"PARTIAL":"UNRESOLVED";
  verified.sort((x,y)=>(x.ref+x.evidence).localeCompare(y.ref+y.evidence));
  // Hash the full acting subject, observed facts, Place binding, rule snapshot and
  // source receipts. Stable set ordering prevents false changes from list order.
  const evidence_hash=hash({activity:a,
    binding:b?{...b,legal_entity_refs:sorted(b.legal_entity_refs||[]),
      jurisdiction_refs:sorted(b.jurisdiction_refs),
      recognition_evidence_refs:sorted(b.recognition_evidence_refs)}:null,
    envelope:{...e,scope_factors:sorted(e.scope_factors||[]),
      requirements:[...e.requirements].map(req=>({...req,
        exception_refs:sorted(req.exception_refs||[])
      })).sort((x,y)=>x.requirement_id.localeCompare(y.requirement_id))},
    applied:ar,unresolved:ur,verified});
  return {
    resolution_id:"CONTEXT:"+evidence_hash.slice(0,24),activity_id:a.activity_id,
    activity_class:a.activity_class,activity_occurred_at:a.activity_occurred_at,
    evaluated_at:a.evaluated_at,actor_digitalme_ref:a.actor_digitalme_ref,
    estate_id:a.estate_id,place_id:a.place_id,
    binding_id:b?.binding_id||"UNRESOLVED",envelope_id:e.envelope_id||"UNRESOLVED",
    envelope_version:e.version||"UNRESOLVED",context_facts_ref:a.context_facts_ref,
    applied_requirement_refs:ar,unresolved_requirement_refs:ur,
    source_set_verified:resolution_status==="COMPLETE",resolution_status,
    resolver_version:"G1-SANDBOX",source_digest:evidence_hash,limitations:sorted(flags),
  };
}
