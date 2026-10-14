import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalAdmissionProofMessage, type SignedAdmissionEvidenceV1 } from "./authority-reference-admission-chain.ts";

/**
 * R1.2 offline, independently pinned ROOT signature over a scoped issuer directory.
 * An operator-supplied test root is NOT proof of an independently deployed estate PKI.
 * No live network calls, registry loading, authority promotion, or key installation.
 */
export type IssuerRoleR12 = "digitalme" | "warden" | "river";
export interface IssuerKeyR12 {
  keyId: string;
  publicKeyPem: string;
  status: "ACTIVE" | "REVOKED";
  notBefore: string;
  notAfter: string;
}
export interface RoleIssuerR12 { issuerId: string; keys: IssuerKeyR12[]; }
export interface SignedIssuerDirectoryR12 {
  schema: "AUTHORITY-REFERENCE-ISSUER-DIRECTORY-001/R1.2";
  namespace: string;
  generation: number;
  issuedAt: string;
  expiresAt: string;
  issuers: Record<IssuerRoleR12, RoleIssuerR12>;
  signatureBase64: string;
}
export interface PinnedOfflineRootR12 {
  mode: "TEST_FIXTURE_ONLY";
  namespace: string;
  rootPublicKeyPem: string;
  rootSpkiSha256: string;
  minimumGeneration: number;
}
export interface IssuerDirectoryAssessmentR12 {
  schema: "AUTHORITY-REFERENCE-ISSUER-DIRECTORY-RESULT-001/R1.2";
  state: "HOLD";
  authoritativeEstateTrust: false;
  rootSignatureVerified: boolean;
  directoryCryptographicallyConsistent: boolean;
  digest: string | null;
  reasons: readonly string[];
}
const ROLES: readonly IssuerRoleR12[] = ["digitalme","warden","river"];
const isObj=(x:unknown): x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const value=(x:unknown):x is string=>typeof x==="string"&&x.length>0&&x.trim()===x;
const safeId=(x:unknown):x is string=>value(x)&&/^[A-Za-z0-9._:-]{1,100}$/.test(x);
const sha=(x:unknown):x is string=>value(x)&&/^sha256:[0-9a-f]{64}$/.test(x);
const instant=(x:unknown):number=>{
  if(!value(x)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x))return NaN;
  const t=Date.parse(x);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x.slice(0,10)?t:NaN;
};
function stable(x:unknown):unknown {
  return Array.isArray(x)?x.map(stable):isObj(x)?
    Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
}
export function directoryCanonicalMessage(directory:Omit<SignedIssuerDirectoryR12,"signatureBase64">):string {
  return "AUTHORITY-REFERENCE-ISSUER-DIRECTORY-R1.2\n"+JSON.stringify(stable(directory));
}
function sha256(x:Buffer):string{return "sha256:"+createHash("sha256").update(x).digest("hex");}
export function pinnedSpkiDigest(pem:string):string{
  return sha256(createPublicKey(pem).export({format:"der",type:"spki"}) as Buffer);
}
function sigBytes(x:unknown):Buffer|null {
  if(!value(x)||!/^[A-Za-z0-9+/]+={0,2}$/.test(x))return null;
  const b=Buffer.from(x,"base64");return b.length===64&&b.toString("base64")===x?b:null;
}
function publicEd25519(pem:unknown):ReturnType<typeof createPublicKey>|null {
  if(typeof pem!=="string"||!pem.includes("-----BEGIN PUBLIC KEY-----"))return null;
  try{
    const k=createPublicKey(pem);return k.asymmetricKeyType==="ed25519"?k:null;
  }catch{return null;}
}
export function inspectPinnedIssuerDirectoryR12(
  unknownDirectory:unknown,unknownRoot:unknown,now:string
):IssuerDirectoryAssessmentR12 {
  const reasons:string[]=[];
  const fail=(r:string)=>{if(!reasons.includes(r))reasons.push(r);};
  const output=(signatureOk:boolean,digest:string|null):IssuerDirectoryAssessmentR12=>({
    schema:"AUTHORITY-REFERENCE-ISSUER-DIRECTORY-RESULT-001/R1.2",
    state:"HOLD",authoritativeEstateTrust:false,rootSignatureVerified:signatureOk,
    directoryCryptographicallyConsistent:signatureOk&&reasons.length===0,
    digest,reasons
  });
  if(!isObj(unknownDirectory)||!isObj(unknownRoot)){fail("REGISTRY_OR_ROOT_MISSING");return output(false,null);}
  const d=unknownDirectory,root=unknownRoot;
  const {signatureBase64,...unsigned}=d;
  const digest=sha256(Buffer.from(directoryCanonicalMessage(unsigned as Omit<SignedIssuerDirectoryR12,"signatureBase64">)));
  if(d.schema!=="AUTHORITY-REFERENCE-ISSUER-DIRECTORY-001/R1.2" ||
     !safeId(d.namespace)|| !Number.isSafeInteger(d.generation)|| (d.generation as number)<1)
     fail("REGISTRY_SCHEMA_INVALID");
  if(root.mode!=="TEST_FIXTURE_ONLY"||!safeId(root.namespace)||root.namespace!==d.namespace||
     !Number.isSafeInteger(root.minimumGeneration)|| (root.minimumGeneration as number)<1)
     fail("PINNED_ROOT_SCOPE_INVALID");
  if(Number.isSafeInteger(d.generation)&&Number.isSafeInteger(root.minimumGeneration)&&
     (d.generation as number)<(root.minimumGeneration as number))
     fail("REGISTRY_GENERATION_ROLLBACK");
  const date=instant(now),issued=instant(d.issuedAt),expires=instant(d.expiresAt);
  if(![date,issued,expires].every(Number.isFinite)||issued>date||date>expires||
     expires<=issued||expires-issued>24*60*60*1000)fail("REGISTRY_TIME_INVALID");
  if(!sha(root.rootSpkiSha256))fail("PINNED_ROOT_DIGEST_INVALID");
  const rootKey=publicEd25519(root.rootPublicKeyPem);
  if(!rootKey||!sha(root.rootSpkiSha256)|| (rootKey&&pinnedSpkiDigest(root.rootPublicKeyPem as string)!==root.rootSpkiSha256))
     fail("ROOT_PUBLIC_KEY_NOT_PINNED");
  const sig=sigBytes(signatureBase64);
  let signatureOk=false;
  if(rootKey&&sig)try{
    signatureOk=verify(null,Buffer.from(directoryCanonicalMessage(unsigned as Omit<SignedIssuerDirectoryR12,"signatureBase64">)),rootKey,sig);
  }catch{signatureOk=false;}
  if(!signatureOk)fail("ROOT_SIGNATURE_INVALID");
  const issuers=d.issuers;
  const issuerIds=new Set<string>(),keys=new Set<string>();
  if(!isObj(issuers)){fail("ISSUERS_MISSING");return output(signatureOk,digest);}
  for(const role of ROLES){
    const entry=issuers[role];
    if(!isObj(entry)||!safeId(entry.issuerId)||!Array.isArray(entry.keys)||
       entry.keys.length===0||entry.keys.length>16){fail("ISSUER_ROLE_INVALID:"+role);continue;}
    if(issuerIds.has(entry.issuerId as string))fail("ISSUER_ID_NOT_INDEPENDENT");
    issuerIds.add(entry.issuerId as string);
    const ids=new Set<string>();let hasActive=false;
    for(const item of entry.keys){
      if(!isObj(item)||!safeId(item.keyId)||ids.has(item.keyId as string)||
         !["ACTIVE","REVOKED"].includes(item.status as string)){
        fail("ISSUER_KEY_INVALID:"+role);continue;
      }
      ids.add(item.keyId as string);
      const key=publicEd25519(item.publicKeyPem);
      if(!key){fail("ISSUER_KEY_NOT_ED25519:"+role);continue;}
      const finger=sha256(key.export({format:"der",type:"spki"}) as Buffer);
      if(keys.has(finger))fail("ISSUER_KEYS_NOT_INDEPENDENT");
      keys.add(finger);
      const from=instant(item.notBefore),until=instant(item.notAfter);
      if(![from,until].every(Number.isFinite)||from>=until){fail("ISSUER_KEY_TIME_INVALID:"+role);continue;}
      if(item.status==="ACTIVE"&&from<=date&&date<=until)hasActive=true;
    }
    if(!hasActive)fail("NO_CURRENT_ACTIVE_ISSUER_KEY:"+role);
  }
  if(Object.keys(issuers).some(role=>!ROLES.includes(role as IssuerRoleR12)))
     fail("UNEXPECTED_ISSUER_ROLE");
  return output(signatureOk,digest);
}
export function verifyProofAgainstDirectoryR12(
  proof:SignedAdmissionEvidenceV1,role:IssuerRoleR12,directory:SignedIssuerDirectoryR12,now:string
):boolean{
  if(!ROLES.includes(role)||!isObj(proof)||proof.schema!=="SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1"||
     proof.algorithm!=="Ed25519"||!isObj(proof.claims))return false;
  const entry=directory.issuers?.[role],key=entry?.keys?.find(k=>k.keyId===proof.keyId);
  if(!entry||!key||proof.issuerId!==entry.issuerId||key.status!=="ACTIVE"||
     !Number.isFinite(instant(now))||instant(key.notBefore)>instant(now)||
     instant(key.notAfter)<instant(now))return false;
  const publicKey=publicEd25519(key.publicKeyPem),bytes=sigBytes(proof.signatureBase64);
  if(!publicKey||!bytes)return false;
  try{return verify(null,Buffer.from(canonicalAdmissionProofMessage(proof)),publicKey,bytes);}
  catch{return false;}
}
