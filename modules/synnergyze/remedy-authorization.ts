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
  proposalKind: ReconciliationRemedyProposalV1["kind"];
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
  | "REMEDY_DETERMINATION_NOT_UNAUTHORIZED"
  | "REMEDY_PROPOSAL_NOT_BOUND"
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
  | "REMEDY_AUTHORIZED_BEFORE_DECISION"
  | "REMEDY_DECISION_EXPIRED";

export interface RemedyAuthorizationSuccessV1 {
  state: "AUTHORIZED";
  grant: RemedyAuthorizationGrantV1;
}

export interface RemedyAuthorizationRejectedV1 {
  state: "REJECTED_INPUT";
  reasonCode: RemedyAuthorizationRejectCodeV1;
}

export type RemedyAuthorizationResultV1 =
  | RemedyAuthorizationSuccessV1
  | RemedyAuthorizationRejectedV1;

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
  return `RECONCILIATION-REMEDY:${determination.reconciliationRef}:${proposal.proposalRef}`;
}

export function authorizeReconciliationRemedyV1(input: {
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  authorizedAt: string;
}): RemedyAuthorizationResultV1 {
  const { determination, proposal, request, decision, authorizedAt } = input;

  if (determination.state !== "DETERMINED_UNAUTHORIZED" || determination.authorized !== false) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_DETERMINATION_NOT_UNAUTHORIZED" };
  }

  const boundProposal = determination.candidateRemedies.find(
    (candidate) => candidate.proposalRef === proposal.proposalRef,
  );
  if (
    !boundProposal ||
    boundProposal.kind !== proposal.kind ||
    boundProposal.capabilityRef !== proposal.capabilityRef ||
    boundProposal.reasonCode !== proposal.reasonCode ||
    boundProposal.requiresFreshWardenDecision !== true ||
    boundProposal.authorized !== false
  ) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_PROPOSAL_NOT_BOUND" };
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
  if (request.capabilityRef !== proposal.capabilityRef) {
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

  const expectedEffectBinding = canonicalRemedyEffectBindingV1(determination, proposal);
  if (request.requestedEffect !== expectedEffectBinding) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EFFECT_BINDING_MISMATCH" };
  }
  if (!decision.actionToken) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_ACTION_TOKEN_REQUIRED" };
  }
  if (!decision.validUntil) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_VALIDITY_REQUIRED" };
  }

  const decided = parseInstant(decision.decidedAt);
  const authorized = parseInstant(authorizedAt);
  const validUntil = parseInstant(decision.validUntil);
  if (decided === null || authorized === null || validUntil === null || validUntil < decided) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_INVALID_TIME" };
  }
  if (authorized < decided) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_AUTHORIZED_BEFORE_DECISION" };
  }
  if (authorized > validUntil) {
    return { state: "REJECTED_INPUT", reasonCode: "REMEDY_DECISION_EXPIRED" };
  }

  const actionTokenDigest = `sha256:${digest(decision.actionToken)}`;
  const authorizationRef = `REMEDY-AUTHORIZATION:${digest(
    JSON.stringify({
      reconciliationRef: determination.reconciliationRef,
      proposalRef: proposal.proposalRef,
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
    }),
  ).slice(0, 24)}`;

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
