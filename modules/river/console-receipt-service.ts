import { createHash } from "node:crypto";

import type {
  EstateActionClassV1,
  EstateReceiptProjectionV1,
} from "../estate-console/contracts.ts";

export interface RiverConsoleReceiptReservationRequestV1 {
  readonly sessionRef: string;
  readonly correlationId: string;
  readonly actionClass: EstateActionClassV1;
  readonly payloadDigest: string;
  readonly reservedAt: string;
}

export interface RiverConsoleReceiptTransitionV1 {
  readonly receiptRef: string;
  readonly recordedAt: string;
  readonly reasonCodes: readonly string[];
}

export interface RiverConsoleReceiptWardenTransitionV1
  extends RiverConsoleReceiptTransitionV1 {
  readonly wardenDecisionRef?: string;
}

interface StoredConsoleReceiptV1 {
  readonly fingerprint: string;
  readonly payloadDigest: string;
  readonly reservedAt: string;
  readonly receipt: EstateReceiptProjectionV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function reservationFingerprint(input: RiverConsoleReceiptReservationRequestV1): string {
  return digest(
    JSON.stringify({
      sessionRef: input.sessionRef,
      correlationId: input.correlationId,
      actionClass: input.actionClass,
      payloadDigest: input.payloadDigest,
    }),
  );
}

export class SyntheticRiverConsoleReceiptServiceV1 {
  private readonly byReceiptRef = new Map<string, StoredConsoleReceiptV1>();
  private readonly receiptRefByCorrelation = new Map<string, string>();

  reserve(input: RiverConsoleReceiptReservationRequestV1): EstateReceiptProjectionV1 {
    parseInstant(input.reservedAt, "river_console_receipt_invalid_reservation_time");
    if (!input.payloadDigest) throw new Error("river_console_receipt_payload_digest_required");

    const fingerprint = reservationFingerprint(input);
    const existingRef = this.receiptRefByCorrelation.get(input.correlationId);
    if (existingRef) {
      const existing = this.byReceiptRef.get(existingRef);
      if (!existing || existing.fingerprint !== fingerprint) {
        throw new Error("river_console_receipt_correlation_conflict");
      }
      return { ...existing.receipt, reasonCodes: [...existing.receipt.reasonCodes] };
    }

    const receiptRef = `RIVER-CONSOLE-RECEIPT:${digest(fingerprint).slice(0, 24)}`;
    const receipt: EstateReceiptProjectionV1 = {
      receiptRef,
      sessionRef: input.sessionRef,
      correlationId: input.correlationId,
      actionClass: input.actionClass,
      state: "RESERVED",
      recordedAt: input.reservedAt,
      reasonCodes: [],
    };

    this.byReceiptRef.set(receiptRef, {
      fingerprint,
      payloadDigest: input.payloadDigest,
      reservedAt: input.reservedAt,
      receipt,
    });
    this.receiptRefByCorrelation.set(input.correlationId, receiptRef);
    return { ...receipt, reasonCodes: [] };
  }

  recordRead(input: RiverConsoleReceiptTransitionV1): EstateReceiptProjectionV1 {
    return this.transition(input, "RECORDED", undefined, "READ");
  }

  recordAuthorizedProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1 {
    if (!input.wardenDecisionRef) {
      throw new Error("river_console_receipt_warden_decision_required");
    }
    return this.transition(input, "AUTHORIZED", input.wardenDecisionRef, "PROPOSE");
  }

  recordDeniedProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1 {
    if (!input.wardenDecisionRef) {
      throw new Error("river_console_receipt_warden_decision_required");
    }
    return this.transition(input, "DENIED", input.wardenDecisionRef, "PROPOSE");
  }

  recordHeldProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1 {
    if (!input.wardenDecisionRef) {
      throw new Error("river_console_receipt_warden_decision_required");
    }
    return this.transition(input, "HELD_FOR_REVIEW", input.wardenDecisionRef, "PROPOSE");
  }

  recordRejected(input: RiverConsoleReceiptTransitionV1): EstateReceiptProjectionV1 {
    return this.transition(input, "REJECTED");
  }

  get(receiptRef: string): EstateReceiptProjectionV1 | undefined {
    const stored = this.byReceiptRef.get(receiptRef);
    if (!stored) return undefined;
    return { ...stored.receipt, reasonCodes: [...stored.receipt.reasonCodes] };
  }

  receiptCount(): number {
    return this.byReceiptRef.size;
  }

  private transition(
    input: RiverConsoleReceiptTransitionV1,
    state: EstateReceiptProjectionV1["state"],
    wardenDecisionRef?: string,
    requiredActionClass?: EstateActionClassV1,
  ): EstateReceiptProjectionV1 {
    const stored = this.byReceiptRef.get(input.receiptRef);
    if (!stored) throw new Error("river_console_receipt_not_found");
    if (stored.receipt.state !== "RESERVED") {
      throw new Error("river_console_receipt_terminal_state");
    }
    if (requiredActionClass && stored.receipt.actionClass !== requiredActionClass) {
      throw new Error(
        requiredActionClass === "READ"
          ? "river_console_receipt_read_class_required"
          : "river_console_receipt_propose_class_required",
      );
    }

    const reservedAt = parseInstant(
      stored.reservedAt,
      "river_console_receipt_invalid_reservation_time",
    );
    const recordedAt = parseInstant(
      input.recordedAt,
      "river_console_receipt_invalid_recorded_time",
    );
    if (recordedAt < reservedAt) {
      throw new Error("river_console_receipt_recorded_before_reservation");
    }

    const receipt: EstateReceiptProjectionV1 = {
      ...stored.receipt,
      state,
      recordedAt: input.recordedAt,
      ...(wardenDecisionRef ? { wardenDecisionRef } : {}),
      reasonCodes: stableUnique(input.reasonCodes),
    };

    this.byReceiptRef.set(input.receiptRef, { ...stored, receipt });
    return { ...receipt, reasonCodes: [...receipt.reasonCodes] };
  }
}
