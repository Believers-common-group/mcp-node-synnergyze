import { REQUIRED_R17_CONTROLS, type R17Control } from "./authority-reference-trust-handoff.ts";

/**
 * R2.0 read-only commissioning register hygiene gate. Repository metadata, a
 * GitHub fork name, ownerAccepted=true, or a signed-looking claim is never
 * independently appointed authority. No live I/O or authority promotion.
 */
export interface R20CustodianEntry {
  control: R17Control;
  requiredRole: string;
  evidenceCandidate: string | null;
  observation: string;
  ownerUserId: string | null;
  mandateRef: string | null;
  ownerAccepted: boolean;
  liveAuthorityVerified: boolean;
  reviewStatus: "UNVERIFIED";
}
export interface R20Register {
  schema: "AUTHORITY-REFERENCE-OWNER-REGISTER-001/R2.0";
  namespace: "authority-reference";
  reviewedOn: string;
  status: "HOLD";
  productionApproval: false;
  ownerAppointmentsCreated: false;
  capabilityAdmitted: false;
  evidenceBasis: "READ_ONLY_REPOSITORY_AND_VERCEL_METADATA_NOT_AUTHORITY";
  candidateRepositories: Array<{
    repo: string;
    githubFork: boolean;
    upstream?: string;
    classification: string;
  }>;
  controls: R20CustodianEntry[];
}
export interface R20Audit {
  schema:"AUTHORITY-REFERENCE-OWNER-AUDIT-001/R2.0";
  state:"HOLD";
  executionAllowed:false;
  deployAllowed:false;
  ownerMandatesVerified:false;
  liveIssuerVerified:false;
  ownerAppointmentCount:0;
  completeUnappointedRegister:boolean;
  integrityIssues:readonly string[];
  pendingControls:readonly R17Control[];
}
const object=(x:unknown):x is Record<string,unknown> =>
  typeof x==="object"&&x!==null&&!Array.isArray(x);
const text=(x:unknown):x is string=>typeof x==="string"&&x.length>0&&x.trim()===x;
const FORKS:Readonly<Record<string,string>>={
  "Believers-common-group/Warden":"openai/openai-agents-js",
  "Believers-common-group/processor-BNR":"github/github-mcp-server",
  "Believers-common-group/mcp-node-synnergyze":"thekingznqueenz11/mcp-node",
};
const AUTHORITY_CONTROLS=new Set<R17Control>([
  "DIGITALME_DELEGATION","BNR_DOOR","GENESIS_CAPACITY",
  "WARDEN_POLICY","WARDEN_ADMISSION","RIVER_ADMISSION",
  "RIVER_EXECUTION","PRODUCTION_COMMISSIONING",
]);
const allowedControls=new Set<string>(REQUIRED_R17_CONTROLS);
export function auditR20OwnerRegister(input:unknown):R20Audit {
  const issues:string[]=[];
  const warn=(v:string)=>{if(!issues.includes(v))issues.push(v);};
  const payload=object(input)?input:{};
  if(payload.schema!=="AUTHORITY-REFERENCE-OWNER-REGISTER-001/R2.0"||
     payload.namespace!=="authority-reference"||
     payload.status!=="HOLD"||payload.productionApproval!==false||
     payload.ownerAppointmentsCreated!==false||payload.capabilityAdmitted!==false||
     payload.evidenceBasis!=="READ_ONLY_REPOSITORY_AND_VERCEL_METADATA_NOT_AUTHORITY") {
    warn("REGISTER_NOT_EXPLICITLY_HELD");
  }
  if(!text(payload.reviewedOn)||!/^2026-\d{2}-\d{2}$/.test(payload.reviewedOn)) {
    warn("REVIEW_DATE_INVALID");
  }
  const repos=Array.isArray(payload.candidateRepositories)&&
    payload.candidateRepositories.length<=30?payload.candidateRepositories:[];
  if(!repos.length)warn("REPOSITORY_PROVENANCE_MISSING");
  const repoMap=new Map<string,Record<string,unknown>>();
  for(const raw of repos) {
    if(!object(raw)||!text(raw.repo)||repoMap.has(raw.repo)){
      warn("DUPLICATE_OR_INVALID_REPOSITORY");continue;
    }
    repoMap.set(raw.repo,raw);
  }
  for(const [repo,upstream] of Object.entries(FORKS)) {
    const entry=repoMap.get(repo);
    if(!entry||entry.githubFork!==true||entry.upstream!==upstream)
      warn("FORK_ORIGIN_NOT_ACKNOWLEDGED:"+repo);
  }
  const entries=Array.isArray(payload.controls)&&payload.controls.length<=50?payload.controls:[];
  if(!Array.isArray(payload.controls)||payload.controls.length>50)
    warn("CONTROL_COLLECTION_INVALID");
  if(entries.some(x=>!object(x)||!allowedControls.has(String(x.control))))
    warn("UNKNOWN_OR_MALFORMED_CONTROL");
  const pending:R17Control[]=[];
  for(const control of REQUIRED_R17_CONTROLS){
    const matches=entries.filter(x=>object(x)&&x.control===control);
    if(matches.length!==1){warn("MISSING_OR_DUPLICATE_CONTROL:"+control);pending.push(control);continue;}
    const entry=matches[0] as Record<string,unknown>;
    if(!text(entry.requiredRole)||!text(entry.observation))warn("ROLE_OR_OBSERVATION_INVALID:"+control);
    if(entry.ownerUserId!==null||entry.mandateRef!==null||entry.ownerAccepted!==false||
       entry.liveAuthorityVerified!==false||entry.reviewStatus!=="UNVERIFIED"){
      warn("UNVERIFIED_OWNER_IMPROPERLY_PROMOTED:"+control);
    }
    if(entry.evidenceCandidate!==null && !text(entry.evidenceCandidate))
      warn("EVIDENCE_CANDIDATE_INVALID:"+control);
    if(AUTHORITY_CONTROLS.has(control)&&typeof entry.evidenceCandidate==="string"&&
       Object.hasOwn(FORKS,entry.evidenceCandidate)&&
       entry.evidenceCandidate!=="Believers-common-group/mcp-node-synnergyze")
      warn("UPSTREAM_SDK_FORK_CANNOT_ESTABLISH_AUTHORITY:"+control);
    pending.push(control);
  }
  return Object.freeze({
    schema:"AUTHORITY-REFERENCE-OWNER-AUDIT-001/R2.0",
    state:"HOLD",executionAllowed:false,deployAllowed:false,
    ownerMandatesVerified:false,liveIssuerVerified:false,
    ownerAppointmentCount:0 as const,
    completeUnappointedRegister:issues.length===0,
    integrityIssues:Object.freeze(issues),
    pendingControls:Object.freeze(pending),
  });
}
