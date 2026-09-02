import { sha256CanonicalV1 } from "./canonical.ts";
import type { LegislativeIntelligenceResultV1 } from "./service.ts";

export interface LegislativeIntelligenceResultStoreV1 {
  put(result: LegislativeIntelligenceResultV1): Promise<void>;
  getBySignalRef(signalRef: string): Promise<LegislativeIntelligenceResultV1 | undefined>;
}

function requiredRef(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(code);
  return value;
}

function stableResultDigest(result: LegislativeIntelligenceResultV1): string {
  const signalRef = requiredRef(
    result.signal.signalRef,
    "legislative_result_store_signal_ref_required",
  );
  const eventRef = requiredRef(
    result.event.eventRef,
    "legislative_result_store_event_ref_required",
  );
  const briefRef = requiredRef(
    result.brief.briefRef,
    "legislative_result_store_brief_ref_required",
  );
  const evidenceRef = requiredRef(
    result.evidence.evidenceRef,
    "legislative_result_store_evidence_ref_required",
  );
  const workRef = requiredRef(
    result.workCandidate.workRef,
    "legislative_result_store_work_ref_required",
  );
  const registryCandidateRefs = result.registryCandidates
    .map((candidate) =>
      requiredRef(
        candidate.candidateRef,
        "legislative_result_store_registry_candidate_ref_required",
      ),
    )
    .sort((a, b) => a.localeCompare(b));

  return sha256CanonicalV1({
    eventRef,
    signalRef,
    briefRef,
    registryCandidateRefs,
    evidenceRef,
    workRef,
  });
}

export class InMemoryLegislativeIntelligenceResultStoreV1
  implements LegislativeIntelligenceResultStoreV1
{
  private readonly bySignalRef = new Map<string, LegislativeIntelligenceResultV1>();
  private readonly digestBySignalRef = new Map<string, string>();

  async put(result: LegislativeIntelligenceResultV1): Promise<void> {
    const signalRef = result.signal.signalRef;
    if (!signalRef) throw new Error("legislative_result_store_signal_ref_required");
    const digest = stableResultDigest(result);
    const existingDigest = this.digestBySignalRef.get(signalRef);
    if (existingDigest !== undefined && existingDigest !== digest) {
      throw new Error("RESULT_STORE_IDENTITY_COLLISION");
    }
    if (existingDigest === undefined) {
      this.bySignalRef.set(signalRef, result);
      this.digestBySignalRef.set(signalRef, digest);
    }
  }

  async getBySignalRef(signalRef: string): Promise<LegislativeIntelligenceResultV1 | undefined> {
    return this.bySignalRef.get(signalRef);
  }
}
