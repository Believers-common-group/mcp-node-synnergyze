import { REQUIRED_R17_CONTROLS, type R17Control } from "./authority-reference-trust-handoff.ts";

/**
 * R2.0 observed-source intake gate. Repository names, READMEs, old deployments,
 * screenshots and caller-provided owner claims are never production authority.
 * Pure evaluation: no network calls, key loading, issuer enrollment or execution.
 */
export interface R20SourceCandidate {
  control:R17Control;
  sourceRef:string;
  repository:string;
  sourceClass:"REPOSITORY_README" | "SOURCE_CONTRACT" | "DEPLOYMENT_METADATA" | "DIRECT_OWNER_EXPORT";
  summary:string;
  observedAt:string;
  observedCommitSha?:string;
  candidateCommitSha?:string;
  deploymentState?: "READY" | "CANCELED" | "ERROR" | "UNKNOWN";
  claimedOwnerRef?:string;
  ownerAccepted?:boolean; // untrusted; never marks approval
  verified?:boolean; // untrusted; never marks approval
}
export type R20SourceStatus =
  "MISSING" | "AMBIGUOUS" | "INVALID_SOURCE" | "STALE" |
  "POSSIBLE_UPSTREAM_CODEBASE" | "OLDER_OR_CANCELED_DEPLOYMENT" |
  "DOCUMENTATION_ONLY" | "UNAUTHENTICATED_OWNER_CANDIDATE";
export interface R20IntakeResult {
  schema:"AUTHORITY-REFERENCE-OWNER-DISCOVERY-001/R2.0";
  state:"HOLD";
  executionAllowed:false;
  realIssuerVerified:false;
  ownerMandatesAccepted:false;
  officialSourceEgressAllowed:false;
  runtimeCommissioned:false;
  controls:Readonly<Record<R17Control,R20SourceStatus>>;
  findings:readonly string[];
  requiredOwnerAcceptance:readonly R17Control[];
}
const isObject=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const safeText=(x:unknown):x is string=>typeof x==="string"&&x.length>0&&x.length<=1024&&x.trim()===x;
const SHA=/^[0-9a-f]{40}$/i;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const REPO=/^[a-z0-9][a-z0-9_.-]{0,99}\/[a-z0-9][a-z0-9_.-]{0,99}$/i;
function timestamp(value:unknown):number {
 if(!safeText(value)||!ISO.test(value))return NaN;
 const t=Date.parse(value);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value.slice(0,10)?t:NaN;
}
export function assessR20OwnerCandidates(
  claims:unknown,evaluatedAt:string
):R20IntakeResult {
 const controls={} as Record<R17Control,R20SourceStatus>;
 const findings:string[]=[];
 const add=(v:string)=>{if(!findings.includes(v))findings.push(v);};
 const now=timestamp(evaluatedAt);
 const candidates=Array.isArray(claims)&&claims.length<=52?claims:[];
 if(!Array.isArray(claims)||claims.length>52)add("INVALID_CANDIDATE_COLLECTION");
 if(!Number.isFinite(now))add("INVALID_REVIEW_TIME");
 if(candidates.some(x=>!isObject(x)||
    !REQUIRED_R17_CONTROLS.includes(x.control as R17Control)))add("UNKNOWN_CONTROL");
 for(const control of REQUIRED_R17_CONTROLS) {
   const hits=candidates.filter((x):x is R20SourceCandidate=>isObject(x)&&x.control===control);
   if(hits.length===0){controls[control]="MISSING";add("MISSING:"+control);continue;}
   if(hits.length!==1){controls[control]="AMBIGUOUS";add("MULTIPLE_UNRECONCILED_SOURCES:"+control);continue;}
   const c=hits[0];
   if(!safeText(c.sourceRef)||!safeText(c.repository)||!REPO.test(c.repository)||
      !safeText(c.summary)||!["REPOSITORY_README","SOURCE_CONTRACT",
      "DEPLOYMENT_METADATA","DIRECT_OWNER_EXPORT"].includes(c.sourceClass)||
      (c.observedCommitSha!==undefined&&!SHA.test(c.observedCommitSha))||
      (c.candidateCommitSha!==undefined&&!SHA.test(c.candidateCommitSha))) {
     controls[control]="INVALID_SOURCE";add("INVALID_SOURCE_DESCRIPTOR:"+control);continue;
   }
   const obs=timestamp(c.observedAt);
   if(!Number.isFinite(now)||!Number.isFinite(obs)||obs>now||now-obs>14*24*60*60*1000){
     controls[control]="STALE";add("SOURCE_NOT_CURRENT:"+control);continue;
   }
   // This is a content-warning heuristic, not a claim that a fork is malicious.
   const seemsUpstream=(control==="WARDEN_POLICY"||control==="WARDEN_ADMISSION")&&
      /OpenAI Agents SDK/i.test(c.summary) ||
      control==="BNR_DOOR"&&/GitHub MCP Server/i.test(c.summary);
   if(seemsUpstream){
     controls[control]="POSSIBLE_UPSTREAM_CODEBASE";
     add("REPOSITORY_NAME_NOT_ESTATE_ISSUER:"+control);continue;
   }
   if(c.sourceClass==="DEPLOYMENT_METADATA" &&
      (c.deploymentState!=="READY"||
       !c.observedCommitSha||!c.candidateCommitSha||
       c.observedCommitSha!==c.candidateCommitSha)){
     controls[control]="OLDER_OR_CANCELED_DEPLOYMENT";
     add("DEPLOYMENT_NOT_EXACT_CANDIDATE:"+control);continue;
   }
   if(c.sourceClass==="DIRECT_OWNER_EXPORT"){
     controls[control]="UNAUTHENTICATED_OWNER_CANDIDATE";
     add("CLAIMED_OWNER_MANDATE_UNVERIFIED:"+control);continue;
   }
   controls[control]="DOCUMENTATION_ONLY";
 }
 add("NO_INDEPENDENT_CUSTODIAN_MANDATES_VERIFIED");
 add("NO_AUTHENTICATED_DIGITALME_WARDEN_RIVER_SERVICE_CHAIN");
 add("NO_APPROVED_SOURCE_EGRESS_OR_ONE_TIME_PERMIT");
 return {
  schema:"AUTHORITY-REFERENCE-OWNER-DISCOVERY-001/R2.0",
  state:"HOLD",executionAllowed:false,realIssuerVerified:false,
  ownerMandatesAccepted:false,officialSourceEgressAllowed:false,runtimeCommissioned:false,
  controls,findings,requiredOwnerAcceptance:[...REQUIRED_R17_CONTROLS]
 };
}
