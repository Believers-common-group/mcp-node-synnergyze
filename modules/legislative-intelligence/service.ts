import { sha256CanonicalV1 } from "./canonical.ts";
import type {
  LegislativeObjectRefV1,
  NormalizedLegislativeEventV1,
  SourceEnvelopeV1,
} from "./contracts.ts";
import { normalizeCongressGovBillV1 } from "./normalizer.ts";
import type { RegistryImpactCandidateV1, RegistrySubjectIndexEntryV1 } from "./impact-graph.ts";
import { mapRegistryImpactCandidatesV1 } from "./impact-graph.ts";
import type { LegislativeSourceAdapterV1 } from "./adapters/source-adapter.ts";
import { classifyPestelV1 } from "../pestel/classifier.ts";
import type { ImpactBriefV1, PestelClassifierAssistV1, PestelSignalV1 } from "../pestel/contracts.ts";
import { buildImpactBriefV1 } from "../pestel/impact-brief.ts";
import type { LegislativeEvidenceReceiptV1 } from "../river/legislative-evidence.ts";
import { buildLegislativeEvidenceReceiptV1 } from "../river/legislative-evidence.ts";
import type { PestelReviewWorkCandidateV1 } from "../synnergyze/pestel-work-bridge.ts";
import { buildPestelReviewWorkCandidateV1 } from "../synnergyze/pestel-work-bridge.ts";

export interface LegislativeIntelligenceResultV1 {
  event: NormalizedLegislativeEventV1;
  signal: PestelSignalV1;
  brief: ImpactBriefV1;
  registryCandidates: readonly RegistryImpactCandidateV1[];
  evidence: LegislativeEvidenceReceiptV1;
  workCandidate: PestelReviewWorkCandidateV1;
}

export interface IngestLegislativeBillOptionsV1 {
  observedAt: string;
  registryIndex: readonly RegistrySubjectIndexEntryV1[];
}

function allSources(bundle: Awaited<ReturnType<LegislativeSourceAdapterV1["getRelated"]>>): SourceEnvelopeV1[] {
  return [
    bundle.bill,
    ...bundle.actions,
    ...bundle.subjects,
    ...bundle.committees,
    ...bundle.amendments,
    ...bundle.summaries,
    ...(bundle.law ? [bundle.law] : []),
  ];
}

export class LegislativeIntelligenceServiceV1 {
  constructor(
    private readonly source: LegislativeSourceAdapterV1,
    private readonly classifierAssist?: PestelClassifierAssistV1,
  ) {}

  async ingestBill(
    ref: LegislativeObjectRefV1,
    options: IngestLegislativeBillOptionsV1,
  ): Promise<LegislativeIntelligenceResultV1> {
    const bundle = await this.source.getRelated(ref);
    const event = normalizeCongressGovBillV1(bundle, options.observedAt);
    const signal = await classifyPestelV1(event, {
      ...(this.classifierAssist ? { assist: this.classifierAssist } : {}),
    });
    const brief = buildImpactBriefV1(event, signal);
    const registryCandidates = mapRegistryImpactCandidatesV1(signal, options.registryIndex);
    const sources = allSources(bundle);
    const runRef = `PESTEL-RUN:${sha256CanonicalV1({
      eventRef: event.eventRef,
      sourceRefs: event.sourceRefs,
    })}`;
    const evidence = buildLegislativeEvidenceReceiptV1({
      runRef,
      sources,
      event,
      signal,
      brief,
      observedAt: options.observedAt,
    });
    const workCandidate = buildPestelReviewWorkCandidateV1({
      event,
      signal,
      brief,
      registryCandidates,
    });

    return { event, signal, brief, registryCandidates, evidence, workCandidate };
  }
}
