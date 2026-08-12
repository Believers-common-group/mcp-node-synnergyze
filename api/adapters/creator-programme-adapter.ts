import {
  PROGRAM_EVENT_CONTRACT_VERSION,
  type EventContractV1,
  type ProgramContractV1,
} from "../runtime/program-event-contract.js";
import {
  SOURCE_ADAPTER_CONTRACT_VERSION,
  assertSourceDoesNotGrantAuthority,
  unresolvedGovernanceFields,
  type GovernanceFieldResolution,
  type NormalizedSourceProgramEvent,
  type SourceLocator,
} from "./source-adapter-contract.js";

export const CREATOR_PROGRAMME_ADAPTER_VERSION = "creator-property-participation.v1" as const;
export const CREATOR_PROGRAMME_REF = "VSR-CC-PROP-PROG-001" as const;

export type LicenceEffectState = "NOT_EFFECTIVE" | "EFFECTIVE_SANDBOX";
export type ComputationPermission = "ALLOW" | "CONDITIONAL" | "DENY";

export interface CreatorSourceCalendarEvidence {
  locator: SourceLocator;
  day: number;
  contentTheme: string;
  hook: string;
  caption: string;
  cta: string;
  status: string;
}

export interface CreatorMasterEventInput {
  locator: SourceLocator;
  sourceCalendar: CreatorSourceCalendarEvidence;
  eventId: string;
  day: number;
  programmeAct: string;
  contentPillar: string;
  programmeRail: string;
  contentTheme: string;
  openingHook: string;
  registryResolution: string;
  sourceAssetId: string;
  evidenceRequirementText: string;
  rightsAuthorityGateText: string;
  creatorBrief: string;
  ctaRequestRoute: string;
  expectedEffectText: string;
  cclProfileRef: string;
  wardenDecision: string;
  programmeState: string;
}

export interface CreatorProgrammeGovernanceOverlay {
  creatorDigitalMeRef: string;
  actingCapacityRef: string;
  placeRef: string;
  authorityRefs: string[];
  evidenceRequirementRefs: string[];
  cclAcceptanceRef: string;
  ccreEnvelopeRef: string;
  targetStateRef: string;
  closureConditionRef: string;
  r5CandidateRoute: string;
}

export interface CreatorProgrammeNormalizedEvent extends NormalizedSourceProgramEvent {
  programmeRef: typeof CREATOR_PROGRAMME_REF;
  sourceCalendar: CreatorSourceCalendarEvidence;
  sourceAssetId: string;
  cclProfileRef: string;
  ccreEnvelopeRef?: string;
  licenceEffectState: LicenceEffectState;
  ctaText: string;
  ctaRouteText: string;
  expectedEffectText: string;
  rightsAuthorityGateText: string;
  economicsState: "NEEDS_POLICY";
  computationPermissions: {
    VIEW: ComputationPermission;
    INDEX: ComputationPermission;
    EMBED: ComputationPermission;
    RAG: ComputationPermission;
    TRAIN: ComputationPermission;
    FINE_TUNE: ComputationPermission;
    DISTILL: ComputationPermission;
  };
}

function governanceSkeleton(): GovernanceFieldResolution[] {
  return [
    { field: "owner_role_ref", state: "UNRESOLVED", refs: [], note: "Creator role/capacity must resolve through Registry/DigitalMe." },
    { field: "authority_refs", state: "UNRESOLVED", refs: [], note: "Submission, upload, selection, signature and payment do not establish controlled rights." },
    { field: "dependency_refs", state: "UNRESOLVED", refs: [], note: "Place/source/CCRE/CCL dependencies require explicit governed references." },
    { field: "evidence_requirement_refs", state: "UNRESOLVED", refs: [], note: "Master text describes evidence classes but does not prove evidence satisfaction." },
    { field: "target_state_ref", state: "UNRESOLVED", refs: [], note: "Expected effect text is a programme expectation, not a verified Effect." },
    { field: "closure_condition_ref", state: "UNRESOLVED", refs: [], note: "Publication, reach or payment alone cannot close the Event." },
    { field: "r5_candidate_route", state: "UNRESOLVED", refs: [], note: "CTA/request route is a candidate next action, not authority or entitlement." },
  ];
}

export function adaptCreatorProgrammeEvent(input: CreatorMasterEventInput): CreatorProgrammeNormalizedEvent {
  if (input.day <= 0 || input.sourceCalendar.day !== input.day) throw new Error("CREATOR_DAY_MISMATCH");
  if (input.sourceCalendar.contentTheme.trim() !== input.contentTheme.trim()) throw new Error("CREATOR_THEME_SOURCE_MISMATCH");
  if (!input.eventId.startsWith("VSR-CC-PROP-EVT-")) throw new Error("INVALID_CREATOR_EVENT_ID");
  if (input.wardenDecision.trim().toUpperCase() !== "PENDING") throw new Error("SOURCE_WARDEN_STATE_MUST_REMAIN_PENDING");

  const program: ProgramContractV1 = {
    contractVersion: PROGRAM_EVENT_CONTRACT_VERSION,
    programRef: CREATOR_PROGRAMME_REF,
    programType: "CREATOR_PROPERTY_PARTICIPATION",
    version: 1,
    sourceRef: `source:${input.locator.fileSha256}`,
    ownerContextRef: "registry-context:ALPHA-NODE-001",
    missionPurpose: "Turn registered Places/property evidence into licensed creator contributions and governed participation requests without collapsing ownership, authority, truth, output or economics",
    targetOutcomeRefs: [],
    contextRefs: [
      "registry-home:ALPHA-NODE-001",
      "gate:VSR:FRONT",
      "gate:EMPIRE:BACK",
      `programme-act:${input.programmeAct}`,
      `programme-rail:${input.programmeRail}`,
      `content-pillar:${input.contentPillar}`,
      `ccl-profile:${input.cclProfileRef}`,
    ],
    participantRoleRefs: [],
    dependencyRefs: [
      `source-asset:${input.sourceAssetId}`,
      "dependency:registered-place",
      "dependency:ccre-envelope",
      "dependency:ccl-acceptance",
      "dependency:warden-authorization",
    ],
    constraintRefs: [
      "constraint:source-ne-model-ne-output",
      "constraint:registration-ne-ownership",
      "constraint:signature-ne-authority",
      "constraint:payment-ne-rights-transfer",
      "constraint:reach-ne-effect",
      "constraint:economics-needs-policy",
    ],
    authorityRefs: [],
    requirementRefs: [
      "requirement:creator-authority-verification",
      "requirement:source-media-rights",
      "requirement:property-claim-scope",
      "requirement:ccl-acceptance",
      "requirement:warden-authorization",
      "requirement:creator-event-evidence",
    ],
    economicRuleRefs: [],
    settlementContextRefs: [],
    state: "DRAFT",
  };

  const event: EventContractV1 = {
    eventDefinitionRef: input.eventId,
    programRef: CREATOR_PROGRAMME_REF,
    sequence: input.day,
    actorRef: "digitalme:UNRESOLVED",
    thingRef: `source-asset:${input.sourceAssetId}`,
    requestedCapability: "CREATE_LICENSED_PROPERTY_STORY",
    dependencyRefs: [...program.dependencyRefs],
    constraintRefs: [...program.constraintRefs],
    authorityRefs: [],
    requirementRefs: [...program.requirementRefs],
    economicRuleRefs: [],
  };

  const item: CreatorProgrammeNormalizedEvent = {
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    adapterType: "CREATOR_PROGRAMME",
    source: {
      locator: input.locator,
      rawValue: input.contentTheme.trim(),
      sourceAuthorityStatus: "WORKING_CONTEXT",
    },
    program,
    event,
    workstreamRef: `programme-rail:${input.programmeRail}`,
    governance: governanceSkeleton(),
    r5CandidateRoute: input.ctaRequestRoute,
    lifecycleState: "READY_FOR_GOVERNANCE",
    programmeRef: CREATOR_PROGRAMME_REF,
    sourceCalendar: input.sourceCalendar,
    sourceAssetId: input.sourceAssetId,
    cclProfileRef: input.cclProfileRef,
    licenceEffectState: "NOT_EFFECTIVE",
    ctaText: input.sourceCalendar.cta,
    ctaRouteText: input.ctaRequestRoute,
    expectedEffectText: input.expectedEffectText,
    rightsAuthorityGateText: input.rightsAuthorityGateText,
    economicsState: "NEEDS_POLICY",
    computationPermissions: {
      VIEW: "ALLOW",
      INDEX: "CONDITIONAL",
      EMBED: "CONDITIONAL",
      RAG: "CONDITIONAL",
      TRAIN: "DENY",
      FINE_TUNE: "DENY",
      DISTILL: "DENY",
    },
  };

  assertSourceDoesNotGrantAuthority(item);
  return item;
}

function resolved(field: GovernanceFieldResolution["field"], refs: string[], note?: string): GovernanceFieldResolution {
  return { field, state: "RESOLVED", refs, note };
}

export function applyCreatorProgrammeSandboxOverlay(
  sourceItem: CreatorProgrammeNormalizedEvent,
  overlay: CreatorProgrammeGovernanceOverlay,
): CreatorProgrammeNormalizedEvent {
  if (!overlay.creatorDigitalMeRef.startsWith("digitalme:sandbox:")) throw new Error("SANDBOX_DIGITALME_REQUIRED");
  if (!overlay.authorityRefs.length || !overlay.authorityRefs.every((ref) => ref.startsWith("authority:sandbox:"))) {
    throw new Error("SANDBOX_AUTHORITY_REQUIRED");
  }
  if (!overlay.cclAcceptanceRef.startsWith("ccl-acceptance:sandbox:")) throw new Error("SANDBOX_CCL_ACCEPTANCE_REQUIRED");
  if (!overlay.ccreEnvelopeRef.startsWith("ccre:sandbox:")) throw new Error("SANDBOX_CCRE_REQUIRED");
  if (!overlay.evidenceRequirementRefs.length) throw new Error("EVIDENCE_REQUIREMENT_REQUIRED");
  if (!overlay.placeRef.startsWith("place:sandbox:")) throw new Error("SANDBOX_PLACE_REQUIRED");

  const dependencyRefs = [
    `source-asset:${sourceItem.sourceAssetId}`,
    overlay.placeRef,
    overlay.cclAcceptanceRef,
    overlay.ccreEnvelopeRef,
  ];
  const authorityRefs = [...new Set(overlay.authorityRefs)];
  const evidenceRequirementRefs = [...new Set(overlay.evidenceRequirementRefs)];

  const governed: CreatorProgrammeNormalizedEvent = {
    ...sourceItem,
    program: {
      ...sourceItem.program,
      participantRoleRefs: [overlay.actingCapacityRef],
      authorityRefs,
      requirementRefs: evidenceRequirementRefs,
      dependencyRefs,
      targetOutcomeRefs: [overlay.targetStateRef],
      state: "READY_FOR_AUTHORIZATION",
    },
    event: {
      ...sourceItem.event,
      actorRef: overlay.creatorDigitalMeRef,
      actingCapacityRef: overlay.actingCapacityRef,
      placeRef: overlay.placeRef,
      authorityRefs,
      requirementRefs: evidenceRequirementRefs,
      dependencyRefs,
    },
    ownerRoleRef: overlay.actingCapacityRef,
    ccreEnvelopeRef: overlay.ccreEnvelopeRef,
    licenceEffectState: "EFFECTIVE_SANDBOX",
    targetStateRef: overlay.targetStateRef,
    closureConditionRef: overlay.closureConditionRef,
    r5CandidateRoute: overlay.r5CandidateRoute,
    governance: [
      resolved("owner_role_ref", [overlay.actingCapacityRef]),
      resolved("authority_refs", authorityRefs),
      resolved("dependency_refs", dependencyRefs),
      resolved("evidence_requirement_refs", evidenceRequirementRefs),
      resolved("target_state_ref", [overlay.targetStateRef]),
      resolved("closure_condition_ref", [overlay.closureConditionRef]),
      resolved("r5_candidate_route", [overlay.r5CandidateRoute], "CTA resolves only to a governed candidate route."),
    ],
    lifecycleState: "READY_FOR_RUNTIME",
  };

  if (unresolvedGovernanceFields(governed).length) throw new Error("CREATOR_GOVERNANCE_OVERLAY_INCOMPLETE");
  if (governed.computationPermissions.TRAIN !== "DENY") throw new Error("TRAIN_PERMISSION_ESCALATED");
  assertSourceDoesNotGrantAuthority(governed);
  return governed;
}
