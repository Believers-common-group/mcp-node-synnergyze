import { createHash } from "node:crypto";

import type { EvidenceSealV1 } from "../river/contracts.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import type { VerifiedRemedyEffectV1 } from "./remedy-effect-verification.ts";

export interface RemedyCausalSealV1 extends EvidenceSealV1 {
  version: "REMEDY-CAUSAL-SEAL-001";
  exceptionRef: string;
  reconciliationRef: string;
  proposalRef: string;
  authorizationRef: string;
  originalExecutionReceiptRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  remedyExecutionReceiptRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  sourceEvidenceRefs: readonly string[];
  synthetic: true;
}

export interface ExceptionSupersessionRecordV1 {
  version: "EXCEPTION-SUPERSESSION-001";
  supersessionRef: string;
  exceptionRef: string;
  reconciliationRef: string;
  priorState: "EXCEPTION";
  disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY" | "SUPERSEDED_BY_VERIFIED_COMPENSATION";
  proposalRef: string;
  authorizationRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverSealRef: string;
  originalExecutionReceiptRef: string;
  remedyExecutionReceiptRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  sourceEvidenceRefs: readonly string[];
  supersededAt: string;
  state: "RESOLVED_APPEND_ONLY";
  settlementFinality: false;
  synthetic: true;
}

export type RemedyClosureResultV1 =
  | {
      state: "SEALED_AND_SUPERSEDED";
      seal: RemedyCausalSealV1;
      supersession: ExceptionSupersessionRecordV1;
      idempotentReplay: boolean;
    }
  | {
      state: "REJECTED_INPUT";
      reasonCode:
        | "REMEDY_CLOSURE_DETERMINATION_NOT_EXCEPTION"
        | "REMEDY_CLOSURE_EFFECT_LINEAGE_MISMATCH"
        | "REMEDY_CLOSURE_PROPOSAL_NOT_BOUND"
        | "REMEDY_CLOSURE_INVALID_TIME"
        | "REMEDY_CLOSURE_BEFORE_VERIFICATION"
        | "REMEDY_CLOSURE_CONFLICT";
    };

interface StoredClosureV1 {
  sourceDigest: string;
  seal: RemedyCausalSealV1;
  supersession: ExceptionSupersessionRecordV1;
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

export function reconciliationExceptionRefV1(
  determination: ReconciliationDeterminationV1,
): string {
  return `RECONCILIATION-EXCEPTION:${digest(
    `${determination.reconciliationRef}|${determination.sourceDigest}`,
  ).slice(0, 24)}`;
}

function cloneSeal(value: RemedyCausalSealV1): RemedyCausalSealV1 {
  return { ...value, sourceEvidenceRefs: [...value.sourceEvidenceRefs] };
}

function cloneSupersession(value: ExceptionSupersessionRecordV1): ExceptionSupersessionRecordV1 {
  return { ...value, sourceEvidenceRefs: [...value.sourceEvidenceRefs] };
}

export class RemedyLineageClosureServiceV1 {
  private readonly byExceptionRef = new Map<string, StoredClosureV1>();

  close(input: {
    determination: ReconciliationDeterminationV1;
    proposal: ReconciliationRemedyProposalV1;
    effect: VerifiedRemedyEffectV1;
    sealedAt: string;
  }): RemedyClosureResultV1 {
    const { determination, proposal, effect, sealedAt } = input;

    if (
      determination.state !== "EXCEPTION" ||
      determination.closureEligible ||
      determination.synthetic !== true
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_DETERMINATION_NOT_EXCEPTION" };
    }

    const bound = determination.candidateRemedies.find(
      (candidate) => candidate.proposalRef === proposal.proposalRef,
    );
    if (
      !bound ||
      bound.kind !== proposal.kind ||
      bound.capabilityRef !== proposal.capabilityRef ||
      bound.reasonCode !== proposal.reasonCode ||
      proposal.kind === "MANUAL_REVIEW"
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_PROPOSAL_NOT_BOUND" };
    }

    if (
      effect.state !== "VERIFIED_REMEDY_EFFECT" ||
      effect.synthetic !== true ||
      effect.reconciliationRef !== determination.reconciliationRef ||
      effect.proposalRef !== proposal.proposalRef ||
      effect.proposalKind !== proposal.kind ||
      effect.originalExecutionReceiptRef !== determination.executionReceiptRef ||
      effect.originalReservationRef !== determination.reservationRef ||
      effect.originalWardenDecisionRef !== determination.originalWardenDecisionRef ||
      effect.parentCorrelationId !== determination.correlationId ||
      effect.remedyCorrelationId === determination.correlationId ||
      effect.targetRef !== determination.targetRef ||
      effect.remedyWardenDecisionRef === determination.originalWardenDecisionRef
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_EFFECT_LINEAGE_MISMATCH" };
    }

    const verifiedAt = parseInstant(effect.verifiedAt);
    const sealedAtMs = parseInstant(sealedAt);
    if (verifiedAt === null || sealedAtMs === null) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_INVALID_TIME" };
    }
    if (sealedAtMs < verifiedAt) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_BEFORE_VERIFICATION" };
    }

    const exceptionRef = reconciliationExceptionRefV1(determination);
    const sourceEvidenceRefs = stableUnique([
      ...determination.sourceEvidenceRefs,
      effect.sourceEvidenceRef,
    ]);
    const sourceDigest = `sha256:${digest(JSON.stringify({
      exceptionRef,
      reconciliationRef: determination.reconciliationRef,
      reconciliationSourceDigest: determination.sourceDigest,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      authorizationRef: effect.authorizationRef,
      originalExecutionReceiptRef: effect.originalExecutionReceiptRef,
      originalReservationRef: effect.originalReservationRef,
      originalWardenDecisionRef: effect.originalWardenDecisionRef,
      remedyWardenDecisionRef: effect.remedyWardenDecisionRef,
      remedyExecutionReceiptRef: effect.remedyExecutionReceiptRef,
      remedyEffectRef: effect.effectRef,
      remedyVerificationRef: effect.verificationRef,
      parentCorrelationId: effect.parentCorrelationId,
      remedyCorrelationId: effect.remedyCorrelationId,
      targetRef: effect.targetRef,
      sourceEvidenceRefs,
    }))}`;

    const existing = this.byExceptionRef.get(exceptionRef);
    if (existing) {
      if (existing.sourceDigest !== sourceDigest) {
        return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CLOSURE_CONFLICT" };
      }
      return {
        state: "SEALED_AND_SUPERSEDED",
        seal: cloneSeal(existing.seal),
        supersession: cloneSupersession(existing.supersession),
        idempotentReplay: true,
      };
    }

    const traceDigest = `sha256:${digest(JSON.stringify({
      sourceDigest,
      remedyEffectRef: effect.effectRef,
      remedyVerificationRef: effect.verificationRef,
      sealedAt,
    }))}`;
    const sealRef = `RIVER-REMEDY-SEAL:${digest(
      `${exceptionRef}|${effect.effectRef}|${traceDigest}`,
    ).slice(0, 24)}`;
    const seal: RemedyCausalSealV1 = {
      version: "REMEDY-CAUSAL-SEAL-001",
      sealRef,
      reservationRef: determination.reservationRef,
      correlationId: determination.correlationId,
      state: "SEALED",
      traceDigest,
      sealedAt,
      exceptionRef,
      reconciliationRef: determination.reconciliationRef,
      proposalRef: proposal.proposalRef,
      authorizationRef: effect.authorizationRef,
      originalExecutionReceiptRef: effect.originalExecutionReceiptRef,
      originalWardenDecisionRef: effect.originalWardenDecisionRef,
      remedyWardenDecisionRef: effect.remedyWardenDecisionRef,
      remedyExecutionReceiptRef: effect.remedyExecutionReceiptRef,
      remedyEffectRef: effect.effectRef,
      remedyVerificationRef: effect.verificationRef,
      parentCorrelationId: effect.parentCorrelationId,
      remedyCorrelationId: effect.remedyCorrelationId,
      sourceEvidenceRefs,
      synthetic: true,
    };

    const disposition = proposal.kind === "RECOVER"
      ? "SUPERSEDED_BY_VERIFIED_RECOVERY"
      : "SUPERSEDED_BY_VERIFIED_COMPENSATION";
    const supersession: ExceptionSupersessionRecordV1 = {
      version: "EXCEPTION-SUPERSESSION-001",
      supersessionRef: `EXCEPTION-SUPERSESSION:${digest(
        `${exceptionRef}|${sealRef}|${effect.verificationRef}`,
      ).slice(0, 24)}`,
      exceptionRef,
      reconciliationRef: determination.reconciliationRef,
      priorState: "EXCEPTION",
      disposition,
      proposalRef: proposal.proposalRef,
      authorizationRef: effect.authorizationRef,
      remedyEffectRef: effect.effectRef,
      remedyVerificationRef: effect.verificationRef,
      riverSealRef: sealRef,
      originalExecutionReceiptRef: effect.originalExecutionReceiptRef,
      remedyExecutionReceiptRef: effect.remedyExecutionReceiptRef,
      originalWardenDecisionRef: effect.originalWardenDecisionRef,
      remedyWardenDecisionRef: effect.remedyWardenDecisionRef,
      parentCorrelationId: effect.parentCorrelationId,
      remedyCorrelationId: effect.remedyCorrelationId,
      sourceEvidenceRefs,
      supersededAt: sealedAt,
      state: "RESOLVED_APPEND_ONLY",
      settlementFinality: false,
      synthetic: true,
    };

    this.byExceptionRef.set(exceptionRef, { sourceDigest, seal, supersession });
    return {
      state: "SEALED_AND_SUPERSEDED",
      seal: cloneSeal(seal),
      supersession: cloneSupersession(supersession),
      idempotentReplay: false,
    };
  }
}
