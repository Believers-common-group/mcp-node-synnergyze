import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_R17_CONTROLS, assessR17EvidenceHandoff } from "./authority-reference-trust-handoff.ts";
import { assessR21OwnerEvidenceIntake } from "./authority-reference-r21-owner-intake.ts";

const NOW="2026-10-14T08:00:00.000Z";
const load=()=>JSON.parse(readFileSync(new URL("../../docs/AUTHORITY-REFERENCE-R20-OWNER-REGISTER.json",import.meta.url),"utf8")) as unknown;
const candidate=()=>({
 schema:"AUTHORITY-REFERENCE-R17-CANDIDATE-001",
 environment:"STAGING_REVIEW",repository:"Believers-common-group/mcp-node-synnergyze",
 commitSha:"a".repeat(40),artifactDigest:"sha256:"+"b".repeat(64),
 deploymentId:"deployment:staging-00001",workerId:"worker:staging-00001",
 requestRef:"request:staging-00001",requestDigest:"sha256:"+"c".repeat(64),
 capability:"authority_reference.retrieve_public",actorRef:"digitalme:offline-test",
 tenantRef:"tenant:offline-test",doorRef:"door:offline-test",
 arkRef:"ark:offline-test",genesisRef:"genesis:offline-test",
 sourceAuthorityRef:"source:offline-test",purpose:"historical-reference",
});
const proposal=(control:(typeof REQUIRED_R17_CONTROLS)[number],nominee="nominee:"+control):Record<string,unknown>=>({
 control,nomineeRef:nominee,independentReviewerRef:"reviewer:"+control,
 mandateRef:"mandate:"+control,evidenceRef:"evidence:"+control,
 evidenceDigest:"sha256:"+"d".repeat(64),
 candidateDigest:assessR17EvidenceHandoff({candidate:candidate(),evidence:[]},NOW).candidateDigest,
 issuedAt:"2026-10-14T07:30:00.000Z",expiresAt:"2026-10-14T08:30:00.000Z",
});
const intake=(props:unknown,base:unknown=candidate(),time=NOW)=>
 assessR21OwnerEvidenceIntake(load(),base,props,time);
const assertHold=(result:ReturnType<typeof intake>)=>{
 expect(result.state).toBe("HOLD");
 expect(result.commissioned).toBe(false);
 expect(result.executionAllowed).toBe(false);
 expect(result.sourceEgressAllowed).toBe(false);
 expect(result.ownerMandatesIndependentlyVerified).toBe(false);
 expect(result.productionApproval).toBe(false);
 expect(result.reviewQueue).toHaveLength(13);
 return result;
};
describe("R2.1 owner-mandate intake (source-only, permanent HOLD)",()=>{
 it("matches the existing R2.0 owner's 13 independent control domains",()=>{
  const r=assertHold(intake([]));
  expect(r.reviewQueue.map(x=>x.control)).toEqual(REQUIRED_R17_CONTROLS);
  expect(r.reviewQueue.every(x=>x.status==="NOT_SUBMITTED")).toBe(true);
  expect(r.reviewableCount).toBe(0);
  expect(r.issues).toContain("INDEPENDENT_OWNER_MANDATE_ACCEPTANCE_NOT_VERIFIED");
 });
 it("a well-formed proposal is REVIEW REQUIRED, never an appointment",()=>{
  const r=assertHold(intake([proposal("AUDIT_ANCHOR")]));
  expect(r.reviewableCount).toBe(1);
  expect(r.reviewQueue.find(x=>x.control==="AUDIT_ANCHOR")).toMatchObject({
    status:"REVIEW_REQUIRED",mandateRef:"mandate:AUDIT_ANCHOR",
  });
 });
 it("all 13 well-formed mandates still cannot authorise any capability",()=>{
  const r=assertHold(intake(REQUIRED_R17_CONTROLS.map(c=>proposal(c))));
  expect(r.reviewableCount).toBe(13);
  expect(r.reviewQueue.every(x=>x.status==="REVIEW_REQUIRED")).toBe(true);
 });
 it("claimed approvals, acceptance and live signatures are ignored",()=>{
  const p={...proposal("WARDEN_ADMISSION"),claimedOwnerAccepted:true,
   claimedLiveAuthorityVerified:true,approved:true,liveRiver:true,
   productionCommissioning:true};
  assertHold(intake([p]));
 });
 it("rejects reviewer self-approval",()=>{
  const p=proposal("WARDEN_ADMISSION");
  p.independentReviewerRef=p.nomineeRef;
  const r=assertHold(intake([p]));
  expect(r.reviewQueue.find(x=>x.control==="WARDEN_ADMISSION")?.reasonCodes)
   .toContain("SELF_REVIEW_FORBIDDEN");
 });
 it("rejects critical signer custodian reuse across Warden and River",()=>{
  const p=proposal("WARDEN_ADMISSION","nominee:shared-mandate-owner");
  const q=proposal("RIVER_ADMISSION","nominee:shared-mandate-owner");
  const r=assertHold(intake([p,q]));
  expect(r.reviewQueue.find(x=>x.control==="WARDEN_ADMISSION")?.status).toBe("INVALID");
  expect(r.reviewQueue.find(x=>x.control==="RIVER_ADMISSION")?.status).toBe("INVALID");
 });
 it("rejects scope mismatch for any candidate field change",()=>{
  const p=proposal("SOURCE_EGRESS"),c=candidate();
  c.actorRef="digitalme:changed";
  const r=assertHold(intake([p],c));
  expect(r.reviewQueue.find(x=>x.control==="SOURCE_EGRESS")?.reasonCodes)
   .toContain("CANDIDATE_SCOPE_NOT_BOUND");
 });
 it("rejects stale proposals",()=>{
  const p=proposal("DIGITALME_DELEGATION");
  p.expiresAt="2026-10-14T07:59:59.000Z";
  const r=assertHold(intake([p]));
  expect(r.reviewQueue.find(x=>x.control==="DIGITALME_DELEGATION")?.reasonCodes)
   .toContain("MANDATE_TIME_NOT_CURRENT");
 });
 it("rejects duplicate mandate reference",()=>{
  const a=proposal("WARDEN_POLICY"),b=proposal("AUDIT_ANCHOR");
  b.mandateRef=a.mandateRef;
  const r=assertHold(intake([a,b]));
  expect(r.reviewQueue.find(x=>x.control==="AUDIT_ANCHOR")?.status).toBe("INVALID");
 });
 it("rejects duplicate evidence reference",()=>{
  const a=proposal("GENESIS_CAPACITY"),b=proposal("RUNTIME_DEPLOYMENT");
  b.evidenceRef=a.evidenceRef;
  const r=assertHold(intake([a,b]));
  expect(r.reviewQueue.find(x=>x.control==="RUNTIME_DEPLOYMENT")?.status).toBe("INVALID");
 });
 it("rejects duplicate role nominations rather than picking a winner",()=>{
  const r=assertHold(intake([proposal("AUDIT_ANCHOR"),proposal("AUDIT_ANCHOR","nominee:another-auditor")]));
  expect(r.reviewQueue.find(x=>x.control==="AUDIT_ANCHOR")?.reasonCodes)
   .toContain("MULTIPLE_MANDATES_FOR_CONTROL");
  expect(r.reviewableCount).toBe(0);
 });
 it("rejects credential-like content in mandate references",()=>{
  const p=proposal("AUDIT_ANCHOR");
  p.evidenceRef="secret:production-credentials";
  const r=assertHold(intake([p]));
  expect(r.reviewQueue.find(x=>x.control==="AUDIT_ANCHOR")?.reasonCodes)
   .toContain("REF_OR_CREDENTIAL_INVALID");
 });
 it("rejects malformed or unknown controls without side effects",()=>{
  const r=assertHold(intake([{control:"BANK_APPROVED",nomineeRef:"nominee:test"}]));
  expect(r.issues).toContain("UNKNOWN_OR_INVALID_ROLE");
 });
 it("rejects invalid candidate and invalid review clock",()=>{
  const a=assertHold(intake([proposal("AUDIT_ANCHOR")],{...candidate(),capability:"authority_reference.publish"}));
  expect(a.issues).toContain("R17_CANDIDATE_INVALID");
  const b=assertHold(intake([],candidate(),"wrong-date"));
  expect(b.issues).toContain("REVIEW_TIME_INVALID");
 });
 it("does not mutate the owner register, candidate or proposals",()=>{
  const register=load(),c=candidate(),p=[proposal("AUDIT_ANCHOR")];
  const before=structuredClone({register,c,p});
  assertHold(assessR21OwnerEvidenceIntake(register,c,p,NOW));
  expect({register,c,p}).toEqual(before);
 });
 it("does not allow a R2.0 register with claimed owner appointments",()=>{
  const r=load() as {ownerAppointmentsCreated:boolean};
  r.ownerAppointmentsCreated=true;
  const outcome=assertHold(assessR21OwnerEvidenceIntake(r,candidate(),[],NOW));
  expect(outcome.issues).toContain("R20_REGISTER_NOT_REVIEWABLE");
 });
});