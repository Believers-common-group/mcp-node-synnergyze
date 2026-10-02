import {createHash} from "node:crypto";
import type {PlaceSourceEndToEndResultG3} from "./g3-end-to-end.ts";
import type {Resolution} from "./contracts.ts";
import type {PlaceReviewPreviewG2} from "../river/place-context-review-preview.ts";

const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v),"utf8").digest("hex");
const unique=(v:readonly string[])=>[...new Set(v)].sort();
const gates=[
  "COMPETENT_REGULATOR_TRUST_UNADMITTED",
  "INDEPENDENT_JURISDICTION_COVERAGE_UNATTESTED",
  "PROVIDER_NATIVE_SITE_ENTITY_AND_REGISTRATION_UNVERIFIED",
  "WARDEN_SIGNED_AUTHORITY_NOT_VALIDATED",
  "RIVER_DURABLE_APPEND_AND_SEAL_NOT_VALIDATED",
  "PILOT_CONSENT_PRIVACY_AND_EXIT_NOT_APPROVED",
];
export interface G4AcceptanceReport {
  schemaVersion:"G4-PLACE-ACCEPTANCE:SANDBOX";
  reportRef:string;
  conformance:"PASS"|"FAIL";
  operationalAdmission:"HOLD";
  providerEffects:"DISABLED";
  riverPersistence:"NOT_PERSISTED";
  wardenAuthority:"NOT_GRANTED";
  sourceAuthority:"TEST_ANCHORS_ONLY";
  disclosure:"EVIDENCE_ONLY";
  contextRef:string;estateRef:string;placeRef:string;envelopeRef:string;
  sourceDigest:string;previewRef:string;
  reviewReasons:readonly string[];
  outstandingGates:readonly string[];
}
function resolutionChecks(r:Resolution|undefined,issues:string[]):void {
  if(!r){issues.push("MISSING_CONTEXT");return}
  if(r.resolution_status!=="COMPLETE"||!r.source_set_verified||
     r.unresolved_requirement_refs.length>0||r.applied_requirement_refs.length===0)
    issues.push("INCOMPLETE_CONTEXT");
  if(!/^[a-f0-9]{64}$/i.test(r.source_digest)||
     r.resolution_id!=="CONTEXT:"+r.source_digest.slice(0,24))
    issues.push("INVALID_CONTEXT_REFERENCE");
  if(r.resolver_version!=="G1-SANDBOX"||
     !r.limitations.includes("CONTEXT_ONLY_NOT_AUTHORITY")||
     !r.limitations.includes("NO_LIVE_SOURCE_ADAPTERS_BUNDLED"))
    issues.push("UNSUPPORTED_SOURCE_LINEAGE");
  if(!r.binding_id||!r.estate_id||!r.place_id||!r.actor_digitalme_ref||
     !r.envelope_id||!r.envelope_version||!r.context_facts_ref)
    issues.push("MISSING_IDENTITY_OR_SCOPE");
}
function previewChecks(p:PlaceReviewPreviewG2|undefined,r:Resolution|undefined,issues:string[]):void {
  if(!p){issues.push("MISSING_RIVER_PREVIEW");return}
  const {evidenceRef,...canonical}=p;
  if(evidenceRef!=="RIVER-PREVIEW:"+digest(canonical).slice(0,32))
    issues.push("PREVIEW_DIGEST_MISMATCH");
  if(p.schemaVersion!=="PLACE-REVIEW-DRYRUN:G2"||
     p.persistenceState!=="NOT_PERSISTED_DRY_RUN"||
     p.sourceVerificationState!=="SYNTHETIC_UNTRUSTED"||
     p.authorityState!=="NO_AUTHORITY_ISSUED"||
     p.effectState!=="NO_EXECUTION"||
     p.syntheticDecision!=="SIMULATED_ALLOW"||
     p.reviewState!=="REVIEW_ONLY"||!p.requestRef||!p.syntheticWardenDecisionRef)
    issues.push("PREVIEW_NOT_SAFE_OR_INCOMPLETE");
  if(r&&(p.contextResolutionRef!==r.resolution_id||p.contextDigest!==r.source_digest||
    p.actorRef!==r.actor_digitalme_ref||p.estateRef!==r.estate_id||
    p.placeRef!==r.place_id||p.envelopeRef!==r.envelope_id||
    p.envelopeVersion!==r.envelope_version))
    issues.push("PREVIEW_CONTEXT_MISMATCH");
}
/** Conformance never grants a real admission. Inputs and attestations are synthetic. */
export function assessPlaceG4(g3:PlaceSourceEndToEndResultG3):G4AcceptanceReport {
  const issues:string[]=[];
  if(g3.state!=="REVIEW_ONLY"||g3.reason_codes.length>0)
    issues.push("G3_REVIEW_FAILED");
  if(g3.source_assurance!=="TEST_ANCHORS_ONLY_NOT_AUTHORITY"||
     g3.river_persistence!=="NOT_PERSISTED"||g3.provider_effect!=="DISABLED")
    issues.push("G3_AUTHORITY_OR_EFFECT_CLAIM_UNSUPPORTED");
  resolutionChecks(g3.resolution,issues);
  if(!g3.review||g3.review.reviewState!=="REVIEW_ONLY"||
     g3.review.simulatedWardenDecision!=="SIMULATED_ALLOW")
    issues.push("G2_SIMULATED_REVIEW_FAILED");
  previewChecks(g3.review?.evidencePreview,g3.resolution,issues);
  const r=g3.resolution,p=g3.review?.evidencePreview;
  const report={
    schemaVersion:"G4-PLACE-ACCEPTANCE:SANDBOX" as const,
    conformance:(issues.length===0?"PASS":"FAIL") as "PASS"|"FAIL",
    operationalAdmission:"HOLD" as const,
    providerEffects:"DISABLED" as const,
    riverPersistence:"NOT_PERSISTED" as const,
    wardenAuthority:"NOT_GRANTED" as const,
    sourceAuthority:"TEST_ANCHORS_ONLY" as const,
    disclosure:"EVIDENCE_ONLY" as const,
    contextRef:r?.resolution_id??"UNRESOLVED",
    estateRef:r?.estate_id??"UNRESOLVED",
    placeRef:r?.place_id??"UNRESOLVED",
    envelopeRef:r?.envelope_id??"UNRESOLVED",
    sourceDigest:r?.source_digest??"UNRESOLVED",
    previewRef:p?.evidenceRef??"UNRESOLVED",
    reviewReasons:unique(issues),
    outstandingGates:unique(gates),
  };
  return {reportRef:"G4-REPORT:"+digest(report).slice(0,32),...report};
}
export interface G4LocalLink {
  sequence:number;predecessorDigest:string;reportRef:string;
  reportDigest:string;digest:string;storage:"MEMORY_ONLY";
}
export class G4LocalPreviewChain {
  private links:G4LocalLink[]=[];
  append(report:G4AcceptanceReport):G4LocalLink {
    const {reportRef,...payload}=report;
    if(reportRef!=="G4-REPORT:"+digest(payload).slice(0,32))
      throw Error("G4_REPORT_TAMPERED");
    const prior=this.links.find(x=>x.reportRef===reportRef);
    if(prior)return {...prior};
    const base={
      sequence:this.links.length,
      predecessorDigest:this.links.at(-1)?.digest??"GENESIS",
      reportRef,reportDigest:digest(report),storage:"MEMORY_ONLY" as const,
    };
    const link={...base,digest:digest(base)};
    this.links.push(link);return {...link};
  }
  snapshot():readonly G4LocalLink[]{return this.links.map(x=>({...x}))}
}
export function verifyG4LocalPreviewChain(items:readonly G4LocalLink[]):boolean {
  let prev="GENESIS";
  for(let i=0;i<items.length;i++){
    const {digest:actual,...rest}=items[i];
    if(rest.sequence!==i||rest.predecessorDigest!==prev||
       rest.storage!=="MEMORY_ONLY"||
       !rest.reportRef.startsWith("G4-REPORT:")||
       !/^[a-f0-9]{64}$/i.test(rest.reportDigest)||
       actual!==digest(rest))return false;
    prev=actual;
  }
  return true;
}
