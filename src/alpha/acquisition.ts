export type SourceRegistry = "BC" | "VSR" | "CC" | "EXTERNAL";

export type SourceObjectType =
  | "NODE"
  | "PRINCIPAL"
  | "ORGANISATION"
  | "LOCATION"
  | "PROGRAMME"
  | "ROUTE"
  | "OTHER";

export type AcquisitionState =
  | "DISCOVERED"
  | "SELECTED_FOR_OUTREACH"
  | "CONTACTED"
  | "ENGAGED"
  | "DISCOVERY_ACTIVE"
  | "QUALIFIED"
  | "SOLUTION_MAPPED"
  | "PROPOSAL_ACTIVE"
  | "COMMERCIAL_AGREED"
  | "PROVISIONING_READY"
  | "PROVISIONING"
  | "WARDEN_ADMISSION"
  | "NODE_REGISTERED"
  | "NODE_ACTIVE"
  | "DISQUALIFIED"
  | "DEFERRED"
  | "WITHDRAWN"
  | "LOST"
  | "SUSPENDED";

const canonicalPath: AcquisitionState[] = [
  "DISCOVERED",
  "SELECTED_FOR_OUTREACH",
  "CONTACTED",
  "ENGAGED",
  "DISCOVERY_ACTIVE",
  "QUALIFIED",
  "SOLUTION_MAPPED",
  "PROPOSAL_ACTIVE",
  "COMMERCIAL_AGREED",
  "PROVISIONING_READY",
  "PROVISIONING",
  "WARDEN_ADMISSION",
  "NODE_REGISTERED",
  "NODE_ACTIVE",
];

const preRegistrationExitStates = new Set<AcquisitionState>([
  "DISQUALIFIED",
  "DEFERRED",
  "WITHDRAWN",
  "LOST",
]);

export function isAllowedTransition(from: AcquisitionState, to: AcquisitionState): boolean {
  const index = canonicalPath.indexOf(from);
  if (index >= 0 && canonicalPath[index + 1] === to) return true;

  if (index >= 0 && index < canonicalPath.indexOf("NODE_REGISTERED")) {
    return preRegistrationExitStates.has(to);
  }

  return (from === "NODE_REGISTERED" || from === "NODE_ACTIVE") && to === "SUSPENDED";
}

export function assertAllowedTransition(from: AcquisitionState, to: AcquisitionState): void {
  if (!isAllowedTransition(from, to)) {
    throw new Error(`Illegal acquisition transition: ${from} -> ${to}`);
  }
}

export interface PrimarySourceInput {
  registry: SourceRegistry;
  sourceObjectType: SourceObjectType;
  sourceObjectId: string | null;
}

export function validatePrimarySource(input: PrimarySourceInput): PrimarySourceInput {
  if (input.registry !== "EXTERNAL" && !input.sourceObjectId?.trim()) {
    throw new Error(`${input.registry} primary source requires sourceObjectId`);
  }

  return input;
}
