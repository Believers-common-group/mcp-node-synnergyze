import { createHash, createPublicKey, verify } from "node:crypto";
import {
  REQUIRED_R17_CONTROLS, assessR17EvidenceHandoff,
  type R17Candidate, type R17ClaimedEvidence, type R17Control,
} from "./authority-reference-trust-handoff.ts";

/**
 * R1.8 OFFLINE signature conformance only. Separately supplied pins are test
 * inputs, NOT independently established estate trust anchors. No network,
 * device access, live status, execution, permit consumption or issuer enrollment.
 */
export interface R18IssuerPin {
  issuerRef: string;
  keyId: string;
  publicKeyPem: string;
  spkiDigest: string;
  state: "ACTIVE" | "REVOKED";
  validFrom: string;
  validUntil: string;
}
export interface R18TestTrust {
  mode: "PINNED_OFFLINE_REVIEW_ONLY";
  namespace: string;
  generation: number;
  minimumGeneration: number;
  pins: Partial<Record<R17Control,R18IssuerPin>>;
}
export interface R18EvidenceAttestation {
  schema: "AUTHORITY-REFERENCE-EVIDENCE-PROOF-001/R1.8";
  namespace: string;
  generation: number;
  control: R17Control;
  issuerRef: string;
  keyId: string;
  candidateDigest: string;
  evidenceDigest: string;
  nonce: string;
  signedAt: string;
  expiresAt: string;
  signatureBase64: string;
}
export interface R18EvidencePacket {
  candidate: R17Candidate;
  evidence: R17ClaimedEvidence[];
  attestations: R18EvidenceAttestation[];
}
export type R18Check = "MISSING" | "STRUCTURAL_REJECT" | "PIN_REJECT" |
  "ATTESTATION_REJECT" | "OFFLINE_SIGNATURE_MATCH";
export interface R18ReviewResult {
  schema:"AUTHORITY-REFERENCE-R18-OFFLINE-ISSUER-REVIEW-001";
  state:"HOLD";
  executionAllowed:false;
  issuerAuthorityVerified:false;
  externalSourceAccessAllowed:false;
  permitConsumed:false;
  liveRiverReceiptsVerified:false;
  matchedOfflineSignatures:number;
  checks:Readonly<Record<R17Control,R18Check>>;
  reasonCodes:readonly string[];
}
const OBJ=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const TEXT=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<512&&v.trim()===v;
const HASH=/^sha256:[0-9a-f]{64}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CRITICAL=new Set<R17Control>([
  "DIGITALME_DELEGATION","BNR_DOOR","GENESIS_CAPACITY","WARDEN_ADMISSION",
  "RIVER_ADMISSION","AUDIT_ANCHOR","PRODUCTION_COMMISSIONING"
]);
function instant(x:unknown):number {
  if(!TEXT(x)||!ISO.test(x))return NaN;
  const time=Date.parse(x);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===x.slice(0,10)?time:NaN;
}
function canonical(value:unknown):unknown {
  return Array.isArray(value)?value.map(canonical):OBJ(value)?
    Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,v])=>[k,canonical(v)])):value;
}
function sha256(data:Buffer|string):string {
  return "sha256:"+createHash("sha256").update(data).digest("hex");
}
export function r18EvidenceDigest(e:R17ClaimedEvidence):string {
  // Caller-provided 'approved'/'verified' fields are deliberately excluded.
  return sha256(JSON.stringify(canonical({
    control:e.control,evidenceRef:e.evidenceRef,issuerRef:e.issuerRef,
    sourceClass:e.sourceClass,digest:e.digest,observedAt:e.observedAt,
    validUntil:e.validUntil,binding:e.binding,
  })));
}
export function r18ProofMessage(proof:Omit<R18EvidenceAttestation,"signatureBase64">):string {
  return "AUTHORITY-REFERENCE-EVIDENCE-ATTESTATION-R1.8\n"+
    JSON.stringify(canonical(proof));
}
export function r18SpkiDigest(pem:string):string {
  return sha256(createPublicKey(pem).export({format:"der",type:"spki"}) as Buffer);
}
function signatureData(s:unknown):Buffer|null {
  if(!TEXT(s)||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))return null;
  const b=Buffer.from(s,"base64");
  return b.length===64&&b.toString("base64")===s?b:null;
}
function publicKeyOf(pin:R18IssuerPin) {
  try{
    if(!pin.publicKeyPem.includes("-----BEGIN PUBLIC KEY-----") ||
       !HASH.test(pin.spkiDigest)||r18SpkiDigest(pin.publicKeyPem)!==pin.spkiDigest)
      return null;
    const key=createPublicKey(pin.publicKeyPem);
    return key.asymmetricKeyType==="ed25519"?key:null;
  }catch{return null;}
}
export function assessR18PinnedEvidence(
  rawPacket:unknown,rawTrust:unknown,evaluatedAt:string
):R18ReviewResult {
  const reasons:string[]=[];
  const add=(reason:string)=>{if(!reasons.includes(reason))reasons.push(reason);};
  const checks={} as Record<R17Control,R18Check>;
  const packet=OBJ(rawPacket)?rawPacket:{};
  const trust=OBJ(rawTrust)?rawTrust:{};
  const ev=Array.isArray(packet.evidence)&&packet.evidence.length<=32?packet.evidence:[];
  const proofs=Array.isArray(packet.attestations)&&packet.attestations.length<=32?
    packet.attestations:[];
  const assessment=assessR17EvidenceHandoff(
    {candidate:packet.candidate,evidence:packet.evidence},evaluatedAt);
  const candidateDigest=assessment.candidateDigest;
  const now=instant(evaluatedAt);
  const pins=OBJ(trust.pins)?trust.pins:{};
  if(!TEXT(trust.namespace)||trust.mode!=="PINNED_OFFLINE_REVIEW_ONLY"||
     !Number.isSafeInteger(trust.generation)||!Number.isSafeInteger(trust.minimumGeneration)||
     Number(trust.generation)<1||Number(trust.minimumGeneration)<1 ||
     Number(trust.generation)<Number(trust.minimumGeneration))
    add("TRUST_SCOPE_OR_GENERATION_INVALID");
  if(!Array.isArray(packet.attestations)||packet.attestations.length>32)
    add("ATTESTATION_COLLECTION_INVALID");
  if(!Array.isArray(packet.evidence)||packet.evidence.length>32)
    add("EVIDENCE_COLLECTION_INVALID");
  if(!Number.isFinite(now))add("EVALUATION_TIME_INVALID");
  if(assessment.reasonCodes.includes("CANDIDATE_SCOPE_INVALID"))
    add("CANDIDATE_SCOPE_INVALID");
  if(assessment.reasonCodes.includes("CONTROL_DOMAINS_NOT_INDEPENDENT"))
    add("CONTROL_DOMAINS_NOT_INDEPENDENT");
  const nonceSet=new Set<string>(),keyDomains=new Map<string,R17Control>();
  let matched=0;
  for(const control of REQUIRED_R17_CONTROLS){
    const evidence=ev.filter(x=>OBJ(x)&&x.control===control);
    const attestations=proofs.filter(x=>OBJ(x)&&x.control===control);
    const suppliedPin=pins[control];
    if(evidence.length!==1||attestations.length!==1){
      checks[control]="MISSING";add("EVIDENCE_OR_SIGNATURE_MISSING_OR_DUPLICATE:"+control);continue;
    }
    if(assessment.checks[control]!=="PRESENT_UNVERIFIED"){
      checks[control]="STRUCTURAL_REJECT";
      add("R17_EVIDENCE_SCOPE_REJECTED:"+control);continue;
    }
    const e=evidence[0] as R17ClaimedEvidence;
    const a=attestations[0] as R18EvidenceAttestation;
    const pin=OBJ(suppliedPin)?suppliedPin as unknown as R18IssuerPin:null;
    if(!pin||!TEXT(pin.issuerRef)||!TEXT(pin.keyId)||
       pin.state!=="ACTIVE"||!TEXT(pin.publicKeyPem)||!TEXT(pin.spkiDigest)||
       pin.issuerRef!==e.issuerRef||pin.issuerRef!==a.issuerRef||
       pin.keyId!==a.keyId || !publicKeyOf(pin)||
       ![instant(pin.validFrom),instant(pin.validUntil),now].every(Number.isFinite)||
       instant(pin.validFrom)>now||instant(pin.validUntil)<now){
      checks[control]="PIN_REJECT";add("PIN_INVALID_OR_REVOKED:"+control);continue;
    }
    // Independently governed roles must not be aliases of the same signing key.
    const spki=pin.spkiDigest;
    if(CRITICAL.has(control)){
      if(keyDomains.has(spki) || [...keyDomains.entries()].some(([_,c])=>
          c!==control && (pins[c] as R18IssuerPin|undefined)?.issuerRef===pin.issuerRef)){
        checks[control]="PIN_REJECT";add("CRITICAL_ISSUER_NOT_INDEPENDENT:"+control);continue;
      }
      keyDomains.set(spki,control);
    }
    const {signatureBase64,...unsigned}=a;
    const sig=signatureData(signatureBase64);
    const issued=instant(a.signedAt),expiry=instant(a.expiresAt);
    if(a.schema!=="AUTHORITY-REFERENCE-EVIDENCE-PROOF-001/R1.8"||
       a.control!==control||a.namespace!==trust.namespace||
       a.generation!==trust.generation||
       a.candidateDigest!==candidateDigest||a.evidenceDigest!==r18EvidenceDigest(e)||
       !TEXT(a.nonce)||!(/^[A-Za-z0-9._:-]{16,128}$/.test(a.nonce))||
       nonceSet.has(a.nonce)||!sig||
       ![issued,expiry,now].every(Number.isFinite)||
       issued>now||now>expiry||expiry<=issued||expiry-issued>15*60*1000 ||
       expiry>instant(e.validUntil) || issued<instant(e.observedAt)){
      checks[control]="ATTESTATION_REJECT";add("ATTESTATION_SCOPE_OR_TIME_INVALID:"+control);continue;
    }
    nonceSet.add(a.nonce);
    let ok=false;
    try{
      const key=publicKeyOf(pin);
      if(key)ok=verify(null,Buffer.from(r18ProofMessage(unsigned)),key,sig);
    }catch{ok=false;}
    if(!ok){
      checks[control]="ATTESTATION_REJECT";add("SIGNATURE_INVALID:"+control);continue;
    }
    checks[control]="OFFLINE_SIGNATURE_MATCH";matched++;
  }
  // In-band public keys and a signed fixture cannot prove the provenance or
  // independent governance of issuer identities. No admission is produced.
  add("PUBLIC_KEY_PINS_NOT_PROVEN_FROM_INDEPENDENT_AUTHORITY");
  add("LIVE_REVOCATION_AND_DELEGATED_MANDATES_UNVERIFIED");
  add("WORKER_AND_LIVE_RIVER_RECEIPTS_NOT_AUTHENTICATED");
  add("DISTRIBUTED_PERMIT_CONSUMPTION_NOT_VERIFIED");
  add("PRODUCTION_APPROVAL_NOT_ESTABLISHED");
  return {
    schema:"AUTHORITY-REFERENCE-R18-OFFLINE-ISSUER-REVIEW-001",
    state:"HOLD",executionAllowed:false,issuerAuthorityVerified:false,
    externalSourceAccessAllowed:false,permitConsumed:false,
    liveRiverReceiptsVerified:false,matchedOfflineSignatures:matched,
    checks,reasonCodes:reasons,
  };
}
