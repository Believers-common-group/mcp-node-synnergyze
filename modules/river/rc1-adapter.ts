import type { Rc1EvidenceEntry } from "../../rc1/runtime.ts";
import type {
  ActionEnvelopeV1,
  CausalTraceV1,
  EffectReceiptV1,
  EvidenceReservationV1,
  EvidenceSealV1,
} from "./contracts.ts";

function entriesForCorrelation(
  correlationId: string,
  entries: readonly Rc1EvidenceEntry[],
): readonly Rc1EvidenceEntry[] {
  return entries.filter((entry) => entry.correlationId === correlationId);
}

export function adaptRc1EvidenceReservation(
  action: ActionEnvelopeV1,
  entries: readonly Rc1EvidenceEntry[],
): EvidenceReservationV1 {
  const reserved = entriesForCorrelation(action.correlationId, entries).find(
    (entry) => entry.stage === "RESERVED" && entry.decisionRef === action.wardenDecisionRef,
  );
  if (!reserved) {
    throw new Error("rc1_evidence_reservation_not_found");
  }

  return {
    reservationRef: reserved.evidenceRef,
    actionRef: action.actionRef,
    correlationId: action.correlationId,
    state: "RESERVED",
    reservedAt: action.requestedAt,
  };
}

export function adaptRc1EvidenceSeal(
  reservation: EvidenceReservationV1,
  effect: EffectReceiptV1,
  entries: readonly Rc1EvidenceEntry[],
): EvidenceSealV1 {
  if (reservation.correlationId !== effect.correlationId) {
    throw new Error("river_correlation_mismatch");
  }

  const sealed = entriesForCorrelation(effect.correlationId, entries).find(
    (entry) => entry.stage === "SEALED" && entry.effectRef === effect.effectRef,
  );
  if (!sealed) {
    throw new Error("rc1_evidence_seal_not_found");
  }

  return {
    sealRef: sealed.evidenceRef,
    reservationRef: reservation.reservationRef,
    correlationId: effect.correlationId,
    state: "SEALED",
    traceDigest: [
      "RC1-TRACE-V1",
      reservation.reservationRef,
      sealed.evidenceRef,
      effect.effectRef,
      effect.verificationRef,
    ].join("|"),
    sealedAt: effect.verifiedAt,
  };
}

export function adaptRc1CausalTrace(
  correlationId: string,
  entries: readonly Rc1EvidenceEntry[],
): CausalTraceV1 {
  const lineage = entriesForCorrelation(correlationId, entries);
  const reservation = lineage.find((entry) => entry.stage === "RESERVED");
  if (!reservation) {
    throw new Error("rc1_evidence_reservation_not_found");
  }
  const seal = lineage.find((entry) => entry.stage === "SEALED");

  return {
    correlationId,
    reservationRef: reservation.evidenceRef,
    eventReceiptRefs: [],
    effectRef: seal?.effectRef,
    sealRef: seal?.evidenceRef,
    sealed: Boolean(seal),
  };
}
