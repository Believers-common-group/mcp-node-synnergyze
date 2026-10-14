import { describe,expect,it } from "vitest";
import { assessR17EvidenceHandoff,REQUIRED_R17_CONTROLS } from "./authority-reference-trust-handoff.ts";
import { inspectR19AuthoritySources } from "./authority-reference-r19-source-inventory.ts";
const NOW="2026-10-13T08:00:00.000Z";
const candidate=()=>({
 schema:"AUTHORITY-REFERENCE-R17-CANDIDATE-001",environment:"STAGING_REVIEW",
 repository:"Believers-common-group/mcp-node-synnergyze",commitSha:"a".repeat(40),
 artifactDigest:"sha256:"+"b".repeat(64),deploymentId:"staging-worker-none",
 workerId:"uncommissioned-worker",requestRef:"review-request",
 requestDigest:"sha256:"+"c".repeat(64),capability:"authority_reference.verify",
 actorRef:"digitalme-test",tenantRef:"tenant-test",doorRef:"door-test",
 arkRef:"ark-test",genesisRef:"genesis-test",sourceAuthorityRef:"source-test",
 purpose:"historical_reference",
});
function fixture(){
 const c=candidate();
 const candidateDigest=assessR17EvidenceHandoff({candidate:c,evidence:[]},NOW).candidateDigest!;
 const sources=REQUIRED_R17_CONTROLS.map((control,i)=>({
   control,sourceClass:"DIRECT_AUTHORITY_EXPORT",evidenceRef:"review-evidence-"+i,
   evidenceUrl:"https://evidence.example.org/review/"+i,
   evidenceSha256:"sha256:"+"d".repeat(64),
   candidateDigest,issuerRef:"ISSUER-"+i,nominatedRole:"UNAPPOINTED_ROLE_"+i,
   mandateRef:null as string|null,ownerAccepted:false,capturedAt:"2026-10-13T07:55:00.000Z",
   expiresAt:"2026-10-13T08:10:00.000Z",verified:true,approved:true
 }));
 return {candidate:c,sources};
}
function assess(x:ReturnType<typeof fixture>,when=NOW){return inspectR19AuthoritySources(x.candidate,x.sources,when);}
function hold(x:ReturnType<typeof fixture>){
 const r=assess(x);expect(r.state).toBe("HOLD");
 expect(r.executionAllowed).toBe(false);expect(r.liveAuthorityVerified).toBe(false);
 expect(r.sideEffects).toBe(false);expect(r.credentialsRequested).toBe(false);
 expect(r.sourceEgressAllowed).toBe(false);
 return r;
}
describe("R1.9 independent authority-source checklist",()=>{
 it("13 apparently complete authority URLs confer no live admission",()=>{
  const r=hold(fixture());expect(r.acceptanceRequests).toHaveLength(13);
  expect(Object.values(r.controls).filter(x=>x==="UNAUTHENTICATED_CANDIDATE")).toHaveLength(13);
  expect(r.reasonCodes).toContain("NO_INDEPENDENTLY_AUTHENTICATED_ISSUER_DIRECTORY");
 });
 it("read-only repo documentation is not issuer attestation",()=>{
  const x=fixture();x.sources[6].sourceClass="REPOSITORY_DOCUMENTATION";
  expect(hold(x).controls.WARDEN_ADMISSION).toBe("DOCUMENTATION_ONLY");
 });
 it("historic deployment metadata is not worker commissioning",()=>{
  const x=fixture();x.sources[1].sourceClass="DEPLOYMENT_METADATA";
  expect(hold(x).controls.RUNTIME_DEPLOYMENT).toBe("DOCUMENTATION_ONLY");
 });
 it("an offline fixture is not real admission",()=>{
  const x=fixture();x.sources[7].sourceClass="OFFLINE_FIXTURE";
  expect(hold(x).controls.RIVER_ADMISSION).toBe("OFFLINE_TEST_ONLY");
 });
 it("missing River receipt remains missing",()=>{
  const x=fixture();x.sources.splice(7,1);
  expect(hold(x).controls.RIVER_ADMISSION).toBe("MISSING");
 });
 it("duplicate control never counts twice",()=>{
  const x=fixture();x.sources.push(structuredClone(x.sources[0]));
  expect(hold(x).controls.WORKER_BUILD).toBe("MULTIPLE");
 });
 it("a mismatched candidate digest is rejected",()=>{
  const x=fixture();x.sources[2].candidateDigest="sha256:"+"e".repeat(64);
  expect(hold(x).controls.DIGITALME_DELEGATION).toBe("SCOPE_MISMATCH");
 });
 it("caller approval and mandate reference still do not confer authority",()=>{
  const x=fixture();x.sources[6].ownerAccepted=true;x.sources[6].mandateRef="SELF-REPORTED";
  const r=hold(x);expect(r.liveAuthorityVerified).toBe(false);
  expect(r.controls.WARDEN_ADMISSION).toBe("UNAUTHENTICATED_CANDIDATE");
 });
 it("expired source descriptor is stale",()=>{
  const x=fixture();x.sources[11].expiresAt="2026-10-13T07:59:00.000Z";
  expect(hold(x).controls.AUDIT_ANCHOR).toBe("STALE_OR_INVALID");
 });
 it("HTTP endpoint is rejected as unsafe descriptor",()=>{
  const x=fixture();x.sources[9].evidenceUrl="http://evidence.example.org/data";
  expect(hold(x).controls.SOURCE_EGRESS).toBe("STALE_OR_INVALID");
 });
 it("credential-bearing URL is rejected",()=>{
  const x=fixture();x.sources[6].evidenceUrl="https://user:password@evidence.example.org/a";
  expect(hold(x).controls.WARDEN_ADMISSION).toBe("STALE_OR_INVALID");
 });
 it("URL with query token is not preserved",()=>{
  const x=fixture();x.sources[6].evidenceUrl="https://evidence.example.org/?token=secret";
  expect(hold(x).controls.WARDEN_ADMISSION).toBe("STALE_OR_INVALID");
 });
 it("unknown control is flagged",()=>{
  const x=fixture();
  expect(inspectR19AuthoritySources(x.candidate,[...x.sources,{control:"BYPASS"}],NOW).reasonCodes)
    .toContain("UNKNOWN_CONTROL_OR_RECORD");
 });
 it("no source records returns all missing",()=>{
  const r=inspectR19AuthoritySources(candidate(),[],NOW);
  expect(Object.values(r.controls)).toHaveLength(13);
  expect(r.reasonCodes).toContain("MISSING:WARDEN_ADMISSION");
 });
 it("production candidate is rejected",()=>{
  const x=fixture();(x.candidate as {environment:string}).environment="PRODUCTION";
  expect(hold(x).reasonCodes).toContain("CANDIDATE_NOT_VERIFIED");
 });
 it("invalid clock fails closed",()=>{
  const x=fixture(),r=assess(x,"not-an-instant");
  expect(r.reasonCodes).toContain("REVIEW_TIME_INVALID");
  expect(r.state).toBe("HOLD");
 });
 it("input immutability is preserved",()=>{
  const x=fixture(),snapshot=structuredClone(x);hold(x);expect(x).toEqual(snapshot);
 });
});
