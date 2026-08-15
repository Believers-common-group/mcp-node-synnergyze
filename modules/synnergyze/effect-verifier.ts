import { createHash } from "node:crypto";

import type { VerifiedEffectV1 } from "../river/contracts.ts";
import type {
  EffectVerificationFailureCodeV1,
  EffectVerificationResultV1,
  PostExecutionObservationV1,
  SynnergyzeExecutionReceiptV1,
} from "./contracts.ts";

const SYNTHETIC_SERVICE_REQUEST_ADAPTER = "SYNTHETIC-SERVICE-REQUEST-ADAPTER-001";
const SYNTHETIC_SERVICE_REQUEST_OBSERVER = "SYNTHETIC-SERVICE-REQUEST-OBSERVER-001";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function failure(
  code: EffectVerificationFailureCodeV1,
  reason: string,
  receipt: SynnergyzeExecutionReceiptV1,
  observation?: PostExecutionObservationV1,
): EffectVerificationResultV1 {
  return {
    ok: false,
    state: "EXCEPTION",
    code,
    reason,
    executionReceiptRef: receipt.receiptRef,
    observationRef: observation?.observationRef,
  };
}

function parseInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class SyntheticServiceRequestObservationSourceV1 {
  readonly observerRef = SYNTHETIC_SERVICE_REQUEST_OBSERVER;

  observe(
    receipt: SynnergyzeExecutionReceiptV1,
    observedAt: string,
  ): PostExecutionObservationV1 {
    if (receipt.state !== "EXECUTED_UNVERIFIED") {
      throw new Error("observation_execution_state_invalid");
    }
    if (!receipt.synthetic) throw new Error("observation_synthetic_receipt_required");
    if (receipt.adapterRef !== SYNTHETIC_SERVICE_REQUEST_ADAPTER) {
      throw new Error("observation_adapter_not_supported");
    }
    const observed = parseInstant(observedAt);
    const executed = parseInstant(receipt.executedAt);
    if (observed === undefined || executed === undefined) throw new Error("observation_invalid_timestamp");
    if (observed < executed) throw new Error("observation_before_execution");

    const stateIdentity = digest(receipt.adapterResultRef).slice(0, 24);
    const observationIdentity = digest(
      [receipt.receiptRef, receipt.adapterResultRef, observedAt].join("|"),
    ).slice(0, 24);
    const evidenceIdentity = digest(
      [receipt.receiptRef, receipt.adapterResultRef, "post-execution-observation"].join("|"),
    ).slice(0, 24);

    return {
      observationRef: `SYNNERGYZE-OBSERVATION:${observationIdentity}`,
      executionReceiptRef: receipt.receiptRef,
      actionRef: receipt.actionRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      targetRef: receipt.targetRef,
      correlationId: receipt.correlationId,
      observerRef: this.observerRef,
      observedStateRef: `SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:${stateIdentity}`,
      observedAt,
      sourceEvidenceRef: `SYNTHETIC-OBSERVATION-EVIDENCE:${evidenceIdentity}`,
      synthetic: true,
    };
  }
}

interface StoredVerification {
  fingerprint: string;
  effect: VerifiedEffectV1;
}

function verificationFingerprint(
  receipt: SynnergyzeExecutionReceiptV1,
  observation: PostExecutionObservationV1,
  verifiedAt: string,
): string {
  return digest(
    JSON.stringify({
      executionReceiptRef: receipt.receiptRef,
      reservationRef: receipt.reservationRef,
      wardenDecisionRef: receipt.wardenDecisionRef,
      observationRef: observation.observationRef,
      observedStateRef: observation.observedStateRef,
      sourceEvidenceRef: observation.sourceEvidenceRef,
      observedAt: observation.observedAt,
      verifiedAt,
    }),
  );
}

export class EffectVerifierV1 {
  private readonly byExecutionReceipt = new Map<string, StoredVerification>();

  verify(input: {
    receipt: SynnergyzeExecutionReceiptV1;
    observation?: PostExecutionObservationV1;
    verifiedAt: string;
  }): EffectVerificationResultV1 {
    const { receipt, observation, verifiedAt } = input;

    if (!observation) {
      return failure(
        "MISSING_OBSERVATION",
        "Post-execution observation is required before an effect can be verified.",
        receipt,
      );
    }
    if (receipt.state !== "EXECUTED_UNVERIFIED") {
      return failure(
        "EXECUTION_STATE_INVALID",
        "Only EXECUTED_UNVERIFIED receipts can enter effect verification.",
        receipt,
        observation,
      );
    }
    if (observation.executionReceiptRef !== receipt.receiptRef) {
      return failure(
        "EXECUTION_RECEIPT_MISMATCH",
        "Observation does not reference the exact execution receipt.",
        receipt,
        observation,
      );
    }
    if (observation.actionRef !== receipt.actionRef) {
      return failure("ACTION_MISMATCH", "Observation action lineage drifted.", receipt, observation);
    }
    if (observation.programRef !== receipt.programRef) {
      return failure("PROGRAM_MISMATCH", "Observation program lineage drifted.", receipt, observation);
    }
    if (observation.eventRef !== receipt.eventRef) {
      return failure("EVENT_MISMATCH", "Observation event lineage drifted.", receipt, observation);
    }
    if (observation.targetRef !== receipt.targetRef) {
      return failure("TARGET_MISMATCH", "Observation target lineage drifted.", receipt, observation);
    }
    if (observation.correlationId !== receipt.correlationId) {
      return failure(
        "CORRELATION_MISMATCH",
        "Observation correlation lineage drifted.",
        receipt,
        observation,
      );
    }
    if (!observation.observedStateRef.trim()) {
      return failure(
        "OBSERVED_STATE_MISSING",
        "Observed state must come from a post-execution observation source.",
        receipt,
        observation,
      );
    }
    if (!observation.sourceEvidenceRef.trim()) {
      return failure(
        "SOURCE_EVIDENCE_MISSING",
        "Observation evidence is required for effect verification.",
        receipt,
        observation,
      );
    }

    const executed = parseInstant(receipt.executedAt);
    const observed = parseInstant(observation.observedAt);
    const verified = parseInstant(verifiedAt);
    if (executed === undefined || observed === undefined || verified === undefined) {
      return failure(
        "INVALID_TIMESTAMP",
        "Execution, observation and verification timestamps must be valid instants.",
        receipt,
        observation,
      );
    }
    if (observed < executed) {
      return failure(
        "OBSERVATION_BEFORE_EXECUTION",
        "Observation cannot precede execution.",
        receipt,
        observation,
      );
    }
    if (verified < observed) {
      return failure(
        "VERIFICATION_BEFORE_OBSERVATION",
        "Verification cannot precede observation.",
        receipt,
        observation,
      );
    }

    const fingerprint = verificationFingerprint(receipt, observation, verifiedAt);
    const existing = this.byExecutionReceipt.get(receipt.receiptRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return failure(
          "IDEMPOTENCY_CONFLICT",
          "The execution receipt already has a different verified observation.",
          receipt,
          observation,
        );
      }
      return {
        ok: true,
        state: "VERIFIED_EFFECT",
        effect: { ...existing.effect },
        idempotentReplay: true,
      };
    }

    const verificationIdentity = digest(
      [receipt.receiptRef, observation.observationRef, observation.sourceEvidenceRef, verifiedAt].join("|"),
    ).slice(0, 24);
    const effectIdentity = digest(
      [receipt.receiptRef, observation.observationRef, observation.observedStateRef].join("|"),
    ).slice(0, 24);
    const effect: VerifiedEffectV1 = {
      effectRef: `SYNNERGYZE-VERIFIED-EFFECT:${effectIdentity}`,
      executionReceiptRef: receipt.receiptRef,
      reservationRef: receipt.reservationRef,
      wardenDecisionRef: receipt.wardenDecisionRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      correlationId: receipt.correlationId,
      targetRef: receipt.targetRef,
      observedStateRef: observation.observedStateRef,
      sourceObservationRef: observation.observationRef,
      sourceEvidenceRef: observation.sourceEvidenceRef,
      verifiedAt,
      verificationRef: `SYNNERGYZE-EFFECT-VERIFICATION:${verificationIdentity}`,
      synthetic: true,
    };

    this.byExecutionReceipt.set(receipt.receiptRef, { fingerprint, effect });
    return { ok: true, state: "VERIFIED_EFFECT", effect: { ...effect }, idempotentReplay: false };
  }

  effectCount(): number {
    return this.byExecutionReceipt.size;
  }

  effects(): readonly VerifiedEffectV1[] {
    return [...this.byExecutionReceipt.values()].map(({ effect }) => ({ ...effect }));
  }
}
