/**
 * SYN-WARDEN-AGG-001 — paired platform/agent aggregation.
 *
 * Genesis owns the authoritative account/license/identity registry.
 * Synnergyze presents and orchestrates platform bindings.
 * Warden catalogs agent bindings and independently adjudicates authority.
 * RiverOS receives subsequent admitted transitions/evidence.
 *
 * All records in this module are *trusted server-side snapshot contracts*.
 * They are NOT MCP inputs or a source of authority by themselves.
 */
export type AccountCategoryV1 = "INDIVIDUAL" | "INSTITUTIONAL" | "ENTERPRISE";
export type AggregationLifecycleV1 = "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface GenesisAccountV1 {
  accountRef: string;
  category: AccountCategoryV1;
  principalRef: string;
  lifecycle: AggregationLifecycleV1;
  registryEvidenceRef: string;
}

export interface GenesisLicenseAssignmentV1 {
  assignmentRef: string;
  licenseRef: string;
  accountRef: string;
  accountCategory: AccountCategoryV1;
  principalRef: string;
  lifecycle: AggregationLifecycleV1;
  validFrom: string;
  validUntil: string;
  platformCapabilityRefs: readonly string[];
  agentCapabilityRefs: readonly string[];
  assignmentEvidenceRef: string;
}

/** Issued by a trusted identity and IAM resolver, never from client JSON. */
export interface ResolvedAccountMembershipV1 {
  membershipRef: string;
  accountRef: string;
  principalRef: string;
  actorRef: string;
  actingCapacityRef: string;
  licenseAssignmentRef: string;
  lifecycle: AggregationLifecycleV1;
  validFrom: string;
  validUntil: string;
  iamCommands: readonly IAMCommandNameV1[];
  identityEvidenceRef: string;
  authorityEvidenceRef: string;
}

/** Synnergyze aggregates provider/platform accounts, not their legal ownership. */
export interface SynnergyzePlatformBindingV1 {
  bindingRef: string;
  platformRef: string;
  providerAccountRef: string;
  accountRef: string;
  accountCategory: AccountCategoryV1;
  licenseAssignmentRef: string;
  lifecycle: AggregationLifecycleV1;
  capabilityRefs: readonly string[];
  providerAdmissionEvidenceRef: string;
}

/** Warden aggregates agent appointments, not underlying model ownership. */
export interface WardenAgentBindingV1 {
  bindingRef: string;
  agentRef: string;
  issuanceRef: string;
  accountRef: string;
  accountCategory: AccountCategoryV1;
  licenseAssignmentRef: string;
  wardenRef: string;
  lifecycle: AggregationLifecycleV1;
  capabilityRefs: readonly string[];
  assignedPlatformBindingRefs: readonly string[];
  authorityEvidenceRef: string;
}

export type IAMCommandNameV1 =
  | "LICENSE_ASSIGN" | "LICENSE_REVOKE"
  | "PLATFORM_ATTACH" | "PLATFORM_DETACH"
  | "AGENT_ISSUE" | "AGENT_REVOKE"
  | "AGENT_BIND_PLATFORM" | "AGENT_UNBIND_PLATFORM"
  | "AGENT_INVOKE"
  | "CONTRIBUTION_SUBMIT" | "CONTRIBUTION_READ";

export interface IAMCommandDraftV1 {
  commandRef: string;
  command: IAMCommandNameV1;
  accountRef: string;
  requestedByActorRef: string;
  actingCapacityRef: string;
  licenseAssignmentRef: string;
  targetRef: string;
  correlationId: string;
  requestedAt: string;
  lifecycle: "DRAFT";
  authorized: false;
  actionToken?: never;
}

/** Contributions originate with a human, and remain unapproved drafts. */
export interface AgentContributionDraftV1 {
  contributionRef: string;
  platformBindingRef: string;
  agentBindingRef: string;
  humanOriginatorRef: string;
  representedPrincipalRef: string;
  requestedCapabilityRef: string;
  contentDigest: string;
  sourceEvidenceRefs: readonly string[];
  correlationId: string;
  createdAt: string;
  lifecycle: "PROPOSED";
  authorized: false;
  actionToken?: never;
}

export interface AggregationAdmissionSnapshotV1 {
  account: GenesisAccountV1;
  license: GenesisLicenseAssignmentV1;
  membership: ResolvedAccountMembershipV1;
  platform?: SynnergyzePlatformBindingV1;
  agent?: WardenAgentBindingV1;
  /** Trusted Genesis/IAM resolver evidence proving this snapshot's provenance. */
  snapshotEvidenceRef: string;
}

export type AggregationPreflightV1 =
  | Readonly<{ ok: false; reasonCode: string }>
  | Readonly<{
      ok: true;
      state: "READY_FOR_WARDEN";
      accountCategory: AccountCategoryV1;
      accountRef: string;
      licenseAssignmentRef: string;
      requestedCapabilityRef?: string;
      correlationId: string;
      authorized: false;
      evidenceRefs: readonly string[];
    }>;
