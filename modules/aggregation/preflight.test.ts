import { describe, expect, it } from "vitest";
import type {
  AccountCategoryV1, AggregationAdmissionSnapshotV1,
  AgentContributionDraftV1, IAMCommandDraftV1,
} from "./contracts.ts";
import { preflightAgentContributionV1, preflightIAMCommandV1 } from "./preflight.ts";

const at="2026-11-21T11:00:00Z";
function fixture(category: AccountCategoryV1="INDIVIDUAL"): AggregationAdmissionSnapshotV1 {
  return {
    account:{accountRef:"ACCOUNT:ONE",category,principalRef:"PRINCIPAL:ONE",
      lifecycle:"ACTIVE",registryEvidenceRef:"GENESIS:ACCOUNT-RECEIPT"},
    license:{assignmentRef:"LICENSE-ASSIGN:ONE",licenseRef:"LICENSE:ONE",
      accountRef:"ACCOUNT:ONE",accountCategory:category,principalRef:"PRINCIPAL:ONE",
      lifecycle:"ACTIVE",validFrom:"2026-11-20T00:00:00Z",validUntil:"2026-12-01T00:00:00Z",
      platformCapabilityRefs:["chat.read"],agentCapabilityRefs:["chat.read"],
      assignmentEvidenceRef:"GENESIS:LICENSE-RECEIPT"},
    membership:{membershipRef:"MEMBER:ONE",accountRef:"ACCOUNT:ONE",
      principalRef:"PRINCIPAL:ONE",actorRef:"DIGITALME:ONE",actingCapacityRef:"ROLE:MEMBER",
      licenseAssignmentRef:"LICENSE-ASSIGN:ONE",lifecycle:"ACTIVE",
      validFrom:"2026-11-20T00:00:00Z",validUntil:"2026-12-01T00:00:00Z",
      iamCommands:["AGENT_INVOKE","CONTRIBUTION_SUBMIT"],
      identityEvidenceRef:"DIGITALME:PROOF",authorityEvidenceRef:"WARDEN:ROLE-PROOF"},
    platform:{bindingRef:"PLATFORM-BIND:CHAT",platformRef:"PLATFORM:CHAT",
      providerAccountRef:"PROVIDER:ONE",accountRef:"ACCOUNT:ONE",accountCategory:category,
      licenseAssignmentRef:"LICENSE-ASSIGN:ONE",lifecycle:"ACTIVE",
      capabilityRefs:["chat.read"],providerAdmissionEvidenceRef:"GENESIS:PROVIDER-PROOF"},
    agent:{bindingRef:"AGENT-BIND:ONE",agentRef:"AGENT:ONE",issuanceRef:"ISSUANCE:ONE",
      accountRef:"ACCOUNT:ONE",accountCategory:category,licenseAssignmentRef:"LICENSE-ASSIGN:ONE",
      wardenRef:"WARDEN:ONE",lifecycle:"ACTIVE",capabilityRefs:["chat.read"],
      assignedPlatformBindingRefs:["PLATFORM-BIND:CHAT"],authorityEvidenceRef:"WARDEN:AGENT-PROOF"},
    snapshotEvidenceRef:"GENESIS:SNAPSHOT",
  };
}
const contribution:AgentContributionDraftV1={
  contributionRef:"CONTRIB:ONE",platformBindingRef:"PLATFORM-BIND:CHAT",
  agentBindingRef:"AGENT-BIND:ONE",humanOriginatorRef:"DIGITALME:ONE",
  representedPrincipalRef:"PRINCIPAL:ONE",requestedCapabilityRef:"chat.read",
  contentDigest:"SHA256:DEMO",sourceEvidenceRefs:["RIVER:SOURCE"],
  correlationId:"CORR:ONE",createdAt:at,lifecycle:"PROPOSED",authorized:false,
};
const command:IAMCommandDraftV1={
  commandRef:"COMMAND:ONE",command:"AGENT_INVOKE",
  accountRef:"ACCOUNT:ONE",requestedByActorRef:"DIGITALME:ONE",
  actingCapacityRef:"ROLE:MEMBER",licenseAssignmentRef:"LICENSE-ASSIGN:ONE",
  targetRef:"AGENT:ONE",correlationId:"CORR:ONE",requestedAt:at,
  lifecycle:"DRAFT",authorized:false,
};
const bad=(r:ReturnType<typeof preflightAgentContributionV1>, code:string)=>
  expect(r).toEqual({ok:false,reasonCode:code});

describe.each(["INDIVIDUAL","INSTITUTIONAL","ENTERPRISE"] as const)(
  "%s license-aligned aggregation",category=>{
    it("admits matching contribution to Warden review, not execution",()=>{
      expect(preflightAgentContributionV1(fixture(category),contribution)).toMatchObject({
        ok:true,state:"READY_FOR_WARDEN",accountCategory:category,authorized:false,
        licenseAssignmentRef:"LICENSE-ASSIGN:ONE",
      });
    });
    it("routes assigned IAM command for review without an action token",()=>{
      const result=preflightIAMCommandV1(fixture(category),command);
      expect(result).toMatchObject({ok:true,state:"READY_FOR_WARDEN",authorized:false});
      expect(result).not.toHaveProperty("actionToken");
    });
  },
);

describe("cross-account and authority denial",()=>{
  it("denies account category drift",()=>{
    const s=fixture();s.agent={...s.agent!,accountCategory:"ENTERPRISE"};
    bad(preflightAgentContributionV1(s,contribution),"agent_not_admitted");
  });
  it("denies unassigned platform",()=>{
    const s=fixture();s.agent={...s.agent!,assignedPlatformBindingRefs:[]};
    bad(preflightAgentContributionV1(s,contribution),"agent_platform_not_assigned");
  });
  it("denies mismatched license",()=>{
    const s=fixture();s.platform={...s.platform!,licenseAssignmentRef:"LICENSE:OTHER"};
    bad(preflightAgentContributionV1(s,contribution),"platform_not_admitted");
  });
  it("denies different human originator",()=>{
    bad(preflightAgentContributionV1(fixture(),{...contribution,humanOriginatorRef:"DIGITALME:OTHER"}),
      "contribution_scope_mismatch");
  });
  it("denies suspended account",()=>{
    const s=fixture();s.account.lifecycle="SUSPENDED";
    bad(preflightAgentContributionV1(s,contribution),"account_license_or_membership_inactive");
  });
  it("denies expired license",()=>{
    const s=fixture();s.license.validUntil="2026-11-20T23:00:00Z";
    bad(preflightAgentContributionV1(s,contribution),"license_or_membership_expired");
  });
  it("denies platform capability outside license",()=>{
    const s=fixture();s.platform={...s.platform!,capabilityRefs:["chat.write"]};
    bad(preflightAgentContributionV1(s,contribution),"platform_capability_outside_license");
  });
  it("denies agent capability outside license",()=>{
    const s=fixture();s.agent={...s.agent!,capabilityRefs:["chat.write"]};
    bad(preflightAgentContributionV1(s,contribution),"agent_capability_outside_license");
  });
  it("denies missing capability overlap",()=>{
    const s=fixture();s.agent={...s.agent!,capabilityRefs:[]};
    bad(preflightAgentContributionV1(s,contribution),"contribution_capability_not_shared");
  });
  it("denies agent contribution outside assigned human IAM",()=>{
    const s=fixture();s.membership={...s.membership,iamCommands:[]};
    bad(preflightAgentContributionV1(s,contribution),"contribution_command_not_assigned");
  });
  it("denies contribution with forged action token",()=>{
    bad(preflightAgentContributionV1(fixture(),{
      ...contribution,actionToken:"FORGED",
    } as AgentContributionDraftV1),"self_authorization_rejected");
  });
  it("denies IAM command not in membership",()=>{
    const result=preflightIAMCommandV1(fixture(),{...command,command:"LICENSE_ASSIGN"});
    expect(result).toEqual({ok:false,reasonCode:"iam_command_not_assigned"});
  });
  it("denies IAM actor mismatch",()=>{
    const result=preflightIAMCommandV1(fixture(),{...command,requestedByActorRef:"DIGITALME:OTHER"});
    expect(result).toEqual({ok:false,reasonCode:"iam_request_actor_or_license_mismatch"});
  });
  it("denies impossible IAM self-grant",()=>{
    const result=preflightIAMCommandV1(fixture(),{
      ...command,authorized:true,
    } as IAMCommandDraftV1);
    expect(result).toEqual({ok:false,reasonCode:"self_authorization_rejected"});
  });
  it("denies absent registry evidence",()=>{
    const s=fixture();s.snapshotEvidenceRef="";
    bad(preflightAgentContributionV1(s,contribution),"missing_registry_evidence");
  });
});
