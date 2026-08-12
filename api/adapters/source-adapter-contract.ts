import type { EventContractV1, ProgramContractV1 } from "../runtime/program-event-contract.js";

export const SOURCE_ADAPTER_CONTRACT_VERSION = "synnergyze.source-adapter.v1" as const;

export type SourceAuthorityStatus = "AUTHORITATIVE" | "WORKING_CONTEXT" | "DERIVED" | "DISPLAY";

export type GovernanceFieldState = "UNRESOLVED" | "RESOLVED" | "NOT_APPLICABLE";

export interface SourceLocator {
  fileName: string;
  fileSha256: string;
  sheetName: string;
  cellAddress: string;
  sourceRow?: number;
  sourceColumn?: string;
  sourceSerial?: number;
}

export interface SourceValueEvidence {
  locator: SourceLocator;
  rawValue: string;
  sourceAuthorityStatus: SourceAuthorityStatus;
}

export interface GovernanceFieldResolution {
  field:
    | "owner_role_ref"
    | "authority_refs"
    | "dependency_refs"
    | "evidence_requirement_refs"
    | "target_state_ref"
    | "closure_condition_ref"
    | "r5_candidate_route";
  state: GovernanceFieldState;
  refs: string[];
  note?: string;
}

export interface TemporalProjection {
  calendarYear: number;
  monthLabel: string;
  cycleRef: string;
  dueWindowRef?: string;
}

export interface NormalizedSourceProgramEvent {
  contractVersion: typeof SOURCE_ADAPTER_CONTRACT_VERSION;
  adapterType: "ANNUAL_OPERATING_CALENDAR" | "RELEASE_TRAIN" | "CREATOR_PROGRAMME" | "ECONOMIC_MODEL";
  source: SourceValueEvidence;
  program: ProgramContractV1;
  event: EventContractV1;
  workstreamRef?: string;
  ownerRoleRef?: string;
  temporal?: TemporalProjection;
  governance: GovernanceFieldResolution[];
  targetStateRef?: string;
  closureConditionRef?: string;
  r5CandidateRoute?: string;
  lifecycleState: "DRAFT" | "READY_FOR_GOVERNANCE" | "READY_FOR_RUNTIME" | "SUPERSEDED";
  supersedesAdapterRef?: string;
}

export function unresolvedGovernanceFields(item: NormalizedSourceProgramEvent): string[] {
  return item.governance.filter((field) => field.state === "UNRESOLVED").map((field) => field.field);
}

export function assertSourceDoesNotGrantAuthority(item: NormalizedSourceProgramEvent): void {
  if (item.source.sourceAuthorityStatus === "AUTHORITATIVE") return;

  const sourceValue = item.source.rawValue.trim();
  if (!sourceValue) throw new Error("SOURCE_VALUE_EMPTY");

  // Authority may only arrive through explicit governance refs, never by interpreting the cell text.
  if (item.program.authorityRefs.some((ref) => ref === sourceValue) || item.event.authorityRefs.some((ref) => ref === sourceValue)) {
    throw new Error("SOURCE_TEXT_PROMOTED_TO_AUTHORITY");
  }
}
