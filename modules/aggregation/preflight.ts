import type {
  AggregationAdmissionSnapshotV1, AggregationPreflightV1, AgentContributionDraftV1,
  IAMCommandDraftV1, IAMCommandNameV1,
} from "./contracts.ts";

const AUTHORITY_CHANGING = new Set<IAMCommandNameV1>([
  "LICENSE_ASSIGN", "LICENSE_REVOKE", "AGENT_ISSUE", "AGENT_REVOKE",
  "PLATFORM_ATTACH", "PLATFORM_DETACH", "AGENT_BIND_PLATFORM", "AGENT_UNBIND_PLATFORM",
]);

function fail(reasonCode: string): AggregationPreflightV1 {
  return { ok: false, reasonCode };
}
function ref(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    !/[\x00-\x1f\x7f]/.test(value);
}
function time(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function period(now: number, start: string, end: string): boolean {
  const begin = time(start), finish = time(end);
  return begin !== undefined && finish !== undefined &&
    begin <= now && now < finish && begin < finish;
}
function bound(snapshot: AggregationAdmissionSnapshotV1, at: string): string | null {
  const { account, license, membership, platform, agent } = snapshot;
  const now = time(at);
  if (now === undefined) return "invalid_time";
  if (![snapshot.snapshotEvidenceRef, account.accountRef, account.principalRef,
    account.registryEvidenceRef, license.assignmentRef, license.licenseRef,
    license.assignmentEvidenceRef, membership.actorRef, membership.membershipRef,
    membership.actingCapacityRef, membership.identityEvidenceRef, membership.authorityEvidenceRef]
    .every(ref)) return "missing_registry_evidence";
  if (account.lifecycle !== "ACTIVE" || license.lifecycle !== "ACTIVE" ||
    membership.lifecycle !== "ACTIVE") return "account_license_or_membership_inactive";
  if (!period(now, license.validFrom, license.validUntil) ||
    !period(now, membership.validFrom, membership.validUntil)) return "license_or_membership_expired";
  if (account.accountRef !== license.accountRef ||
    account.accountRef !== membership.accountRef ||
    account.principalRef !== license.principalRef ||
    account.principalRef !== membership.principalRef ||
    account.category !== license.accountCategory ||
    membership.licenseAssignmentRef !== license.assignmentRef) return "account_license_mismatch";
  if (platform) {
    if (platform.lifecycle !== "ACTIVE" ||
      platform.accountRef !== account.accountRef ||
      platform.accountCategory !== account.category ||
      platform.licenseAssignmentRef !== license.assignmentRef ||
      ![platform.bindingRef,platform.platformRef,platform.providerAccountRef,platform.providerAdmissionEvidenceRef]
        .every(ref)) return "platform_not_admitted";
    if (platform.capabilityRefs.some(c => !license.platformCapabilityRefs.includes(c))) {
      return "platform_capability_outside_license";
    }
  }
  if (agent) {
    if (agent.lifecycle !== "ACTIVE" ||
      agent.accountRef !== account.accountRef ||
      agent.accountCategory !== account.category ||
      agent.licenseAssignmentRef !== license.assignmentRef ||
      ![agent.bindingRef,agent.agentRef,agent.issuanceRef,agent.wardenRef,agent.authorityEvidenceRef]
        .every(ref)) return "agent_not_admitted";
    if (agent.capabilityRefs.some(c => !license.agentCapabilityRefs.includes(c))) {
      return "agent_capability_outside_license";
    }
    if (platform && !agent.assignedPlatformBindingRefs.includes(platform.bindingRef)) {
      return "agent_platform_not_assigned";
    }
  }
  return null;
}
function evidence(snapshot: AggregationAdmissionSnapshotV1): readonly string[] {
  return [snapshot.snapshotEvidenceRef,snapshot.account.registryEvidenceRef,
    snapshot.license.assignmentEvidenceRef,snapshot.membership.identityEvidenceRef,
    snapshot.membership.authorityEvidenceRef,
    ...(snapshot.platform ? [snapshot.platform.providerAdmissionEvidenceRef] : []),
    ...(snapshot.agent ? [snapshot.agent.authorityEvidenceRef] : [])];
}

/** Read-only preflight, never a Warden authorization or IAM mutation. */
export function preflightIAMCommandV1(
  snapshot: AggregationAdmissionSnapshotV1, intent: IAMCommandDraftV1,
): AggregationPreflightV1 {
  if (intent.lifecycle !== "DRAFT" || intent.authorized !== false ||
      "actionToken" in intent) return fail("self_authorization_rejected");
  const error = bound(snapshot, intent.requestedAt);
  if (error) return fail(error);
  if (![intent.commandRef,intent.targetRef,intent.correlationId].every(ref)) {
    return fail("command_identity_missing");
  }
  if (intent.accountRef !== snapshot.account.accountRef ||
    intent.licenseAssignmentRef !== snapshot.license.assignmentRef ||
    intent.requestedByActorRef !== snapshot.membership.actorRef ||
    intent.actingCapacityRef !== snapshot.membership.actingCapacityRef) {
    return fail("iam_request_actor_or_license_mismatch");
  }
  if (!snapshot.membership.iamCommands.includes(intent.command)) {
    return fail("iam_command_not_assigned");
  }
  if (AUTHORITY_CHANGING.has(intent.command) &&
    !ref(snapshot.membership.authorityEvidenceRef)) return fail("iam_authority_evidence_missing");
  if (intent.command === "AGENT_INVOKE" && !snapshot.agent) return fail("agent_binding_required");
  return {
    ok: true, state: "READY_FOR_WARDEN", accountCategory: snapshot.account.category,
    accountRef: snapshot.account.accountRef,
    licenseAssignmentRef: snapshot.license.assignmentRef,
    correlationId: intent.correlationId, authorized: false, evidenceRefs: evidence(snapshot),
  };
}

/** Attaches contributions to a platform, agent, human originator and shared license. */
export function preflightAgentContributionV1(
  snapshot: AggregationAdmissionSnapshotV1,
  contribution: AgentContributionDraftV1,
): AggregationPreflightV1 {
  if (contribution.lifecycle !== "PROPOSED" || contribution.authorized !== false ||
      "actionToken" in contribution) return fail("self_authorization_rejected");
  const error = bound(snapshot, contribution.createdAt);
  if (error) return fail(error);
  const { platform, agent, membership, account, license } = snapshot;
  if (!platform || !agent) return fail("platform_and_agent_required");
  if (![contribution.contributionRef,contribution.contentDigest,
    contribution.correlationId].every(ref) ||
      !Array.isArray(contribution.sourceEvidenceRefs) ||
      !contribution.sourceEvidenceRefs.every(ref)) return fail("contribution_evidence_missing");
  if (contribution.platformBindingRef !== platform.bindingRef ||
    contribution.agentBindingRef !== agent.bindingRef ||
    contribution.humanOriginatorRef !== membership.actorRef ||
    contribution.representedPrincipalRef !== account.principalRef) return fail("contribution_scope_mismatch");
  if (!membership.iamCommands.includes("CONTRIBUTION_SUBMIT")) {
    return fail("contribution_command_not_assigned");
  }
  if (!platform.capabilityRefs.includes(contribution.requestedCapabilityRef) ||
    !agent.capabilityRefs.includes(contribution.requestedCapabilityRef) ||
    !license.platformCapabilityRefs.includes(contribution.requestedCapabilityRef) ||
    !license.agentCapabilityRefs.includes(contribution.requestedCapabilityRef)) {
    return fail("contribution_capability_not_shared");
  }
  return {
    ok: true, state:"READY_FOR_WARDEN",accountCategory:account.category,
    accountRef:account.accountRef,licenseAssignmentRef:license.assignmentRef,
    requestedCapabilityRef:contribution.requestedCapabilityRef,
    correlationId:contribution.correlationId,authorized:false,
    evidenceRefs:[...evidence(snapshot),...contribution.sourceEvidenceRefs],
  };
}
