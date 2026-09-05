import type { AcquisitionState, SourceRegistry } from "./acquisition.ts";

export interface ProjectionAcquisitionRecord {
  sourceRegistry: SourceRegistry;
  sourceNodeId: string | null;
  state: AcquisitionState;
  countable: boolean;
}

export interface SourceNodeYield {
  sourceRegistry: SourceRegistry;
  sourceNodeId: string;
  opportunities: number;
  engaged: number;
  qualified: number;
  commercialAgreed: number;
  provisioned: number;
  countableNodes: number;
  activeNodes: number;
}

const stateOrder: AcquisitionState[] = [
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
  "DISQUALIFIED",
  "DEFERRED",
  "WITHDRAWN",
  "LOST",
  "SUSPENDED",
];

const stateRank = new Map(stateOrder.map((state, index) => [state, index]));
const rankOf = (state: AcquisitionState) => stateRank.get(state) ?? -1;
const reached = (state: AcquisitionState, threshold: AcquisitionState) =>
  rankOf(state) >= rankOf(threshold) && rankOf(state) <= rankOf("NODE_ACTIVE");

export function sourceNodeYield(records: ProjectionAcquisitionRecord[]): SourceNodeYield[] {
  const yields = new Map<string, SourceNodeYield>();

  for (const record of records) {
    if (!record.sourceNodeId) continue;
    const key = `${record.sourceRegistry}:${record.sourceNodeId}`;
    const current = yields.get(key) ?? {
      sourceRegistry: record.sourceRegistry,
      sourceNodeId: record.sourceNodeId,
      opportunities: 0,
      engaged: 0,
      qualified: 0,
      commercialAgreed: 0,
      provisioned: 0,
      countableNodes: 0,
      activeNodes: 0,
    };

    current.opportunities += 1;
    if (reached(record.state, "ENGAGED")) current.engaged += 1;
    if (reached(record.state, "QUALIFIED")) current.qualified += 1;
    if (reached(record.state, "COMMERCIAL_AGREED")) current.commercialAgreed += 1;
    if (reached(record.state, "NODE_REGISTERED")) current.provisioned += 1;
    if (record.countable) current.countableNodes += 1;
    if (record.state === "NODE_ACTIVE") current.activeNodes += 1;

    yields.set(key, current);
  }

  return [...yields.values()].sort((a, b) =>
    `${a.sourceRegistry}:${a.sourceNodeId}`.localeCompare(`${b.sourceRegistry}:${b.sourceNodeId}`),
  );
}

export function acquisitionFunnel(
  records: Pick<ProjectionAcquisitionRecord, "state">[],
): Array<{ state: AcquisitionState; count: number }> {
  const counts = new Map<AcquisitionState, number>();
  for (const { state } of records) counts.set(state, (counts.get(state) ?? 0) + 1);

  return [...counts.entries()]
    .sort(([a], [b]) => rankOf(a) - rankOf(b))
    .map(([state, count]) => ({ state, count }));
}

export function toolkitForwardDemand(
  requirements: Array<{ toolkitId: string }>,
): Array<{ toolkitId: string; count: number }> {
  const counts = new Map<string, number>();
  for (const { toolkitId } of requirements) {
    counts.set(toolkitId, (counts.get(toolkitId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([toolkitId, count]) => ({ toolkitId, count }));
}
