import { createHash } from "node:crypto";

import type { EffectMatcherV1, ExpectedEffectContractV1 } from "./effect-expectation.ts";
import { validateExpectedEffectContractV1 } from "./effect-expectation.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import type { RemedyAuthorizationGrantV1 } from "./remedy-authorization.ts";
import type { RemedyExecutionReceiptV1 } from "./remedy-execution.ts";

export interface RemedyObservationV1 {
  observationRef: string;
  remedyExecutionReceiptRef: string;
  reconciliationRef: string;
  proposalRef: string;
  targetRef: string;
  remedyCorrelationId: string;
  observerRef: string;
  observedStateRef: string;
  sourceEvidenceRef: string;
  observedAt: string;
  synthetic: true;
}

export interface CompensationTargetResolverV1 {
  readonly resolverRef: string;
  readonly capabilityRef: string;
  resolve(input: {
    expectation: ExpectedEffectContractV1;
    determination: ReconciliationDeterminationV1;
    proposal: ReconciliationRemedyProposalV1;
  }): EffectMatcherV1;
}

export interface VerifiedRemedyEffectV1 {
  version: "REMEDY-EFFECT-VERIFICATION-001";
  effectRef: string;
  verificationRef: string;
  reconciliationRef: string;
  proposalRef: string;
  proposalKind: "RECOVER" | "COMPENSATE";
  authorizationRef: string;
  remedyExecutionReceiptRef: string;
  originalExecutionReceiptRef: string;
  originalReservationRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  targetRef: string;
  observedStateRef: string;
  observationRef: string;
  sourceEvidenceRef: string;
  verifiedAt: string;
  state: "VERIFIED_REMEDY_EFFECT";
  synthetic: true;
}

export type RemedyEffectVerificationResultV1 =
  | { state: "VERIFIED_REMEDY_EFFECT"; effect: VerifiedRemedyEffectV1 }
  | {
      state: "EXCEPTION";
      reasonCode:
        | "REMEDY_EFFECT_EXPECTATION_INVALID"
        | "REMEDY_EFFECT_DETERMINATION_NOT_EXCEPTION"
        | "REMEDY_EFFECT_PROPOSAL_NOT_BOUND"
        | "REMEDY_EFFECT_MANUAL_REVIEW_NOT_EXECUTABLE"
        | "REMEDY_EFFECT_AUTHORIZATION_MISMATCH"
        | "REMEDY_EFFECT_EXECUTION_MISMATCH"
        | "REMEDY_EFFECT_OBSERVATION_LINEAGE_MISMATCH"
        | "REMEDY_EFFECT_OBSERVATION_EVIDENCE_REQUIRED"
        | "REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED"
        | "REMEDY_EFFECT_STATE_MISMATCH"
        | "REMEDY_EFFECT_INVALID_TIME"
        | "REMEDY_EFFECT_OBSERVATION_BEFORE_EXECUTION"
        | "REMEDY_EFFECT_VERIFICATION_BEFORE_OBSERVATION";
    };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matches(matcher: EffectMatcherV1, value: string): boolean {
  return matcher.kind === "EXACT" ? value === matcher.value : value.startsWith(matcher.value);
}

function boundProposal(
  determination: ReconciliationDeterminationV1,
  proposal: ReconciliationRemedyProposalV1,
): boolean {
  const candidate = determination.candidateRemedies.find(
    (value) => value.proposalRef === proposal.proposalRef,
  );
  return Boolean(
    candidate &&
    candidate.kind === proposal.kind &&
    candidate.capabilityRef === proposal.capabilityRef &&
    candidate.reasonCode === proposal.reasonCode &&
    candidate.requiresFreshWardenDecision === true &&
    candidate.authorized === false,
  );
}

export function verifyRemedyEffectV1(input: {
  expectation: ExpectedEffectContractV1;
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  authorization: RemedyAuthorizationGrantV1;
  receipt: RemedyExecutionReceiptV1;
  observation: RemedyObservationV1;
  compensationResolvers?: readonly CompensationTargetResolverV1[];
  verifiedAt: string;
}): RemedyEffectVerificationResultV1 {
  const {
    expectation,
    determination,
    proposal,
    authorization,
    receipt,
    observation,
    compensationResolvers = [],
    verifiedAt,
  } = input;

  if (!validateExpectedEffectContractV1(expectation)) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_EXPECTATION_INVALID" };
  }
  if (
    determination.state !== "EXCEPTION" ||
    determination.closureEligible ||
    determination.synthetic !== true
  ) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_DETERMINATION_NOT_EXCEPTION" };
  }
  if (!boundProposal(determination, proposal)) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_PROPOSAL_NOT_BOUND" };
  }
  if (proposal.kind === "MANUAL_REVIEW") {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_MANUAL_REVIEW_NOT_EXECUTABLE" };
  }

  if (
    authorization.state !== "AUTHORIZED_REMEDY" ||
    authorization.reconciliationRef !== determination.reconciliationRef ||
    authorization.proposalRef !== proposal.proposalRef ||
    authorization.proposalKind !== proposal.kind ||
    authorization.capabilityRef !== proposal.capabilityRef ||
    authorization.targetRef !== determination.targetRef ||
    authorization.parentCorrelationId !== determination.correlationId ||
    authorization.originalWardenDecisionRef !== determination.originalWardenDecisionRef
  ) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_AUTHORIZATION_MISMATCH" };
  }

  if (
    receipt.state !== "EXECUTED_UNVERIFIED_REMEDY" ||
    receipt.synthetic !== true ||
    receipt.authorizationRef !== authorization.authorizationRef ||
    receipt.reconciliationRef !== determination.reconciliationRef ||
    receipt.proposalRef !== proposal.proposalRef ||
    receipt.proposalKind !== proposal.kind ||
    receipt.parentCorrelationId !== determination.correlationId ||
    receipt.remedyCorrelationId !== authorization.remedyCorrelationId ||
    receipt.originalWardenDecisionRef !== determination.originalWardenDecisionRef ||
    receipt.remedyWardenDecisionRef !== authorization.remedyWardenDecisionRef ||
    receipt.capabilityRef !== proposal.capabilityRef ||
    receipt.targetRef !== determination.targetRef
  ) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_EXECUTION_MISMATCH" };
  }

  if (
    observation.synthetic !== true ||
    observation.remedyExecutionReceiptRef !== receipt.receiptRef ||
    observation.reconciliationRef !== determination.reconciliationRef ||
    observation.proposalRef !== proposal.proposalRef ||
    observation.targetRef !== determination.targetRef ||
    observation.remedyCorrelationId !== authorization.remedyCorrelationId
  ) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_OBSERVATION_LINEAGE_MISMATCH" };
  }
  if (!observation.sourceEvidenceRef.trim() || !observation.observedStateRef.trim()) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_OBSERVATION_EVIDENCE_REQUIRED" };
  }

  const executedAt = parseInstant(receipt.executedAt);
  const observedAt = parseInstant(observation.observedAt);
  const verifiedAtMs = parseInstant(verifiedAt);
  if (executedAt === null || observedAt === null || verifiedAtMs === null) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_INVALID_TIME" };
  }
  if (observedAt < executedAt) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_OBSERVATION_BEFORE_EXECUTION" };
  }
  if (verifiedAtMs < observedAt) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_VERIFICATION_BEFORE_OBSERVATION" };
  }

  let matcher: EffectMatcherV1;
  if (proposal.kind === "RECOVER") {
    matcher = expectation.matcher;
  } else {
    const resolver = compensationResolvers.find(
      (candidate) => candidate.capabilityRef === proposal.capabilityRef,
    );
    if (!resolver) {
      return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED" };
    }
    try {
      matcher = resolver.resolve({ expectation, determination, proposal });
    } catch {
      return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED" };
    }
  }
  if (!matcher.value.trim() || !matches(matcher, observation.observedStateRef)) {
    return { state: "EXCEPTION", reasonCode: "REMEDY_EFFECT_STATE_MISMATCH" };
  }

  const verificationRef = `REMEDY-EFFECT-VERIFICATION:${digest(JSON.stringify({
    reconciliationRef: determination.reconciliationRef,
    proposalRef: proposal.proposalRef,
    authorizationRef: authorization.authorizationRef,
    remedyExecutionReceiptRef: receipt.receiptRef,
    observationRef: observation.observationRef,
    sourceEvidenceRef: observation.sourceEvidenceRef,
    observedStateRef: observation.observedStateRef,
    verifiedAt,
  })).slice(0, 24)}`;
  const effectRef = `VERIFIED-REMEDY-EFFECT:${digest(
    `${verificationRef}|${receipt.receiptRef}|${observation.observedStateRef}`,
  ).slice(0, 24)}`;

  return {
    state: "VERIFIED_REMEDY_EFFECT",
    effect: {
      version: "REMEDY-EFFECT-VERIFICATION-001",
      effectRef,
      verificationRef,
      reconciliationRef: determination.reconciliationRef,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      authorizationRef: authorization.authorizationRef,
      remedyExecutionReceiptRef: receipt.receiptRef,
      originalExecutionReceiptRef: determination.executionReceiptRef,
      originalReservationRef: determination.reservationRef,
      originalWardenDecisionRef: determination.originalWardenDecisionRef,
      remedyWardenDecisionRef: authorization.remedyWardenDecisionRef,
      parentCorrelationId: determination.correlationId,
      remedyCorrelationId: authorization.remedyCorrelationId,
      targetRef: determination.targetRef,
      observedStateRef: observation.observedStateRef,
      observationRef: observation.observationRef,
      sourceEvidenceRef: observation.sourceEvidenceRef,
      verifiedAt,
      state: "VERIFIED_REMEDY_EFFECT",
      synthetic: true,
    },
  };
}
