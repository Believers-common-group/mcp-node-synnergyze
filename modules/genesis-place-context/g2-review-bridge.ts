import {createHash} from "node:crypto";
import {evaluateSyntheticWardenDecisionV1} from "../warden/decision-service.ts";
import type {SyntheticWardenDecisionPolicyV1} from "../warden/decision-service.ts";
import type {WardenDecisionRequestV1,WardenNonAllowDecisionV1} from "../warden/contracts.ts";
import type {EventEnvelopeV1} from "../river/contracts.ts";
import type {ResolveRequest,Resolution} from "./contracts.ts";
import {resolvePlaceContextG1} from "./resolver.ts";

const REVIEW="place_context.review" as const;
const PROGRAM="GENESIS-PLACE-CONTEXT:G2-REVIEW" as const;
const sha256=(data:unknown)=>createHash("sha256").update(JSON.stringify(data),"utf8").digest("hex");
const unique=(data:readonly string[])=>[...new Set(data)].sort();
const timestamp=(t:string)=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(t)
  && Number.isFinite(Date.parse(t))?Date.parse(t):undefined;

export interface ReviewScopeG2 {
  actorRef:string;estateId:string;placeId:string;
  representedPrincipalRef:string;actingCapacityRef:string;
  authorityRefs:readonly string[];policyRefs:readonly string[];
  representationSourceRefs:readonly string[];
  requestedAt:string;decidedAt:string;
}
export interface ReviewInputG2 {
  /** G2 re-runs the G1 resolver. Callers cannot supply self-attested Resolution. */
  resolverInput:ResolveRequest;
  scope:ReviewScopeG2;
  /** In G2 this uses the existing synthetic Warden evaluation only. */
  policy:SyntheticWardenDecisionPolicyV1;
}
export interface ReviewOutcomeG2 {
  disposition:"HOLD"|"ESCALATE"|"DENY";
  contextRef:string;
  resolutionStatus:Resolution["resolution_status"];
  correlationId:string;
  wardenRequest?:WardenDecisionRequestV1;
  wardenDecision?:WardenNonAllowDecisionV1;
  reasons:readonly string[];
  /** EventEnvelopeV1 candidates, not evidence receipts, reservations or River appends. */
  riverEventCandidates:readonly EventEnvelopeV1[];
  persistenceState:"NOT_PERSISTED";
  effectsEnabled:false;
}
export function placeReviewContextRefG2(r:Resolution):string {
  return "PLACE-CONTEXT:"+sha256({
    estate:r.estate_id,place:r.place_id,binding:r.binding_id,
    resolution:r.resolution_id,sourceDigest:r.source_digest,
    envelope:r.envelope_id,version:r.envelope_version,
  }).slice(0,32);
}
function candidate(
  correlationId:string,type:string,at:string,payload:unknown,sequence:number,
  predecessorEventRef?:string,
):EventEnvelopeV1 {
  const payloadDigest="sha256:"+sha256(payload);
  const eventRef="RIVER-EVENT-CANDIDATE:"+sha256({
    correlationId,type,at,sequence,payloadDigest,predecessorEventRef:predecessorEventRef??null
  }).slice(0,32);
  return {eventRef,correlationId,sequence,eventType:type,occurredAt:at,payloadDigest,
    ...(predecessorEventRef?{predecessorEventRef}:{})};
}
export async function reviewPlaceContextG2(input:ReviewInputG2):Promise<ReviewOutcomeG2> {
  const {scope:s,policy:p,resolverInput}=input;
  // In-process recomputation is important; do not accept a forged COMPLETE record.
  const r=await resolvePlaceContextG1(resolverInput);
  const contextRef=placeReviewContextRefG2(r);
  const correlationId="PLACE-REVIEW:"+sha256({
    resolution:r.resolution_id,sourceDigest:r.source_digest,
    scope:s,policySnapshot:p.policySnapshotRef,
  }).slice(0,32);
  const issues:string[]=[];
  const requested=timestamp(s.requestedAt),evaluated=timestamp(r.evaluated_at);
  if(r.resolution_status!=="COMPLETE"||!r.source_set_verified||
      r.applied_requirement_refs.length===0||r.unresolved_requirement_refs.length!==0)
    issues.push("CONTEXT_NOT_FULLY_RESOLVED");
  const binding=resolverInput.bindings.filter(b=>
    b.estate_id===r.estate_id&&b.place_id===r.place_id);
  if(binding.length!==1||binding[0].binding_id!==r.binding_id||
     !binding[0].legal_entity_refs.includes(s.representedPrincipalRef))
    issues.push("ENTITY_BINDING_NOT_ESTABLISHED");
  if(s.actorRef!==r.actor_digitalme_ref||s.estateId!==r.estate_id||
     s.placeId!==r.place_id)issues.push("SUBJECT_OR_PLACE_MISMATCH");
  if(!s.actingCapacityRef||!s.representedPrincipalRef||!s.authorityRefs.length||
     !s.policyRefs.length||!s.representationSourceRefs.length)
    issues.push("REVIEW_AUTHORITY_REFS_MISSING");
  if(requested===undefined||evaluated===undefined||
     requested<evaluated||requested-evaluated>300_000||
     timestamp(s.decidedAt)===undefined)
    issues.push("REVIEW_TIME_INVALID_OR_STALE");
  // Explicit Warden *manual-review* rather than Warden ALLOW/execute policy.
  if(!p.manualReviewCapabilityRefs.includes(REVIEW)||
     p.allowedCapabilityRefs.includes(REVIEW)||
     !p.constraints.includes("NO_EXTERNAL_EFFECT")||
     !p.constraints.includes("SYNTHETIC_CONFORMANCE_ONLY"))
    issues.push("NON_EFFECT_MANUAL_REVIEW_POLICY_REQUIRED");

  // Invalid timestamps cannot be used as meaningful event evidence.
  const eventReady=requested!==undefined;
  const events:EventEnvelopeV1[]=[];
  if(eventReady) {
    events.push(candidate(correlationId,"genesis.place.review_requested",s.requestedAt,{
      contextRef,sourceDigest:r.source_digest,resolutionId:r.resolution_id,
      envelopeId:r.envelope_id,envelopeVersion:r.envelope_version,
      actorRef:s.actorRef,principalRef:s.representedPrincipalRef,
      authorityRefs:unique(s.authorityRefs),policyRefs:unique(s.policyRefs),
    },1));
  }
  const append=(kind:string,at:string,data:unknown)=>{
    if(events.length) events.push(candidate(correlationId,kind,at,data,2,events[0].eventRef));
  };
  if(issues.length) {
    append("genesis.place.review_held",s.requestedAt,{issues:unique(issues)});
    return {disposition:"HOLD",contextRef,correlationId,
      resolutionStatus:r.resolution_status,reasons:unique(issues),
      riverEventCandidates:events,persistenceState:"NOT_PERSISTED",effectsEnabled:false};
  }
  const request:WardenDecisionRequestV1={
    requestRef:"WARDEN-PLACE-REVIEW:"+sha256({
      correlationId,sourceDigest:r.source_digest,contextRef
    }).slice(0,32),
    actorRef:s.actorRef,representedPrincipalRef:s.representedPrincipalRef,
    actingCapacityRef:s.actingCapacityRef,contextRef,programRef:PROGRAM,
    eventRef:events[0].eventRef,action:REVIEW,capabilityRef:REVIEW,
    targetRef:r.resolution_id,authorityRefs:unique(s.authorityRefs),
    policyRefs:unique(s.policyRefs),
    representationSourceRefs:unique(s.representationSourceRefs),
    requestedAt:s.requestedAt,correlationId,
  };
  // Existing Warden evaluation; no Warden bypass or local authorization policy.
  // G2's synthetic branch must NEVER release ALLOW or an actionToken.
  const decision=evaluateSyntheticWardenDecisionV1({
    request,policy:p,decidedAt:s.decidedAt,
  });
  if(decision.decision==="ALLOW"){
    const reason="UNEXPECTED_WARDEN_ALLOW_BLOCKED";
    append("genesis.place.review_held",s.decidedAt,{reason});
    return {disposition:"HOLD",contextRef,correlationId,resolutionStatus:r.resolution_status,
      reasons:[reason],riverEventCandidates:events,persistenceState:"NOT_PERSISTED",effectsEnabled:false};
  }
  const disposition=decision.decision==="ESCALATE"?"ESCALATE":"DENY";
  append("genesis.place.review_decision",s.decidedAt,{
    decisionRef:decision.decisionRef,status:decision.decision,
    reasons:unique(decision.reasonCodes),
  });
  return {disposition,contextRef,correlationId,resolutionStatus:r.resolution_status,
    wardenRequest:request,wardenDecision:decision,reasons:unique(decision.reasonCodes),
    riverEventCandidates:events,persistenceState:"NOT_PERSISTED",effectsEnabled:false};
}
