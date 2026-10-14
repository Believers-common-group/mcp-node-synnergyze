import { auditR20OwnerRegister } from "./authority-reference-r20-owner-gate.ts";
import { assessR17EvidenceHandoff, REQUIRED_R17_CONTROLS,
  type R17Control } from "./authority-reference-trust-handoff.ts";

/**
 * R2.1 immutable owner nomination intake. A well-formed mandate proposal is only
 * a review candidate. A GitHub account, README, signature-looking string or
 * caller-provided ownerAccepted flag never commissions an authority.
 * This module performs NO I/O, crypto trust enrollment, or execution.
 */
export interface R21MandateProposal {
  control: R17Control;
  nomineeRef: string;
  independentReviewerRef: string;
  mandateRef: string;
  evidenceRef: string;
  evidenceDigest: string;
  candidateDigest: string;
  issuedAt: string;
  expiresAt: string;
  claimedOwnerAccepted?: boolean;
  claimedLiveAuthorityVerified?: boolean;
}
export interface R21ReviewItem {
  control: R17Control;
  status: "NOT_SUBMITTED" | "REVIEW_REQUIRED" | "INVALID";
  reasonCodes: readonly string[];
  mandateRef: string | null;
}
export interface R21OwnerIntakeResult {
  schema: "AUTHORITY-REFERENCE-R21-OWNER-INTAKE-001";
  state: "HOLD";
  commissioned: false;
  executionAllowed: false;
  sourceEgressAllowed: false;
  ownerMandatesIndependentlyVerified: false;
  productionApproval: false;
  candidateDigest: string | null;
  reviewableCount: number;
  issues: readonly string[];
  reviewQueue: readonly R21ReviewItem[];
}
const object=(x:unknown):x is Record<string,unknown> =>
  typeof x==="object" && x!==null && !Array.isArray(x);
const ref=/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,159}$/;
const digest=/^sha256:[a-f0-9]{64}$/;
const timePattern=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const noCredentials=/secret|token|password|apikey|private.key|bearer/i;
function instant(x:unknown):number {
  if(typeof x!=="string"||!timePattern.test(x))return NaN;
  const t=Date.parse(x);
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x.slice(0,10)?t:NaN;
}
/** These roles require nonidentical nominated custodians at minimum.
 * Real organizational independence is NOT established by different strings. */
const distinctRoles = new Set<R17Control>([
  "WORKER_BUILD","DIGITALME_DELEGATION","BNR_DOOR","GENESIS_CAPACITY",
  "WARDEN_POLICY","WARDEN_ADMISSION","RIVER_ADMISSION","REPLAY_LEDGER",
  "SOURCE_EGRESS","RIVER_EXECUTION","AUDIT_ANCHOR","PRODUCTION_COMMISSIONING",
]);
export function assessR21OwnerEvidenceIntake(
  register:unknown,candidate:unknown,proposals:unknown,evaluatedAt:string
):R21OwnerIntakeResult {
  const issues:string[]=[];
  const add=(s:string)=>{if(!issues.includes(s))issues.push(s);};
  const registerAudit=auditR20OwnerRegister(register);
  if(!registerAudit.completeUnappointedRegister)add("R20_REGISTER_NOT_REVIEWABLE");
  const candidateAssessment=assessR17EvidenceHandoff({candidate,evidence:[]},evaluatedAt);
  const candidateDigest=candidateAssessment.candidateDigest;
  if(candidateDigest===null)add("R17_CANDIDATE_INVALID");
  const now=instant(evaluatedAt);
  if(!Number.isFinite(now))add("REVIEW_TIME_INVALID");
  const data=Array.isArray(proposals)&&proposals.length<=26?proposals:[];
  if(!Array.isArray(proposals)||proposals.length>26)add("MANDATE_COLLECTION_INVALID");
  const refs=new Set<string>(),evidence=new Set<string>(),owners=new Map<string,R17Control>();
  const invalidShared=new Map<R17Control,string[]>();
  if(data.some(p=>!object(p)||!REQUIRED_R17_CONTROLS.includes(p.control as R17Control)))
    add("UNKNOWN_OR_INVALID_ROLE");
  // All entries are evaluated even when one control has a duplicate.
  for(const p of data) {
    if(!object(p) || !REQUIRED_R17_CONTROLS.includes(p.control as R17Control))continue;
    const c=p.control as R17Control;
    const problems:string[]=[];
    if(!ref.test(String(p.nomineeRef))||!ref.test(String(p.independentReviewerRef))||
       !ref.test(String(p.mandateRef))||!ref.test(String(p.evidenceRef))||
       [p.nomineeRef,p.independentReviewerRef,p.mandateRef,p.evidenceRef].some(x=>
         typeof x!=="string"||noCredentials.test(x)))problems.push("REF_OR_CREDENTIAL_INVALID");
    if(typeof p.nomineeRef==="string"&&p.nomineeRef===p.independentReviewerRef)
      problems.push("SELF_REVIEW_FORBIDDEN");
    if(p.candidateDigest!==candidateDigest || !digest.test(String(p.candidateDigest)))
      problems.push("CANDIDATE_SCOPE_NOT_BOUND");
    if(!digest.test(String(p.evidenceDigest)))problems.push("EVIDENCE_DIGEST_INVALID");
    const from=instant(p.issuedAt),end=instant(p.expiresAt);
    if(![now,from,end].every(Number.isFinite)||from>now||end<now||end<=from||
       end-from>24*60*60*1000)problems.push("MANDATE_TIME_NOT_CURRENT");
    if(typeof p.mandateRef==="string"&&refs.has(p.mandateRef))problems.push("DUPLICATE_MANDATE_REF");
    if(typeof p.evidenceRef==="string"&&evidence.has(p.evidenceRef))problems.push("DUPLICATE_EVIDENCE_REF");
    if(typeof p.mandateRef==="string")refs.add(p.mandateRef);
    if(typeof p.evidenceRef==="string")evidence.add(p.evidenceRef);
    if(distinctRoles.has(c)&&typeof p.nomineeRef==="string") {
      const prev=owners.get(p.nomineeRef);
      if(prev&&prev!==c){
        problems.push("SEPARATION_OF_DUTIES_CONFLICT");
        invalidShared.set(prev,[...(invalidShared.get(prev)||[]),"SEPARATION_OF_DUTIES_CONFLICT"]);
      }else owners.set(p.nomineeRef,c);
    }
    if(problems.length)invalidShared.set(c,[...(invalidShared.get(c)||[]),...problems]);
    // claimedOwnerAccepted and claimedLiveAuthorityVerified are never authoritative.
  }
  const reviewQueue:R21ReviewItem[]=REQUIRED_R17_CONTROLS.map(control=>{
    const matches=data.filter(x=>object(x)&&x.control===control);
    const problem=[...(invalidShared.get(control)||[])];
    if(matches.length>1)problem.push("MULTIPLE_MANDATES_FOR_CONTROL");
    const reasons=[...new Set(problem)];
    const status:R21ReviewItem["status"]=matches.length===0?"NOT_SUBMITTED":
      reasons.length?"INVALID":"REVIEW_REQUIRED";
    if(reasons.length)add("REVIEW_INVALID:"+control);
    return {control,status,reasonCodes:reasons,
      mandateRef:status==="REVIEW_REQUIRED"&&object(matches[0]) ?
        matches[0].mandateRef as string : null};
  });
  add("INDEPENDENT_OWNER_MANDATE_ACCEPTANCE_NOT_VERIFIED");
  add("PINNED_ISSUER_AND_CURRENT_REVOCATION_NOT_VERIFIED");
  add("LIVE_WARDEN_RIVER_ADMISSION_NOT_ESTABLISHED");
  add("PRODUCTION_RELEASE_NOT_APPROVED");
  return Object.freeze({
    schema:"AUTHORITY-REFERENCE-R21-OWNER-INTAKE-001" as const,
    state:"HOLD" as const,commissioned:false as const,executionAllowed:false as const,
    sourceEgressAllowed:false as const,ownerMandatesIndependentlyVerified:false as const,
    productionApproval:false as const,candidateDigest,
    reviewableCount:reviewQueue.filter(q=>q.status==="REVIEW_REQUIRED").length,
    issues:Object.freeze(issues),
    reviewQueue:Object.freeze(reviewQueue.map(q=>Object.freeze({...q,
      reasonCodes:Object.freeze(q.reasonCodes)}))),
  });
}
