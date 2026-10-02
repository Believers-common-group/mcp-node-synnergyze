import { describe, expect, it } from "vitest";
import type { Resolution } from "./contracts.ts";
import type { PlaceReviewInputG2 } from "./warden-river-review.ts";
import { reviewPlaceContextG2 } from "./warden-river-review.ts";
const now="2026-10-02T06:00:00.000Z";
function caseInput():PlaceReviewInputG2 {
 const sha="a".repeat(64);
 const r:Resolution={
  resolution_id:"CONTEXT:"+sha.slice(0,24),
  source_digest:sha,activity_id:"SYNTH-ACT",activity_class:"RETAIL",
  activity_occurred_at:"2026-10-02T05:58:00.000Z",evaluated_at:"2026-10-02T05:59:00.000Z",
  actor_digitalme_ref:"SYNTH-DIGITALME",estate_id:"SYNTH-ESTATE",place_id:"SYNTH-PLACE",
  binding_id:"SYNTH-BINDING",envelope_id:"SYNTH-ENV",envelope_version:"R0.2",
  context_facts_ref:"SYNTH-FACTS",applied_requirement_refs:["SYNTH-REQ"],
  unresolved_requirement_refs:[],source_set_verified:true,resolution_status:"COMPLETE",
  resolver_version:"G1-SANDBOX",limitations:["CONTEXT_ONLY_NOT_AUTHORITY","NO_LIVE_SOURCE_ADAPTERS_BUNDLED"],
 };
 const policyRef="SYNTH-POLICY-SNAPSHOT";
 return {
  mode:"SYNTHETIC_ONLY",resolution:r,
  representedPrincipalRef:"SYNTH-ORG",actingCapacityRef:"SYNTH-REVIEWER",
  authorityRefs:["SYNTH-AUTH"],representationSourceRefs:["SYNTH-REP-PROOF"],
  programRef:"SYNTH-PROGRAM",correlationId:"SYNTH-CORR",
  policyRef,requestedAt:now,decidedAt:now,
  policy:{
   policySnapshotRef:policyRef,wardenRef:"SYNTH-WARDEN",
   lifecycle:"ACTIVE",validFrom:"2026-10-02T05:30:00.000Z",
   validUntil:"2026-10-02T07:00:00.000Z",
   actorRef:"SYNTH-DIGITALME",representedPrincipalRef:"SYNTH-ORG",
   actingCapacityRef:"SYNTH-REVIEWER",
   contextRef:"PLACE:SYNTH-ESTATE:SYNTH-PLACE",
   programRef:"SYNTH-PROGRAM",
   requiredAuthorityRefs:["SYNTH-AUTH"],requiredPolicyRefs:[policyRef],
   allowedCapabilityRefs:["place_context.review"],
   manualReviewCapabilityRefs:[],
   constraints:["SYNTHETIC_CONFORMANCE_ONLY","NO_EXTERNAL_EFFECT"],
  },
 };
}
function run(edit?:(v:PlaceReviewInputG2)=>void){
 const v=caseInput();edit?.(v);return reviewPlaceContextG2(v);
}
describe("G2 Place Warden / River review — synthetic only",()=>{
 it("limits synthetic allow to REVIEW_ONLY",()=>{
  const v=run();expect(v.reviewState).toBe("REVIEW_ONLY");
  expect(v.simulatedWardenDecision).toBe("SIMULATED_ALLOW");
  expect(v.evidencePreview.persistenceState).toBe("NOT_PERSISTED_DRY_RUN");
  expect(v.evidencePreview.authorityState).toBe("NO_AUTHORITY_ISSUED");
  expect(v.evidencePreview.effectState).toBe("NO_EXECUTION");
  expect(v.evidencePreview.sourceVerificationState).toBe("SYNTHETIC_UNTRUSTED");
 });
 it("never discloses Warden tokens or credentials",()=>{
  const receipt=JSON.stringify(run());
  expect(receipt).not.toContain("actionToken");
  expect(receipt).not.toContain("WARDEN-ACTION-TOKEN");
  expect(receipt).not.toContain("authorityGrant");
 });
 it("produces deterministic replay receipts",()=>expect(run()).toEqual(run()));
 it("holds incomplete resolution before Warden",()=>{
  const v=run(i=>{i.resolution={...i.resolution,resolution_status:"PARTIAL"}});
  expect(v.simulatedWardenDecision).toBe("NOT_EVALUATED");
  expect(v.evidencePreview.syntheticWardenDecisionRef).toBeUndefined();
 });
 it("holds forged context digest",()=>{
  expect(run(i=>{i.resolution={...i.resolution,source_digest:"b".repeat(64)}}).reviewState).toBe("HOLD");
 });
 it("holds unresolved obligations",()=>{
  expect(run(i=>{i.resolution={...i.resolution,unresolved_requirement_refs:["SYNTH-REQ-2"]}}).reviewState).toBe("HOLD");
 });
 it("rejects mismatched principal through Warden",()=>{
  const v=run(i=>{i.policy={...i.policy,representedPrincipalRef:"OTHER"}});
  expect(v.simulatedWardenDecision).toBe("SIMULATED_DENY");expect(v.reviewState).toBe("HOLD");
 });
 it("rejects acting capacity mismatches",()=>{
  expect(run(i=>{i.policy={...i.policy,actingCapacityRef:"OTHER"}}).reviewState).toBe("HOLD");
 });
 it("rejects mismatch in Place context",()=>{
  expect(run(i=>{i.policy={...i.policy,contextRef:"PLACE:OTHER"}}).reviewState).toBe("HOLD");
 });
 it("rejects missing Warden authority proof",()=>{
  expect(run(i=>{i.authorityRefs=[]}).reviewState).toBe("HOLD");
 });
 it("escalates a policy-designated manual-review capability",()=>{
  const v=run(i=>{i.policy={...i.policy,manualReviewCapabilityRefs:["place_context.review"]}});
  expect(v.simulatedWardenDecision).toBe("SIMULATED_ESCALATE");
 });
 it("rejects revoked Warden policy",()=>{
  const v=run(i=>{i.policy={...i.policy,lifecycle:"REVOKED"}});
  expect(v.simulatedWardenDecision).toBe("SIMULATED_DENY");
 });
 it("rejects expired Warden policy",()=>{
  const v=run(i=>{i.policy={...i.policy,validUntil:"2026-10-02T05:59:30.000Z"}});
  expect(v.reviewState).toBe("HOLD");
 });
 it("rejects invalid chronological ordering",()=>{
  const v=run(i=>{i.requestedAt="2026-10-02T05:00:00.000Z"});
  expect(v.reviewState).toBe("HOLD");
  expect(v.simulatedWardenDecision).toBe("NOT_EVALUATED");
 });
 it("does not accept a policy without non-effect constraint",()=>{
  expect(run(i=>{i.policy={...i.policy,constraints:["SYNTHETIC_CONFORMANCE_ONLY"]}}).reviewState).toBe("HOLD");
 });
 it("forces the review-only capability, even with allowed dangerous capabilities",()=>{
  const v=run(i=>{i.policy={...i.policy,allowedCapabilityRefs:["place_context.review","bank.transfer"]}});
  expect(v.evidencePreview.effectState).toBe("NO_EXECUTION");
  expect(JSON.stringify(v)).not.toContain("bank.transfer");
 });
 it("refuses missing source-lineage limitations",()=>{
  expect(run(i=>{i.resolution={...i.resolution,limitations:[]}}).reviewState).toBe("HOLD");
 });
 it("returns River dry-run evidence even when Warden denies",()=>{
  const v=run(i=>{i.policy={...i.policy,allowedCapabilityRefs:[]}});
  expect(v.reviewState).toBe("HOLD");
  expect(v.evidencePreview.evidenceRef).toMatch(/^RIVER-PREVIEW:/);
  expect(v.evidencePreview.persistenceState).toBe("NOT_PERSISTED_DRY_RUN");
 });
});
