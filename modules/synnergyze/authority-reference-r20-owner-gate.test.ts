import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { REQUIRED_R17_CONTROLS } from "./authority-reference-trust-handoff.ts";
import { auditR20OwnerRegister } from "./authority-reference-r20-owner-gate.ts";

const load=()=>JSON.parse(readFileSync(new URL("../../docs/AUTHORITY-REFERENCE-R20-OWNER-REGISTER.json",import.meta.url),"utf8")) as Record<string,any>;
const check=(data:unknown)=>auditR20OwnerRegister(data);

describe("R2.0 owner custody provenance and immutable HOLD",()=>{
 it("checked-in actual source register includes every commissioning control, but appoints no owners",()=>{
  const r=check(load());
  expect(r.completeUnappointedRegister).toBe(true);
  expect(r.integrityIssues).toEqual([]);
  expect(r.pendingControls).toEqual(REQUIRED_R17_CONTROLS);
  expect(r.ownerAppointmentCount).toBe(0);
  expect(r.state).toBe("HOLD");
  expect(r.executionAllowed).toBe(false);
  expect(r.deployAllowed).toBe(false);
  expect(r.ownerMandatesVerified).toBe(false);
  expect(r.liveIssuerVerified).toBe(false);
 });
 it("rejects apparently approved registers without independent proof",()=>{
  const x=load();x.productionApproval=true;
  expect(check(x).integrityIssues).toContain("REGISTER_NOT_EXPLICITLY_HELD");
  expect(check(x).executionAllowed).toBe(false);
 });
 it("rejects false owner acceptance and mandates for a previously unappointed role",()=>{
  const x=load();const control=x.controls[0].control;
  x.controls[0].ownerUserId="claimed-approver";
  x.controls[0].mandateRef="claimed-mandate";
  x.controls[0].ownerAccepted=true;
  x.controls[0].liveAuthorityVerified=true;
  expect(check(x).integrityIssues).toContain("UNVERIFIED_OWNER_IMPROPERLY_PROMOTED:"+control);
  expect(check(x).ownerMandatesVerified).toBe(false);
 });
 it("rejects missing and duplicated controls",()=>{
  const x=load();const first=x.controls[0];
  x.controls.push(structuredClone(first));
  expect(check(x).integrityIssues).toContain("MISSING_OR_DUPLICATE_CONTROL:"+first.control);
  const y=load();y.controls.shift();
  expect(check(y).integrityIssues).toContain("MISSING_OR_DUPLICATE_CONTROL:"+first.control);
 });
 it("rejects an undocumented OpenAI SDK origin for the Warden-named fork",()=>{
  const x=load();x.candidateRepositories.find((r:any)=>r.repo==="Believers-common-group/Warden").githubFork=false;
  expect(check(x).integrityIssues).toContain("FORK_ORIGIN_NOT_ACKNOWLEDGED:Believers-common-group/Warden");
 });
 it("rejects an undocumented GitHub MCP origin for processor-BNR",()=>{
  const x=load();x.candidateRepositories.find((r:any)=>r.repo==="Believers-common-group/processor-BNR").upstream="claimed-native-bnr";
  expect(check(x).integrityIssues).toContain("FORK_ORIGIN_NOT_ACKNOWLEDGED:Believers-common-group/processor-BNR");
 });
 it("refuses a forked upstream SDK nominated as the signing authority",()=>{
  const x=load();
  x.controls.find((r:any)=>r.control==="WARDEN_ADMISSION").evidenceCandidate="Believers-common-group/Warden";
  expect(check(x).integrityIssues).toContain("UPSTREAM_SDK_FORK_CANNOT_ESTABLISH_AUTHORITY:WARDEN_ADMISSION");
 });
 it("rejects unknown control injection and still holds",()=>{
  const x=load();x.controls.push({...x.controls[0],control:"GOVERNMENT_CERTIFIED"});
  const r=check(x);
  expect(r.integrityIssues).toContain("UNKNOWN_OR_MALFORMED_CONTROL");
  expect(r.state).toBe("HOLD");
 });
 it("rejects duplicate source repository records",()=>{
  const x=load();x.candidateRepositories.push({...x.candidateRepositories[0]});
  expect(check(x).integrityIssues).toContain("DUPLICATE_OR_INVALID_REPOSITORY");
 });
 it("treats untrusted positive caller flags as irrelevant",()=>{
  const x=load();
  x.signedWardenDecision=true;x.liveRiverReceiptVerified=true;x.productionPermitConsumed=true;
  const r=check(x);
  expect(r.completeUnappointedRegister).toBe(true);
  expect(r.executionAllowed).toBe(false);
  expect(r.ownerMandatesVerified).toBe(false);
 });
 it("fails closed on missing or malformed input",()=>{
  for(const input of [null,{},[],"signed", {schema:"OTHER"}]){
   const r=check(input);
   expect(r.state).toBe("HOLD");
   expect(r.executionAllowed).toBe(false);
   expect(r.completeUnappointedRegister).toBe(false);
  }
 });
 it("does not mutate the checked-in evidence register",()=>{
  const x=load(),clone=structuredClone(x);
  check(x);expect(x).toEqual(clone);
 });
});
