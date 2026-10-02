import {describe,it,expect} from "vitest";
import {SyntheticRiverReservationServiceV1,buildAuthorizedActionEnvelopeV1}
  from "../river/reservation-service.ts";
import {resolvePlaceContextG1} from "./resolver.ts";
import {reviewPlaceContextG2,placeReviewContextRefG2,type ReviewInputG2}
  from "./g2-review-bridge.ts";
import type {ResolveRequest} from "./contracts.ts";

const from="2026-10-02T00:00:00+05:30",valid="2026-10-03T02:30:00+05:30",
  evaluated="2026-10-03T02:35:00+05:30",requested="2026-10-03T02:35:30+05:30",
  decided="2026-10-03T02:35:31+05:30";
function resolverInput():ResolveRequest{
 return {
  activity:{activity_id:"SYNTH-ACT",activity_class:"TEST_READ_ONLY",activity_occurred_at:evaluated,
   evaluated_at:evaluated,actor_digitalme_ref:"SYNTH-ACTOR",estate_id:"SYNTH-ESTATE",
   place_id:"SYNTH-PLACE",context_facts_ref:"SYNTHETIC-NO-PII"},
  bindings:[{binding_id:"SYNTH-BIND",estate_id:"SYNTH-ESTATE",place_id:"SYNTH-PLACE",
   physical_site_ref:"SYNTH-SITE",legal_entity_refs:["SYNTH-ENTITY"],occupancy_basis:"TENANT",
   jurisdiction_refs:["SYNTH-J"],recognition_evidence_refs:["SYNTH-RECOGNITION"],
   status:"VERIFIED",verified_by:"SYNTH-VERIFIER",verified_at:valid,valid_from:from}],
  envelope:{envelope_id:"SYNTH-ENV",binding_id:"SYNTH-BIND",estate_id:"SYNTH-ESTATE",
   place_id:"SYNTH-PLACE",version:"R0.2-TEST",compiled_at:valid,
   source_set_status:"VERIFIED",valid_from:from,
   scope_factors:["ACTIVITY","LEGAL_ENTITY","TIME"],
   requirements:[{requirement_id:"SYNTH-REQ",jurisdiction_ref:"SYNTH-J",
     source_ref:"SYNTH-SOURCE",source_verified_at:valid,verification_state:"VERIFIED",
     authority_class:"STATUTORY",category:"TAX",inheritance:"CONTEXTUAL",
     effective_from:from,applicability_predicate_ref:"SYNTH-PRED"}]},
  admitted_providers:["SYNTH-TRUSTED"],
  sources:{async verify(ref,j){return {source_ref:ref,jurisdiction_ref:j,
    provider_ref:"SYNTH-TRUSTED",sha256:"f".repeat(64),evidence_ref:"SYNTH-PROOF:"+ref,
    verified_at:valid,valid_from:from,signature_status:"VALID"}}},
  predicates:{async evaluate(ref){return {predicate_ref:ref,status:"APPLIES",
    verified:true,evidence_ref:"SYNTH-PREDICATE-EVIDENCE"}}},
 };
}
async function fixture():Promise<ReviewInputG2>{
 const r=resolverInput();
 const contextRef=placeReviewContextRefG2(await resolvePlaceContextG1(r));
 return {resolverInput:r,
  scope:{actorRef:"SYNTH-ACTOR",estateId:"SYNTH-ESTATE",placeId:"SYNTH-PLACE",
   representedPrincipalRef:"SYNTH-ENTITY",actingCapacityRef:"SYNTH-CAPACITY",
   authorityRefs:["SYNTH-AUTHORITY"],policyRefs:["SYNTH-POLICY"],
   representationSourceRefs:["SYNTH-REPRESENTATION"],
   requestedAt:requested,decidedAt:decided},
  policy:{policySnapshotRef:"SYNTH-POLICY-SNAPSHOT",wardenRef:"SYNTH-WARDEN",
   lifecycle:"ACTIVE",validFrom:evaluated,validUntil:"2026-10-03T03:10:00+05:30",
   actorRef:"SYNTH-ACTOR",representedPrincipalRef:"SYNTH-ENTITY",
   actingCapacityRef:"SYNTH-CAPACITY",contextRef,
   programRef:"GENESIS-PLACE-CONTEXT:G2-REVIEW",
   requiredAuthorityRefs:["SYNTH-AUTHORITY"],requiredPolicyRefs:["SYNTH-POLICY"],
   allowedCapabilityRefs:[],manualReviewCapabilityRefs:["place_context.review"],
   constraints:["SYNTHETIC_CONFORMANCE_ONLY","NO_EXTERNAL_EFFECT"]}
 };
}
async function run(mutate?:(v:ReviewInputG2)=>void){
 const v=await fixture();mutate?.(v);return reviewPlaceContextG2(v);
}
describe("G2 review and non-persisted River evidence candidates",()=>{
 it("routes internally resolved synthetic context only to Warden manual review",async()=>{
  const r=await run();
  expect(r.disposition).toBe("ESCALATE");
  expect(r.wardenDecision?.decision).toBe("ESCALATE");
  expect(r.wardenRequest?.capabilityRef).toBe("place_context.review");
  expect(r.wardenRequest?.requestedEffect).toBeUndefined();
  expect(r.effectsEnabled).toBe(false);
  expect(r.persistenceState).toBe("NOT_PERSISTED");
 });
 it("produces two linked River event candidates, not receipts",async()=>{
  const r=await run();expect(r.riverEventCandidates).toHaveLength(2);
  expect(r.riverEventCandidates[0].sequence).toBe(1);
  expect(r.riverEventCandidates[1].sequence).toBe(2);
  expect(r.riverEventCandidates[1].predecessorEventRef)
    .toBe(r.riverEventCandidates[0].eventRef);
  expect(JSON.stringify(r)).not.toContain("RIVER-RESERVATION:");
  expect(JSON.stringify(r)).not.toContain("WARDEN-ACTION-TOKEN:");
 });
 it("cannot reserve an ESCALATE through existing River service",async()=>{
  const r=await run(),service=new SyntheticRiverReservationServiceV1();
  expect(()=>buildAuthorizedActionEnvelopeV1(r.wardenRequest!,r.wardenDecision!))
    .toThrow("river_warden_allow_required");
  expect(service.reservationCount()).toBe(0);
 });
 it("holds incomplete source verification before any Warden invocation",async()=>{
  const r=await run(i=>{i.resolverInput.sources=undefined});
  expect(r.disposition).toBe("HOLD");
  expect(r.wardenRequest).toBeUndefined();expect(r.wardenDecision).toBeUndefined();
 });
 it("holds partial and unresolved inventory",async()=>{
  const r=await run(i=>{i.resolverInput.envelope={...i.resolverInput.envelope,
    source_set_status:"PARTIAL"}});
  expect(r.disposition).toBe("HOLD");
 });
 it("holds foreign Place and principal impersonation",async()=>{
  const place=await run(i=>{i.scope={...i.scope,placeId:"OTHER-PLACE"}});
  const principal=await run(i=>{i.scope={...i.scope,
    representedPrincipalRef:"IMPOSTOR-ENTITY"}});
  expect(place.disposition).toBe("HOLD");
  expect(principal.disposition).toBe("HOLD");
 });
 it("holds actor substitution before Warden",async()=>{
  const r=await run(i=>{i.scope={...i.scope,actorRef:"OTHER-DIGITALME"}});
  expect(r.disposition).toBe("HOLD");
 });
 it("fails closed on non-review or effect-enabled Warden policy",async()=>{
  const allow=await run(i=>{i.policy={...i.policy,
    manualReviewCapabilityRefs:[],allowedCapabilityRefs:["place_context.review"]}});
  expect(allow.disposition).toBe("HOLD");
  const effects=await run(i=>{i.policy={...i.policy,
    constraints:["SYNTHETIC_CONFORMANCE_ONLY"]}});
  expect(effects.disposition).toBe("HOLD");
  expect("actionToken" in (allow.wardenDecision||{})).toBe(false);
 });
 it("uses existing Warden revoked-policy denial",async()=>{
  const r=await run(i=>{i.policy={...i.policy,lifecycle:"REVOKED"}});
  expect(r.disposition).toBe("DENY");
  expect(r.wardenDecision?.reasonCodes).toContain("authority_revoked");
 });
 it("uses existing Warden identity mismatch and missing authority denial",async()=>{
  const identity=await run(i=>{i.policy={...i.policy,actorRef:"OTHER"}});
  const authority=await run(i=>{i.policy={...i.policy,
    requiredAuthorityRefs:["OTHER-AUTHORITY"]}});
  expect(identity.disposition).toBe("DENY");
  expect(authority.disposition).toBe("DENY");
 });
 it("holds when representation source refs are missing",async()=>{
  const r=await run(i=>{i.scope={...i.scope,representationSourceRefs:[]}});
  expect(r.disposition).toBe("HOLD");
 });
 it("holds old resolution timestamps or clock reversal",async()=>{
  const stale=await run(i=>{i.scope={...i.scope,
    requestedAt:"2026-10-03T03:00:00+05:30"}});
  expect(stale.disposition).toBe("HOLD");
  const reversed=await run(i=>{i.scope={...i.scope,
    requestedAt:"2026-10-03T02:34:00+05:30"}});
  expect(reversed.disposition).toBe("HOLD");
 });
 it("fails through Warden on decision_before_request",async()=>{
  const r=await run(i=>{i.scope={...i.scope,
    decidedAt:"2026-10-03T02:35:20+05:30"}});
  expect(r.disposition).toBe("DENY");
  expect(r.wardenDecision?.reasonCodes).toContain("decision_before_request");
 });
 it("never produces an execution actionToken for any outcome",async()=>{
  for(const r of [await run(),await run(i=>{i.policy={...i.policy,lifecycle:"REVOKED"}}),
     await run(i=>{i.resolverInput.sources=undefined})])
    expect(JSON.stringify(r)).not.toContain("actionToken");
 });
 it("stably replays matching inputs",async()=>{
  expect(await run()).toEqual(await run());
 });
 it("changes event identities for distinct actors, inputs and decisions",async()=>{
  const original=await run();
  const actor=await run(i=>{i.scope={...i.scope,actorRef:"OTHER"}});
  const denied=await run(i=>{i.policy={...i.policy,lifecycle:"REVOKED"}});
  const facts=await run(i=>{i.resolverInput.activity={...i.resolverInput.activity,
    context_facts_ref:"DIFFERENT-FACTS"}});
  expect(actor.correlationId).not.toBe(original.correlationId);
  expect(denied.riverEventCandidates[1].payloadDigest)
    .not.toBe(original.riverEventCandidates[1].payloadDigest);
  expect(facts.contextRef).not.toBe(original.contextRef);
 });
});
