import { createHash } from "node:crypto";

import type { EffectReceiptV1 } from "../river/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";

export interface PostExecutionObservationV1 {
  observationRef: string;
  executionReceiptRef: string;
  actionRef: string;
  programRef: string;
  eventRef: string;
  targetRef: string;
  correlationId: string;
  observerRef: string;
  observedStateRef: string;
  observedAt: string;
  sourceEvidenceRef: string;
  synthetic: true;
}

export interface VerifiedEffectV1 extends EffectReceiptV1 {
  executionReceiptRef: string;
  reservationRef: string;
  wardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  synthetic: true;
}

export type EffectVerificationReasonCodeV1 =
  | "EXECUTION_NOT_UNVERIFIED"
  | "OBSERVATION_EXECUTION_MISMATCH"
  | "OBSERVATION_ACTION_MISMATCH"
  | "OBSERVATION_PROGRAM_MISMATCH"
  | "OBSERVATION_EVENT_MISMATCH"
  | "OBSERVATION_TARGET_MISMATCH"
  | "OBSERVATION_CORRELATION_MISMATCH"
  | "OBSERVATION_BEFORE_EXECUTION"
  | "VERIFICATION_BEFORE_OBSERVATION"
  | "INVALID_EXECUTION_TIME"
  | "INVALID_OBSERVATION_TIME"
  | "INVALID_VERIFICATION_TIME"
  | "MISSING_OBSERVED_STATE"
  | "MISSING_SOURCE_EVIDENCE"
  | "NON_SYNTHETIC_OBSERVATION"
  | "VERIFICATION_IDEMPOTENCY_CONFLICT";

export interface EffectVerificationSuccessV1 {
  state: "VERIFIED_EFFECT";
  effect: VerifiedEffectV1;
  observationRef: string;
  idempotentReplay: boolean;
}

export interface EffectVerificationFailureV1 {
  state: "EXCEPTION";
  executionReceiptRef: string;
  observationRef?: string;
  reasonCode: EffectVerificationReasonCodeV1;
  reason: string;
}

export type EffectVerificationResultV1 =
  | EffectVerificationSuccessV1
  | EffectVerificationFailureV1;

export interface PostExecutionObservationSourceV1 {
  readonly observerRef: string;
  observe(receipt: SynnergyzeExecutionReceiptV1, observedAt: string): PostExecutionObservationV1;
}

interface StoredVerificationV1 {
  fingerprint: string;
  result: EffectVerificationSuccessV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function failure(
  receipt: SynnergyzeExecutionReceiptV1,
  reasonCode: EffectVerificationReasonCodeV1,
  reason: string,
  observation?: PostExecutionObservationV1,
): EffectVerificationFailureV1 {
  return {
    state: "EXCEPTION",
    executionReceiptRef: receipt.receiptRef,
    observationRef: observation?.observationRef,
    reasonCode,
    reason,
  };
}

export class SyntheticServiceRequestObservationSourceV1
  implements PostExecutionObservationSourceV1
{
  readonly observerRef = "SYNTHETIC-SERVICE-REQUEST-OBSERVER-001";

  observe(receipt: SynnergyzeExecutionReceiptV1, observedAt: string): PostExecutionObservationV1 {
    if (receipt.state !== "EXECUTED_UNVERIFIED") {
      throw new Error("observation_execution_unverified_required");
    }
    if (receipt.adapterRef !== "SYNTHETIC-SERVICE-REQUEST-ADAPTER-001") {
      throw new Error("observation_adapter_not_supported");
    }
    if (!receipt.adapterResultRef) throw new Error("observation_adapter_result_required");

    const observedIdentity = digest(receipt.adapterResultRef).slice(0, 24);
    const observedStateRef = `SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:${observedIdentity}`;
    const sourceEvidenceRef = `SYNTHETIC-OBSERVATION-EVIDENCE:${digest(
      `${receipt.receiptRef}|${receipt.adapterResultRef}|${observedAt}`,
    ).slice(0, 24)}`;
    const observationRef = `POST-EXECUTION-OBSERVATION:${digest(
      `${receipt.receiptRef}|${this.observerRef}|${observedStateRef}|${sourceEvidenceRef}|${observedAt}`,
    ).slice(0, 24)}`;

    return {
      observationRef,
      executionReceiptRef: receipt.receiptRef,
      actionRef: receipt.actionRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      targetRef: receipt.targetRef,
      correlationId: receipt.correlationId,
      observerRef: this.observerRef,
      observedStateRef,
      observedAt,
      sourceEvidenceRef,
      synthetic: true,
    };
  }
}

export class EffectVerificationServiceV1 {
  private readonly byExecutionReceipt = new Map<string, StoredVerificationV1>();

  verify(input: {
    receipt: SynnergyzeExecutionReceiptV1;
    observation?: PostExecutionObservationV1;
    verifiedAt: string;
  }): EffectVerificationResultV1 {
    const { receipt, observation, verifiedAt } = input;

    if (receipt.state !== "EXECUTED_UNVERIFIED") {
      return failure(receipt, "EXECUTION_NOT_UNVERIFIED", "execution receipt must be EXECUTED_UNVERIFIED", observation);
    }
    if (!observation) {
      return failure(receipt, "MISSING_SOURCE_EVIDENCE", "post-execution observation is required");
    }
    if (observation.synthetic !== true) {
      return failure(receipt, "NON_SYNTHETIC_OBSERVATION", "this conformance slice accepts only synthetic observations", observation);
    }
    if (observation.executionReceiptRef !== receipt.receiptRef) {
      return failure(receipt, "OBSERVATION_EXECUTION_MISMATCH", "observation references another execution receipt", observation);
    }
    if (observation.actionRef !== receipt.actionRef) {
      return failure(receipt, "OBSERVATION_ACTION_MISMATCH", "observation action lineage mismatch", observation);
    }
    if (observation.programRef !== receipt.programRef) {
      return failure(receipt, "OBSERVATION_PROGRAM_MISMATCH", "observation program lineage mismatch", observation);
    }
    if (observation.eventRef !== receipt.eventRef) {
      return failure(receipt, "OBSERVATION_EVENT_MISMATCH", "observation event lineage mismatch", observation);
    }
    if (observation.targetRef !== receipt.targetRef) {
      return failure(receipt, "OBSERVATION_TARGET_MISMATCH", "observation target lineage mismatch", observation);
    }
    if (observation.correlationId !== receipt.correlationId) {
      return failure(receipt, "OBSERVATION_CORRELATION_MISMATCH", "observation correlation lineage mismatch", observation);
    }
    if (!observation.observedStateRef.trim()) {
      return failure(receipt, "MISSING_OBSERVED_STATE", "observation must contain an observed state", observation);
    }
    if (!observation.sourceEvidenceRef.trim()) {
      return failure(receipt, "MISSING_SOURCE_EVIDENCE", "observation must contain source evidence", observation);
    }

    const executed = parseInstant(receipt.executedAt);
    if (executed === null) {
      return failure(receipt, "INVALID_EXECUTION_TIME", "execution timestamp is invalid", observation);
    }
    const observed = parseInstant(observation.observedAt);
    if (observed === null) {
      return failure(receipt, "INVALID_OBSERVATION_TIME", "observation timestamp is invalid", observation);
    }
    const verified = parseInstant(verifiedAt);
    if (verified === null) {
      return failure(receipt, "INVALID_VERIFICATION_TIME", "verification timestamp is invalid", observation);
    }
    if (observed < executed) {
      return failure(receipt, "OBSERVATION_BEFORE_EXECUTION", "observation cannot precede execution", observation);
    }
    if (verified < observed) {
      return failure(receipt, "VERIFICATION_BEFORE_OBSERVATION", "verification cannot precede observation", observation);
    }

    const fingerprint = digest(
      JSON.stringify({
        receiptRef: receipt.receiptRef,
        reservationRef: receipt.reservationRef,
        wardenDecisionRef: receipt.wardenDecisionRef,
        observationRef: observation.observationRef,
        observedStateRef: observation.observedStateRef,
        sourceEvidenceRef: observation.sourceEvidenceRef,
        observedAt: observation.observedAt,
        verifiedAt,
      }),
    );

    const existing = this.byExecutionReceipt.get(receipt.receiptRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return failure(
          receipt,
          "VERIFICATION_IDEMPOTENCY_CONFLICT",
          "execution receipt already verified with a different observation or verification identity",
          observation,
        );
      }
      return { ...existing.result, effect: { ...existing.result.effect }, idempotentReplay: true };
    }

    const verificationRef = `EFFECT-VERIFICATION:${digest(
      `${receipt.receiptRef}|${observation.observationRef}|${observation.sourceEvidenceRef}|${verifiedAt}`,
    ).slice(0, 24)}`;
    const effectRef = `VERIFIED-EFFECT:${digest(
      `${receipt.receiptRef}|${observation.observedStateRef}|${verificationRef}`,
    ).slice(0, 24)}`;
    const effect: VerifiedEffectV1 = {
      effectRef,
      executionReceiptRef: receipt.receiptRef,
      reservationRef: receipt.reservationRef,
      wardenDecisionRef: receipt.wardenDecisionRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      correlationId: receipt.correlationId,
      targetRef: receipt.targetRef,
      observedStateRef: observation.observedStateRef,
      verifiedAt,
      verificationRef,
      synthetic: true,
    };
    const result: EffectVerificationSuccessV1 = {
      state: "VERIFIED_EFFECT",
      effect,
      observationRef: observation.observationRef,
      idempotentReplay: false,
    };
    this.byExecutionReceipt.set(receipt.receiptRef, { fingerprint, result });
    return { ...result, effect: { ...effect } };
  }

  verificationCount(): number {
    return this.byExecutionReceipt.size;
  }
}
