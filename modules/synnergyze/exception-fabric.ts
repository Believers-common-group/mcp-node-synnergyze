import { createHash } from "node:crypto";

import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import type {
  EffectVerificationFailureV1,
  EffectVerificationReasonCodeV1,
  PostExecutionObservationV1,
} from "./effect-verification.ts";

export type CanonicalExceptionClassificationV1 =
  | "AUTHORITY"
  | "LINEAGE"
  | "EVIDENCE"
  | "TEMPORAL"
  | "REPLAY_CONFLICT"
  | "STATE"
  | "UNKNOWN";

export type ExceptionLineageViolationV1 =
  | "OBSERVATION_EXECUTION"
  | "OBSERVATION_ACTION"
  | "OBSERVATION_PROGRAM"
  | "OBSERVATION_EVENT"
  | "OBSERVATION_TARGET"
  | "OBSERVATION_CORRELATION";

export interface CanonicalExceptionRecordV1 {
  version: "EXCEPTION-FABRIC-001";
  exceptionRef: string;
  source: "EFFECT_VERIFICATION";
  classification: CanonicalExceptionClassificationV1;
  reasonCode: EffectVerificationReasonCodeV1;
  reasonDigest: string;
  executionReceiptRef: string;
  actionRef: string;
  reservationRef: string;
  originalWardenDecisionRef: string;
  checkpointRef: string;
  programRef: string;
  eventRef: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect?: string;
  correlationId: string;
  observationRef?: string;
  sourceEvidenceRefs: readonly string[];
  lineageViolations: readonly ExceptionLineageViolationV1[];
  executedAt: string;
  detectedAt: string;
  sourceDigest: string;
  state: "OPEN";
  synthetic: true;
}

export type ExceptionCaptureRejectCodeV1 =
  | "EXCEPTION_SOURCE_RECEIPT_MISMATCH"
  | "EXCEPTION_OBSERVATION_REQUIRED"
  | "EXCEPTION_OBSERVATION_UNEXPECTED"
  | "EXCEPTION_OBSERVATION_REF_MISMATCH"
  | "EXCEPTION_NON_SYNTHETIC_RECEIPT"
  | "EXCEPTION_NON_SYNTHETIC_OBSERVATION"
  | "EXCEPTION_INVALID_EXECUTION_TIME"
  | "EXCEPTION_INVALID_DETECTION_TIME"
  | "EXCEPTION_DETECTED_BEFORE_EXECUTION"
  | "EXCEPTION_CAPTURE_CONFLICT";

export interface ExceptionCaptureSuccessV1 {
  state: "CAPTURED_EXCEPTION";
  record: CanonicalExceptionRecordV1;
  idempotentReplay: boolean;
}

export interface ExceptionCaptureRejectedV1 {
  state: "REJECTED_INPUT";
  reasonCode: ExceptionCaptureRejectCodeV1;
}

export type ExceptionCaptureResultV1 =
  | ExceptionCaptureSuccessV1
  | ExceptionCaptureRejectedV1;

interface StoredExceptionV1 {
  sourceDigest: string;
  record: CanonicalExceptionRecordV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableUnique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort() as T[];
}

function classificationFor(reasonCode: EffectVerificationReasonCodeV1): CanonicalExceptionClassificationV1 {
  switch (reasonCode) {
    case "OBSERVATION_EXECUTION_MISMATCH":
    case "OBSERVATION_ACTION_MISMATCH":
    case "OBSERVATION_PROGRAM_MISMATCH":
    case "OBSERVATION_EVENT_MISMATCH":
    case "OBSERVATION_TARGET_MISMATCH":
    case "OBSERVATION_CORRELATION_MISMATCH":
      return "LINEAGE";
    case "OBSERVATION_BEFORE_EXECUTION":
    case "VERIFICATION_BEFORE_OBSERVATION":
    case "INVALID_EXECUTION_TIME":
    case "INVALID_OBSERVATION_TIME":
    case "INVALID_VERIFICATION_TIME":
      return "TEMPORAL";
    case "MISSING_OBSERVED_STATE":
    case "MISSING_SOURCE_EVIDENCE":
    case "NON_SYNTHETIC_OBSERVATION":
      return "EVIDENCE";
    case "VERIFICATION_IDEMPOTENCY_CONFLICT":
      return "REPLAY_CONFLICT";
    case "EXECUTION_NOT_UNVERIFIED":
      return "STATE";
    default:
      return "UNKNOWN";
  }
}

function lineageViolations(
  receipt: SynnergyzeExecutionReceiptV1,
  observation: PostExecutionObservationV1 | undefined,
): readonly ExceptionLineageViolationV1[] {
  if (!observation) return [];
  const violations: ExceptionLineageViolationV1[] = [];
  if (observation.executionReceiptRef !== receipt.receiptRef) violations.push("OBSERVATION_EXECUTION");
  if (observation.actionRef !== receipt.actionRef) violations.push("OBSERVATION_ACTION");
  if (observation.programRef !== receipt.programRef) violations.push("OBSERVATION_PROGRAM");
  if (observation.eventRef !== receipt.eventRef) violations.push("OBSERVATION_EVENT");
  if (observation.targetRef !== receipt.targetRef) violations.push("OBSERVATION_TARGET");
  if (observation.correlationId !== receipt.correlationId) violations.push("OBSERVATION_CORRELATION");
  return stableUnique(violations);
}

export class ExceptionFabricV1 {
  private readonly bySemanticKey = new Map<string, StoredExceptionV1>();

  captureEffectVerificationFailure(input: {
    receipt: SynnergyzeExecutionReceiptV1;
    failure: EffectVerificationFailureV1;
    observation?: PostExecutionObservationV1;
    detectedAt: string;
  }): ExceptionCaptureResultV1 {
    const { receipt, failure, observation, detectedAt } = input;

    if (receipt.synthetic !== true) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_NON_SYNTHETIC_RECEIPT" };
    }
    if (failure.executionReceiptRef !== receipt.receiptRef) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_SOURCE_RECEIPT_MISMATCH" };
    }
    if (failure.observationRef && !observation) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_OBSERVATION_REQUIRED" };
    }
    if (!failure.observationRef && observation) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_OBSERVATION_UNEXPECTED" };
    }
    if (failure.observationRef && observation?.observationRef !== failure.observationRef) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_OBSERVATION_REF_MISMATCH" };
    }
    if (observation && observation.synthetic !== true) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_NON_SYNTHETIC_OBSERVATION" };
    }

    const executed = parseInstant(receipt.executedAt);
    if (executed === null) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_INVALID_EXECUTION_TIME" };
    }
    const detected = parseInstant(detectedAt);
    if (detected === null) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_INVALID_DETECTION_TIME" };
    }
    if (detected < executed) {
      return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_DETECTED_BEFORE_EXECUTION" };
    }

    const classification = classificationFor(failure.reasonCode);
    const violations = lineageViolations(receipt, observation);
    const sourceEvidenceRefs = stableUnique(
      [observation?.sourceEvidenceRef, receipt.deviceSecurityEvidenceRef]
        .filter((value): value is string => Boolean(value?.trim())),
    );
    const reasonDigest = `sha256:${digest(failure.reason)}`;
    const semanticKey = digest(
      JSON.stringify({
        source: "EFFECT_VERIFICATION",
        executionReceiptRef: receipt.receiptRef,
        reasonCode: failure.reasonCode,
        observationRef: failure.observationRef ?? null,
      }),
    );
    const sourceDigest = `sha256:${digest(
      JSON.stringify({
        receipt: {
          receiptRef: receipt.receiptRef,
          actionRef: receipt.actionRef,
          reservationRef: receipt.reservationRef,
          wardenDecisionRef: receipt.wardenDecisionRef,
          checkpointRef: receipt.checkpointRef,
          programRef: receipt.programRef,
          eventRef: receipt.eventRef,
          capabilityRef: receipt.capabilityRef,
          targetRef: receipt.targetRef,
          requestedEffect: receipt.requestedEffect ?? null,
          correlationId: receipt.correlationId,
          executedAt: receipt.executedAt,
        },
        failure: {
          reasonCode: failure.reasonCode,
          reasonDigest,
          observationRef: failure.observationRef ?? null,
        },
        observation: observation
          ? {
              observationRef: observation.observationRef,
              executionReceiptRef: observation.executionReceiptRef,
              actionRef: observation.actionRef,
              programRef: observation.programRef,
              eventRef: observation.eventRef,
              targetRef: observation.targetRef,
              correlationId: observation.correlationId,
              observerRef: observation.observerRef,
              observedStateRef: observation.observedStateRef,
              observedAt: observation.observedAt,
              sourceEvidenceRef: observation.sourceEvidenceRef,
            }
          : null,
        classification,
        lineageViolations: violations,
        sourceEvidenceRefs,
      }),
    )}`;

    const existing = this.bySemanticKey.get(semanticKey);
    if (existing) {
      if (existing.sourceDigest !== sourceDigest) {
        return { state: "REJECTED_INPUT", reasonCode: "EXCEPTION_CAPTURE_CONFLICT" };
      }
      return {
        state: "CAPTURED_EXCEPTION",
        record: {
          ...existing.record,
          sourceEvidenceRefs: [...existing.record.sourceEvidenceRefs],
          lineageViolations: [...existing.record.lineageViolations],
        },
        idempotentReplay: true,
      };
    }

    const record: CanonicalExceptionRecordV1 = {
      version: "EXCEPTION-FABRIC-001",
      exceptionRef: `EXCEPTION:${digest(`${semanticKey}|${sourceDigest}`).slice(0, 24)}`,
      source: "EFFECT_VERIFICATION",
      classification,
      reasonCode: failure.reasonCode,
      reasonDigest,
      executionReceiptRef: receipt.receiptRef,
      actionRef: receipt.actionRef,
      reservationRef: receipt.reservationRef,
      originalWardenDecisionRef: receipt.wardenDecisionRef,
      checkpointRef: receipt.checkpointRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      capabilityRef: receipt.capabilityRef,
      targetRef: receipt.targetRef,
      requestedEffect: receipt.requestedEffect,
      correlationId: receipt.correlationId,
      observationRef: failure.observationRef,
      sourceEvidenceRefs,
      lineageViolations: violations,
      executedAt: receipt.executedAt,
      detectedAt,
      sourceDigest,
      state: "OPEN",
      synthetic: true,
    };

    this.bySemanticKey.set(semanticKey, { sourceDigest, record });
    return {
      state: "CAPTURED_EXCEPTION",
      record: {
        ...record,
        sourceEvidenceRefs: [...record.sourceEvidenceRefs],
        lineageViolations: [...record.lineageViolations],
      },
      idempotentReplay: false,
    };
  }

  exceptionCount(): number {
    return this.bySemanticKey.size;
  }

  records(): readonly CanonicalExceptionRecordV1[] {
    return [...this.bySemanticKey.values()].map(({ record }) => ({
      ...record,
      sourceEvidenceRefs: [...record.sourceEvidenceRefs],
      lineageViolations: [...record.lineageViolations],
    }));
  }
}
