import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compileAuthorityReferencePreviewV1 } from "./authority-reference-preview.ts";
import { admissionClaimsDigest, canonicalAdmissionProofMessage,
  inspectOfflineAdmissionChainV1, type OfflineAdmissionBundleV1,
  type SignedAdmissionEvidenceV1 } from "./authority-reference-admission-chain.ts";

const NOW = "2026-10-13T00:00:00.000Z";
function fixture() {
 const w = generateKeyPairSync("ed25519"), r = generateKeyPairSync("ed25519");
 const preview=compileAuthorityReferencePreviewV1({
   operation:"retrieve_public",mode:"STAGING_REVIEW",actorRef:"DIGITALME-TEST-001",
   contextRef:"ESTATE-STAGING",correlationId:"CORR-001",
   sourceExpressionRef:"EXPR-001",sourceAuthorityRef:"PRGI-DECLARED",
   recordRef:"RECORD-TEST-001",observedAt:"2026-10-12T23:50:00.000Z",
   claimedEventDate:"2016-10-11",
 });
 const p=preview.bundle.program, e=preview.bundle.events[0];
 const workerBindingDigest="sha256:"+ "c".repeat(64), requestRef="REQUEST-TEST-001";
 const wClaims={
  decision:"ALLOW",decisionRef:"WARDEN-TEST-DECISION-001",
  requestRef,actorRef:e.actorRef,contextRef:e.contextRef,
  programRef:p.programRef,eventRef:e.eventRef,correlationId:e.correlationId,
  capabilityRef:e.capabilityRef,action:e.action,targetRef:e.targetRef,
  candidateDigest:preview.candidateDigest,compilationDigest:p.compilationDigest,
  workerBindingDigest,actionTokenDigest:"sha256:"+ "d".repeat(64),
  issuedAt:"2026-10-12T23:55:00.000Z",expiresAt:"2026-10-13T00:05:00.000Z"
 };
 const rClaims={
   receiptType:"ADMISSION",state:"ACCEPTED",receiptRef:"RIVER-TEST-RECEIPT-001",
   requestRef,wardenDecisionRef:wClaims.decisionRef,
   wardenDecisionDigest:admissionClaimsDigest(wClaims),
   actionTokenDigest:wClaims.actionTokenDigest,workerBindingDigest,
   candidateDigest:preview.candidateDigest,programRef:p.programRef,
   eventRef:e.eventRef,correlationId:e.correlationId,
   acceptedAt:"2026-10-12T23:58:00.000Z"
 };
 const warden:SignedAdmissionEvidenceV1={schema:"SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1",
   issuerId:"TEST-WARDEN",keyId:"w1",algorithm:"Ed25519",claims:wClaims,signatureBase64:""};
 const river:SignedAdmissionEvidenceV1={schema:"SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1",
   issuerId:"TEST-RIVER",keyId:"r1",algorithm:"Ed25519",claims:rClaims,signatureBase64:""};
 const resignW=()=>warden.signatureBase64=sign(null,Buffer.from(canonicalAdmissionProofMessage(warden)),w.privateKey).toString("base64");
 const resignR=()=>river.signatureBase64=sign(null,Buffer.from(canonicalAdmissionProofMessage(river)),r.privateKey).toString("base64");
 resignW();resignR();
 const bundle:OfflineAdmissionBundleV1={
  preview,requestRef,workerBindingDigest,warden,river,
  evaluatedAt:NOW,
  trust:{schema:"SYNNERGYZE-OFFLINE-ADMISSION-TRUST-001/R1.1",mode:"TEST_FIXTURE_ONLY",
   warden:{issuerId:"TEST-WARDEN",keys:{w1:w.publicKey.export({type:"spki",format:"pem"}).toString()},revokedKeyIds:[]},
   river:{issuerId:"TEST-RIVER",keys:{r1:r.publicKey.export({type:"spki",format:"pem"}).toString()},revokedKeyIds:[]}}
 };
 return {bundle,resignW,resignR};
}
const inspect=(x:unknown)=>inspectOfflineAdmissionChainV1(x);
function assertHold(x:unknown,reason?:string){
 const result=inspect(x);
 expect(result.state).toBe("HOLD");
 expect(result.executionAllowed).toBe(false);
 expect(result.wardenAdmissionGranted).toBe(false);
 expect(result.riverLiveReceiptVerified).toBe(false);
 expect(result.oneTimePermitConsumed).toBe(false);
 expect(result.realWorkerAttested).toBe(false);
 if(reason) expect(result.reasons).toContain(reason);
 return result;
}
describe("R1.1 independent test signatures, exact scope and permanent HOLD",()=>{
 it("two fixture signatures verify yet do NOT authorize the worker",()=>{
  const x=fixture(),v=assertHold(x.bundle,"OFFLINE_FIXTURES_ARE_NOT_AUTHORISED_WARDEN_OR_RIVER");
  expect(v.cryptographicFixtureChecks).toEqual({
   wardenSignatureValid:true,riverSignatureValid:true,
   claimsBoundToNativeDraft:true,crossReceiptBindingValid:true,
  });
 });
 it("canonical signing and digest ignore object key ordering",()=>{
  expect(admissionClaimsDigest({b:2,a:{x:1,y:2}})).toBe(
   admissionClaimsDigest({a:{y:2,x:1},b:2}));
 });
 it("does not mutate any issuer or proof payload",()=>{
  const x=fixture(),before=structuredClone(x.bundle);
  assertHold(x.bundle);
  expect(x.bundle).toEqual(before);
 });
 const negative: Array<[string,(f:ReturnType<typeof fixture>)=>void,string]> = [
  ["unsigned Warden mutation",f=>{f.bundle.warden.claims.decisionRef="TAMPER"},"WARDEN_TEST_SIGNATURE_INVALID"],
  ["unsigned River mutation",f=>{f.bundle.river.claims.receiptRef="TAMPER"},"RIVER_TEST_SIGNATURE_INVALID"],
  ["revoked Warden signer",f=>f.bundle.trust.warden.revokedKeyIds.push("w1"),"WARDEN_TEST_SIGNATURE_INVALID"],
  ["revoked River signer",f=>f.bundle.trust.river.revokedKeyIds.push("r1"),"RIVER_TEST_SIGNATURE_INVALID"],
  ["untrusted Warden issuer",f=>f.bundle.warden.issuerId="OTHER","WARDEN_TEST_SIGNATURE_INVALID"],
  ["untrusted River issuer",f=>f.bundle.river.issuerId="OTHER","RIVER_TEST_SIGNATURE_INVALID"],
  ["wrong Warden request",f=>{f.bundle.warden.claims.requestRef="OTHER";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["wrong Warden actor",f=>{f.bundle.warden.claims.actorRef="OTHER";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["wrong Warden scope",f=>{f.bundle.warden.claims.capabilityRef="authority_reference.publish";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["different job digest",f=>{f.bundle.warden.claims.candidateDigest="sha256:"+"a".repeat(64);f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["different worker digest",f=>{f.bundle.warden.claims.workerBindingDigest="sha256:"+"a".repeat(64);f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["different target",f=>{f.bundle.warden.claims.targetRef="RECORD-OTHER";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["missing Warden grant",f=>{f.bundle.warden.claims.decision="DENY";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["expired Warden claim",f=>{f.bundle.warden.claims.expiresAt="2026-10-12T23:56:00.000Z";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["too-long Warden grant",f=>{f.bundle.warden.claims.expiresAt="2026-10-13T01:55:00.000Z";f.resignW()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["River receipt refers to different decision",f=>{f.bundle.river.claims.wardenDecisionRef="OTHER";f.resignR()}, "SIGNED_RIVER_RECEIPT_NOT_EXACTLY_BOUND"],
  ["River receipt digest changed",f=>{f.bundle.river.claims.wardenDecisionDigest="sha256:"+"a".repeat(64);f.resignR()}, "SIGNED_RIVER_RECEIPT_NOT_EXACTLY_BOUND"],
  ["River receipt worker changed",f=>{f.bundle.river.claims.workerBindingDigest="sha256:"+"b".repeat(64);f.resignR()}, "SIGNED_RIVER_RECEIPT_NOT_EXACTLY_BOUND"],
  ["River receipt not accepted",f=>{f.bundle.river.claims.state="PENDING";f.resignR()}, "SIGNED_RIVER_RECEIPT_NOT_EXACTLY_BOUND"],
  ["River receipt type mismatch",f=>{f.bundle.river.claims.receiptType="EXECUTION";f.resignR()}, "SIGNED_RIVER_RECEIPT_NOT_EXACTLY_BOUND"],
  ["River receipt from future",f=>{f.bundle.river.claims.acceptedAt="2026-10-13T00:01:00.000Z";f.resignR()}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["reclassified preview",f=>{(f.bundle.preview as {state:string}).state="AUTHORIZED"}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["different native event",f=>{(f.bundle.preview.bundle.events[0] as {eventRef:string}).eventRef="EVENT-OTHER"}, "SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT"],
  ["production trust mode",f=>{(f.bundle.trust as {mode:string}).mode="LIVE"}, "DISTINCT_OFFLINE_TRUST_ROOTS_REQUIRED"],
  ["same issuer",f=>{f.bundle.trust.river.issuerId="TEST-WARDEN"}, "DISTINCT_OFFLINE_TRUST_ROOTS_REQUIRED"],
  ["bad base64",f=>{f.bundle.river.signatureBase64="bad-signature"}, "RIVER_TEST_SIGNATURE_INVALID"],
 ];
 for(const [name,change,reason] of negative) it(name,()=>{
  const f=fixture();change(f);const r=assertHold(f.bundle,reason);
  expect(r.cryptographicFixtureChecks.wardenSignatureValid&&
    r.cryptographicFixtureChecks.riverSignatureValid&&
    r.cryptographicFixtureChecks.claimsBoundToNativeDraft&&
    r.cryptographicFixtureChecks.crossReceiptBindingValid).toBe(false);
 });
 it("rejects missing trust and malformed input",()=>{
  const f=fixture();(f.bundle as {trust:unknown}).trust=null;
  assertHold(f.bundle,"DISTINCT_OFFLINE_TRUST_ROOTS_REQUIRED");
  assertHold(null,"DISTINCT_OFFLINE_TRUST_ROOTS_REQUIRED");
 });
 it("untrusted caller-supplied authorization flag is ignored",()=>{
  const f=fixture();
  const result=assertHold({...f.bundle,admitted:true,live:true,riverVerified:true,executed:true});
  expect(result.wardenAdmissionGranted).toBe(false);
 });
});
