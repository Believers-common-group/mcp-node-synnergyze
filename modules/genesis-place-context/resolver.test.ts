import {describe,it,expect} from "vitest";
import {resolvePlaceContextG1} from "./resolver.ts";
import type {ResolveRequest} from "./contracts.ts";
function example():ResolveRequest {
 const from="2026-10-01T00:00:00+05:30",now="2026-10-02T04:00:00+05:30",
   verified="2026-10-02T03:00:00+05:30";
 return {
 activity:{activity_id:"SYNTH-ACT",activity_class:"RETAIL",activity_occurred_at:now,
   evaluated_at:now,actor_digitalme_ref:"SYNTH-ACTOR",estate_id:"SYNTH-E",
   place_id:"SYNTH-P",context_facts_ref:"SYNTH-FACT"},
 bindings:[{binding_id:"SYNTH-B",estate_id:"SYNTH-E",place_id:"SYNTH-P",
   physical_site_ref:"SYNTH-SITE",legal_entity_refs:["SYNTH-ENTITY"],
   occupancy_basis:"TENANT",status:"VERIFIED",
   jurisdiction_refs:["SYNTH-J"],recognition_evidence_refs:["SYNTH-RECOGNITION"],
   verified_by:"SYNTH-VERIFIER",verified_at:verified,valid_from:from}],
 envelope:{envelope_id:"SYNTH-ENV",binding_id:"SYNTH-B",estate_id:"SYNTH-E",
   place_id:"SYNTH-P",version:"G0-R0.2",compiled_at:verified,valid_from:from,
   scope_factors:["ACTIVITY","LEGAL_ENTITY","TIME"],
   source_set_status:"VERIFIED",requirements:[{requirement_id:"SYNTH-RULE",
     jurisdiction_ref:"SYNTH-J",source_ref:"SYNTH-SOURCE",source_verified_at:verified,
     authority_class:"STATUTORY",category:"TAX",inheritance:"CONTEXTUAL",
     verification_state:"VERIFIED",effective_from:from,
     applicability_predicate_ref:"SYNTH-PREDICATE"}]},
 admitted_providers:["SYNTH-TRUSTED"],
 sources:{async verify(ref,j){return {source_ref:ref,jurisdiction_ref:j,
   provider_ref:"SYNTH-TRUSTED",sha256:"a".repeat(64),evidence_ref:"SYNTH-PROOF:"+ref,
   verified_at:verified,valid_from:from,signature_status:"VALID"}}},
 predicates:{async evaluate(ref){return {predicate_ref:ref,status:"APPLIES",
   evidence_ref:"SYNTH-PREDICATE-PROOF",verified:true}}},
 };
}
const run=(fn?:(x:ResolveRequest)=>void)=>{const f=example();fn?.(f);return resolvePlaceContextG1(f)};
describe("G1 sandbox — fake proofs only, not legal verification",()=>{
 it("returns complete context without execution authority",async()=>{
  const r=await run();expect(r.resolution_status).toBe("COMPLETE");
  expect(r.applied_requirement_refs).toEqual(["SYNTH-RULE"]);
  expect("authority_grant" in r).toBe(false);
 });
 it("deterministic",async()=>expect(await run()).toEqual(await run()));
 it("missing adapter holds",async()=>expect((await run(f=>{f.sources=undefined})).resolution_status).toBe("UNRESOLVED"));
 it("missing legal inventory holds",async()=>expect((await run(f=>{f.envelope={...f.envelope,requirements:[]}})).resolution_status).toBe("UNRESOLVED"));
 it("binding with no legal entity is unresolved",async()=>expect((await run(f=>{f.bindings=[{...f.bindings[0],legal_entity_refs:[]}]})).resolution_status).toBe("UNRESOLVED"));
 it("missing recognized occupancy basis is unresolved",async()=>expect((await run(f=>{f.bindings=[{...f.bindings[0],occupancy_basis:"UNKNOWN"}]})).resolution_status).toBe("UNRESOLVED"));
 it("stale declared rule verification cannot pass",async()=>expect((await run(f=>{f.envelope={...f.envelope,requirements:[{...f.envelope.requirements[0],source_verified_at:"2026-09-01T00:00:00+05:30"}]}})).resolution_status).toBe("UNRESOLVED"));
 it("suspended binding holds",async()=>expect((await run(f=>{f.bindings=[{...f.bindings[0],status:"SUSPENDED"}]})).resolution_status).toBe("UNRESOLVED"));
 it("different estate cannot borrow place",async()=>expect((await run(f=>{f.bindings=[{...f.bindings[0],estate_id:"DIFFERENT"}]})).resolution_status).toBe("UNRESOLVED"));
 it("two same estate bindings conflict",async()=>expect((await run(f=>{f.bindings=[f.bindings[0],{...f.bindings[0],binding_id:"OTHER"}]})).resolution_status).toBe("UNRESOLVED"));
 it("two estates may recognize a physical site",async()=>expect((await run(f=>{f.bindings=[f.bindings[0],{...f.bindings[0],estate_id:"OTHER"}]})).resolution_status).toBe("COMPLETE"));
 it("wrong envelope fails",async()=>expect((await run(f=>{f.envelope={...f.envelope,place_id:"OTHER"}})).resolution_status).toBe("UNRESOLVED"));
 it("failed signatures fail closed",async()=>expect((await run(f=>{f.admitted_providers=["OTHER"]})).resolution_status).toBe("UNRESOLVED"));
 it("stale source fails closed",async()=>expect((await run(f=>{f.max_source_age_ms=1000})).resolution_status).toBe("UNRESOLVED"));
 it("exemptions remain on hold",async()=>{
  const r=await run(f=>{f.envelope={...f.envelope,requirements:[{...f.envelope.requirements[0],exception_refs:["SYNTH-X"]}]}});
  expect(r.resolution_status).toBe("UNRESOLVED");
 });
 it("unknown predicate fails closed",async()=>expect((await run(f=>{f.predicates=undefined})).resolution_status).toBe("UNRESOLVED"));
 it("does not count non-applicable as satisfied",async()=>{
  const r=await run(f=>{f.predicates={async evaluate(ref){return {predicate_ref:ref,status:"DOES_NOT_APPLY",verified:true,evidence_ref:"SYNTH-PREDICATE-PROOF"}}}});
  expect(r.resolution_status).toBe("UNRESOLVED");
 });
 it("source outage fails closed",async()=>{
  const r=await run(f=>{f.sources={async verify(){throw Error("offline")}}});
  expect(r.resolution_status).toBe("UNRESOLVED");
 });
 it("invalid chronology fails closed",async()=>expect((await run(f=>{f.activity={...f.activity,evaluated_at:"2026-09-01T00:00:00+05:30"}})).resolution_status).toBe("UNRESOLVED"));
});
