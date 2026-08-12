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

export const RELEASE_TRAIN_ADAPTER_VERSION = "release-train-temporal.v1" as const;

export type ReleaseStream = "CLDR" | "ICU" | "ICU4X" | "UTC_OTHER";

export interface ReleaseAnchorEvidence {
  locator: SourceLocator;
  releaseVersion: string;
  releaseDate: string;
  rawValue: string;
}

export interface ReleaseMilestoneInput {
  locator: SourceLocator;
  stream: ReleaseStream;
  releaseVersion: string;
  sourceDate: string;
  milestoneText: string;
  durationWeeks?: number;
  sourceRemainingWeeks?: number;
  anchor: ReleaseAnchorEvidence;
  collisionConstraintRefs?: string[];
}

export interface ReleaseTrainGovernanceOverlay {
  ownerRoleRef: string;
  authorityRefs: string[];
  evidenceRequirementRefs: string[];
  dependencyRefs?: string[];
  constraintRefs?: string[];
  targetStateRef: string;
  closureConditionRef: string;
  r5CandidateRoute: string;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function asUtcDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new Error(`INVALID_DATE:${value}`);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function offsetDaysFromAnchor(sourceDate: string, anchorDate: string): number {
  const source = asUtcDate(sourceDate);
  const anchor = asUtcDate(anchorDate);
  return (source.valueOf() - anchor.valueOf()) / 86_400_000;
}

export function generateDateFromReleaseAnchor(anchorDate: string, offsetWeeks: number): string {
  if (!Number.isFinite(offsetWeeks)) throw new Error("INVALID_OFFSET_WEEKS");
  const anchor = asUtcDate(anchorDate);
  anchor.setUTCDate(anchor.getUTCDate() + offsetWeeks * 7);
  return isoDate(anchor);
}

function governanceSkeleton(): GovernanceFieldResolution[] {
  return [
    { field: "owner_role_ref", state: "UNRESOLVED", refs: [], note: "Schedule stream is not a Registry role assignment." },
    { field: "authority_refs", state: "UNRESOLVED", refs: [], note: "A milestone date does not authorize a release gate." },
    { field: "dependency_refs", state: "UNRESOLVED", refs: [], note: "Cross-program dependencies require explicit Registry references." },
    { field: "evidence_requirement_refs", state: "UNRESOLVED", refs: [], note: "Gate evidence is not established by schedule placement." },
    { field: "target_state_ref", state: "UNRESOLVED", refs: [], note: "Target release state requires governed definition." },
    { field: "closure_condition_ref", state: "UNRESOLVED", refs: [], note: "Passing time does not close a release gate." },
    { field: "r5_candidate_route", state: "UNRESOLVED", refs: [], note: "R5 is a candidate route and never authorization." },
  ];
}

export function adaptReleaseTrainMilestone(input: ReleaseMilestoneInput): NormalizedSourceProgramEvent {
  const milestoneText = input.milestoneText.trim();
  if (!milestoneText) throw new Error("EMPTY_RELEASE_MILESTONE");
  if (input.releaseVersion !== input.anchor.releaseVersion) throw new Error("RELEASE_VERSION_ANCHOR_MISMATCH");

  const offsetDays = offsetDaysFromAnchor(input.sourceDate, input.anchor.releaseDate);
  const offsetWeeks = offsetDays / 7;
  const generatedDate = generateDateFromReleaseAnchor(input.anchor.releaseDate, offsetWeeks);
  const streamSlug = slug(input.stream);
  const releaseSlug = slug(input.releaseVersion);
  const milestoneSlug = slug(milestoneText.replace(new RegExp(`^${input.releaseVersion}\\s*`, "i"), ""));
  const programRef = `program:release-train:${streamSlug}:${releaseSlug}`;
  const anchorRef = `temporal-anchor:${streamSlug}:${releaseSlug}:${input.anchor.releaseDate}`;
  const eventDefinitionRef = `event-def:release-train:${streamSlug}:${releaseSlug}:${input.locator.sourceRow ?? slug(input.locator.cellAddress)}:${milestoneSlug}`;

  const sourceConstraintRefs = [...new Set(input.collisionConstraintRefs ?? [])];
  const program: ProgramContractV1 = {
    contractVersion: PROGRAM_EVENT_CONTRACT_VERSION,
    programRef,
    programType: "RELEASE_TRAIN",
    version: 1,
    sourceRef: `source:${input.locator.fileSha256}`,
    ownerContextRef: "registry-context:UNRESOLVED",
    missionPurpose: "Generate governed release milestones from an anchor and relative temporal rules",
    targetOutcomeRefs: [],
    contextRefs: [
      `release-version:${releaseSlug}`,
      `release-stream:${streamSlug}`,
      anchorRef,
      `source-anchor-cell:${input.anchor.locator.sheetName}:${input.anchor.locator.cellAddress}`,
    ],
    participantRoleRefs: [],
    dependencyRefs: [],
    constraintRefs: sourceConstraintRefs,
    authorityRefs: [],
    requirementRefs: [
      "requirement:release-owner-resolution",
      "requirement:release-authority-resolution",
      "requirement:release-gate-evidence",
      "requirement:release-closure-definition",
    ],
    economicRuleRefs: [],
    settlementContextRefs: [],
    state: "DRAFT",
  };

  const event: EventContractV1 = {
    eventDefinitionRef,
    programRef,
    sequence: input.locator.sourceRow ?? 1,
    actorRef: "digitalme:UNRESOLVED",
    thingRef: `release-gate:${eventDefinitionRef}`,
    requestedCapability: "PASS_RELEASE_GATE",
    dependencyRefs: [],
    constraintRefs: sourceConstraintRefs,
    authorityRefs: [],
    requirementRefs: [...program.requirementRefs],
    economicRuleRefs: [],
  };

  const normalized: NormalizedSourceProgramEvent = {
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    adapterType: "RELEASE_TRAIN",
    source: {
      locator: input.locator,
      rawValue: milestoneText,
      sourceAuthorityStatus: "WORKING_CONTEXT",
    },
    program,
    event,
    workstreamRef: `release-stream:${streamSlug}`,
    relativeTemporal: {
      anchorRef,
      anchorDate: input.anchor.releaseDate,
      sourceDate: input.sourceDate,
      generatedDate,
      offsetDaysFromAnchor: offsetDays,
      offsetWeeksFromAnchor: offsetWeeks,
      durationWeeks: input.durationWeeks,
      sourceRemainingWeeks: input.sourceRemainingWeeks,
      collisionConstraintRefs: sourceConstraintRefs,
    },
    governance: governanceSkeleton(),
    lifecycleState: "READY_FOR_GOVERNANCE",
  };

  assertSourceDoesNotGrantAuthority(normalized);
  return normalized;
}

function resolved(field: GovernanceFieldResolution["field"], refs: string[], note?: string): GovernanceFieldResolution {
  return { field, state: "RESOLVED", refs, note };
}

export function applyReleaseTrainGovernanceOverlay(
  sourceItem: NormalizedSourceProgramEvent,
  overlay: ReleaseTrainGovernanceOverlay,
): NormalizedSourceProgramEvent {
  if (sourceItem.adapterType !== "RELEASE_TRAIN") throw new Error("WRONG_ADAPTER_TYPE");
  if (!overlay.ownerRoleRef) throw new Error("OWNER_ROLE_REQUIRED");
  if (!overlay.authorityRefs.length) throw new Error("AUTHORITY_REQUIRED");
  if (!overlay.evidenceRequirementRefs.length) throw new Error("EVIDENCE_REQUIREMENT_REQUIRED");
  if (!overlay.targetStateRef) throw new Error("TARGET_STATE_REQUIRED");
  if (!overlay.closureConditionRef) throw new Error("CLOSURE_CONDITION_REQUIRED");
  if (!overlay.r5CandidateRoute) throw new Error("R5_ROUTE_REQUIRED");

  const dependencyRefs = [...new Set(overlay.dependencyRefs ?? [])];
  const constraintRefs = [
    ...new Set([...(sourceItem.event.constraintRefs ?? []), ...(overlay.constraintRefs ?? [])]),
  ];
  const authorityRefs = [...new Set(overlay.authorityRefs)];
  const requirementRefs = [...new Set(overlay.evidenceRequirementRefs)];

  const governed: NormalizedSourceProgramEvent = {
    ...sourceItem,
    program: {
      ...sourceItem.program,
      ownerContextRef: overlay.ownerRoleRef,
      participantRoleRefs: [overlay.ownerRoleRef],
      authorityRefs,
      requirementRefs,
      dependencyRefs,
      constraintRefs,
      targetOutcomeRefs: [overlay.targetStateRef],
      state: "READY_FOR_AUTHORIZATION",
    },
    event: {
      ...sourceItem.event,
      actorRef: `digitalme-for:${overlay.ownerRoleRef}`,
      actingCapacityRef: overlay.ownerRoleRef,
      authorityRefs,
      requirementRefs,
      dependencyRefs,
      constraintRefs,
    },
    ownerRoleRef: overlay.ownerRoleRef,
    targetStateRef: overlay.targetStateRef,
    closureConditionRef: overlay.closureConditionRef,
    r5CandidateRoute: overlay.r5CandidateRoute,
    governance: [
      resolved("owner_role_ref", [overlay.ownerRoleRef]),
      resolved("authority_refs", authorityRefs),
      resolved("dependency_refs", dependencyRefs, dependencyRefs.length ? undefined : "No cross-program dependency supplied for this sandbox gate."),
      resolved("evidence_requirement_refs", requirementRefs),
      resolved("target_state_ref", [overlay.targetStateRef]),
      resolved("closure_condition_ref", [overlay.closureConditionRef]),
      resolved("r5_candidate_route", [overlay.r5CandidateRoute]),
    ],
    lifecycleState: "READY_FOR_RUNTIME",
  };

  if (unresolvedGovernanceFields(governed).length) throw new Error("GOVERNANCE_OVERLAY_INCOMPLETE");
  assertSourceDoesNotGrantAuthority(governed);
  return governed;
}
