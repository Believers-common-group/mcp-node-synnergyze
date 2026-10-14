import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileAuthorityReferencePreviewV1 } from "./authority-reference-preview.ts";
import {
 admissionClaimsDigest, canonicalAdmissionProofMessage,
 type OfflineAdmissionBundleV1, type SignedAdmissionEvidenceV1,
} from "./authority-reference-admission-chain.ts";
import { directoryCanonicalMessage, inspectPinnedIssuerDirectoryR12,
 pinnedSpkiDigest, verifyProofAgainstDirectoryR12,
 type PinnedOfflineRootR12, type SignedIssuerDirectoryR12 } from "./authority-reference-issuer-registry.ts";
import { OfflineNonceLedgerR12 } from "./authority-reference-replay-ledger.ts";
import { verifyAndReserveOfflineTripleProofR12 } from "./authority-reference-triple-issuer.ts";

const NOW="2026-10-13T00:00:00.000Z";
function fixture(){
 const keys={root:generateKeyPairSync("ed25519"),digitalme:generateKeyPairSync("ed25519"),
   warden:generateKeyPairSync("ed25519"),river:generateKeyPairSync("ed25519")};
 const pem=(role:keyof typeof keys)=>
   keys[role].publicKey.export({format:"pem",type:"spki"}).toString();
 const preview=compileAuthorityReferencePreviewV1({
  operation:"retrieve_public",mode:"STAGING_REVIEW",actorRef:"DIGITALME-TEST-001",
  contextRef:"ESTATE-STAGING",correlationId:"CORR-001",sourceExpressionRef:"EXPR-001",
  sourceAuthorityRef:"PRGI-DECLARED",recordRef:"RECORD-TEST-001",
  observedAt:"2026-10-12T23:50:00.000Z",claimedEventDate:"2016-10-11"
 });
 const event=preview.bundle.events[0],program=preview.bundle.program;
 const workerBindingDigest="sha256:"+"a".repeat(64),requestRef="REQUEST-TEST-001";
 const nonce="unique-staging-nonce-00001";
 const dClaims={
   purpose:"OFFLINE_REFERENCE_IDENTITY",requestRef,actorRef:event.actorRef,
   contextRef:event.contextRef,programRef:program.programRef,eventRef:event.eventRef,
   capabilityRef:event.capabilityRef,candidateDigest:preview.candidateDigest,
   workerBindingDigest,nonce,notBefore:"2026-10-12T23:55:00.000Z",
   expiresAt:"2026-10-13T00:05:00.000Z"
 };
 const digitalme:SignedAdmissionEvidenceV1={
  schema:"SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1",
  issuerId:"TEST-DIGITALME",keyId:"d1",algorithm:"Ed25519",claims:dClaims,signatureBase64:""
 };
 const wClaims={
  decision:"ALLOW",decisionRef:"WARDEN-TEST-DECISION-001",requestRef,
  actorRef:event.actorRef,contextRef:event.contextRef,
  programRef:program.programRef,eventRef:event.eventRef,correlationId:event.correlationId,
  capabilityRef:event.capabilityRef,action:event.action,targetRef:event.targetRef,
  candidateDigest:preview.candidateDigest,compilationDigest:program.compilationDigest,
  workerBindingDigest,actionTokenDigest:"sha256:"+"b".repeat(64),
  nonce,digitalmeProofDigest:admissionClaimsDigest(dClaims),
  issuedAt:"2026-10-12T23:56:00.000Z",expiresAt:"2026-10-13T00:05:00.000Z",
 };
 const warden:SignedAdmissionEvidenceV1={
  schema:"SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1",
  issuerId:"TEST-WARDEN",keyId:"w1",algorithm:"Ed25519",claims:wClaims,signatureBase64:""
 };
 const rClaims={
  receiptType:"ADMISSION",state:"ACCEPTED",receiptRef:"TEST-RIVER-RECEIPT-001",
  requestRef,wardenDecisionRef:wClaims.decisionRef,
  wardenDecisionDigest:admissionClaimsDigest(wClaims),
  actionTokenDigest:wClaims.actionTokenDigest,workerBindingDigest,
  candidateDigest:preview.candidateDigest,programRef:program.programRef,
  eventRef:event.eventRef,correlationId:event.correlationId,nonce,
  digitalmeProofDigest:admissionClaimsDigest(dClaims),acceptedAt:"2026-10-12T23:58:00.000Z",
 };
 const river:SignedAdmissionEvidenceV1={
  schema:"SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1",
  issuerId:"TEST-RIVER",keyId:"r1",algorithm:"Ed25519",claims:rClaims,signatureBase64:""
 };
 const resignD=()=>{digitalme.signatureBase64=sign(null,
  Buffer.from(canonicalAdmissionProofMessage(digitalme)),keys.digitalme.privateKey).toString("base64");};
 const resignW=()=>{warden.signatureBase64=sign(null,
  Buffer.from(canonicalAdmissionProofMessage(warden)),keys.warden.privateKey).toString("base64");};
 const resignR=()=>{river.signatureBase64=sign(null,
  Buffer.from(canonicalAdmissionProofMessage(river)),keys.river.privateKey).toString("base64");};
 resignD();resignW();resignR();
 const r11:OfflineAdmissionBundleV1={
  preview,requestRef,workerBindingDigest,digitalme:undefined,
  warden,river,evaluatedAt:NOW,
  trust:{schema:"SYNNERGYZE-OFFLINE-ADMISSION-TRUST-001/R1.1",mode:"TEST_FIXTURE_ONLY",
   warden:{issuerId:"TEST-WARDEN",keys:{w1:pem("warden")},revokedKeyIds:[]},
   river:{issuerId:"TEST-RIVER",keys:{r1:pem("river")},revokedKeyIds:[]},
  }
 } as OfflineAdmissionBundleV1;
 const since="2026-10-12T23:30:00.000Z",until="2026-10-13T00:20:00.000Z";
 const active=(keyId:string,publicKeyPem:string)=>({keyId,publicKeyPem,status:"ACTIVE" as const,
   notBefore:since,notAfter:until});
 const issuerDirectory:SignedIssuerDirectoryR12={
  schema:"AUTHORITY-REFERENCE-ISSUER-DIRECTORY-001/R1.2",
  namespace:"OFFLINE-TEST-NAMESPACE-001",generation:3,
  issuedAt:"2026-10-12T23:50:00.000Z",expiresAt:"2026-10-13T00:15:00.000Z",
  issuers:{
   digitalme:{issuerId:"TEST-DIGITALME",keys:[active("d1",pem("digitalme"))]},
   warden:{issuerId:"TEST-WARDEN",keys:[active("w1",pem("warden"))]},
   river:{issuerId:"TEST-RIVER",keys:[active("r1",pem("river"))]},
  },signatureBase64:"",
 };
 const resignDirectory=()=>{
  const {signatureBase64:ignored,...unsigned}=issuerDirectory;
  void ignored;
  issuerDirectory.signatureBase64=sign(null,Buffer.from(directoryCanonicalMessage(unsigned)),
    keys.root.privateKey).toString("base64");
 };
 resignDirectory();
 const pinnedTestRoot:PinnedOfflineRootR12={
  mode:"TEST_FIXTURE_ONLY",namespace:"OFFLINE-TEST-NAMESPACE-001",
  rootPublicKeyPem:pem("root"),rootSpkiSha256:pinnedSpkiDigest(pem("root")),
  minimumGeneration:3,
 };
 const input={r11,digitalme,issuerDirectory,pinnedTestRoot};
 return {input,keys,resignD,resignW,resignR,resignDirectory};
}
async function withLedger(action:(ledger:OfflineNonceLedgerR12)=>Promise<void>){
 const root=await mkdtemp(path.join(tmpdir(),"authority-r12-"));
 try{await action(new OfflineNonceLedgerR12(root));}finally{await rm(root,{force:true,recursive:true});}
}
const verifyTrip=(x:ReturnType<typeof fixture>,ledger:OfflineNonceLedgerR12)=>
 verifyAndReserveOfflineTripleProofR12(x.input,ledger);
describe("R1.2 independently pinned offline issuer directory",()=>{
 it("verifies three independent signer roles and stays HOLD",()=>{
  const f=fixture(),r=inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,
    f.input.pinnedTestRoot,NOW);
  expect(r.rootSignatureVerified).toBe(true);
  expect(r.directoryCryptographicallyConsistent).toBe(true);
  expect(r.authoritativeEstateTrust).toBe(false);
  for(const [role,proof] of [["digitalme",f.input.digitalme],["warden",f.input.r11.warden],
   ["river",f.input.r11.river]] as const)
   expect(verifyProofAgainstDirectoryR12(proof,role,f.input.issuerDirectory,NOW)).toBe(true);
 });
 it("rejects unsigned directory changes",()=>{
  const f=fixture();f.input.issuerDirectory.generation=4;
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .reasons).toContain("ROOT_SIGNATURE_INVALID");
 });
 it("rejects stale but correctly signed generation",()=>{
  const f=fixture();f.input.pinnedTestRoot.minimumGeneration=4;
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .reasons).toContain("REGISTRY_GENERATION_ROLLBACK");
 });
 it("rejects incorrect independently pinned root",()=>{
  const f=fixture();f.input.pinnedTestRoot.rootSpkiSha256="sha256:"+"f".repeat(64);
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .reasons).toContain("ROOT_PUBLIC_KEY_NOT_PINNED");
 });
 it("requires three issuer identities",()=>{
  const f=fixture();f.input.issuerDirectory.issuers.river.issuerId="TEST-WARDEN";
  f.resignDirectory();
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .reasons).toContain("ISSUER_ID_NOT_INDEPENDENT");
 });
 it("revocation prevents reuse of a previously valid key",()=>{
  const f=fixture();f.input.issuerDirectory.issuers.warden.keys[0].status="REVOKED";
  f.resignDirectory();
  expect(verifyProofAgainstDirectoryR12(f.input.r11.warden,"warden",f.input.issuerDirectory,NOW)).toBe(false);
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .reasons).toContain("NO_CURRENT_ACTIVE_ISSUER_KEY:warden");
 });
 it("supports an overlapping revoked old key and active new key",()=>{
  const f=fixture(),old=generateKeyPairSync("ed25519");
  f.input.issuerDirectory.issuers.warden.keys.push({
    keyId:"w0",publicKeyPem:old.publicKey.export({format:"pem",type:"spki"}).toString(),
    status:"REVOKED",notBefore:"2026-10-11T00:00:00.000Z",
    notAfter:"2026-10-14T00:00:00.000Z",
  });
  f.resignDirectory();
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .directoryCryptographicallyConsistent).toBe(true);
  expect(verifyProofAgainstDirectoryR12(f.input.r11.warden,"warden",f.input.issuerDirectory,NOW)).toBe(true);
 });
 it("rejects a public key used by multiple issuer roles",()=>{
  const f=fixture();f.input.issuerDirectory.issuers.river.keys[0].publicKeyPem=
   f.input.issuerDirectory.issuers.warden.keys[0].publicKeyPem;
  f.resignDirectory();
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,NOW)
    .reasons).toContain("ISSUER_KEYS_NOT_INDEPENDENT");
 });
 it("rejects a fully expired directory",()=>{
  const f=fixture();
  expect(inspectPinnedIssuerDirectoryR12(f.input.issuerDirectory,f.input.pinnedTestRoot,
   "2026-10-13T01:00:00.000Z").reasons).toContain("REGISTRY_TIME_INVALID");
 });
});
describe("R1.2 durable single-host test-only replay reservation",()=>{
 it("signatures and scopes can pass, only an offline nonce is reserved; execution stays HOLD",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();
   const v=await verifyTrip(f,ledger);
   expect(v.localFixtureSignaturesValid).toBe(true);
   expect(v.offlineReplayReservationCreated).toBe(true);
   expect(v.state).toBe("HOLD");
   expect(v.executionAllowed).toBe(false);
   expect(v.authoritativeAdmission).toBe(false);
   expect(v.actualRiverReceiptVerified).toBe(false);
   expect(v.oneTimeProductionPermitConsumed).toBe(false);
  });
 });
 it("duplicate identical request is rejected without resetting ledger",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();
   expect((await verifyTrip(f,ledger)).offlineReplayReservationCreated).toBe(true);
   const second=await verifyTrip(f,ledger);
   expect(second.offlineReplayReservationCreated).toBe(false);
   expect(second.reasons).toContain("STAGING_NONCE_ALREADY_SPENT");
  });
 });
 it("two concurrent reservations cannot both succeed",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();
   const r=await Promise.all([verifyTrip(f,ledger),verifyTrip(f,ledger)]);
   expect(r.filter(x=>x.offlineReplayReservationCreated)).toHaveLength(1);
   expect(r.every(x=>x.executionAllowed===false)).toBe(true);
  });
 });
 it("same nonce, distinct request digest is still rejected",async()=>{
  await withLedger(async ledger=>{
   const nonce="unique-staging-nonce-00001";
   const a=await ledger.reserve({namespace:"OFFLINE-TEST-NAMESPACE-001",nonce,
     requestDigest:"sha256:"+"a".repeat(64)});
   const b=await ledger.reserve({namespace:"OFFLINE-TEST-NAMESPACE-001",nonce,
     requestDigest:"sha256:"+"b".repeat(64)});
   expect(a.reserved).toBe(true);expect(b.reserved).toBe(false);
   expect(b.reason).toBe("STAGING_NONCE_ALREADY_SPENT");
  });
 });
 it("nonce is still spent after ledger instance is reconstructed",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();
   expect((await verifyTrip(f,ledger)).offlineReplayReservationCreated).toBe(true);
   const another=new OfflineNonceLedgerR12(ledger.rootDirectory);
   expect((await verifyTrip(f,another)).offlineReplayReservationCreated).toBe(false);
  });
 });
 it("failed identity validation does not spend the nonce",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();
   f.input.digitalme.claims.actorRef="SOMEONE-ELSE";f.resignD();
   const failed=await verifyTrip(f,ledger);
   expect(failed.offlineReplayReservationCreated).toBe(false);
   expect(failed.reasons).toContain("DIGITALME_WARDEN_RIVER_NONCE_OR_SCOPE_MISMATCH");
   f.input.digitalme.claims.actorRef="DIGITALME-TEST-001";f.resignD();
   expect((await verifyTrip(f,ledger)).offlineReplayReservationCreated).toBe(true);
  });
 });
 it("mismatched River nonce rejects without reservation",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();f.input.r11.river.claims.nonce="different-valid-nonce-001";f.resignR();
   const v=await verifyTrip(f,ledger);
   expect(v.reasons).toContain("DIGITALME_WARDEN_RIVER_NONCE_OR_SCOPE_MISMATCH");
   expect(v.offlineReplayReservationCreated).toBe(false);
  });
 });
 it("unsigned Warden alteration rejects before reservation",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();f.input.r11.warden.claims.requestRef="TAMPERED";
   const v=await verifyTrip(f,ledger);
   expect(v.reasons).toContain("WARDEN_DIRECTORY_SIGNATURE_INVALID");
   expect(v.offlineReplayReservationCreated).toBe(false);
  });
 });
 it("expired DigitalMe identity is not reserved even after correctly resigning",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();
   f.input.digitalme.claims.expiresAt="2026-10-12T23:59:00.000Z";f.resignD();
   f.input.r11.warden.claims.digitalmeProofDigest=admissionClaimsDigest(f.input.digitalme.claims);
   f.resignW();
   f.input.r11.river.claims.digitalmeProofDigest=admissionClaimsDigest(f.input.digitalme.claims);
   f.input.r11.river.claims.wardenDecisionDigest=admissionClaimsDigest(f.input.r11.warden.claims);
   f.resignR();
   const v=await verifyTrip(f,ledger);
   expect(v.reasons).toContain("DIGITALME_ASSERTION_TIME_INVALID");
   expect(v.offlineReplayReservationCreated).toBe(false);
  });
 });
 it("an insecure staging directory fails closed",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"authority-r12-insecure-"));
  try{
   if(process.platform==="win32")return;
   await chmod(dir,0o777);
   const ledger=new OfflineNonceLedgerR12(dir);
   const result=await ledger.reserve({namespace:"OFFLINE-TEST-NAMESPACE-001",
    nonce:"unique-staging-nonce-00001",requestDigest:"sha256:"+"a".repeat(64)});
   expect(result.reason).toBe("INSECURE_STAGING_LEDGER_DIRECTORY");
   expect(result.reserved).toBe(false);
  }finally{await rm(dir,{force:true,recursive:true});}
 });
 it("a file reservation stores no raw nonce or identity",async()=>{
  await withLedger(async ledger=>{
   const f=fixture();expect((await verifyTrip(f,ledger)).offlineReplayReservationCreated).toBe(true);
   const names=await import("node:fs/promises").then(fs=>fs.readdir(ledger.rootDirectory));
   expect(names).toHaveLength(1);
   const bytes=await readFile(path.join(ledger.rootDirectory,names[0]),"utf8");
   expect(bytes).not.toContain("unique-staging-nonce-00001");
   expect(bytes).not.toContain("DIGITALME-TEST-001");
  });
 });
});
