import { describe, expect, it } from "vitest";
import { REQUIRED_R17_CONTROLS } from "./authority-reference-trust-handoff.ts";
import { assessR20OwnerCandidates, type R20SourceCandidate } from "./authority-reference-r20-owner-discovery.ts";

const NOW="2026-10-13T00:00:00.000Z";
const make=(control: R20SourceCandidate["control"]): R20SourceCandidate => ({
 control,sourceRef:"github-content-"+control,
 repository:"Believers-common-group/mcp-node-synnergyze",
 sourceClass:"REPOSITORY_README",
 summary:"Integration documentation and non-admitting staging contracts",
 observedAt:"2026-10-12T20:00:00.000Z",
 ownerAccepted:true,verified:true, // deliberately untrusted
});
const assess=(v:unknown)=>assessR20OwnerCandidates(v,NOW);
describe("R2.0 issuer provenance is a non-authorising discovery gate",()=>{
 it("all 13 source and owner controls remain HOLD with complete-looking evidence",()=>{
  const result=assess(REQUIRED_R17_CONTROLS.map(make));
  expect(Object.values(result.controls)).toHaveLength(13);
  expect(result.requiredOwnerAcceptance).toHaveLength(13);
  expect(result.state).toBe("HOLD");
  expect(result.executionAllowed).toBe(false);
  expect(result.ownerMandatesAccepted).toBe(false);
  expect(result.realIssuerVerified).toBe(false);
  expect(result.runtimeCommissioned).toBe(false);
  expect(result.officialSourceEgressAllowed).toBe(false);
  expect(Object.values(result.controls).every(x=>x==="DOCUMENTATION_ONLY")).toBe(true);
 });
 it("flags an upstream Agents SDK README instead of treating the Warden repository name as a signer",()=>{
  const x=make("WARDEN_ADMISSION");x.repository="Believers-common-group/Warden";
  x.summary="OpenAI Agents SDK JavaScript / TypeScript";
  const r=assess([x]);
  expect(r.controls.WARDEN_ADMISSION).toBe("POSSIBLE_UPSTREAM_CODEBASE");
  expect(r.findings).toContain("REPOSITORY_NAME_NOT_ESTATE_ISSUER:WARDEN_ADMISSION");
 });
 it("flags GitHub MCP Server source instead of treating processor-BNR name as a Door issuer",()=>{
  const x=make("BNR_DOOR");x.repository="Believers-common-group/processor-BNR";
  x.summary="GitHub MCP Server repository from GitHub";
  expect(assess([x]).controls.BNR_DOOR).toBe("POSSIBLE_UPSTREAM_CODEBASE");
 });
 it("classifies an old READY deployment of a different commit as non-candidate provenance",()=>{
  const x=make("RUNTIME_DEPLOYMENT");
  x.sourceClass="DEPLOYMENT_METADATA";x.deploymentState="READY";
  x.observedCommitSha="a".repeat(40);x.candidateCommitSha="b".repeat(40);
  expect(assess([x]).controls.RUNTIME_DEPLOYMENT).toBe("OLDER_OR_CANCELED_DEPLOYMENT");
 });
 it("rejects canceled deployment even if commit matches",()=>{
  const x=make("RUNTIME_DEPLOYMENT");
  x.sourceClass="DEPLOYMENT_METADATA";x.deploymentState="CANCELED";
  x.observedCommitSha="a".repeat(40);x.candidateCommitSha="a".repeat(40);
  expect(assess([x]).controls.RUNTIME_DEPLOYMENT).toBe("OLDER_OR_CANCELED_DEPLOYMENT");
 });
 it("an exact READY commit is still documentation, never a commissioned worker",()=>{
  const x=make("RUNTIME_DEPLOYMENT");x.sourceClass="DEPLOYMENT_METADATA";
  x.deploymentState="READY";x.observedCommitSha="a".repeat(40);x.candidateCommitSha="a".repeat(40);
  const v=assess([x]);
  expect(v.controls.RUNTIME_DEPLOYMENT).toBe("DOCUMENTATION_ONLY");
  expect(v.runtimeCommissioned).toBe(false);
 });
 it("unverified owner export is not accepted despite ownerAccepted=true",()=>{
  const x=make("DIGITALME_DELEGATION");x.sourceClass="DIRECT_OWNER_EXPORT";
  const v=assess([x]);expect(v.controls.DIGITALME_DELEGATION).toBe("UNAUTHENTICATED_OWNER_CANDIDATE");
  expect(v.ownerMandatesAccepted).toBe(false);
 });
 it("duplicate sources stay ambiguous instead of choosing a winner",()=>{
  expect(assess([make("WARDEN_POLICY"),make("WARDEN_POLICY")]).controls.WARDEN_POLICY).toBe("AMBIGUOUS");
 });
 it("outdated or future timestamps are blocked",()=>{
  const past=make("WARDEN_ADMISSION");past.observedAt="2026-09-01T00:00:00.000Z";
  const future=make("DIGITALME_DELEGATION");future.observedAt="2027-01-01T00:00:00.000Z";
  expect(assess([past,future]).controls.WARDEN_ADMISSION).toBe("STALE");
  expect(assess([past,future]).controls.DIGITALME_DELEGATION).toBe("STALE");
 });
 it("invalid repository identity and malformed commit are rejected",()=>{
  const x=make("WORKER_BUILD");x.repository="javascript sdk alias";
  const y=make("GENESIS_CAPACITY");y.observedCommitSha="not-a-sha";
  const z=assess([x,y]);
  expect(z.controls.WORKER_BUILD).toBe("INVALID_SOURCE");
  expect(z.controls.GENESIS_CAPACITY).toBe("INVALID_SOURCE");
 });
 it("rejects unknown controls and oversized source collections",()=>{
  const a=assess([{...make("WORKER_BUILD"),control:"UNAUTHORIZED_TOOL"}]);
  expect(a.findings).toContain("UNKNOWN_CONTROL");
  const b=assess(Array.from({length:53},()=>make("RIVER_ADMISSION")));
  expect(b.findings).toContain("INVALID_CANDIDATE_COLLECTION");
 });
 it("does not mutate the input",()=>{
  const x=REQUIRED_R17_CONTROLS.map(make),saved=structuredClone(x);
  assess(x);expect(x).toEqual(saved);
 });
 it("invalid review time prevents stale evidence from being relied on",()=>{
  const x=assessR20OwnerCandidates([make("WORKER_BUILD")],"not-a-time");
  expect(x.controls.WORKER_BUILD).toBe("STALE");
  expect(x.executionAllowed).toBe(false);
 });
});
