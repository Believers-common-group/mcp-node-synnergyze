import { describe,expect,it } from "vitest";
import { assessR17EvidenceHandoff, REQUIRED_R17_CONTROLS } from "./authority-reference-trust-handoff.ts";
const NOW="2026-10-13T06:00:00.000Z";
const candidate=()=>({
  schema:"AUTHORITY-REFERENCE-R17-CANDIDATE-001",environment:"STAGING_REVIEW",
  repository:"Believers-common-group/mcp-node-synnergyze",commitSha:"a".repeat(40),
  artifactDigest:"sha256:"+"b".repeat(64),deploymentId:"staging-deployment-001",
  workerId:"SYN-STAGING-WORKER-001",requestRef:"REQUEST-STAGING-001",
  requestDigest:"sha256:"+"c".repeat(64),capability:"authority_reference.retrieve_public",
  actorRef:"DIGITALME-STAGING-ACTOR",tenantRef:"TENANT-TEST",doorRef:"BNR-DOOR-TEST",
  arkRef:"ARK-TEST",genesisRef:"GENESIS-CAPACITY-TEST",
  sourceAuthorityRef:"REGISTRY-DECLARED",purpose:"historical_reference",
});
const evidence=(c:ReturnType<typeof candidate>)=>REQUIRED_R17_CONTROLS.map((control,i)=>({
  control,evidenceRef:"EVIDENCE-"+control,issuerRef:"AUTHORITY-"+i,
  sourceClass:"DIRECT_AUTHORITY_EXPORT",digest:"sha256:"+"d".repeat(64),
  observedAt:"2026-10-13T05:55:00.000Z",validUntil:"2026-10-13T06:10:00.000Z",
  binding:{commitSha:c.commitSha,artifactDigest:c.artifactDigest,deploymentId:c.deploymentId,
    workerId:c.workerId,requestRef:c.requestRef,requestDigest:c.requestDigest,
    capability:c.capability,actorRef:c.actorRef,tenantRef:c.tenantRef,doorRef:c.doorRef,
    arkRef:c.arkRef,genesisRef:c.genesisRef,sourceAuthorityRef:c.sourceAuthorityRef,purpose:c.purpose},
  verified:true,approved:true,
}));
const inspect=(data:unknown)=>assessR17EvidenceHandoff(data,NOW);
function hold(data:unknown) {
 const r=inspect(data);expect(r.state).toBe("HOLD");
 expect(r.commissioningAuthorized).toBe(false);
 expect(r.executeAllowed).toBe(false);
 expect(r.externalSourceAccessAllowed).toBe(false);
 expect(r.actualIssuerTrustVerified).toBe(false);
 expect(r.liveRiverAdmissionVerified).toBe(false);
 expect(r.liveRiverExecutionVerified).toBe(false);
 return r;
}
describe("R1.7 source-only trusted-evidence handoff (HOLD)",()=>{
 it("even 13 complete-looking self-reported control exports confer zero authority",()=>{
   const c=candidate(),r=hold({candidate:c,evidence:evidence(c),approved:true});
   expect(Object.values(r.checks).filter(x=>x==="PRESENT_UNVERIFIED")).toHaveLength(13);
   expect(r.reasonCodes).toContain("ISSUER_SIGNATURES_NOT_INDEPENDENTLY_VERIFIED");
 });
 it("missing packet keeps all thirteen controls missing",()=>{
   const r=hold({candidate:candidate(),evidence:[]});
   expect(r.reviewQueue).toHaveLength(13);expect(r.reasonCodes).toContain("MISSING:WARDEN_ADMISSION");
 });
 it("missing candidate fails closed",()=>{
   expect(hold({evidence:[]}).reasonCodes).toContain("CANDIDATE_SCOPE_INVALID");
 });
 it("wrong Door is a scope mismatch",()=>{
   const c=candidate(),e=evidence(c);e[0].binding.doorRef="OTHER";
   expect(hold({candidate:c,evidence:e}).checks.WORKER_BUILD).toBe("SCOPE_MISMATCH");
 });
 it("wrong immutable commit is a scope mismatch",()=>{
   const c=candidate(),e=evidence(c);e[1].binding.commitSha="e".repeat(40);
   expect(hold({candidate:c,evidence:e}).checks.RUNTIME_DEPLOYMENT).toBe("SCOPE_MISMATCH");
 });
 it("self-declared Warden proof is untrusted",()=>{
   const c=candidate(),e=evidence(c);e[6].sourceClass="SELF_DECLARED";
   expect(hold({candidate:c,evidence:e}).checks.WARDEN_ADMISSION).toBe("UNTRUSTED");
 });
 it("expired River admission proof is stale",()=>{
   const c=candidate(),e=evidence(c);e[7].validUntil="2026-10-13T05:59:00.000Z";
   expect(hold({candidate:c,evidence:e}).checks.RIVER_ADMISSION).toBe("STALE");
 });
 it("duplicate evidence cannot be counted twice",()=>{
   const c=candidate(),e=evidence(c);e.push(structuredClone(e[0]));
   expect(hold({candidate:c,evidence:e}).checks.WORKER_BUILD).toBe("DUPLICATE");
 });
 it("two separately required authorities cannot share one claimed issuer",()=>{
   const c=candidate(),e=evidence(c);e[2].issuerRef=e[3].issuerRef;
   expect(hold({candidate:c,evidence:e}).reasonCodes).toContain("CONTROL_DOMAINS_NOT_INDEPENDENT");
 });
 it("production is not a staging candidate",()=>{
   const c=candidate();c.environment="PRODUCTION";
   expect(hold({candidate:c,evidence:evidence(c)}).reasonCodes).toContain("CANDIDATE_SCOPE_INVALID");
 });
 it("changed request digest fails exact binding",()=>{
   const c=candidate(),e=evidence(c);c.requestDigest="sha256:"+"f".repeat(64);
   expect(hold({candidate:c,evidence:e}).checks.WARDEN_ADMISSION).toBe("SCOPE_MISMATCH");
 });
 it("caller-provided approval flags never override HOLD",()=>{
   const c=candidate();expect(hold({candidate:c,evidence:evidence(c),force:true,executionAllowed:true}).executeAllowed).toBe(false);
 });
 it("invalid clock fails closed",()=>{
   const c=candidate(),r=assessR17EvidenceHandoff({candidate:c,evidence:evidence(c)},"bad-time");
   expect(r.reasonCodes).toContain("EVALUATION_TIME_INVALID");
   expect(r.checks.RIVER_ADMISSION).toBe("STALE");
 });
 it("the review does not modify its supplied packet",()=>{
   const c=candidate(),x={candidate:c,evidence:evidence(c)},snap=structuredClone(x);
   hold(x);expect(x).toEqual(snap);
 });
 it("duplicate evidence references cannot be recycled",()=>{
   const c=candidate(),e=evidence(c);e[2].evidenceRef=e[3].evidenceRef;
   expect(hold({candidate:c,evidence:e}).reasonCodes).toContain("DUPLICATE_EVIDENCE_REFERENCE");
 });
 it("unrecognised controls are flagged",()=>{
   const c=candidate(),e=evidence(c);
   expect(hold({candidate:c,evidence:[...e,{control:"BYPASS",approved:true}]}).reasonCodes).toContain("UNKNOWN_EVIDENCE_CONTROL");
 });
});