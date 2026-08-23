import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";

export interface RemedyAuthorizationGrantV1 {
  version: "WARDEN-REMEDY-AUTH-001";
  authorizationRef: string;
  reconciliationRef: string;
  proposalRef: string;
  proposalKind: "RECOVER" | "COMPENSATE";
  parentCorrelationId: string;
  remedyCorrelationId: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  remedyWardenRequestRef: string;
  capabilityRef: string;
  targetRef: string;
  actionTokenDigest: string;
  authorizedAt: string;
  validUntil: string;
  state: "AUTHORIZED_REMEDY";
  synthetic: true;
}

export type RemedyAuthorizationRejectCodeV1 =
  | "REMEDY_DETERMINATION_NOT_EXCEPTION"
  | "REMEDY_PROPOSAL_NOT_BOUND"
  | "REMEDY_MANUAL_REVIEW_NOT_EXECUTABLE"
  | "REMEDY_FRESH_DECISION_REQUIRED"
  | "REMEDY_WARDEN_ALLOW_REQUIRED"
  | "REMEDY_REQUEST_MISMATCH"
  | "REMEDY_ACTION_MISMATCH"
  | "REMEDY_TARGET_MISMATCH"
  | "REMEDY_CAPABILITY_MISMATCH"
  | "REMEDY_PROGRAM_MISMATCH"
  | "REMEDY_EVENT_MISMATCH"
  | "REMEDY_NEW_CORRELATION_REQUIRED"
  | "REMEDY_CORRELATION_MISMATCH"
  | "REMEDY_EFFECT_BINDING_MISMATCH"
  | "REMEDY_ACTION_TOKEN_REQUIRED"
  | "REMEDY_VALIDITY_REQUIRED"
  | "REMEDY_INVALID_TIME"
  | "REMEDY_DECISION_BEFORE_RECONCILIATION"
  | "REMEDY_AUTHORIZED_BEFORE_DECISION"
  | "REMEDY_DECISION_EXPIRED";

export type RemedyAuthorizationResultV1 =
  | { state: "AUTHORIZED"; grant: RemedyAuthorizationGrantV1 }
  | { state: "REJECTED_INPUT"; reasonCode: RemedyAuthorizationRejectCodeV1 };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function canonicalRemedyEffectBindingV1(
  determination: ReconciliationDeterminationV1,
  proposal: ReconciliationRemedyProposalV1,
): string {
  return `RECONCILIATION-REMEDY:${determination.reconciliationRef}:${proposal.proposalRef}:${proposal.kind}`;
}

export function authorizeReconciliationRemedyV1(input: {
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  authorizedAt: string;
}): RemedyAuthorizationResultV1 {
  const { determination, proposal, request, decision, authorizedAt } = input;

  if (
    determination.state !== "EXCEPTION" ||
    determination.closureEligible ||
    determination.synthetic !== true
  ) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_DETERMINATION_NOT_EXCEPTION" };
  }

  const bound = determination.candidateRemedies.find(
    (candidate) => candidate.proposalRef === proposal.proposalRef,
  );
  if (
    !bound ||
    bound.kind !== proposal.kind ||
    bound.capabilityRef !== proposal.capabilityRef ||
    bound.reasonCode !== proposal.reasonCode ||
    bound.requiresFreshWardenDecision !== true ||
    bound.authorized !== false
  ) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_PROPOSAL_NOT_BOUND" };
  }
  if (proposal.kind === "MANUAL_REVIEW") {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_MANUAL_REVIEW_NOT_EXECUTABLE" };
  }

  if (decision.decisionRef === determination.originalWardenDecisionRef) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_FRESH_DECISION_REQUIRED" };
  }
  if (decision.decision !== "ALLOW") {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_WARDEN_ALLOW_REQUIRED" };
  }
  if (decision.requestRef !== request.requestRef) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_REQUEST_MISMATCH" };
  }
  if (decision.action !== request.action) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_ACTION_MISMATCH" };
  }
  if (decision.targetRef !== request.targetRef || request.targetRef !== determination.targetRef) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_TARGET_MISMATCH" };
  }
  if (
    request.action !== proposal.capabilityRef ||
    request.capabilityRef !== proposal.capabilityRef
  ) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CAPABILITY_MISMATCH" };
  }
  if (request.programRef !== determination.programRef) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_PROGRAM_MISMATCH" };
  }
  if (request.eventRef !== determination.eventRef) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EVENT_MISMATCH" };
  }
  if (request.correlationId === determination.correlationId) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_NEW_CORRELATION_REQUIRED" };
  }
  if (decision.correlationId !== request.correlationId) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_CORRELATION_MISMATCH" };
  }

  if (request.requestedEffect !== canonicalRemedyEffectBindingV1(determination, proposal)) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EFFECT_BINDING_MISMATCH" };
  }
  if (!decision.actionToken) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_ACTION_TOKEN_REQUIRED" };
  }
  if (!decision.validUntil) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_VALIDITY_REQUIRED" };
  }

  const reconciled = parseInstant(determination.reconciledAt);
  const decided = parseInstant(decision.decidedAt);
  const authorized = parseInstant(authorizedAt);
  const validUntil = parseInstant(decision.validUntil);
  if (
    reconciled === null ||
    decided === null ||
    authorized === null ||
    validUntil === null ||
    validUntil < decided
  ) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_INVALID_TIME" };
  }
  if (decided < reconciled) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_DECISION_BEFORE_RECONCILIATION" };
  }
  if (authorized < decided) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_AUTHORIZED_BEFORE_DECISION" };
  }
  if (authorized > validUntil) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_DECISION_EXPIRED" };
  }

  const actionTokenDigest = `sha256:${digest(decision.actionToken)}`;
  const authorizationRef = `REMEDY-AUTHORIZATION:${digest(JSON.stringify({
    reconciliationRef: determination.reconciliationRef,
    proposalRef: proposal.proposalRef,
    proposalKind: proposal.kind,
    originalWardenDecisionRef: determination.originalWardenDecisionRef,
    remedyWardenDecisionRef: decision.decisionRef,
    remedyWardenRequestRef: request.requestRef,
    parentCorrelationId: determination.correlationId,
    remedyCorrelationId: request.correlationId,
    capabilityRef: proposal.capabilityRef,
    targetRef: determination.targetRef,
    actionTokenDigest,
    authorizedAt,
    validUntil: decision.validUntil,
  })).slice(0, 24)}`;

  return {
    state: "AUTHORIZED",
    grant: {
      version: "WARDEN-REMEDY-AUTH-001",
      authorizationRef,
      reconciliationRef: determination.reconciliationRef,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      parentCorrelationId: determination.correlationId,
      remedyCorrelationId: request.correlationId,
      originalWardenDecisionRef: determination.originalWardenDecisionRef,
      remedyWardenDecisionRef: decision.decisionRef,
      remedyWardenRequestRef: request.requestRef,
      capabilityRef: proposal.capabilityRef,
      targetRef: determination.targetRef,
      actionTokenDigest,
      authorizedAt,
      validUntil: decision.validUntil,
      state: "AUTHORIZED_REMEDY",
      synthetic: true,
    },
  };
}
