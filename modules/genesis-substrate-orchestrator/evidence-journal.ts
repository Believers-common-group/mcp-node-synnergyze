import { stableDigest, type PlacementReasonCode } from "./contracts.ts";

export type SubstrateEvidenceStage =
  | "PLACEMENT_COMPUTED"
  | "PLACEMENT_BLOCKED"
  | "RESERVATION_REQUESTED"
  | "RESERVATION_AUTHORIZED"
  | "RESERVATION_DENIED"
  | "HANDOFF_READY"
  | "HANDOFF_DENIED";

export interface SubstrateEvidenceEnvelopeV1 {
  evidenceRef: string;
  correlationId: string;
  workloadRef: string;
  placementRef: string;
  substrateInstanceRef?: string;
  reservationRef?: string;
  wardenDecisionRef?: string;
  stage: SubstrateEvidenceStage;
  reason?: PlacementReasonCode;
  recordedAt: string;
}

export type AppendSubstrateEvidenceInputV1 = Omit<SubstrateEvidenceEnvelopeV1, "evidenceRef">;

export class SubstrateEvidenceJournalV1 {
  private readonly envelopes: SubstrateEvidenceEnvelopeV1[] = [];

  append(input: AppendSubstrateEvidenceInputV1): SubstrateEvidenceEnvelopeV1 {
    const evidenceRef = `SUBSTRATE-EVIDENCE:${stableDigest(input).slice(0, 24)}`;
    const envelope: SubstrateEvidenceEnvelopeV1 = { evidenceRef, ...input };
    this.envelopes.push(envelope);
    return { ...envelope };
  }

  list(): readonly SubstrateEvidenceEnvelopeV1[] {
    return this.envelopes.map((envelope) => ({ ...envelope }));
  }
}
