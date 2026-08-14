import { createHash } from "node:crypto";

import type { VerifiedEffectReceiptV1 } from "../river/contracts.ts";
import type {
  EffectVerificationErrorCodeV1,
  EffectVerificationFailureV1,
  EffectVerificationResultV1,
  PostExecutionObservationV1,
  SynnergyzeExecutionReceiptV1,
} from "./contracts.ts";
import { SyntheticServiceRequestCreateAdapterV1 } from "./execution-gate.ts";

export interface EffectVerificationRequestV1 {
  execution: SynnergyzeExecutionReceiptV1;
  observation: PostExecutionObservationV1;
  verifiedAt: string;
}

interface StoredVerification {
  fingerprint: string;
  effect: VerifiedEffectReceiptV1;
  observationRef: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function failure(
  input: EffectVerificationRequestV1,
  code: EffectVerificationErrorCodeV1,
  reason: string,
): EffectVerificationFailureV1 {
  return {
    ok: false,
    state: "EXCEPTION",
    code,
    reason,
    executionReceiptRef: input.execution.receiptRef,
    observationRef: input.observation?.observationRef,
  };
}

function verificationFingerprint(input: EffectVerificationRequestV1): string {
  return digest(
    JSON.stringify({
      executionReceiptRef: input.execution.receiptRef,
      actionRef: input.execution.actionRef,
      reservationRef: input.execution.reservationRef,
      wardenDecisionRef: input.execution.wardenDecisionRef,
      programRef: input.execution.programRef,
      eventRef: input.execution.eventRef,
      targetRef: input.execution.targetRef,
      correlationId: input.execution.correlationId,
      observationRef: input.observation.observationRef,
      observerRef: input.observation.observerRef,
      observedStateRef: input.observation.observedStateRef,
      observedAt: input.observation.observedAt,
      sourceEvidenceRef: input.observation.sourceEvidenceRef,
      verifiedAt: input.verifiedAt,
    }),
  );
}

export class SyntheticServiceRequestObservationSourceV1 {
  readonly observerRef = "SYNTHETIC-SERVICE-REQUEST-OBSERVER-001";

  constructor(private readonly adapter: SyntheticServiceRequestCreateAdapterV1) {}

  observe(
    execution: SynnergyzeExecutionReceiptV1,
    observedAt: string,
  ): PostExecutionObservationV1 {
    if (execution.adapterRef !== this.adapter.adapterRef) {
      throw new Error("observation_adapter_mismatch");
    }
    if (execution.capabilityRef !== this.adapter.capabilityRef) {
      throw new Error("observation_capability_mismatch");
    }
    if (!this.adapter.hasResult(execution.adapterResultRef)) {
      throw new Error("observation_adapter_result_not_found");
    }

    const identity = digest(
      [execution.receiptRef, execution.adapterResultRef, execution.targetRef, observedAt].join("|"),
    ).slice(0, 24);
    return {
      observationRef: `SYNTHETIC-OBSERVATION:${identity}`,
      executionReceiptRef: execution.receiptRef,
      actionRef: execution.actionRef,
      programRef: execution.programRef,
      eventRef: execution.eventRef,
      targetRef: execution.targetRef,
      correlationId: execution.correlationId,
      observerRef: this.observerRef,
      observedStateRef: `SYNTHETIC-SERVICE-REQUEST-STATE:${execution.adapterResultRef}`,
      observedAt,
      sourceEvidenceRef: `SYNTHETIC-ADAPTER-READ:${execution.adapterResultRef}`,
      synthetic: true,
    };
  }
}

export class EffectVerificationServiceV1 {
  private readonly byExecutionReceipt = new Map<string, StoredVerification>();

  verify(input: EffectVerificationRequestV1): EffectVerificationResultV1 {
    const fingerprint = verificationFingerprint(input);
    const existing = this.byExecutionReceipt.get(input.execution.receiptRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return failure(
          input,
          "VERIFICATION_CONFLICT",
          "execution receipt already has a different verified observation",
        );
      }
      return {
        ok: true,
        state: "VERIFIED_EFFECT",
        effect: { ...existing.effect },
        observationRef: existing.observationRef,
        idempotentReplay: true,
      };
    }

    if ((input.execution as { state: string }).state !== "EXECUTED_UNVERIFIED") {
      return failure(
        input,
        "EXECUTION_NOT_UNVERIFIED",
        "effect verification requires an EXECUTED_UNVERIFIED receipt",
      );
    }
    if (input.observation.executionReceiptRef !== input.execution.receiptRef) {
      return failure(
        input,
        "OBSERVATION_EXECUTION_MISMATCH",
        "observation does not reference the execution receipt",
      );
    }
    if (input.observation.actionRef !== input.execution.actionRef) {
      return failure(input, "OBSERVATION_ACTION_MISMATCH", "observation action lineage mismatch");
    }
    if (input.observation.programRef !== input.execution.programRef) {
      return failure(
        input,
        "OBSERVATION_PROGRAM_MISMATCH",
        "observation program lineage mismatch",
      );
    }
    if (input.observation.eventRef !== input.execution.eventRef) {
      return failure(input, "OBSERVATION_EVENT_MISMATCH", "observation event lineage mismatch");
    }
    if (input.observation.targetRef !== input.execution.targetRef) {
      return failure(input, "OBSERVATION_TARGET_MISMATCH", "observation target lineage mismatch");
    }
    if (input.observation.correlationId !== input.execution.correlationId) {
      return failure(
        input,
        "OBSERVATION_CORRELATION_MISMATCH",
        "observation correlation lineage mismatch",
      );
    }
    if (!input.observation.observedStateRef.trim()) {
      return failure(input, "MISSING_OBSERVED_STATE", "observation has no observed state reference");
    }
    if (!input.observation.sourceEvidenceRef.trim()) {
      return failure(input, "MISSING_SOURCE_EVIDENCE", "observation has no source evidence reference");
    }

    const executed = parseInstant(input.execution.executedAt);
    const observed = parseInstant(input.observation.observedAt);
    const verified = parseInstant(input.verifiedAt);
    if (executed === undefined || observed === undefined || observed < executed) {
      return failure(
        input,
        "OBSERVATION_BEFORE_EXECUTION",
        "observation time is invalid or precedes execution",
      );
    }
    if (verified === undefined || verified < observed) {
      return failure(
        input,
        "VERIFICATION_BEFORE_OBSERVATION",
        "verification time is invalid or precedes observation",
      );
    }

    const verificationIdentity = digest(
      [input.execution.receiptRef, input.observation.observationRef, fingerprint].join("|"),
    ).slice(0, 24);
    const effectIdentity = digest(
      [
        input.execution.receiptRef,
        input.observation.observedStateRef,
        input.observation.sourceEvidenceRef,
        verificationIdentity,
      ].join("|"),
    ).slice(0, 24);
    const effect: VerifiedEffectReceiptV1 = {
      effectRef: `RIVER-VERIFIED-EFFECT:${effectIdentity}`,
      executionReceiptRef: input.execution.receiptRef,
      reservationRef: input.execution.reservationRef,
      wardenDecisionRef: input.execution.wardenDecisionRef,
      programRef: input.execution.programRef,
      eventRef: input.execution.eventRef,
      correlationId: input.execution.correlationId,
      targetRef: input.execution.targetRef,
      observedStateRef: input.observation.observedStateRef,
      verifiedAt: input.verifiedAt,
      verificationRef: `EFFECT-VERIFICATION:${verificationIdentity}`,
      state: "VERIFIED_EFFECT",
      synthetic: true,
    };

    this.byExecutionReceipt.set(input.execution.receiptRef, {
      fingerprint,
      effect,
      observationRef: input.observation.observationRef,
    });
    return {
      ok: true,
      state: "VERIFIED_EFFECT",
      effect: { ...effect },
      observationRef: input.observation.observationRef,
      idempotentReplay: false,
    };
  }

  verificationCount(): number {
    return this.byExecutionReceipt.size;
  }
}
