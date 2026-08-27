import type { HealthEvidenceObservationV1 } from "./contracts.ts";

export interface SentinelXHostObservationInputV1 {
  genesisSubjectRef: string;
  sentinelxHostRef: string;
  hostname: string;
  label: string;
  agentVersion: string;
  observedAt: string;
  sourceEvidenceRef: string;
  reachable: boolean;
}

export interface SentinelXHostObservationV1 {
  version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1";
  subjectRef: string;
  adapterRef: "SENTINELX";
  adapterHostRef: string;
  hostname: string;
  label: string;
  agentVersion: string;
  observedAt: string;
  sourceEvidenceRef: string;
  healthEvidence: HealthEvidenceObservationV1;
  observed: true;
}

export function projectSentinelXHostObservationV1(
  input: SentinelXHostObservationInputV1,
): SentinelXHostObservationV1 {
  const observationRef = `SENTINELX-HOST-OBSERVATION:${input.sentinelxHostRef}:${input.observedAt}`;

  return {
    version: "SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001-R0.1",
    subjectRef: input.genesisSubjectRef,
    adapterRef: "SENTINELX",
    adapterHostRef: input.sentinelxHostRef,
    hostname: input.hostname,
    label: input.label,
    agentVersion: input.agentVersion,
    observedAt: input.observedAt,
    sourceEvidenceRef: input.sourceEvidenceRef,
    healthEvidence: {
      observationRef,
      observedAt: input.observedAt,
      evidenceRefs: [input.sourceEvidenceRef],
      condition: input.reachable ? "POSITIVE" : "NEGATIVE",
      severity: input.reachable ? "NONE" : "CRITICAL",
      confidence: 1,
    },
    observed: true,
  };
}
