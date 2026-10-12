import { admissionClaimsDigest, inspectOfflineAdmissionChainV1,
  type OfflineAdmissionBundleV1, type SignedAdmissionEvidenceV1 } from "./authority-reference-admission-chain.ts";
import { inspectPinnedIssuerDirectoryR12, verifyProofAgainstDirectoryR12,
  type SignedIssuerDirectoryR12, type PinnedOfflineRootR12 } from "./authority-reference-issuer-registry.ts";
import { OfflineNonceLedgerR12 } from "./authority-reference-replay-ledger.ts";

/** R1.2 offline fixture end-to-end verification; never authorises live execution. */
export interface TripleProofFixtureR12 {
  r11: OfflineAdmissionBundleV1;
  digitalme: SignedAdmissionEvidenceV1;
  issuerDirectory: SignedIssuerDirectoryR12;
  pinnedTestRoot: PinnedOfflineRootR12;
}
export interface TripleProofResultR12 {
  schema:"AUTHORITY-REFERENCE-TRIPLE-ISSUER-PREFLIGHT-001/R1.2";
  state:"HOLD";
  executionAllowed:false;
  authoritativeAdmission:false;
  actualRiverReceiptVerified:false;
  oneTimeProductionPermitConsumed:false;
  localFixtureSignaturesValid:boolean;
  offlineReplayReservationCreated:boolean;
  reasons:readonly string[];
}
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const value=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.trim()===v;
const instant=(v:unknown):number=>{
 if(!value(v)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v))return NaN;
 const ms=Date.parse(v);return Number.isFinite(ms)?ms:NaN;
};
export async function verifyAndReserveOfflineTripleProofR12(
  input:unknown, ledger:OfflineNonceLedgerR12
):Promise<TripleProofResultR12>{
  const reasons:string[]=[];
  const fail=(reason:string)=>{if(!reasons.includes(reason))reasons.push(reason);};
  const finish=(ok:boolean,reserved:boolean):TripleProofResultR12=>({
    schema:"AUTHORITY-REFERENCE-TRIPLE-ISSUER-PREFLIGHT-001/R1.2",
    state:"HOLD",executionAllowed:false,authoritativeAdmission:false,
    actualRiverReceiptVerified:false,oneTimeProductionPermitConsumed:false,
    localFixtureSignaturesValid:ok,offlineReplayReservationCreated:reserved,
    reasons:[...reasons,"OFFLINE_TEST_CANNOT_GRANT_ESTATE_AUTHORITY",
      "WORKER_BUILD_AND_LIVE_RIVER_RECEIPTS_NOT_VERIFIED",
      "PRODUCTION_DISTRIBUTED_REPLAY_LEDGER_NOT_CONNECTED"]
  });
  if(!obj(input)||!obj(input.r11)||!obj(input.digitalme)||!obj(input.issuerDirectory)||
     !obj(input.pinnedTestRoot)||!(ledger instanceof OfflineNonceLedgerR12)){
    fail("TRIPLE_PROOF_INPUT_INVALID");return finish(false,false);
  }
  const i=input as unknown as TripleProofFixtureR12;
  const now=i.r11.evaluatedAt;
  const directory=inspectPinnedIssuerDirectoryR12(i.issuerDirectory,i.pinnedTestRoot,now);
  if(!directory.directoryCryptographicallyConsistent){
    fail("INDEPENDENT_PINNED_ISSUER_DIRECTORY_INVALID");return finish(false,false);
  }
  if(!i.r11.preview || i.r11.preview.state!=="HOLD" ||
     i.r11.preview.executionAllowed!==false) {
    fail("NATIVE_PROGRAM_MUST_REMAIN_HOLD");return finish(false,false);
  }
  const dValid=verifyProofAgainstDirectoryR12(i.digitalme,"digitalme",i.issuerDirectory,now);
  const wValid=verifyProofAgainstDirectoryR12(i.r11.warden,"warden",i.issuerDirectory,now);
  const rValid=verifyProofAgainstDirectoryR12(i.r11.river,"river",i.issuerDirectory,now);
  if(!dValid)fail("DIGITALME_DIRECTORY_SIGNATURE_INVALID");
  if(!wValid)fail("WARDEN_DIRECTORY_SIGNATURE_INVALID");
  if(!rValid)fail("RIVER_DIRECTORY_SIGNATURE_INVALID");
  if(reasons.length)return finish(false,false);
  const d=i.digitalme.claims, w=i.r11.warden.claims, r=i.r11.river.claims;
  const ev=i.r11.preview.bundle.events[0];
  const prog=i.r11.preview.bundle.program;
  const nonce=d.nonce;
  const shared=typeof nonce==="string"&&/^[A-Za-z0-9._:-]{16,160}$/.test(nonce) &&
    w.nonce===nonce && r.nonce===nonce &&
    d.purpose==="OFFLINE_REFERENCE_IDENTITY" &&
    d.requestRef===i.r11.requestRef &&
    d.actorRef===ev.actorRef && d.contextRef===ev.contextRef &&
    d.programRef===prog.programRef && d.eventRef===ev.eventRef &&
    d.capabilityRef===ev.capabilityRef && d.candidateDigest===i.r11.preview.candidateDigest &&
    d.workerBindingDigest===i.r11.workerBindingDigest &&
    w.digitalmeProofDigest===admissionClaimsDigest(d) &&
    r.digitalmeProofDigest===admissionClaimsDigest(d);
  if(!shared)fail("DIGITALME_WARDEN_RIVER_NONCE_OR_SCOPE_MISMATCH");
  const nowMs=instant(now),start=instant(d.notBefore),end=instant(d.expiresAt);
  if(![nowMs,start,end].every(Number.isFinite)||start>nowMs||nowMs>end||
     end<=start||end-start>15*60*1000)fail("DIGITALME_ASSERTION_TIME_INVALID");

  // Reconstruct R1.1 trust from the verified root-signed directory, not from caller-supplied R1.1 trust.
  const rootTrust={
    schema:"SYNNERGYZE-OFFLINE-ADMISSION-TRUST-001/R1.1" as const,
    mode:"TEST_FIXTURE_ONLY" as const,
    warden:{issuerId:i.issuerDirectory.issuers.warden.issuerId,
      keys:Object.fromEntries(i.issuerDirectory.issuers.warden.keys
        .filter(k=>k.status==="ACTIVE").map(k=>[k.keyId,k.publicKeyPem])),
      revokedKeyIds:i.issuerDirectory.issuers.warden.keys
        .filter(k=>k.status==="REVOKED").map(k=>k.keyId)},
    river:{issuerId:i.issuerDirectory.issuers.river.issuerId,
      keys:Object.fromEntries(i.issuerDirectory.issuers.river.keys
        .filter(k=>k.status==="ACTIVE").map(k=>[k.keyId,k.publicKeyPem])),
      revokedKeyIds:i.issuerDirectory.issuers.river.keys
        .filter(k=>k.status==="REVOKED").map(k=>k.keyId)},
  };
  const r11=inspectOfflineAdmissionChainV1({...i.r11,trust:rootTrust});
  const checks=r11.cryptographicFixtureChecks;
  if(!checks.wardenSignatureValid||!checks.riverSignatureValid||
     !checks.claimsBoundToNativeDraft||!checks.crossReceiptBindingValid)
     fail("R11_EXACT_WARDEN_RIVER_BINDING_FAILED");
  if(reasons.length)return finish(false,false);
  const reservation=await ledger.reserve({
    namespace:i.pinnedTestRoot.namespace,nonce:nonce as string,
    requestDigest:admissionClaimsDigest({
      digitalme:admissionClaimsDigest(d),warden:admissionClaimsDigest(w),
      river:admissionClaimsDigest(r),worker:i.r11.workerBindingDigest,
      candidate:i.r11.preview.candidateDigest,
    }),
  });
  if(!reservation.reserved)fail(reservation.reason);
  // Successful *offline* reservation remains an explicit non-production HOLD.
  return finish(true,reservation.reserved);
}
