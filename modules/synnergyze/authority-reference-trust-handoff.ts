import { createHash } from "node:crypto";

/** R1.7 source-only, never-authorising evidence handoff for independent reviewers. */
export const REQUIRED_R17_CONTROLS = [
  "WORKER_BUILD", "RUNTIME_DEPLOYMENT", "DIGITALME_DELEGATION", "BNR_DOOR",
  "GENESIS_CAPACITY", "WARDEN_POLICY", "WARDEN_ADMISSION", "RIVER_ADMISSION",
  "REPLAY_LEDGER", "SOURCE_EGRESS", "RIVER_EXECUTION", "AUDIT_ANCHOR",
  "PRODUCTION_COMMISSIONING",
] as const;
export type R17Control = (typeof REQUIRED_R17_CONTROLS)[number];
export type R17EvidenceClassification =
  "MISSING" | "UNTRUSTED" | "SCOPE_MISMATCH" | "STALE" | "DUPLICATE" | "PRESENT_UNVERIFIED";
export interface R17Candidate {
  schema: "AUTHORITY-REFERENCE-R17-CANDIDATE-001";
  environment: "STAGING_REVIEW";
  repository: string;
  commitSha: string;
  artifactDigest: string;
  deploymentId: string;
  workerId: string;
  requestRef: string;
  requestDigest: string;
  capability: string;
  actorRef: string;
  tenantRef: string;
  doorRef: string;
  arkRef: string;
  genesisRef: string;
  sourceAuthorityRef: string;
  purpose: string;
}
export interface R17ClaimedEvidence {
  control: R17Control;
  evidenceRef: string;
  issuerRef: string;
  sourceClass: "DIRECT_AUTHORITY_EXPORT" | "SELF_DECLARED" | "TEST_FIXTURE";
  digest: string;
  observedAt: string;
  validUntil: string;
  binding: Pick<R17Candidate, "commitSha" | "artifactDigest" | "deploymentId" |
    "workerId" | "requestRef" | "requestDigest" | "capability" | "actorRef" |
    "tenantRef" | "doorRef" | "arkRef" | "genesisRef" | "sourceAuthorityRef" | "purpose">;
  // Deliberately ignored: trust must come from a separately authenticated system.
  verified?: boolean;
  approved?: boolean;
}
export interface R17EvidenceReviewResult {
  schema: "AUTHORITY-REFERENCE-R17-TRUST-REVIEW-001";
  state: "HOLD";
  commissioningAuthorized: false;
  executeAllowed: false;
  externalSourceAccessAllowed: false;
  actualIssuerTrustVerified: false;
  liveRiverAdmissionVerified: false;
  liveRiverExecutionVerified: false;
  candidateDigest: string | null;
  checks: Readonly<Record<R17Control, R17EvidenceClassification>>;
  reasonCodes: readonly string[];
  reviewQueue: readonly {control:R17Control; requiredIndependentOwner:string}[];
}
const CONTROL_OWNER: Readonly<Record<R17Control,string>> = {
  WORKER_BUILD: "Independent build/release custodian",
  RUNTIME_DEPLOYMENT: "Runtime operator and independent deployment auditor",
  DIGITALME_DELEGATION: "DigitalMe identity issuer",
  BNR_DOOR: "BNR Door admission authority",
  GENESIS_CAPACITY: "Genesis capacity registrar",
  WARDEN_POLICY: "Warden policy owner",
  WARDEN_ADMISSION: "Warden admission signer",
  RIVER_ADMISSION: "RiverOS admission receipt issuer",
  REPLAY_LEDGER: "Independent ledger/database operator",
  SOURCE_EGRESS: "Source access and privacy approver",
  RIVER_EXECUTION: "RiverOS execution receipt issuer",
  AUDIT_ANCHOR: "Independent external audit custodian",
  PRODUCTION_COMMISSIONING: "Explicitly mandated commissioning authority",
};
const isObject = (x:unknown):x is Record<string,unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const nonblank = (x:unknown):x is string =>
  typeof x === "string" && x.length > 0 && x.length < 512 && x.trim() === x;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const TOOL = /^authority_reference\.(discover|retrieve_public|verify|reference)$/;
const BINDING_FIELDS = ["commitSha", "artifactDigest", "deploymentId", "workerId",
  "requestRef", "requestDigest", "capability", "actorRef", "tenantRef", "doorRef",
  "arkRef", "genesisRef", "sourceAuthorityRef", "purpose"] as const;
const CRITICAL_INDEPENDENT = ["DIGITALME_DELEGATION","BNR_DOOR","GENESIS_CAPACITY",
  "WARDEN_ADMISSION","RIVER_ADMISSION","AUDIT_ANCHOR",
  "PRODUCTION_COMMISSIONING"] as const;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function millis(x:unknown):number {
  if (!nonblank(x) || !ISO.test(x)) return NaN;
  const d=Date.parse(x);
  return Number.isFinite(d) && new Date(d).toISOString().slice(0,10)===x.slice(0,10) ? d : NaN;
}
function sorted(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (isObject(value)) return Object.fromEntries(
    Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,sorted(v)]));
  return value;
}
function candidateValid(x:unknown):x is R17Candidate {
  if (!isObject(x) || x.schema !== "AUTHORITY-REFERENCE-R17-CANDIDATE-001" ||
      x.environment !== "STAGING_REVIEW" || !SHA.test(String(x.commitSha)) ||
      !DIGEST.test(String(x.artifactDigest)) || !DIGEST.test(String(x.requestDigest)) ||
      !TOOL.test(String(x.capability))) return false;
  for (const k of ["repository","deploymentId","workerId","requestRef","actorRef",
    "tenantRef","doorRef","arkRef","genesisRef","sourceAuthorityRef","purpose"])
    if (!nonblank(x[k])) return false;
  return true;
}
function digest(x:unknown):string {
  return "sha256:"+createHash("sha256").update(JSON.stringify(sorted(x))).digest("hex");
}

/** Does not validate claimed issuer signatures or grant execution rights. */
export function assessR17EvidenceHandoff(input:unknown, evaluatedAt:string):R17EvidenceReviewResult {
  const reasons:string[]=[];
  const reason=(value:string)=>{if(!reasons.includes(value))reasons.push(value);};
  const c=isObject(input)?input.candidate:undefined;
  const proofs=isObject(input)?input.evidence:undefined;
  const valid=candidateValid(c);
  const now=millis(evaluatedAt);
  if (!valid) reason("CANDIDATE_SCOPE_INVALID");
  if (!Number.isFinite(now)) reason("EVALUATION_TIME_INVALID");
  if (!Array.isArray(proofs) || proofs.length>64) reason("EVIDENCE_COLLECTION_INVALID");
  const checks={} as Record<R17Control,R17EvidenceClassification>;
  const inputProofs=Array.isArray(proofs) && proofs.length<=64 ? proofs : [];
  if (inputProofs.some(x=>!isObject(x)||!REQUIRED_R17_CONTROLS.includes(x.control as R17Control)))
    reason("UNKNOWN_EVIDENCE_CONTROL");
  const evidenceRefs=new Set<string>();
  for (const item of inputProofs) {
    if (!isObject(item) || !nonblank(item.evidenceRef)) continue;
    if (evidenceRefs.has(item.evidenceRef)) reason("DUPLICATE_EVIDENCE_REFERENCE");
    evidenceRefs.add(item.evidenceRef);
  }
  for (const control of REQUIRED_R17_CONTROLS) {
    const items=inputProofs.filter((x):x is R17ClaimedEvidence=>isObject(x)&&x.control===control);
    if (!items.length) {checks[control]="MISSING";reason("MISSING:"+control);continue;}
    if (items.length!==1) {checks[control]="DUPLICATE";reason("DUPLICATE:"+control);continue;}
    const x=items[0];
    if (!nonblank(x.evidenceRef) || !nonblank(x.issuerRef) ||
        !DIGEST.test(String(x.digest)) ||
        x.sourceClass!=="DIRECT_AUTHORITY_EXPORT" || !isObject(x.binding)) {
      checks[control]="UNTRUSTED";reason("UNTRUSTED:"+control);continue;
    }
    if (!valid || BINDING_FIELDS.some(k=>x.binding[k]!==c[k])) {
      checks[control]="SCOPE_MISMATCH";reason("SCOPE_MISMATCH:"+control);continue;
    }
    const from=millis(x.observedAt),to=millis(x.validUntil);
    if (![now,from,to].every(Number.isFinite) || from>now || to<now || to<=from ||
        to-from>24*60*60*1000) {
      checks[control]="STALE";reason("STALE:"+control);continue;
    }
    checks[control]="PRESENT_UNVERIFIED";
  }
  // Separate control domains may require different issuers; identical role names are not identity proofs.
  const claimedIssuers=new Set<string>();
  for (const control of CRITICAL_INDEPENDENT) {
    const p=inputProofs.filter((x):x is R17ClaimedEvidence=>isObject(x)&&x.control===control);
    if(p.length!==1 || !nonblank(p[0].issuerRef))continue;
    if(claimedIssuers.has(p[0].issuerRef)) reason("CONTROL_DOMAINS_NOT_INDEPENDENT");
    claimedIssuers.add(p[0].issuerRef);
  }
  reason("ISSUER_SIGNATURES_NOT_INDEPENDENTLY_VERIFIED");
  reason("AUTHORITY_SERVICE_REVOCATION_NOT_CHECKED");
  reason("NO_ATOMIC_CONSUMPTION_OF_PRODUCTION_PERMIT");
  reason("PRODUCTION_RELEASE_APPROVAL_NOT_ESTABLISHED");
  return {
    schema:"AUTHORITY-REFERENCE-R17-TRUST-REVIEW-001",state:"HOLD",
    commissioningAuthorized:false,executeAllowed:false,
    externalSourceAccessAllowed:false,actualIssuerTrustVerified:false,
    liveRiverAdmissionVerified:false,liveRiverExecutionVerified:false,
    candidateDigest:valid?digest(Object.fromEntries(["schema", "environment", "repository", ...BINDING_FIELDS].map(k=>[k,c[k]]))):null,
    checks,reasonCodes:reasons,
    reviewQueue:REQUIRED_R17_CONTROLS.map(control=>({control,requiredIndependentOwner:CONTROL_OWNER[control]})),
  };
}