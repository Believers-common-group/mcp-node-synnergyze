import { sha256CanonicalV1 } from "../legislative-intelligence/canonical.ts";
import type { PestelReviewWorkCandidateV1 } from "../synnergyze/pestel-work-bridge.ts";
import type { SynnergyzeEventDraftV1, SynnergyzeProgramDraftV1 } from "../synnergyze/contracts.ts";
import {
  buildWardenDecisionRequestV1,
  type ResolvedRepresentationContextV1,
  type WardenRequestBridgeResultV1,
} from "../synnergyze/warden-request-bridge.ts";

export interface PestelConsequentialActionProposalV1 {
  proposalRef: string;
  action: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect: string;
  evidenceRefs: readonly string[];
}

export interface BuildPestelConsequentialWardenRequestInputV1 {
  workCandidate: PestelReviewWorkCandidateV1;
  proposal: PestelConsequentialActionProposalV1;
  representation: ResolvedRepresentationContextV1;
  requestedAt: string;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function buildPestelConsequentialWardenRequestV1(
  input: BuildPestelConsequentialWardenRequestInputV1,
): WardenRequestBridgeResultV1 {
  const { workCandidate, proposal, representation, requestedAt } = input;
  if (workCandidate.state !== "REVIEW_CANDIDATE" || workCandidate.authorized !== false) {
    throw new Error("pestel_work_candidate_not_reviewable");
  }
  if (!proposal.action || !proposal.capabilityRef || !proposal.targetRef || !proposal.requestedEffect) {
    throw new Error("pestel_consequential_proposal_incomplete");
  }

  const correlationId = workCandidate.correlationId;
  const dependencyRefs = uniqueSorted([
    ...workCandidate.evidenceRefs,
    ...proposal.evidenceRefs,
  ]);
  const programIdentity = {
    sourcePlanRef: workCandidate.workRef,
    sourceIntentRef: proposal.proposalRef,
    sourceExpressionRef: workCandidate.briefRef,
    actorRef: representation.actorRef,
    contextRef: representation.contextRef,
    action: proposal.action,
    capabilityRef: proposal.capabilityRef,
    targetRef: proposal.targetRef,
    requestedEffect: proposal.requestedEffect,
    correlationId,
  };
  const programRef = `SYNNERGYZE-PROGRAM:${sha256CanonicalV1(programIdentity)}`;
  const eventRef = `SYNNERGYZE-EVENT:${sha256CanonicalV1({
    programRef,
    sourceIntentRef: proposal.proposalRef,
    action: proposal.action,
    capabilityRef: proposal.capabilityRef,
    targetRef: proposal.targetRef,
    correlationId,
  })}`;

  const event: SynnergyzeEventDraftV1 = {
    eventRef,
    programRef,
    sourcePlanRef: workCandidate.workRef,
    sourceIntentRef: proposal.proposalRef,
    sourceStepRef: proposal.proposalRef,
    sequence: 1,
    actorRef: representation.actorRef,
    contextRef: representation.contextRef,
    targetRef: proposal.targetRef,
    action: proposal.action,
    capabilityRef: proposal.capabilityRef,
    requestedEffect: proposal.requestedEffect,
    dependencyRefs,
    requirementRefs: [],
    state: "DRAFT",
    authorized: false,
    correlationId,
  };

  const programMaterial = {
    programRef,
    sourcePlanRef: workCandidate.workRef,
    sourceIntentRef: proposal.proposalRef,
    sourceExpressionRef: workCandidate.briefRef,
    actorRef: representation.actorRef,
    contextRef: representation.contextRef,
    requestedEffect: proposal.requestedEffect,
    capabilityRef: proposal.capabilityRef,
    state: "READY_FOR_AUTHORIZATION" as const,
    authorized: false as const,
    eventRefs: [eventRef],
    dependencyRefs,
    constraintRefs: [],
    requirementRefs: [],
    correlationId,
    compiledAt: requestedAt,
  };
  const program: SynnergyzeProgramDraftV1 = {
    ...programMaterial,
    compilationDigest: sha256CanonicalV1(programMaterial),
  };

  return buildWardenDecisionRequestV1({ program, event, representation, requestedAt });
}
