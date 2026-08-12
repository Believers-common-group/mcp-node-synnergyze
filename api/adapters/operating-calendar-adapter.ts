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

export const OPERATING_CALENDAR_ADAPTER_VERSION = "annual-operating-calendar.v1" as const;

export interface OperatingCalendarCellInput {
  locator: SourceLocator;
  calendarYear: number;
  monthLabel: string;
  serial: number;
  workstreamHeader: string;
  taskText: string;
}

export interface OperatingCalendarGovernanceOverlay {
  ownerRoleRef: string;
  authorityRefs: string[];
  evidenceRequirementRefs: string[];
  dependencyRefs?: string[];
  constraintRefs?: string[];
  targetStateRef: string;
  closureConditionRef: string;
  r5CandidateRoute: string;
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  frebuary: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  decemeber: 12,
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function monthNumber(label: string): number {
  const normalized = label.trim().toLowerCase();
  const value = MONTHS[normalized];
  if (!value) throw new Error(`UNSUPPORTED_MONTH:${label}`);
  return value;
}

function governanceSkeleton(): GovernanceFieldResolution[] {
  return [
    { field: "owner_role_ref", state: "UNRESOLVED", refs: [], note: "Source column names a function, not a Registry role assignment." },
    { field: "authority_refs", state: "UNRESOLVED", refs: [], note: "Workbook text does not establish authority." },
    { field: "dependency_refs", state: "UNRESOLVED", refs: [], note: "Dependencies are not explicit in the source cell." },
    { field: "evidence_requirement_refs", state: "UNRESOLVED", refs: [], note: "Completion evidence must be defined outside the source workbook." },
    { field: "target_state_ref", state: "UNRESOLVED", refs: [], note: "Target state is not explicit in the source cell." },
    { field: "closure_condition_ref", state: "UNRESOLVED", refs: [], note: "A checkbox or status alone cannot prove closure." },
    { field: "r5_candidate_route", state: "UNRESOLVED", refs: [], note: "Routing is a governed runtime decision, not source authority." },
  ];
}

export function adaptOperatingCalendarCell(input: OperatingCalendarCellInput): NormalizedSourceProgramEvent {
  const taskText = input.taskText.trim();
  if (!taskText) throw new Error("EMPTY_CALENDAR_TASK");
  if (!Number.isInteger(input.serial) || input.serial <= 0) throw new Error("INVALID_CALENDAR_SERIAL");

  const month = monthNumber(input.monthLabel);
  const workstreamSlug = slug(input.workstreamHeader.replace(/task list/gi, ""));
  if (!workstreamSlug) throw new Error("EMPTY_WORKSTREAM");

  const programRef = `program:annual-operating-calendar:${input.calendarYear}`;
  const cycleRef = `program-cycle:${input.calendarYear}:${String(month).padStart(2, "0")}`;
  const eventDefinitionRef = `event-def:annual-calendar:${input.calendarYear}:${String(month).padStart(2, "0")}:${input.serial}:${workstreamSlug}`;
  const workstreamRef = `workstream:${workstreamSlug}`;

  const program: ProgramContractV1 = {
    contractVersion: PROGRAM_EVENT_CONTRACT_VERSION,
    programRef,
    programType: "ANNUAL_OPERATING_CALENDAR",
    version: 1,
    sourceRef: `source:${input.locator.fileSha256}`,
    ownerContextRef: "registry-context:UNRESOLVED",
    missionPurpose: "Normalize annual cross-functional operating work into governed Program/Event definitions",
    targetOutcomeRefs: [],
    contextRefs: [cycleRef, workstreamRef],
    participantRoleRefs: [],
    dependencyRefs: [],
    constraintRefs: [],
    authorityRefs: [],
    requirementRefs: [
      "requirement:calendar-owner-resolution",
      "requirement:calendar-authority-resolution",
      "requirement:calendar-evidence-definition",
      "requirement:calendar-closure-definition",
    ],
    economicRuleRefs: [],
    settlementContextRefs: [],
    state: "DRAFT",
  };

  const event: EventContractV1 = {
    eventDefinitionRef,
    programRef,
    sequence: input.serial,
    actorRef: "digitalme:UNRESOLVED",
    thingRef: `work-item:${eventDefinitionRef}`,
    requestedCapability: "COMPLETE_OPERATING_WORK_ITEM",
    dependencyRefs: [],
    constraintRefs: [],
    authorityRefs: [],
    requirementRefs: [...program.requirementRefs],
    economicRuleRefs: [],
  };

  const normalized: NormalizedSourceProgramEvent = {
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    adapterType: "ANNUAL_OPERATING_CALENDAR",
    source: {
      locator: input.locator,
      rawValue: taskText,
      sourceAuthorityStatus: "WORKING_CONTEXT",
    },
    program,
    event,
    workstreamRef,
    temporal: {
      calendarYear: input.calendarYear,
      monthLabel: input.monthLabel,
      cycleRef,
      dueWindowRef: `temporal-window:${input.calendarYear}:${String(month).padStart(2, "0")}`,
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

export function applyOperatingCalendarGovernanceOverlay(
  sourceItem: NormalizedSourceProgramEvent,
  overlay: OperatingCalendarGovernanceOverlay,
): NormalizedSourceProgramEvent {
  if (sourceItem.adapterType !== "ANNUAL_OPERATING_CALENDAR") throw new Error("WRONG_ADAPTER_TYPE");
  if (!overlay.ownerRoleRef) throw new Error("OWNER_ROLE_REQUIRED");
  if (!overlay.authorityRefs.length) throw new Error("AUTHORITY_REQUIRED");
  if (!overlay.evidenceRequirementRefs.length) throw new Error("EVIDENCE_REQUIREMENT_REQUIRED");
  if (!overlay.targetStateRef) throw new Error("TARGET_STATE_REQUIRED");
  if (!overlay.closureConditionRef) throw new Error("CLOSURE_CONDITION_REQUIRED");
  if (!overlay.r5CandidateRoute) throw new Error("R5_ROUTE_REQUIRED");

  const dependencyRefs = overlay.dependencyRefs ?? [];
  const constraintRefs = overlay.constraintRefs ?? [];
  const requirementRefs = [...new Set(overlay.evidenceRequirementRefs)];
  const authorityRefs = [...new Set(overlay.authorityRefs)];

  const program: ProgramContractV1 = {
    ...sourceItem.program,
    ownerContextRef: overlay.ownerRoleRef,
    participantRoleRefs: [overlay.ownerRoleRef],
    authorityRefs,
    requirementRefs,
    dependencyRefs,
    constraintRefs,
    targetOutcomeRefs: [overlay.targetStateRef],
    state: "READY_FOR_AUTHORIZATION",
  };

  const event: EventContractV1 = {
    ...sourceItem.event,
    actorRef: `digitalme-for:${overlay.ownerRoleRef}`,
    actingCapacityRef: overlay.ownerRoleRef,
    authorityRefs,
    requirementRefs,
    dependencyRefs,
    constraintRefs,
  };

  const governed: NormalizedSourceProgramEvent = {
    ...sourceItem,
    program,
    event,
    ownerRoleRef: overlay.ownerRoleRef,
    targetStateRef: overlay.targetStateRef,
    closureConditionRef: overlay.closureConditionRef,
    r5CandidateRoute: overlay.r5CandidateRoute,
    governance: [
      resolved("owner_role_ref", [overlay.ownerRoleRef]),
      resolved("authority_refs", authorityRefs),
      resolved("dependency_refs", dependencyRefs, dependencyRefs.length ? undefined : "No dependencies supplied for this sandbox instance."),
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
