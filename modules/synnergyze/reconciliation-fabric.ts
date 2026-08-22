import { createHash } from "node:crypto";

import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";

export type ReconciliationClassificationV1 =
  | "MATCH"
  | "MISSING_EFFECT"
  | "UNEXPECTED_EFFECT"
  | "PARTIAL_EFFECT"
  | "DUPLICATE_EFFECT"
  | "CONFLICTING_EFFECT"
  | "PROVIDER_UNAVAILABLE"
  | "EVIDENCE_INSUFFICIENT"
  | "UNKNOWN";

export type ReconciliationRemedyKindV1 =
  | "RETRY_OBSERVATION"
  | "MANUAL_REVIEW"
  | "RECOVER"
  | "COMPENSATE";

export interface ProviderReadbackV1 {
  readbackRef: string;
  executionReceiptRef: string;
  targetRef: string;
  correlationId: string;
  providerRef: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  observedStateRef?: string;
  sourceEvidenceRef: string;
  reasonCode?: string;
  readAt: string;
  synthetic: true;
}

export interface ReconciliationRemedyProposalV1 {
  proposalRef: string;
  kind: ReconciliationRemedyKindV1;
  capabilityRef: string;
  reasonCode: string;
  requiresFreshWardenDecision: true;
  authorized: false;
}

export interface ReconciliationDeterminationV1 {
  version: "RECONCILIATION-FABRIC-001";
  reconciliationRef: string;
  exceptionRef: string;
  classification: ReconciliationClassificationV1;
  executionReceiptRef: string;
  reservationRef: string;
  originalWardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  targetRef: string;
  requestedEffect?: string;
  correlationId: string;
  readbackRef?: string;
  sourceEvidenceRefs: readonly string[];
  candidateRemedies: readonly ReconciliationRemedyProposalV1[];
  sourceDigest: string;
  reconciledAt: string;
  state: "DETERMINED_UNAUTHORIZED";
  authorized: false;
  synthetic: true;
}

export type ReconciliationRejectCodeV1 =
  | "RECONCILIATION_EXCEPTION_NOT_OPEN"
  | "RECONCILIATION_INVALID_EXCEPTION_TIME"
  | "RECONCILIATION_INVALID_TIME"
  | "RECONCILIATION_BEFORE_EXCEPTION"
  | "RECONCILIATION_READBACK_EXECUTION_MISMATCH"
  | "RECONCILIATION_READBACK_TARGET_MISMATCH"
  | "RECONCILIATION_READBACK_CORRELATION_MISMATCH"
  | "RECONCILIATION_NON_SYNTHETIC_READBACK"
  | "RECONCILIATION_READBACK_EVIDENCE_REQUIRED"
  | "RECONCILIATION_READBACK_STATE_REQUIRED"
  | "RECONCILIATION_INVALID_READBACK_TIME"
  | "RECONCILIATION_READBACK_BEFORE_EXECUTION"
  | "RECONCILIATION_BEFORE_READBACK"
  | "RECONCILIATION_CONFLICT";

export interface ReconciliationSuccessV1 {
  state: "DETERMINED";
  determination: ReconciliationDeterminationV1;
  idempotentReplay: boolean;
}

export interface ReconciliationRejectedV1 {
  state: "REJECTED_INPUT";
  reasonCode: ReconciliationRejectCodeV1;
}

export type ReconciliationResultV1 = ReconciliationSuccessV1 | ReconciliationRejectedV1;

interface StoredReconciliationV1 {
  sourceDigest: string;
  determination: ReconciliationDeterminationV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function classificationFor(
  exception: CanonicalExceptionRecordV1,
  readback: ProviderReadbackV1 | undefined,
): ReconciliationClassificationV1 {
  if (readback?.status === "UNAVAILABLE") return "PROVIDER_UNAVAILABLE";

  switch (exception.classification) {
    case "LINEAGE":
    case "REPLAY_CONFLICT":
      return "CONFLICTING_EFFECT";
    case "EVIDENCE":
    case "TEMPORAL":
      return "EVIDENCE_INSUFFICIENT";
    case "STATE":
    case "AUTHORITY":
    case "UNKNOWN":
    default:
      return "UNKNOWN";
  }
}

function remedyBlueprints(
  classification: ReconciliationClassificationV1,
): readonly Omit<ReconciliationRemedyProposalV1, "proposalRef">[] {
  switch (classification) {
    case "EVIDENCE_INSUFFICIENT":
      return [
        {
          kind: "RETRY_OBSERVATION",
          capabilityRef: "effect.observe.retry",
          reasonCode: "fresh_observation_required",
          requiresFreshWardenDecision: true,
          authorized: false,
        },
      ];
    case "PROVIDER_UNAVAILABLE":
      return [
        {
          kind: "RETRY_OBSERVATION",
          capabilityRef: "effect.observe.retry",
          reasonCode: "provider_readback_unavailable",
          requiresFreshWardenDecision: true,
          authorized: false,
        },
      ];
    case "CONFLICTING_EFFECT":
    case "DUPLICATE_EFFECT":
    case "UNEXPECTED_EFFECT":
    case "PARTIAL_EFFECT":
    case "MISSING_EFFECT":
    case "UNKNOWN":
      return [
        {
          kind: "MANUAL_REVIEW",
          capabilityRef: "reconciliation.manual_review",
          reasonCode: "human_resolution_required",
          requiresFreshWardenDecision: true,
          authorized: false,
        },
      ];
    case "MATCH":
      return [];
  }
}

function cloneDetermination(
  determination: ReconciliationDeterminationV1,
): ReconciliationDeterminationV1 {
  return {
    ...determination,
    sourceEvidenceRefs: [...determination.sourceEvidenceRefs],
    candidateRemedies: determination.candidateRemedies.map((proposal) => ({ ...proposal })),
  };
}

export class ReconciliationFabricV1 {
  private readonly bySemanticKey = new Map<string, StoredReconciliationV1>();

  reconcile(input: {
    exception: CanonicalExceptionRecordV1;
    readback?: ProviderReadbackV1;
    reconciledAt: string;
  }): ReconciliationResultV1 {
    const { exception, readback, reconciledAt } = input;

    if (exception.state !== "OPEN") {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXCEPTION_NOT_OPEN" };
    }

    const executed = parseInstant(exception.executedAt);
    const detected = parseInstant(exception.detectedAt);
    if (executed === null || detected === null) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_INVALID_EXCEPTION_TIME" };
    }
    const reconciled = parseInstant(reconciledAt);
    if (reconciled === null) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_INVALID_TIME" };
    }
    if (reconciled < detected) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_BEFORE_EXCEPTION" };
    }

    if (readback) {
      if (readback.synthetic !== true) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_NON_SYNTHETIC_READBACK" };
      }
      if (readback.executionReceiptRef !== exception.executionReceiptRef) {
        return {
          state: "REJECTED_INPUT",
          reasonCode: "RECONCILIATION_READBACK_EXECUTION_MISMATCH",
        };
      }
      if (readback.targetRef !== exception.targetRef) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_READBACK_TARGET_MISMATCH" };
      }
      if (readback.correlationId !== exception.correlationId) {
        return {
          state: "REJECTED_INPUT",
          reasonCode: "RECONCILIATION_READBACK_CORRELATION_MISMATCH",
        };
      }
      if (!readback.sourceEvidenceRef.trim()) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_READBACK_EVIDENCE_REQUIRED" };
      }
      if (readback.status === "AVAILABLE" && !readback.observedStateRef?.trim()) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_READBACK_STATE_REQUIRED" };
      }
      const readAt = parseInstant(readback.readAt);
      if (readAt === null) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_INVALID_READBACK_TIME" };
      }
      if (readAt < executed) {
        return {
          state: "REJECTED_INPUT",
          reasonCode: "RECONCILIATION_READBACK_BEFORE_EXECUTION",
        };
      }
      if (reconciled < readAt) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_BEFORE_READBACK" };
      }
    }

    const classification = classificationFor(exception, readback);
    const sourceEvidenceRefs = stableUnique(
      [...exception.sourceEvidenceRefs, readback?.sourceEvidenceRef]
        .filter((value): value is string => Boolean(value?.trim())),
    );
    const semanticKey = digest(
      JSON.stringify({
        exceptionRef: exception.exceptionRef,
        readbackRef: readback?.readbackRef ?? null,
      }),
    );
    const sourceDigest = `sha256:${digest(
      JSON.stringify({
        exception: {
          exceptionRef: exception.exceptionRef,
          sourceDigest: exception.sourceDigest,
          reasonCode: exception.reasonCode,
          classification: exception.classification,
          executionReceiptRef: exception.executionReceiptRef,
          reservationRef: exception.reservationRef,
          originalWardenDecisionRef: exception.originalWardenDecisionRef,
          programRef: exception.programRef,
          eventRef: exception.eventRef,
          targetRef: exception.targetRef,
          requestedEffect: exception.requestedEffect ?? null,
          correlationId: exception.correlationId,
        },
        readback: readback
          ? {
              readbackRef: readback.readbackRef,
              executionReceiptRef: readback.executionReceiptRef,
              targetRef: readback.targetRef,
              correlationId: readback.correlationId,
              providerRef: readback.providerRef,
              status: readback.status,
              observedStateRef: readback.observedStateRef ?? null,
              sourceEvidenceRef: readback.sourceEvidenceRef,
              reasonCode: readback.reasonCode ?? null,
              readAt: readback.readAt,
            }
          : null,
        classification,
        sourceEvidenceRefs,
      }),
    )}`;

    const existing = this.bySemanticKey.get(semanticKey);
    if (existing) {
      if (existing.sourceDigest !== sourceDigest) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_CONFLICT" };
      }
      return {
        state: "DETERMINED",
        determination: cloneDetermination(existing.determination),
        idempotentReplay: true,
      };
    }

    const reconciliationRef = `RECONCILIATION:${digest(`${semanticKey}|${sourceDigest}`).slice(0, 24)}`;
    const candidateRemedies = remedyBlueprints(classification).map((proposal, index) => ({
      ...proposal,
      proposalRef: `REMEDY-PROPOSAL:${digest(`${reconciliationRef}|${proposal.kind}|${index}`).slice(0, 24)}`,
    }));
    const determination: ReconciliationDeterminationV1 = {
      version: "RECONCILIATION-FABRIC-001",
      reconciliationRef,
      exceptionRef: exception.exceptionRef,
      classification,
      executionReceiptRef: exception.executionReceiptRef,
      reservationRef: exception.reservationRef,
      originalWardenDecisionRef: exception.originalWardenDecisionRef,
      programRef: exception.programRef,
      eventRef: exception.eventRef,
      targetRef: exception.targetRef,
      requestedEffect: exception.requestedEffect,
      correlationId: exception.correlationId,
      readbackRef: readback?.readbackRef,
      sourceEvidenceRefs,
      candidateRemedies,
      sourceDigest,
      reconciledAt,
      state: "DETERMINED_UNAUTHORIZED",
      authorized: false,
      synthetic: true,
    };

    this.bySemanticKey.set(semanticKey, { sourceDigest, determination });
    return {
      state: "DETERMINED",
      determination: cloneDetermination(determination),
      idempotentReplay: false,
    };
  }

  determinationCount(): number {
    return this.bySemanticKey.size;
  }

  determinations(): readonly ReconciliationDeterminationV1[] {
    return [...this.bySemanticKey.values()].map(({ determination }) => cloneDetermination(determination));
  }
}
