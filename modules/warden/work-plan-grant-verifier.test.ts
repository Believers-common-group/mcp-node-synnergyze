import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  mayDispatchWorkGrant, unsignedGrant, verifyProposedWorkGrant,
  workCanonicalJson, workSha256,
  type WorkExecutionGrant, type TrustedWorkContext, type ProposedWorkRequest,
} from "./work-plan-grant-verifier.ts";

const time = "2026-10-02T07:00:00Z";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ format:"pem", type:"spki" }).toString();
function sample() {
  const request = {
    state:"PROPOSED_FOR_WARDEN_EVALUATION",
    principal_id:"DM-DEMO-INSPECTOR", context_id:"CTX-DEMO-42", program_id:"PROGRAM-DEMO-42",
    action_id:"ACTION-RESOLVE", capability_id:"REGISTRY_READ", target_id:"REGISTRY-DEMO-42",
    effect_class:"READ",
    constraints:{max_compute_credits:0,max_duration_seconds:60,data_classes:["SYNTHETIC"]},
    required_evidence_profile:"RIVER-EFFECT-V1"
  };
  const proposal: ProposedWorkRequest = { request, request_digest:workSha256(request) };
  const grant: WorkExecutionGrant = {
    schema_id:"genesis:warden-execution-grant",
    contract_id:"WARDEN-EXECUTION-GRANT-001",contract_version:"1.0",
    grant_id:"WEG-DEMO-00001",decision_id:"DEC-DEMO-00001",
    principal_id:request.principal_id,
    represented_principal_id:"ORG-DEMO",
    acting_capacity_id:"CAP-DEMO",
    context_id:request.context_id,program_id:request.program_id,
    action_id:request.action_id,capability_id:request.capability_id,target_id:request.target_id,
    effect_class:"READ",effect_binding:"sha256:"+proposal.request_digest,
    authority_refs:["AUTH-DEMO"],consent_refs:[],policy_refs:["POLICY-DEMO"],
    request_digest:proposal.request_digest,
    constraints:{minimum_containment:"C2_CONTAINER",network_mode:"DENY",max_duration_seconds:30},
    required_evidence_profile:"RIVER-EFFECT-V1",
    issued_at:"2026-10-02T06:50:00Z",expires_at:"2026-10-02T07:05:00Z",
    warden_key_id:"KEY-DEMO",grant_signature:{algorithm:"Ed25519",signature:""}
  };
  const trusted: TrustedWorkContext = {
    principalId:request.principal_id,receiptId:"RECEIPT-DEMO",
    receiptExpiresAt:"2026-10-02T07:15:00Z",representedPrincipalId:"ORG-DEMO",
    actingCapacityId:"CAP-DEMO",
    authorityRefs:["AUTH-DEMO"],policyRefs:["POLICY-DEMO"],
    revokedGrantIds:new Set(),trustedPublicKeys:{"KEY-DEMO":pub},
  };
  const signGrant = () => {
    grant.grant_signature.signature =
      sign(null, Buffer.from(workCanonicalJson(unsignedGrant(grant))), privateKey).toString("base64");
  };
  signGrant();
  return { proposal,grant,trusted,signGrant };
}
describe("R0.2-D Warden work-plan cryptographic verification profile",()=>{
  it("valid signed grant remains NOT ADMITTED and cannot dispatch",()=>{
    const {proposal,grant,trusted}=sample();
    const result=verifyProposedWorkGrant(proposal,grant,trusted,time);
    expect(result.verdict).toBe("CRYPTOGRAPHICALLY_VALID_NOT_ADMITTED");
    expect(mayDispatchWorkGrant(result)).toBe(false);
  });
  it("rejects tampered proposal digest",()=>{
    const s=sample();
    s.proposal.request.target_id="OTHER";
    expect(verifyProposedWorkGrant(s.proposal,s.grant,s.trusted,time))
      .toMatchObject({verdict:"REJECTED",reason:"PROPOSAL_DIGEST_MISMATCH"});
  });
  it("rejects validly signed grant for changed target",()=>{
    const s=sample();
    s.grant.target_id="PAYMENT-RAIL";s.signGrant();
    expect(verifyProposedWorkGrant(s.proposal,s.grant,s.trusted,time))
      .toMatchObject({verdict:"REJECTED",reason:"EXACT_ACTION_BINDING_MISMATCH"});
  });
  it("detects signature tampering",()=>{
    const s=sample();s.grant.decision_id="FORGED";
    expect(verifyProposedWorkGrant(s.proposal,s.grant,s.trusted,time))
      .toMatchObject({verdict:"REJECTED",reason:"INVALID_SIGNATURE"});
  });
  it("requires independent trusted key",()=>{
    const s=sample();
    expect(verifyProposedWorkGrant(s.proposal,s.grant,{...s.trusted,trustedPublicKeys:{}},time))
      .toMatchObject({verdict:"REJECTED",reason:"UNKNOWN_TRUST_ROOT"});
  });
  it("rejects expired, not yet issued and stale identity",()=>{
    const s=sample();
    for(const when of ["2026-10-02T06:49:59Z","2026-10-02T07:05:00Z","invalid"]){
      expect(verifyProposedWorkGrant(s.proposal,s.grant,s.trusted,when))
        .toMatchObject({verdict:"REJECTED",reason:"EXPIRED_OR_INVALID_TIME_WINDOW"});
    }
    expect(verifyProposedWorkGrant(s.proposal,s.grant,{...s.trusted,principalId:"DM-OTHER"},time))
      .toMatchObject({verdict:"REJECTED",reason:"EXACT_ACTION_BINDING_MISMATCH"});
  });
  it("rejects revoked grant and differing trusted authority",()=>{
    const s=sample();
    expect(verifyProposedWorkGrant(s.proposal,s.grant,{
      ...s.trusted,revokedGrantIds:new Set([s.grant.grant_id])},time))
      .toMatchObject({reason:"REVOKED_GRANT"});
    expect(verifyProposedWorkGrant(s.proposal,s.grant,{
      ...s.trusted,policyRefs:["OTHER-POLICY"]},time))
      .toMatchObject({reason:"TRUSTED_AUTHORITY_CONTEXT_MISMATCH"});
  });
  it("blocks paid/real/mutating actions even with re-signed grant",()=>{
    for(const kind of ["cost","data","effect"]){
      const s=sample();
      if(kind==="cost")s.proposal.request.constraints.max_compute_credits=1;
      if(kind==="data")s.proposal.request.constraints.data_classes=["CONFIDENTIAL"];
      if(kind==="effect")s.proposal.request.effect_class="WRITE";
      s.proposal.request_digest=workSha256(s.proposal.request);
      s.grant.request_digest=s.proposal.request_digest;
      s.grant.effect_binding="sha256:"+s.proposal.request_digest;
      s.grant.effect_class=s.proposal.request.effect_class;s.signGrant();
      expect(verifyProposedWorkGrant(s.proposal,s.grant,s.trusted,time))
        .toMatchObject({reason:"ONLY_ZERO_COST_SYNTHETIC_READ_PROFILES"});
    }
  });
  it("rejects constraint widening and untrusted plan state",()=>{
    const s=sample();s.grant.constraints.network_mode="ALLOW_ALL";s.signGrant();
    expect(verifyProposedWorkGrant(s.proposal,s.grant,s.trusted,time))
      .toMatchObject({reason:"CONSTRAINT_WIDENING_OR_UNSUPPORTED"});
    const a=sample();a.proposal.request.state="ADMITTED";a.proposal.request_digest=workSha256(a.proposal.request);
    expect(verifyProposedWorkGrant(a.proposal,a.grant,a.trusted,time))
      .toMatchObject({reason:"PLAN_STATE_INVALID"});
  });
});
