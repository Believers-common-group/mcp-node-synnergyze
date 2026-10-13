import { generateKeyPairSync,sign } from "node:crypto";
import { describe,expect,it } from "vitest";
import { REQUIRED_R17_CONTROLS } from "./authority-reference-trust-handoff.ts";
import { assessR17EvidenceHandoff } from "./authority-reference-trust-handoff.ts";
import { assessR18PinnedEvidence,r18EvidenceDigest,r18ProofMessage,r18SpkiDigest } from "./authority-reference-r18-pinned-verification.ts";
const NOW="2026-10-13T06:00:00.000Z";
function fixture(){
 const candidate={
  schema:"AUTHORITY-REFERENCE-R17-CANDIDATE-001",environment:"STAGING_REVIEW",
  repository:"Believers-common-group/mcp-node-synnergyze",commitSha:"a".repeat(40),
  artifactDigest:"sha256:"+"b".repeat(64),deploymentId:"staging-001",
  workerId:"WORKER-001",requestRef:"REQUEST-001",requestDigest:"sha256:"+"c".repeat(64),
  capability:"authority_reference.retrieve_public",actorRef:"DIGITALME-TEST",
  tenantRef:"TENANT-TEST",doorRef:"DOOR-TEST",arkRef:"ARK-TEST",genesisRef:"GENESIS-TEST",
  sourceAuthorityRef:"AUTHORITY-TEST",purpose:"historical_reference",
 };
 const binding={commitSha:candidate.commitSha,artifactDigest:candidate.artifactDigest,
  deploymentId:candidate.deploymentId,workerId:candidate.workerId,requestRef:candidate.requestRef,
  requestDigest:candidate.requestDigest,capability:candidate.capability,actorRef:candidate.actorRef,
  tenantRef:candidate.tenantRef,doorRef:candidate.doorRef,arkRef:candidate.arkRef,
  genesisRef:candidate.genesisRef,sourceAuthorityRef:candidate.sourceAuthorityRef,purpose:candidate.purpose};
 const evidence=REQUIRED_R17_CONTROLS.map((control,i)=>({
  control,evidenceRef:"EVIDENCE-"+control,issuerRef:"ISSUER-"+i,
  sourceClass:"DIRECT_AUTHORITY_EXPORT" as const,
  digest:"sha256:"+"d".repeat(64),
  observedAt:"2026-10-13T05:55:00.000Z",validUntil:"2026-10-13T06:10:00.000Z",
  binding:{...binding},
 }));
 const candidateDigest=assessR17EvidenceHandoff({candidate,evidence},NOW).candidateDigest!;
 const pins:Record<string,unknown>={},signers:Record<string,ReturnType<typeof generateKeyPairSync>>={};
 const attestations=evidence.map((e,i)=>{
  const keys=generateKeyPairSync("ed25519");signers[e.control]=keys;
  const pem=keys.publicKey.export({type:"spki",format:"pem"}).toString();
  pins[e.control]={issuerRef:e.issuerRef,keyId:"key-"+i,publicKeyPem:pem,spkiDigest:r18SpkiDigest(pem),
    state:"ACTIVE",validFrom:"2026-10-13T05:50:00.000Z",validUntil:"2026-10-13T06:15:00.000Z"};
  const attestation={schema:"AUTHORITY-REFERENCE-EVIDENCE-PROOF-001/R1.8" as const,
    namespace:"STAGING-TEST",generation:3,control:e.control,
    issuerRef:e.issuerRef,keyId:"key-"+i,candidateDigest,evidenceDigest:r18EvidenceDigest(e),
    nonce:"nonce-unique-per-control-"+i,signedAt:"2026-10-13T05:56:00.000Z",
    expiresAt:"2026-10-13T06:05:00.000Z"};
  return {...attestation,signatureBase64:sign(null,Buffer.from(r18ProofMessage(attestation)),
    keys.privateKey).toString("base64")};
 });
 const trust={mode:"PINNED_OFFLINE_REVIEW_ONLY",namespace:"STAGING-TEST",
  generation:3,minimumGeneration:3,pins};
 return {candidate,evidence,attestations,trust,signers};
}
const assess=(x:ReturnType<typeof fixture>)=>assessR18PinnedEvidence(x,x.trust,NOW);
function hold(x:ReturnType<typeof fixture>){
 const v=assess(x);expect(v.state).toBe("HOLD");expect(v.executionAllowed).toBe(false);
 expect(v.issuerAuthorityVerified).toBe(false);expect(v.liveRiverReceiptsVerified).toBe(false);
 return v;
}
describe("R1.8 independent PIN input — offline ONLY",()=>{
 it("13 valid test signatures remain untrusted estate authority",()=>{
  const x=fixture(),v=hold(x);
  expect(v.matchedOfflineSignatures).toBe(13);
  expect(v.reasonCodes).toContain("PUBLIC_KEY_PINS_NOT_PROVEN_FROM_INDEPENDENT_AUTHORITY");
 });
 it("no packet cannot authorize",()=>{
  const v=assessR18PinnedEvidence(null,null,NOW);
  expect(v.state).toBe("HOLD");expect(v.matchedOfflineSignatures).toBe(0);
 });
 it("tampered Warden evidence fails",()=>{
  const x=fixture();x.evidence[6].binding.doorRef="ALTERED";
  expect(hold(x).checks.WARDEN_ADMISSION).toBe("STRUCTURAL_REJECT");
 });
 it("changed signature fails",()=>{
  const x=fixture();x.attestations[7].signatureBase64="A".repeat(86)+"==";
  expect(hold(x).checks.RIVER_ADMISSION).toBe("ATTESTATION_REJECT");
 });
 it("revoked DigitalMe signing key fails",()=>{
  const x=fixture();(x.trust.pins.DIGITALME_DELEGATION as {state:string}).state="REVOKED";
  expect(hold(x).checks.DIGITALME_DELEGATION).toBe("PIN_REJECT");
 });
 it("wrong external SPKI pin fails",()=>{
  const x=fixture();(x.trust.pins.AUDIT_ANCHOR as {spkiDigest:string}).spkiDigest="sha256:"+"f".repeat(64);
  expect(hold(x).checks.AUDIT_ANCHOR).toBe("PIN_REJECT");
 });
 it("issuer-name swap fails",()=>{
  const x=fixture();x.attestations[8].issuerRef="OTHER";
  expect(hold(x).checks.REPLAY_LEDGER).toBe("PIN_REJECT");
 });
 it("registry generation rollback fails",()=>{
  const x=fixture();x.trust.minimumGeneration=4;
  expect(hold(x).reasonCodes).toContain("TRUST_SCOPE_OR_GENERATION_INVALID");
 });
 it("expired attestation fails",()=>{
  const x=fixture();x.attestations[9].expiresAt="2026-10-13T05:59:00.000Z";
  expect(hold(x).checks.SOURCE_EGRESS).toBe("ATTESTATION_REJECT");
 });
 it("duplicate attestation on Warden fails",()=>{
  const x=fixture();x.attestations.push(structuredClone(x.attestations[6]));
  expect(hold(x).checks.WARDEN_ADMISSION).toBe("MISSING");
 });
 it("missing source permission signature fails",()=>{
  const x=fixture();x.attestations.splice(9,1);
  expect(hold(x).checks.SOURCE_EGRESS).toBe("MISSING");
 });
 it("changed request digest invalidates all scoped evidence",()=>{
  const x=fixture();x.candidate.requestDigest="sha256:"+"e".repeat(64);
  expect(hold(x).checks.WARDEN_ADMISSION).toBe("STRUCTURAL_REJECT");
 });
 it("user supplied verified/approved flags do not count",()=>{
  const x=fixture();const extra={...x,verified:true,approved:true,executeAllowed:true};
  const v=assessR18PinnedEvidence(extra,x.trust,NOW);
  expect(v.executionAllowed).toBe(false);
 });
 it("source input is not mutated",()=>{
  const x=fixture(),before=structuredClone({candidate:x.candidate,evidence:x.evidence,attestations:x.attestations,trust:x.trust});
  hold(x);expect({candidate:x.candidate,evidence:x.evidence,attestations:x.attestations,trust:x.trust}).toEqual(before);
 });
});