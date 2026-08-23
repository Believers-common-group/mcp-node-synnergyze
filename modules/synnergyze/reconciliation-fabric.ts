import { createHash } from "node:crypto";

import type { CausalTraceV1, EvidenceSealV1 } from "../river/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import type {
  EffectVerificationResultV1,
  EffectVerificationSuccessV1,
  PostExecutionObservationV1,
} from "./effect-verification.ts";
import {
  matchesExpectedEffectV1,
  type ExpectedEffectContractV1,
} from "./effect-expectation.ts";

export type ReconciliationClassificationV1 =
  | "MATCH"
  | "MISSING_EFFECT"
  | "UNEXPECTED_EFFECT"
  | "CONFLICTING_EFFECT"
  | "EVIDENCE_INSUFFICIENT";

export type ReconciliationStateV1 = "RECONCILED" | "EXCEPTION";
export type ReconciliationRemedyKindV1 = "RECOVER" | "COMPENSATE" | "MANUAL_REVIEW";

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
  state: ReconciliationStateV1;
  classification: ReconciliationClassificationV1;
  expectationRef: string;
  executionReceiptRef: string;
  actionRef: string;
  reservationRef: string;
  originalWardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect: string;
  correlationId: string;
  observationRef?: string;
  effectRef?: string;
  sealRef?: string;
  sourceEvidenceRefs: readonly string[];
  candidateRemedies: readonly ReconciliationRemedyProposalV1[];
  closureEligible: boolean;
  reconciledAt: string;
  sourceDigest: string;
  synthetic: true;
}

export type ReconciliationRejectCodeV1 =
  | "RECONCILIATION_EXPECTATION_NOT_BOUND"
  | "RECONCILIATION_EXPECTATION_ACTION_MISMATCH"
  | "RECONCILIATION_EXPECTATION_RESERVATION_MISMATCH"
  | "RECONCILIATION_EXPECTATION_DECISION_MISMATCH"
  | "RECONCILIATION_EXPECTATION_PROGRAM_MISMATCH"
  | "RECONCILIATION_EXPECTATION_EVENT_MISMATCH"
  | "RECONCILIATION_EXPECTATION_CAPABILITY_MISMATCH"
  | "RECONCILIATION_EXPECTATION_TARGET_MISMATCH"
  | "RECONCILIATION_EXPECTATION_CORRELATION_MISMATCH"
  | "RECONCILIATION_EXPECTATION_AFTER_EXECUTION"
  | "RECONCILIATION_OBSERVATION_MISMATCH"
  | "RECONCILIATION_EFFECT_LINEAGE_MISMATCH"
  | "RECONCILIATION_SEAL_REQUIRED"
  | "RECONCILIATION_SEAL_LINEAGE_MISMATCH"
  | "RECONCILIATION_CAUSAL_TRACE_REQUIRED"
  | "RECONCILIATION_CAUSAL_TRACE_MISMATCH"
  | "RECONCILIATION_INVALID_TIME"
  | "RECONCILIATION_BEFORE_EXECUTION"
  | "RECONCILIATION_CONFLICT";

export type ReconciliationResultV1 =
  | {
      state: "DETERMINED";
      determination: ReconciliationDeterminationV1;
      idempotentReplay: boolean;
    }
  | { state: "REJECTED_INPUT"; reasonCode: ReconciliationRejectCodeV1 };

interface StoredDeterminationV1 {
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

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function classificationForFailure(verification: Exclude<EffectVerificationResultV1, EffectVerificationSuccessV1>) {
  switch (verification.reasonCode) {
    case "MISSING_OBSERVED_STATE":
    case "MISSING_SOURCE_EVIDENCE":
      return "MISSING_EFFECT" as const;
    case "OBSERVATION_EXECUTION_MISMATCH":
    case "OBSERVATION_ACTION_MISMATCH":
    case "OBSERVATION_PROGRAM_MISMATCH":
    case "OBSERVATION_EVENT_MISMATCH":
    case "OBSERVATION_TARGET_MISMATCH":
    case "OBSERVATION_CORRELATION_MISMATCH":
    case "VERIFICATION_IDEMPOTENCY_CONFLICT":
      return "CONFLICTING_EFFECT" as const;
    default:
      return "EVIDENCE_INSUFFICIENT" as const;
  }
}

function remediesFor(
  classification: ReconciliationClassificationV1,
  reconciliationRef: string,
): readonly ReconciliationRemedyProposalV1[] {
  const base = (() => {
    switch (classification) {
      case "MISSING_EFFECT":
        return {
          kind: "RECOVER" as const,
          capabilityRef: "reconciliation.recover",
          reasonCode: "expected_effect_missing",
        };
      case "UNEXPECTED_EFFECT":
        return {
          kind: "COMPENSATE" as const,
          capabilityRef: "reconciliation.compensate",
          reasonCode: "unexpected_effect_observed",
        };
      case "CONFLICTING_EFFECT":
      case "EVIDENCE_INSUFFICIENT":
        return {
          kind: "MANUAL_REVIEW" as const,
          capabilityRef: "reconciliation.manual_review",
          reasonCode: "unsafe_for_automatic_remedy",
        };
      case "MATCH":
        return null;
    }
  })();

  if (!base) return [];
  return [{
    proposalRef: `REMEDY-PROPOSAL:${digest(`${reconciliationRef}|${base.kind}|${base.reasonCode}`).slice(0, 24)}`,
    ...base,
    requiresFreshWardenDecision: true,
    authorized: false,
  }];
}

function cloneDetermination(value: ReconciliationDeterminationV1): ReconciliationDeterminationV1 {
  return {
    ...value,
    sourceEvidenceRefs: [...value.sourceEvidenceRefs],
    candidateRemedies: value.candidateRemedies.map((proposal) => ({ ...proposal })),
  };
}

export class ReconciliationFabricV1 {
  private readonly byExecutionReceiptRef = new Map<string, StoredDeterminationV1>();

  reconcile(input: {
    expectation: ExpectedEffectContractV1;
    receipt: SynnergyzeExecutionReceiptV1;
    observation?: PostExecutionObservationV1;
    verification: EffectVerificationResultV1;
    seal?: EvidenceSealV1;
    causalTrace?: CausalTraceV1;
    reconciledAt: string;
  }): ReconciliationResultV1 {
    const { expectation, receipt, observation, verification, seal, causalTrace, reconciledAt } = input;

    if (expectation.state !== "BOUND_PRE_EXECUTION") {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_NOT_BOUND" };
    }
    if (expectation.actionRef !== receipt.actionRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_ACTION_MISMATCH" };
    }
    if (expectation.reservationRef !== receipt.reservationRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_RESERVATION_MISMATCH" };
    }
    if (expectation.wardenDecisionRef !== receipt.wardenDecisionRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_DECISION_MISMATCH" };
    }
    if (expectation.programRef !== receipt.programRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_PROGRAM_MISMATCH" };
    }
    if (expectation.eventRef !== receipt.eventRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_EVENT_MISMATCH" };
    }
    if (expectation.capabilityRef !== receipt.capabilityRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_CAPABILITY_MISMATCH" };
    }
    if (expectation.targetRef !== receipt.targetRef) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_TARGET_MISMATCH" };
    }
    if (expectation.correlationId !== receipt.correlationId) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_CORRELATION_MISMATCH" };
    }

    const compiled = parseInstant(expectation.compiledAt);
    const executed = parseInstant(receipt.executedAt);
    const reconciled = parseInstant(reconciledAt);
    if (compiled === null || executed === null || reconciled === null) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_INVALID_TIME" };
    }
    if (compiled > executed) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EXPECTATION_AFTER_EXECUTION" };
    }
    if (reconciled < executed) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_BEFORE_EXECUTION" };
    }

    if (observation && (
      observation.executionReceiptRef !== receipt.receiptRef ||
      observation.actionRef !== receipt.actionRef ||
      observation.programRef !== receipt.programRef ||
      observation.eventRef !== receipt.eventRef ||
      observation.targetRef !== receipt.targetRef ||
      observation.correlationId !== receipt.correlationId
    )) {
      return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_OBSERVATION_MISMATCH" };
    }

    let classification: ReconciliationClassificationV1;
    const sourceEvidenceRefs: string[] = [];
    let effectRef: string | undefined;
    let sealRef: string | undefined;

    if (verification.state === "VERIFIED_EFFECT") {
      if (
        verification.effect.executionReceiptRef !== receipt.receiptRef ||
        verification.effect.reservationRef !== receipt.reservationRef ||
        verification.effect.wardenDecisionRef !== receipt.wardenDecisionRef ||
        verification.effect.programRef !== receipt.programRef ||
        verification.effect.eventRef !== receipt.eventRef ||
        verification.effect.targetRef !== receipt.targetRef ||
        verification.effect.correlationId !== receipt.correlationId
      ) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_EFFECT_LINEAGE_MISMATCH" };
      }
      if (!seal) return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_SEAL_REQUIRED" };
      if (seal.reservationRef !== receipt.reservationRef || seal.correlationId !== receipt.correlationId) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_SEAL_LINEAGE_MISMATCH" };
      }
      if (!causalTrace) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_CAUSAL_TRACE_REQUIRED" };
      }
      if (
        causalTrace.reservationRef !== receipt.reservationRef ||
        causalTrace.correlationId !== receipt.correlationId ||
        causalTrace.effectRef !== verification.effect.effectRef ||
        causalTrace.sealRef !== seal.sealRef ||
        causalTrace.sealed !== true
      ) {
        return { state: "REJECTED_INPUT", reasonCode: "RECONCILIATION_CAUSAL_TRACE_MISMATCH" };
      }
      effectRef = verification.effect.effectRef;
      sealRef = seal.sealRef;
      if (observation?.sourceEvidenceRef) sourceEvidenceRefs.push(observation.sourceEvidenceRef);
      classification = matchesExpectedEffectV1(expectation, verification.effect.observedStateRef)
        ? "MATCH"
        : "UNEXPECTED_EFFECT";
    } else {
      classification = classificationForFailure(verification);
      if (observation?.sourceEvidenceRef) sourceEvidenceRefs.push(observation.sourceEvidenceRef);
    }

    const state: ReconciliationStateV1 = classification === "MATCH" ? "RECONCILED" : "EXCEPTION";
    const semantic = {
      expectationRef: expectation.expectationRef,
      executionReceiptRef: receipt.receiptRef,
      observationRef: observation?.observationRef ?? null,
      verificationState: verification.state,
      verificationIdentity: verification.state === "VERIFIED_EFFECT"
        ? verification.effect.verificationRef
        : verification.reasonCode,
      effectRef: effectRef ?? null,
      sealRef: sealRef ?? null,
      classification,
    };
    const sourceDigest = `sha256:${digest(JSON.stringify(semantic))}`;
    const existing = this.byExecutionReceiptRef.get(receipt.receiptRef);
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

    const reconciliationRef = `RECONCILIATION:${digest(`${receipt.receiptRef}|${sourceDigest}`).slice(0, 24)}`;
    const determination: ReconciliationDeterminationV1 = {
      version: "RECONCILIATION-FABRIC-001",
      reconciliationRef,
      state,
      classification,
      expectationRef: expectation.expectationRef,
      executionReceiptRef: receipt.receiptRef,
      actionRef: receipt.actionRef,
      reservationRef: receipt.reservationRef,
      originalWardenDecisionRef: receipt.wardenDecisionRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      capabilityRef: receipt.capabilityRef,
      targetRef: receipt.targetRef,
      requestedEffect: expectation.requestedEffect,
      correlationId: receipt.correlationId,
      observationRef: observation?.observationRef,
      effectRef,
      sealRef,
      sourceEvidenceRefs: stableUnique(sourceEvidenceRefs),
      candidateRemedies: remediesFor(classification, reconciliationRef),
      closureEligible: classification === "MATCH" && Boolean(sealRef),
      reconciledAt,
      sourceDigest,
      synthetic: true,
    };
    this.byExecutionReceiptRef.set(receipt.receiptRef, { sourceDigest, determination });
    return {
      state: "DETERMINED",
      determination: cloneDetermination(determination),
      idempotentReplay: false,
    };
  }
}
