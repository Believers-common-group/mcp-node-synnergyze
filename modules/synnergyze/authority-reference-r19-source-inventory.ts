import { assessR17EvidenceHandoff, REQUIRED_R17_CONTROLS,
  type R17Candidate, type R17Control } from "./authority-reference-trust-handoff.ts";

/**
 * R1.9 read-only authority-source inventory. This is an intake CHECKLIST,
 * not a verifier of service authenticity, owner mandates, or live receipts.
 * No fetch, credential access, tenant lookup, network I/O, or execution.
 */
export type R19SourceClass =
  | "REPOSITORY_DOCUMENTATION" | "DEPLOYMENT_METADATA"
  | "DIRECT_AUTHORITY_EXPORT" | "EXTERNAL_TRUST_ANCHOR" | "OFFLINE_FIXTURE";
export type R19SourceState =
  | "MISSING" | "MULTIPLE" | "DOCUMENTATION_ONLY" | "OFFLINE_TEST_ONLY"
  | "SCOPE_MISMATCH" | "STALE_OR_INVALID" | "UNAUTHENTICATED_CANDIDATE";
export interface R19AuthoritySourceClaim {
  control: R17Control;
  sourceClass: R19SourceClass;
  evidenceRef: string;
  evidenceUrl: string;
  evidenceSha256: string;
  candidateDigest: string;
  issuerRef: string;
  nominatedRole: string;
  mandateRef: string | null;
  ownerAccepted: boolean;
  capturedAt: string;
  expiresAt: string;
  // Untrusted fields are explicitly ignored as authorization evidence.
  verified?: boolean;
  approved?: boolean;
}
export interface R19AuthorityInventory {
  schema: "AUTHORITY-REFERENCE-R19-AUTHORITY-INVENTORY-001";
  state: "HOLD";
  liveAuthorityVerified: false;
  executionAllowed: false;
  credentialsRequested: false;
  sideEffects: false;
  sourceEgressAllowed: false;
  controls: Readonly<Record<R17Control,R19SourceState>>;
  reasonCodes: readonly string[];
  acceptanceRequests: readonly {
    control:R17Control;
    requiredRole:string;
    ownerMandateState:"NOT_VERIFIED";
    requiredNextAction:string;
  }[];
}
const SHA=/^sha256:[a-f0-9]{64}$/;
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=300&&v.trim()===v;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const ts=(v:unknown):number=>{
  if(!text(v)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))return NaN;
  const t=Date.parse(v);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v.slice(0,10)?t:NaN;
};
const VALID_CLASS=new Set<R19SourceClass>([
  "REPOSITORY_DOCUMENTATION","DEPLOYMENT_METADATA","DIRECT_AUTHORITY_EXPORT",
  "EXTERNAL_TRUST_ANCHOR","OFFLINE_FIXTURE"]);
function sourceUrl(x:unknown):boolean{
 if(!text(x)||x.length>2048)return false;
 try{
   const u=new URL(x);return u.protocol==="https:"&&!u.username&&!u.password&&
     !u.hash&&!u.search&&u.hostname.includes(".")&&
     !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);
 }catch{return false;}
}
const NEXT_ACTION:Readonly<Record<R17Control,string>>={
 WORKER_BUILD:"Independently reproduce and pin the exact worker artifact from reviewed source",
 RUNTIME_DEPLOYMENT:"Obtain authenticated deployment provenance for the exact worker commit",
 DIGITALME_DELEGATION:"Confirm authorised DigitalMe issuer, active principal and delegated mandate",
 BNR_DOOR:"Obtain independently validated tenant/Door membership and BNR admission",
 GENESIS_CAPACITY:"Verify independently admitted and available Genesis runtime capacity",
 WARDEN_POLICY:"Verify signed Warden policy, permitted capability, issuer and revocation freshness",
 WARDEN_ADMISSION:"Verify live signed Warden decision scoped to exact request and worker",
 RIVER_ADMISSION:"Independently verify matching live signed River admission receipt",
 REPLAY_LEDGER:"Verify shared ACID permit reservation and cross-worker replay exclusion",
 SOURCE_EGRESS:"Approve named official source, collection purpose and outbound access policy",
 RIVER_EXECUTION:"Verify a distinct signed River execution receipt, not an admission receipt",
 AUDIT_ANCHOR:"Obtain off-worker independently administered audit witness with retention",
 PRODUCTION_COMMISSIONING:"Record nominated authority, individual acceptance and explicit go-live decision"
};
/** URLs and owner assertions remain untrusted, even when syntactically valid. */
export function inspectR19AuthoritySources(
 candidate:unknown,sourceClaims:unknown,evaluatedAt:string
):R19AuthorityInventory {
 const reasons:string[]=[];
 const fail=(r:string)=>{if(!reasons.includes(r))reasons.push(r);};
 const controls={} as Record<R17Control,R19SourceState>;
 const r17=assessR17EvidenceHandoff({candidate,evidence:[]},evaluatedAt);
 const digest=r17.candidateDigest;
 const now=ts(evaluatedAt);
 if(!digest)fail("CANDIDATE_NOT_VERIFIED");
 if(!Number.isFinite(now))fail("REVIEW_TIME_INVALID");
 if(!Array.isArray(sourceClaims)||sourceClaims.length>32)fail("SOURCE_COLLECTION_INVALID");
 const sources=Array.isArray(sourceClaims)&&sourceClaims.length<=32?sourceClaims:[];
 if(sources.some(x=>!obj(x)||!REQUIRED_R17_CONTROLS.includes(x.control as R17Control)))
   fail("UNKNOWN_CONTROL_OR_RECORD");
 for(const control of REQUIRED_R17_CONTROLS){
   const matches=sources.filter(x=>obj(x)&&x.control===control);
   if(matches.length===0){controls[control]="MISSING";fail("MISSING:"+control);continue;}
   if(matches.length!==1){controls[control]="MULTIPLE";fail("DUPLICATE:"+control);continue;}
   const c=matches[0] as R19AuthoritySourceClaim;
   if(c.sourceClass==="OFFLINE_FIXTURE"){controls[control]="OFFLINE_TEST_ONLY";continue;}
   if(!VALID_CLASS.has(c.sourceClass)||!text(c.evidenceRef)||
     !sourceUrl(c.evidenceUrl)||!SHA.test(c.evidenceSha256)||
     !text(c.issuerRef)||!text(c.nominatedRole)){
       controls[control]="STALE_OR_INVALID";fail("BAD_SOURCE_DESCRIPTOR:"+control);continue;
   }
   if(!digest||c.candidateDigest!==digest){
     controls[control]="SCOPE_MISMATCH";fail("CANDIDATE_DIGEST_MISMATCH:"+control);continue;
   }
   const from=ts(c.capturedAt),until=ts(c.expiresAt);
   if(![from,until,now].every(Number.isFinite)||from>now||now>until||
      until<=from||until-from>24*60*60*1000){
     controls[control]="STALE_OR_INVALID";fail("SOURCE_STALE:"+control);continue;
   }
   if(c.sourceClass==="REPOSITORY_DOCUMENTATION"||
      c.sourceClass==="DEPLOYMENT_METADATA"){
     controls[control]="DOCUMENTATION_ONLY";continue;
   }
   controls[control]="UNAUTHENTICATED_CANDIDATE";
   if(!text(c.mandateRef)||!c.ownerAccepted)
      fail("OWNER_NOMINATION_OR_ACCEPTANCE_UNVERIFIED:"+control);
 }
 // No source class, HTTPS URL, owner claim or digest supplies estate issuer trust.
 fail("NO_INDEPENDENTLY_AUTHENTICATED_ISSUER_DIRECTORY");
 fail("LIVE_DIGITALME_WARDEN_RIVER_NOT_CONFIRMED");
 fail("WORKER_AND_SINGLE_USE_PERMIT_NOT_COMMISSIONED");
 fail("EXPLICIT_PRODUCTION_APPROVAL_MISSING");
 return {
  schema:"AUTHORITY-REFERENCE-R19-AUTHORITY-INVENTORY-001",state:"HOLD",
  liveAuthorityVerified:false,executionAllowed:false,credentialsRequested:false,
  sideEffects:false,sourceEgressAllowed:false,controls,reasonCodes:reasons,
  acceptanceRequests:r17.reviewQueue.map(x=>({
    control:x.control,requiredRole:x.requiredIndependentOwner,
    ownerMandateState:"NOT_VERIFIED" as const,requiredNextAction:NEXT_ACTION[x.control],
  }))
 };
}