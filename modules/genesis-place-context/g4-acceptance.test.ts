import {describe,it,expect} from "vitest";
import type {PlaceSourceEndToEndResultG3} from "./g3-end-to-end.ts";
import type {Resolution} from "./contracts.ts";
import {buildPlaceReviewPreviewG2} from "../river/place-context-review-preview.ts";
import {assessPlaceG4,G4LocalPreviewChain,verifyG4LocalPreviewChain} from "./g4-acceptance.ts";

function syntheticG3():PlaceSourceEndToEndResultG3 {
  const source_digest="a".repeat(64);
  const r:Resolution={
    resolution_id:"CONTEXT:"+source_digest.slice(0,24),source_digest,
    activity_id:"TEST-ACT",activity_class:"TEST-RETAIL",
    activity_occurred_at:"2026-10-02T05:58:00.000Z",
    evaluated_at:"2026-10-02T05:59:00.000Z",
    actor_digitalme_ref:"TEST-ACTOR",estate_id:"TEST-ESTATE",
    place_id:"TEST-PLACE",binding_id:"TEST-BINDING",
    envelope_id:"TEST-ENV",envelope_version:"R0.2",
    context_facts_ref:"TEST-FACTS",applied_requirement_refs:["TEST-RULE"],
    unresolved_requirement_refs:[],source_set_verified:true,
    resolution_status:"COMPLETE",resolver_version:"G1-SANDBOX",
    limitations:["CONTEXT_ONLY_NOT_AUTHORITY","NO_LIVE_SOURCE_ADAPTERS_BUNDLED"],
  };
  const preview=buildPlaceReviewPreviewG2({
    resolution:r,requestRef:"TEST-WARDEN-REQUEST",
    decisionRef:"TEST-WARDEN-DECISION",
    syntheticDecision:"SIMULATED_ALLOW",
    reviewState:"REVIEW_ONLY",reasons:["bounded_policy_allow"],
  });
  return {
    state:"REVIEW_ONLY",reason_codes:[],resolution:r,
    source_assurance:"TEST_ANCHORS_ONLY_NOT_AUTHORITY",
    river_persistence:"NOT_PERSISTED",provider_effect:"DISABLED",
    review:{
      reviewState:"REVIEW_ONLY",simulatedWardenDecision:"SIMULATED_ALLOW",
      evidencePreview:preview,
    },
  };
}
function run(edit?:(g:PlaceSourceEndToEndResultG3)=>void){
  const data=syntheticG3();edit?.(data);return assessPlaceG4(data);
}
describe("G4 bounded acceptance - non-effect forever",()=>{
  it("passes sandbox conformance but never grants authority",()=>{
    const r=run();expect(r.conformance).toBe("PASS");
    expect(r.operationalAdmission).toBe("HOLD");
    expect(r.wardenAuthority).toBe("NOT_GRANTED");
    expect(r.providerEffects).toBe("DISABLED");
    expect(r.riverPersistence).toBe("NOT_PERSISTED");
    expect(r.outstandingGates).toContain("COMPETENT_REGULATOR_TRUST_UNADMITTED");
  });
  it("is deterministic across identical reviews",()=>expect(run()).toEqual(run()));
  it("publishes no action token or source payload",()=>{
    const v=JSON.stringify(run());
    expect(v).not.toContain("actionToken");
    expect(v).not.toContain("signature_base64");
    expect(v).not.toContain("public_key_spki_pem");
  });
  it("holds incomplete source resolution",()=>{
    const r=run(g=>{g.resolution={...g.resolution!,resolution_status:"PARTIAL"}});
    expect(r.conformance).toBe("FAIL");
    expect(r.reviewReasons).toContain("INCOMPLETE_CONTEXT");
  });
  it("rejects unresolved requirements",()=>{
    const r=run(g=>{g.resolution={...g.resolution!,unresolved_requirement_refs:["MISSING"]}});
    expect(r.reviewReasons).toContain("INCOMPLETE_CONTEXT");
  });
  it("rejects stale or forged resolution identity",()=>{
    const r=run(g=>{g.resolution={...g.resolution!,resolution_id:"FORGED"}});
    expect(r.reviewReasons).toContain("INVALID_CONTEXT_REFERENCE");
  });
  it("rejects mismatch between source resolution and preview actor",()=>{
    const r=run(g=>{g.resolution={...g.resolution!,actor_digitalme_ref:"OTHER-ACTOR"}});
    expect(r.reviewReasons).toContain("PREVIEW_CONTEXT_MISMATCH");
  });
  it("rejects different envelope version from the signed-review output",()=>{
    const r=run(g=>{g.resolution={...g.resolution!,envelope_version:"REPLAY"}});
    expect(r.reviewReasons).toContain("PREVIEW_CONTEXT_MISMATCH");
  });
  it("rejects altered River preview digest",()=>{
    const r=run(g=>{g.review={...g.review!,evidencePreview:{
      ...g.review!.evidencePreview,contextDigest:"b".repeat(64)}}});
    expect(r.reviewReasons).toContain("PREVIEW_DIGEST_MISMATCH");
  });
  it("rejects forged Warden authority in preview",()=>{
    const r=run(g=>{g.review={...g.review!,evidencePreview:{
      ...g.review!.evidencePreview,authorityState:"GRANTED" as never}}});
    expect(r.reviewReasons).toContain("PREVIEW_NOT_SAFE_OR_INCOMPLETE");
  });
  it("rejects asserted real source verification",()=>{
    const r=run(g=>{Object.assign(g,{source_assurance:"PRODUCTION_VERIFIED"})});
    expect(r.reviewReasons).toContain("G3_AUTHORITY_OR_EFFECT_CLAIM_UNSUPPORTED");
  });
  it("rejects claimed durable River seal",()=>{
    const r=run(g=>{Object.assign(g,{river_persistence:"SEALED"})});
    expect(r.reviewReasons).toContain("G3_AUTHORITY_OR_EFFECT_CLAIM_UNSUPPORTED");
  });
  it("rejects a claimed execution",()=>{
    const r=run(g=>{Object.assign(g,{provider_effect:"ENABLED"})});
    expect(r.reviewReasons).toContain("G3_AUTHORITY_OR_EFFECT_CLAIM_UNSUPPORTED");
  });
  it("rejects HOLD or declined G3 reviews",()=>{
    const r=run(g=>{g.state="HOLD";g.reason_codes=["G3_NO_TRUST"]});
    expect(r.reviewReasons).toContain("G3_REVIEW_FAILED");
  });
  it("rejects absent preview",()=>{
    const r=run(g=>{g.review=undefined});
    expect(r.reviewReasons).toContain("MISSING_RIVER_PREVIEW");
  });
  it("links two distinct reports in local-only memory",()=>{
    const chain=new G4LocalPreviewChain();
    chain.append(run());chain.append(run(g=>{g.state="HOLD"}));
    expect(chain.snapshot()).toHaveLength(2);
    expect(verifyG4LocalPreviewChain(chain.snapshot())).toBe(true);
  });
  it("idempotently replays an exact report",()=>{
    const chain=new G4LocalPreviewChain(),r=run();
    expect(chain.append(r)).toEqual(chain.append(r));
    expect(chain.snapshot()).toHaveLength(1);
  });
  it("rejects mutated reports before local logging",()=>{
    const chain=new G4LocalPreviewChain(),r=run();
    r.reviewReasons=["NEW-ISSUE"];
    expect(()=>chain.append(r)).toThrow("G4_REPORT_TAMPERED");
  });
  it("detects tampering with a linked record",()=>{
    const chain=new G4LocalPreviewChain();chain.append(run());
    const altered=chain.snapshot().map(item=>({...item,reportDigest:"0".repeat(64)}));
    expect(verifyG4LocalPreviewChain(altered)).toBe(false);
    expect(verifyG4LocalPreviewChain(chain.snapshot())).toBe(true);
  });
  it("detects reordered records",()=>{
    const chain=new G4LocalPreviewChain();
    chain.append(run());chain.append(run(g=>{g.state="HOLD"}));
    expect(verifyG4LocalPreviewChain([...chain.snapshot()].reverse())).toBe(false);
  });
  it("rejects missing Warden request evidence",()=>{
    const r=run(g=>{g.review={...g.review!,evidencePreview:{
      ...g.review!.evidencePreview,requestRef:undefined}}});
    expect(r.reviewReasons).toContain("PREVIEW_NOT_SAFE_OR_INCOMPLETE");
  });
});
