import { sha256CanonicalV1 } from "../legislative-intelligence/canonical.ts";
import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import type { RegistryImpactCandidateV1 } from "../legislative-intelligence/impact-graph.ts";
import type { ImpactBriefV1, PestelSignalV1 } from "../pestel/contracts.ts";

export interface PestelReviewWorkCandidateV1 {
  workRef: string;
  sourceEventRef: string;
  signalRef: string;
  briefRef: string;
  registryCandidateRefs: readonly string[];
  state: "REVIEW_CANDIDATE";
  authorized: false;
  evidenceRefs: readonly string[];
  correlationId: string;
}

export interface BuildPestelReviewWorkCandidateInputV1 {
  event: NormalizedLegislativeEventV1;
  signal: PestelSignalV1;
  brief: ImpactBriefV1;
  registryCandidates: readonly RegistryImpactCandidateV1[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function buildPestelReviewWorkCandidateV1(
  input: BuildPestelReviewWorkCandidateInputV1,
): PestelReviewWorkCandidateV1 {
  if (input.signal.legislativeEventRef !== input.event.eventRef) {
    throw new Error("pestel_work_signal_event_mismatch");
  }
  if (input.brief.signalRef !== input.signal.signalRef) {
    throw new Error("pestel_work_brief_signal_mismatch");
  }
  if (input.registryCandidates.some((candidate) => candidate.signalRef !== input.signal.signalRef)) {
    throw new Error("pestel_work_registry_signal_mismatch");
  }

  const registryCandidateRefs = uniqueSorted(
    input.registryCandidates.map((candidate) => candidate.candidateRef),
  );
  const evidenceRefs = uniqueSorted([
    ...input.event.evidenceRefs,
    ...input.signal.evidenceRefs,
    ...input.brief.evidenceRefs,
    ...input.registryCandidates.flatMap((candidate) => candidate.evidenceRefs),
  ]);
  const correlationIdentity = {
    sourceEventRef: input.event.eventRef,
    signalRef: input.signal.signalRef,
    briefRef: input.brief.briefRef,
  };
  const correlationId = `PESTEL-CORRELATION:${sha256CanonicalV1(correlationIdentity)}`;
  const workIdentity = {
    ...correlationIdentity,
    registryCandidateRefs,
    state: "REVIEW_CANDIDATE" as const,
    authorized: false as const,
    evidenceRefs,
    correlationId,
  };

  return {
    workRef: `SYNNERGYZE-PESTEL-WORK:${sha256CanonicalV1(workIdentity)}`,
    ...workIdentity,
  };
}
