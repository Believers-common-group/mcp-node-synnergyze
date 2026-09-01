import { sha256CanonicalV1 } from "../legislative-intelligence/canonical.ts";
import type { NormalizedLegislativeEventV1 } from "../legislative-intelligence/contracts.ts";
import type { ImpactBriefV1, PestelSignalV1 } from "./contracts.ts";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function buildImpactBriefV1(
  event: NormalizedLegislativeEventV1,
  signal: PestelSignalV1,
  createdAt: string,
): ImpactBriefV1 {
  if (signal.legislativeEventRef !== event.eventRef) {
    throw new Error("pestel_signal_event_mismatch");
  }
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error("pestel_brief_created_at_invalid");
  }

  const observedFacts = uniqueSorted([
    `Lifecycle observed as ${event.lifecycle}.`,
    ...(event.title ? [`Title: ${event.title}`] : []),
    ...(event.summary ? [`Source summary: ${event.summary}`] : []),
    ...event.subjects.map((subject) => `Subject: ${subject}`),
    ...event.committees.map((committee) => `Committee: ${committee}`),
  ]);

  const riskHypotheses = uniqueSorted(
    Object.entries(signal.vector)
      .filter(([, score]) => score >= 0.35)
      .map(([dimension, score]) => `Hypothesis: Potential ${dimension} impact warrants review (signal ${score.toFixed(2)}).`),
  );
  const opportunityHypotheses = uniqueSorted(
    Object.entries(signal.vector)
      .filter(([dimension, score]) => score >= 0.35 && ["economic", "technological", "political"].includes(dimension))
      .map(([dimension, score]) => `Hypothesis: Potential ${dimension} opportunity warrants review (signal ${score.toFixed(2)}).`),
  );
  const evidenceRefs = uniqueSorted(signal.evidenceRefs);
  const completeness: ImpactBriefV1["completeness"] =
    event.summary && evidenceRefs.length > 0 ? "COMPLETE" : "DEGRADED";

  const identity = {
    schemaVersion: "PESTEL-BRIEF:R0.1" as const,
    signalRef: signal.signalRef,
    lifecycle: event.lifecycle,
    observedFacts,
    riskHypotheses,
    opportunityHypotheses,
    obligationCandidate: signal.obligationCandidate,
    completeness,
    confidence: signal.confidence,
    evidenceRefs,
    createdAt,
  };

  return {
    briefRef: `PESTEL-BRIEF:${sha256CanonicalV1(identity)}`,
    ...identity,
  };
}
