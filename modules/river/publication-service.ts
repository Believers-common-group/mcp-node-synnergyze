import { createHash } from "node:crypto";
import type { PublicationEvidenceInputV1, PublicationReceiptV1 } from "./contracts.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class SyntheticRiverPublicationServiceV1 {
  private readonly receipts = new Map<string, PublicationReceiptV1>();

  record(input: PublicationEvidenceInputV1): PublicationReceiptV1 {
    if (input.reservation.state !== "RESERVED") throw new Error("river_publication_reservation_required");
    if (input.correlationId !== input.reservation.correlationId) {
      throw new Error("river_publication_correlation_mismatch");
    }
    if (input.sourceEventRefs.length === 0) throw new Error("river_publication_source_event_required");
    if (!/^sha256:[a-f0-9]{64}$/.test(input.payloadDigest)) {
      throw new Error("river_publication_payload_digest_invalid");
    }

    const identity = JSON.stringify({
      headerBoardRef: input.headerBoardRef,
      channelRef: input.channelRef,
      routeRef: input.routeRef,
      sourceEventRefs: [...input.sourceEventRefs].sort(),
      reservationRef: input.reservation.reservationRef,
      state: input.state,
      providerReceiptRef: input.providerReceiptRef ?? null,
      payloadDigest: input.payloadDigest,
      correlationId: input.correlationId,
    });
    const receiptRef = `RIVER-PUBLICATION:${digest(identity).slice(0, 24)}`;
    const existing = this.receipts.get(receiptRef);
    if (existing) return structuredClone(existing);

    const receipt: PublicationReceiptV1 = {
      receiptRef,
      headerBoardRef: input.headerBoardRef,
      channelRef: input.channelRef,
      routeRef: input.routeRef,
      sourceEventRefs: [...input.sourceEventRefs],
      riverReservationRef: input.reservation.reservationRef,
      wardenDecisionRef: input.reservation.wardenDecisionRef,
      state: input.state,
      providerReceiptRef: input.providerReceiptRef,
      payloadDigest: input.payloadDigest,
      observedAt: input.observedAt,
      correlationId: input.correlationId,
    };
    this.receipts.set(receiptRef, receipt);
    return structuredClone(receipt);
  }

  all(): readonly PublicationReceiptV1[] {
    return [...this.receipts.values()].map((receipt) => structuredClone(receipt));
  }
}
