import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PlaceSourceEndToEndInputG3 } from "./g3-end-to-end.ts";
import { envelopeInventoryDigestG3, runSignedPlaceReviewG3 } from "./g3-end-to-end.ts";
import {
  placeSourceSha256G3, placeSourceSignedBytesG3,
  type ProofPurposeG3, type SignedSourceClaimG3, type SignedSourceRecordG3,
} from "./verified-sources-g3.ts";

const BEGIN="2026-10-01T00:00:00.000Z";
const NOW="2026-10-02T06:00:00.000Z";
const ISSUED="2026-10-02T05:50:00.000Z";
const END="2026-10-04T00:00:00.000Z";
type Fixture = {
  input:PlaceSourceEndToEndInputG3;
  resign:(index:number, payload:unknown, changes?:Partial<SignedSourceClaimG3>)=>void;
  index:{recognition:number;requirement:number;predicate:number;inventory:number};
};

function makeFixture():Fixture {
  const keys=generateKeyPairSync("ed25519");
  const b={
    binding_id:"TEST-BINDING-001", estate_id:"TEST-ESTATE-001",
    place_id:"TEST-PLACE-001",physical_site_ref:"TEST-PHYSICAL-SITE",
    legal_entity_refs:["TEST-ENTITY"],occupancy_basis:"TENANT" as const,
    status:"VERIFIED" as const,jurisdiction_refs:["TEST-JURISDICTION"],
    recognition_evidence_refs:["TEST-RECOGNITION"],
    verified_at:ISSUED,verified_by:"TEST-VERIFIER",valid_from:BEGIN,valid_until:END,
  };
  const requirement={
    requirement_id:"TEST-OBLIGATION",jurisdiction_ref:"TEST-JURISDICTION",
    source_ref:"TEST-STATUTE",source_verified_at:ISSUED,
    authority_class:"STATUTORY" as const, category:"TAX" as const,
    inheritance:"CONTEXTUAL" as const,
    verification_state:"VERIFIED" as const,applicability_predicate_ref:"TEST-PREDICATE",
    effective_from:BEGIN,effective_until:END,exception_refs:[],
  };
  const envelope={
    envelope_id:"TEST-ENVELOPE",binding_id:b.binding_id,estate_id:b.estate_id,
    place_id:b.place_id,version:"R0.2-TEST",
    source_set_status:"VERIFIED" as const,compiled_at:ISSUED,
    scope_factors:["ACTIVITY","LEGAL_ENTITY","TIME"] as const,
    valid_from:BEGIN,valid_until:END,requirements:[requirement],
  };
  const activity={
    activity_id:"TEST-ACTIVITY",activity_class:"TEST_RETAIL",
    activity_occurred_at:"2026-10-02T05:59:00.000Z",
    evaluated_at:NOW,actor_digitalme_ref:"TEST-ACTOR",
    estate_id:b.estate_id,place_id:b.place_id,context_facts_ref:"TEST-FACTS",
  };
  const context:PlaceSourceEndToEndInputG3["context"]={
    activity,bindings:[b],envelope,
    admitted_providers:["TEST-PROVIDER"],max_source_age_ms:3600000,
  };
  const policyRef="TEST-WARDEN-POLICY";
  const review:PlaceSourceEndToEndInputG3["review"]={
    mode:"SYNTHETIC_ONLY",
    representedPrincipalRef:"TEST-ENTITY",actingCapacityRef:"TEST-REVIEWER",
    authorityRefs:["TEST-AUTHORITY"],representationSourceRefs:["TEST-REPRESENTATION"],
    programRef:"TEST-PROGRAM",correlationId:"TEST-CORRELATION",
    requestedAt:"2026-10-02T06:00:02.000Z",decidedAt:"2026-10-02T06:00:03.000Z",
    policyRef,policy:{
      policySnapshotRef:policyRef,wardenRef:"TEST-WARDEN",lifecycle:"ACTIVE",
      validFrom:"2026-10-02T05:30:00.000Z",validUntil:"2026-10-02T07:00:00.000Z",
      actorRef:activity.actor_digitalme_ref,representedPrincipalRef:"TEST-ENTITY",
      actingCapacityRef:"TEST-REVIEWER",
      contextRef:"PLACE:"+b.estate_id+":"+b.place_id,
      programRef:"TEST-PROGRAM",requiredAuthorityRefs:["TEST-AUTHORITY"],
      requiredPolicyRefs:[policyRef],allowedCapabilityRefs:["place_context.review"],
      manualReviewCapabilityRefs:[],constraints:["SYNTHETIC_CONFORMANCE_ONLY","NO_EXTERNAL_EFFECT"],
    },
  };
  const anchor={
    provider_ref:"TEST-PROVIDER",key_id:"TEST-KEY",
    public_key_spki_pem:keys.publicKey.export({format:"pem",type:"spki"}).toString(),
    jurisdiction_refs:["TEST-JURISDICTION"],
    purposes:["INVENTORY","RECOGNITION","REQUIREMENT","PREDICATE"] as ProofPurposeG3[],
    status:"ADMITTED" as const,valid_from:BEGIN,valid_until:END,
  };
  function signed(ref:string,purpose:ProofPurposeG3,payload:unknown) {
    const body=Buffer.from(JSON.stringify(payload),"utf8");
    const claim:SignedSourceClaimG3={
      schema:"PLACE-SOURCE:G3-ED25519-1",
      source_ref:ref,jurisdiction_ref:"TEST-JURISDICTION",
      provider_ref:anchor.provider_ref,key_id:anchor.key_id,
      purpose,payload_sha256:placeSourceSha256G3(body),
      issued_at:ISSUED,valid_from:BEGIN,valid_until:END,
    };
    return {
      claim,payload_base64:body.toString("base64"),
      signature_base64:sign(null,placeSourceSignedBytesG3(claim),keys.privateKey).toString("base64"),
    };
  }
  const predicateRef="G3-PREDICATE:"+requirement.applicability_predicate_ref+":"+activity.activity_id;
  const inventoryRef="G3-INVENTORY:"+envelope.envelope_id+":"+envelope.version;
  const records:SignedSourceRecordG3[]=[
    signed(b.recognition_evidence_refs[0],"RECOGNITION",{
      schema:"G3-RECOGNITION:1",
      binding_id:b.binding_id,estate_id:b.estate_id,place_id:b.place_id,
      physical_site_ref:b.physical_site_ref,occupancy_basis:b.occupancy_basis,
      verified_by:b.verified_by,verified_at:b.verified_at,
      legal_entity_refs:b.legal_entity_refs,jurisdiction_refs:b.jurisdiction_refs,
    }),
    signed(requirement.source_ref,"REQUIREMENT",{
      schema:"G3-REQUIREMENT:1",
      requirement_id:requirement.requirement_id,source_ref:requirement.source_ref,
      jurisdiction_ref:requirement.jurisdiction_ref,
      authority_class:requirement.authority_class,category:requirement.category,
      inheritance:requirement.inheritance,
      applicability_predicate_ref:requirement.applicability_predicate_ref,
      effective_from:requirement.effective_from,effective_until:requirement.effective_until,
      source_verified_at:requirement.source_verified_at,
    }),
    signed(predicateRef,"PREDICATE",{
      schema:"G3-APPLICABILITY:1",
      predicate_ref:requirement.applicability_predicate_ref,
      activity_id:activity.activity_id,estate_id:activity.estate_id,
      place_id:activity.place_id,context_facts_ref:activity.context_facts_ref,
      result:"APPLIES",
    }),
    signed(inventoryRef,"INVENTORY",{
      schema:"G3-INVENTORY:1",complete:true,
      estate_id:activity.estate_id,place_id:activity.place_id,
      binding_id:b.binding_id,version:envelope.version,
      snapshot_digest:envelopeInventoryDigestG3(context),
    }),
  ];
  const input:PlaceSourceEndToEndInputG3={
    context,signed_sources:records,trust_anchors:[anchor],review,
  };
  function resign(index:number,payload:unknown, changes:Partial<SignedSourceClaimG3>={}) {
    const old=input.signed_sources[index];
    const body=Buffer.from(JSON.stringify(payload),"utf8");
    const claim={...old.claim,payload_sha256:placeSourceSha256G3(body),...changes};
    input.signed_sources=[
      ...input.signed_sources.slice(0,index),
      {
        claim,payload_base64:body.toString("base64"),
        signature_base64:sign(null,placeSourceSignedBytesG3(claim),keys.privateKey).toString("base64"),
      },
      ...input.signed_sources.slice(index+1),
    ];
  }
  return {input,resign,index:{recognition:0,requirement:1,predicate:2,inventory:3}};
}
const run=(edit?:(value:Fixture)=>void)=>{
  const f=makeFixture();edit?.(f);return runSignedPlaceReviewG3(f.input);
};
const payload=(record:SignedSourceRecordG3)=>JSON.parse(Buffer.from(record.payload_base64,"base64").toString("utf8")) as Record<string,unknown>;

describe("G3 signed source assurance — synthetic keys ONLY",()=>{
  it("verifies signed inventory and each purpose-scoped record in read-only E2E",async()=>{
    const v=await run();
    expect(v.state).toBe("REVIEW_ONLY");
    expect(v.resolution?.resolution_status).toBe("COMPLETE");
    expect(v.review?.simulatedWardenDecision).toBe("SIMULATED_ALLOW");
    expect(v.review?.evidencePreview.persistenceState).toBe("NOT_PERSISTED_DRY_RUN");
    expect(v.review?.evidencePreview.authorityState).toBe("NO_AUTHORITY_ISSUED");
    expect(v.review?.evidencePreview.sourceVerificationState).toBe("SYNTHETIC_UNTRUSTED");
    expect(v.river_persistence).toBe("NOT_PERSISTED");
    expect(v.provider_effect).toBe("DISABLED");
  });
  it("replays same signed source material deterministically",async()=>{
    const f=makeFixture();
    expect(await runSignedPlaceReviewG3(f.input)).toEqual(await runSignedPlaceReviewG3(f.input));
  });
  it("contains no action token or raw source body in returned preview",async()=>{
    const text=JSON.stringify(await run());
    expect(text).not.toContain("WARDEN-ACTION-TOKEN");
    expect(text).not.toContain("signature_base64");
    expect(text).not.toContain("public_key_spki_pem");
  });
  it("holds if signed inventory is missing",async()=>{
    const r=await run(f=>{f.input.signed_sources=f.input.signed_sources.slice(0,3)});
    expect(r.reason_codes).toContain("G3_SIGNED_INVENTORY_MISSING_OR_INVALID");
  });
  it("holds unsigned assertion of completeness",async()=>{
    const r=await run(f=>{const i=f.index.inventory,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,complete:false})});
    expect(r.reason_codes).toContain("G3_INVENTORY_SCOPE_OR_COMPLETENESS_MISMATCH");
  });
  it("holds inventory describing a different estate even if signed",async()=>{
    const r=await run(f=>{const i=f.index.inventory,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,estate_id:"OTHER"})});
    expect(r.reason_codes).toContain("G3_INVENTORY_SCOPE_OR_COMPLETENESS_MISMATCH");
  });
  it("holds modified requirements despite a valid old inventory",async()=>{
    const r=await run(f=>{const c=f.input.context;c.envelope={...c.envelope,
      requirements:[{...c.envelope.requirements[0],category:"LABOUR"}]}});
    expect(r.reason_codes).toContain("G3_INVENTORY_SCOPE_OR_COMPLETENESS_MISMATCH");
  });
  it("holds a tampered payload that preserves the signed claim",async()=>{
    const r=await run(f=>{
      const i=f.index.requirement,p=payload(f.input.signed_sources[i]);
      f.input.signed_sources=[...f.input.signed_sources.slice(0,i),
        {...f.input.signed_sources[i],payload_base64:Buffer.from(JSON.stringify({...p,category:"SAFETY"})).toString("base64")},
        ...f.input.signed_sources.slice(i+1)];
    });
    expect(r.reason_codes).toContain("G3_REQUIREMENT_PAYLOAD_MISMATCH");
  });
  it("holds an authentic signature on mismatched recognition site",async()=>{
    const r=await run(f=>{const i=f.index.recognition,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,physical_site_ref:"OTHER-SITE"})});
    expect(r.reason_codes).toContain("G3_RECOGNITION_PAYLOAD_MISMATCH");
  });
  it("rejects a Warden represented principal outside the recognized Place",async()=>{
    const r=await run(f=>{f.input.review.representedPrincipalRef="OTHER-ORG"});
    expect(r.reason_codes).toContain("G3_PRINCIPAL_NOT_BOUND_TO_PLACE");
  });
  it("holds an authentic but wrong legal entity recognition",async()=>{
    const r=await run(f=>{const i=f.index.recognition,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,legal_entity_refs:["OTHER-ENTITY"]})});
    expect(r.reason_codes).toContain("G3_RECOGNITION_PAYLOAD_MISMATCH");
  });
  it("holds an authentic but wrong regulation source payload",async()=>{
    const r=await run(f=>{const i=f.index.requirement,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,category:"LABOUR"})});
    expect(r.reason_codes).toContain("G3_REQUIREMENT_PAYLOAD_MISMATCH");
  });
  it("holds an untrusted jurisdiction",async()=>{
    const r=await run(f=>{f.input.trust_anchors=[{...f.input.trust_anchors[0],jurisdiction_refs:["OTHER"]}]});
    expect(r.state).toBe("HOLD");
  });
  it("holds revoked signing trust anchor",async()=>{
    const r=await run(f=>{f.input.trust_anchors=[{...f.input.trust_anchors[0],status:"REVOKED"}]});
    expect(r.state).toBe("HOLD");
  });
  it("holds ambiguous duplicate trust anchors",async()=>{
    const r=await run(f=>{f.input.trust_anchors=[f.input.trust_anchors[0],f.input.trust_anchors[0]]});
    expect(r.state).toBe("HOLD");
  });
  it("holds expired signing trust anchor",async()=>{
    const r=await run(f=>{f.input.trust_anchors=[{...f.input.trust_anchors[0],valid_until:BEGIN}]});
    expect(r.state).toBe("HOLD");
  });
  it("holds purpose-confused signature",async()=>{
    const r=await run(f=>{const i=f.index.inventory,p=payload(f.input.signed_sources[i]);f.resign(i,p,{purpose:"PREDICATE"})});
    expect(r.reason_codes).toContain("G3_SIGNED_INVENTORY_MISSING_OR_INVALID");
  });
  it("holds revoked purpose admission",async()=>{
    const r=await run(f=>{f.input.trust_anchors=[{...f.input.trust_anchors[0],purposes:["REQUIREMENT"]}]});
    expect(r.state).toBe("HOLD");
  });
  it("holds failed Ed25519 verification",async()=>{
    const r=await run(f=>{const i=f.index.inventory;f.input.signed_sources=[
      ...f.input.signed_sources.slice(0,i),
      {...f.input.signed_sources[i],signature_base64:Buffer.alloc(64).toString("base64")},
      ...f.input.signed_sources.slice(i+1)]});
    expect(r.reason_codes).toContain("G3_SIGNED_INVENTORY_MISSING_OR_INVALID");
  });
  it("holds if no independently admitted source providers are specified",async()=>{
    const r=await run(f=>{f.input.context.admitted_providers=[]});
    expect(r.reason_codes).toContain("G3_NO_ADMITTED_TRUST");
  });
  it("holds missing applicability record",async()=>{
    const r=await run(f=>{f.input.signed_sources=f.input.signed_sources.filter((_,i)=>i!==f.index.predicate)});
    expect(r.state).toBe("HOLD");
  });
  it("holds a signed predicate for wrong activity context",async()=>{
    const r=await run(f=>{const i=f.index.predicate,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,context_facts_ref:"OTHER-FACTS"})});
    expect(r.state).toBe("HOLD");
  });
  it("holds an authentically signed non-applicable outcome",async()=>{
    const r=await run(f=>{const i=f.index.predicate,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,result:"DOES_NOT_APPLY"})});
    expect(r.state).toBe("HOLD");
  });
  it("holds an unsigned claim that a statute grants an exception",async()=>{
    const r=await run(f=>{f.input.context.envelope={...f.input.context.envelope,
      requirements:[{...f.input.context.envelope.requirements[0],exception_refs:["FAKE-WAIVER"]}]}});
    expect(r.state).toBe("HOLD");
  });
  it("holds multiple jurisdictions until independent joint jurisdiction model exists",async()=>{
    const r=await run(f=>{f.input.context.bindings=[{...f.input.context.bindings[0],
      jurisdiction_refs:["TEST-JURISDICTION","SECOND-JURISDICTION"]}]});
    expect(r.reason_codes).toContain("G3_MULTI_JURISDICTION_UNSUPPORTED");
  });
  it("holds conflicting recognition bindings",async()=>{
    const r=await run(f=>{f.input.context.bindings=[f.input.context.bindings[0],f.input.context.bindings[0]]});
    expect(r.reason_codes).toContain("G3_BINDING_AMBIGUOUS");
  });
  it("holds missing one of the signed recognition facts",async()=>{
    const r=await run(f=>{const i=f.index.recognition,p=payload(f.input.signed_sources[i]);f.resign(i,{...p,occupancy_basis:"OWNER"})});
    expect(r.reason_codes).toContain("G3_RECOGNITION_PAYLOAD_MISMATCH");
  });
  it("holds an issued record outside source freshness SLA",async()=>{
    const r=await run(f=>{f.input.context.max_source_age_ms=10});
    expect(r.state).toBe("HOLD");
  });
  it("holds duplicate source-ref reuse",async()=>{
    const r=await run(f=>{f.input.signed_sources=[...f.input.signed_sources,f.input.signed_sources[0]]});
    expect(r.reason_codes).toContain("G3_DUPLICATE_SOURCE_REF");
  });
  it("synthetic revoked Warden policy cannot be mistaken for admission",async()=>{
    const r=await run(f=>{f.input.review.policy={...f.input.review.policy,lifecycle:"REVOKED"}});
    expect(r.state).toBe("HOLD");
    expect(r.review?.evidencePreview.authorityState).toBe("NO_AUTHORITY_ISSUED");
  });
  it("holds a signed rule source with wrong jurisdiction claim",async()=>{
    const r=await run(f=>{const i=f.index.requirement,p=payload(f.input.signed_sources[i]);f.resign(i,p,{jurisdiction_ref:"OTHER-JURISDICTION"})});
    expect(r.reason_codes).toContain("G3_REQUIREMENT_PAYLOAD_MISMATCH");
  });
});
