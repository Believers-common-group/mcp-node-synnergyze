import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type { RemedyAuthorizationGrantV1 } from "./remedy-authorization.ts";
import type {
  CompositeEffectAssessmentV1,
  ScopedRemedyProposalV1,
} from "./composite-effect-reconciliation.ts";

export interface ScopedRemedyAuthorizationGrantV1 extends RemedyAuthorizationGrantV1 {
  version: "WARDEN-REMEDY-AUTH-001";
  assessmentRef: string;
  effectSetRef: string;
  componentRefs: readonly string[];
}

export type ScopedRemedyAuthorizationRejectCodeV1 =
  | "SCOPED_REMEDY_ASSESSMENT_NOT_UNAUTHORIZED"
  | "SCOPED_REMEDY_PROPOSAL_NOT_BOUND"
  | "SCOPED_REMEDY_FRESH_DECISION_REQUIRED"
  | "SCOPED_REMEDY_WARDEN_ALLOW_REQUIRED"
  | "SCOPED_REMEDY_REQUEST_MISMATCH"
  | "SCOPED_REMEDY_ACTION_MISMATCH"
  | "SCOPED_REMEDY_TARGET_MISMATCH"
  | "SCOPED_REMEDY_CAPABILITY_MISMATCH"
  | "SCOPED_REMEDY_PROGRAM_MISMATCH"
  | "SCOPED_REMEDY_EVENT_MISMATCH"
  | "SCOPED_REMEDY_NEW_CORRELATION_REQUIRED"
  | "SCOPED_REMEDY_CORRELATION_MISMATCH"
  | "SCOPED_REMEDY_EFFECT_BINDING_MISMATCH"
  | "SCOPED_REMEDY_ACTION_TOKEN_REQUIRED"
  | "SCOPED_REMEDY_VALIDITY_REQUIRED"
  | "SCOPED_REMEDY_INVALID_TIME"
  | "SCOPED_REMEDY_AUTHORIZED_BEFORE_DECISION"
  | "SCOPED_REMEDY_DECISION_EXPIRED";

export type ScopedRemedyAuthorizationResultV1 =
  | { state: "AUTHORIZED"; grant: ScopedRemedyAuthorizationGrantV1 }
  | { state: "REJECTED_INPUT"; reasonCode: ScopedRemedyAuthorizationRejectCodeV1 };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function canonicalScopedRemedyEffectBindingV1(
  assessment: CompositeEffectAssessmentV1,
  proposal: ScopedRemedyProposalV1,
): string {
  const componentRefs = stableUnique(proposal.componentRefs).join(",");
  return `PARTIAL-EFFECT-REMEDY:${assessment.assessmentRef}:${proposal.effectSetRef}:${proposal.proposalRef}:${componentRefs}`;
}

export function authorizeScopedRemedyV1(input: {
  assessment: CompositeEffectAssessmentV1;
  proposal: ScopedRemedyProposalV1;
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  authorizedAt: string;
}): ScopedRemedyAuthorizationResultV1 {
  const { assessment, proposal, request, decision, authorizedAt } = input;

  if (assessment.state !== "DETERMINED_UNAUTHORIZED" || assessment.authorized !== false) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_ASSESSMENT_NOT_UNAUTHORIZED" };
  }

  const boundProposal = assessment.candidateRemedies.find(
    (candidate) => candidate.proposalRef === proposal.proposalRef,
  );
  const proposalComponents = stableUnique(proposal.componentRefs);
  if (
    !boundProposal ||
    boundProposal.kind !== proposal.kind ||
    boundProposal.capabilityRef !== proposal.capabilityRef ||
    boundProposal.effectSetRef !== proposal.effectSetRef ||
    boundProposal.reasonCode !== proposal.reasonCode ||
    JSON.stringify(stableUnique(boundProposal.componentRefs)) !== JSON.stringify(proposalComponents) ||
    boundProposal.requiresFreshWardenDecision !== true ||
    boundProposal.authorized !== false ||
    proposal.effectSetRef !== assessment.effectSetRef
  ) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_PROPOSAL_NOT_BOUND" };
  }

  if (decision.decisionRef === assessment.originalWardenDecisionRef) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_FRESH_DECISION_REQUIRED" };
  }
  if (decision.decision !== "ALLOW") {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_WARDEN_ALLOW_REQUIRED" };
  }
  if (decision.requestRef !== request.requestRef) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_REQUEST_MISMATCH" };
  }
  if (decision.action !== request.action) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_ACTION_MISMATCH" };
  }
  if (decision.targetRef !== request.targetRef || request.targetRef !== assessment.targetRef) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_TARGET_MISMATCH" };
  }
  if (request.capabilityRef !== proposal.capabilityRef) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_CAPABILITY_MISMATCH" };
  }
  if (request.programRef !== assessment.programRef) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_PROGRAM_MISMATCH" };
  }
  if (request.eventRef !== assessment.eventRef) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_EVENT_MISMATCH" };
  }
  if (request.correlationId === assessment.correlationId) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_NEW_CORRELATION_REQUIRED" };
  }
  if (decision.correlationId !== request.correlationId) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_CORRELATION_MISMATCH" };
  }

  const expectedBinding = canonicalScopedRemedyEffectBindingV1(assessment, proposal);
  if (request.requestedEffect !== expectedBinding) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_EFFECT_BINDING_MISMATCH" };
  }
  if (!decision.actionToken) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_ACTION_TOKEN_REQUIRED" };
  }
  if (!decision.validUntil) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_VALIDITY_REQUIRED" };
  }

  const decided = parseInstant(decision.decidedAt);
  const authorized = parseInstant(authorizedAt);
  const validUntil = parseInstant(decision.validUntil);
  if (decided === null || authorized === null || validUntil === null || validUntil < decided) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_INVALID_TIME" };
  }
  if (authorized < decided) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_AUTHORIZED_BEFORE_DECISION" };
  }
  if (authorized > validUntil) {
    return { state: "REJECTED_INPUT", reasonCode: "SCOPED_REMEDY_DECISION_EXPIRED" };
  }

  const actionTokenDigest = `sha256:${digest(decision.actionToken)}`;
  const authorizationRef = `REMEDY-AUTHORIZATION:${digest(
    JSON.stringify({
      assessmentRef: assessment.assessmentRef,
      effectSetRef: assessment.effectSetRef,
      proposalRef: proposal.proposalRef,
      componentRefs: proposalComponents,
      originalWardenDecisionRef: assessment.originalWardenDecisionRef,
      remedyWardenDecisionRef: decision.decisionRef,
      remedyWardenRequestRef: request.requestRef,
      parentCorrelationId: assessment.correlationId,
      remedyCorrelationId: request.correlationId,
      capabilityRef: proposal.capabilityRef,
      targetRef: assessment.targetRef,
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
      reconciliationRef: assessment.assessmentRef,
      assessmentRef: assessment.assessmentRef,
      effectSetRef: assessment.effectSetRef,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      componentRefs: proposalComponents,
      parentCorrelationId: assessment.correlationId,
      remedyCorrelationId: request.correlationId,
      originalWardenDecisionRef: assessment.originalWardenDecisionRef,
      remedyWardenDecisionRef: decision.decisionRef,
      remedyWardenRequestRef: request.requestRef,
      capabilityRef: proposal.capabilityRef,
      targetRef: assessment.targetRef,
      actionTokenDigest,
      authorizedAt,
      validUntil: decision.validUntil,
      state: "AUTHORIZED_REMEDY",
      synthetic: true,
    },
  };
}
