import { createHash } from "node:crypto";

import type {
  CompositeEffectAssessmentV1,
  CompositeExpectedEffectContractV1,
  ExpectedEffectComponentV1,
  ScopedRemedyProposalV1,
} from "./composite-effect-reconciliation.ts";
import type { EffectMatcherV1 } from "./effect-expectation.ts";
import type { ScopedRemedyAuthorizationGrantV1 } from "./scoped-remedy-authorization.ts";
import type { ScopedRemedyExecutionReceiptV1 } from "./scoped-remedy-execution.ts";

export interface ScopedRemedyComponentObservationV1 {
  observationRef: string;
  remedyExecutionReceiptRef: string;
  assessmentRef: string;
  effectSetRef: string;
  proposalRef: string;
  componentRef: string;
  subjectRef: string;
  targetRef: string;
  remedyCorrelationId: string;
  observerRef: string;
  observedStateRef: string;
  sourceEvidenceRef: string;
  observedAt: string;
  synthetic: true;
}

export interface CompensationEffectTargetResolverV1 {
  readonly resolverRef: string;
  readonly capabilityRef: string;
  resolve(component: ExpectedEffectComponentV1): EffectMatcherV1;
}

export interface VerifiedScopedRemedyEffectV1 {
  version: "SCOPED-REMEDY-EFFECT-VERIFICATION-001";
  effectRef: string;
  verificationRef: string;
  assessmentRef: string;
  effectSetRef: string;
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
  componentRefs: readonly string[];
  observationRefs: readonly string[];
  sourceEvidenceRefs: readonly string[];
  verifiedAt: string;
  state: "VERIFIED_REMEDY_EFFECT";
  synthetic: true;
}

export type ScopedRemedyEffectVerificationReasonCodeV1 =
  | "REMEDY_EFFECT_UNEXECUTABLE_KIND"
  | "REMEDY_EFFECT_CONTRACT_NOT_BOUND"
  | "REMEDY_EFFECT_ASSESSMENT_MISMATCH"
  | "REMEDY_EFFECT_PROPOSAL_MISMATCH"
  | "REMEDY_EFFECT_AUTHORIZATION_MISMATCH"
  | "REMEDY_EFFECT_EXECUTION_MISMATCH"
  | "REMEDY_EFFECT_SCOPE_MISMATCH"
  | "REMEDY_EFFECT_TARGET_MISMATCH"
  | "REMEDY_EFFECT_CORRELATION_MISMATCH"
  | "REMEDY_EFFECT_OBSERVATION_REQUIRED"
  | "REMEDY_EFFECT_NON_SYNTHETIC_OBSERVATION"
  | "REMEDY_EFFECT_OBSERVATION_LINEAGE_MISMATCH"
  | "REMEDY_EFFECT_OBSERVATION_EVIDENCE_REQUIRED"
  | "REMEDY_EFFECT_DUPLICATE_OBSERVATION"
  | "REMEDY_EFFECT_UNEXPECTED_COMPONENT"
  | "REMEDY_EFFECT_COMPONENT_SUBJECT_MISMATCH"
  | "REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED"
  | "REMEDY_EFFECT_STATE_MISMATCH"
  | "REMEDY_EFFECT_INVALID_TIME"
  | "REMEDY_EFFECT_OBSERVATION_BEFORE_EXECUTION"
  | "REMEDY_EFFECT_VERIFICATION_BEFORE_OBSERVATION";

export type ScopedRemedyEffectVerificationResultV1 =
  | {
      state: "VERIFIED_REMEDY_EFFECT";
      effect: VerifiedScopedRemedyEffectV1;
    }
  | {
      state: "EXCEPTION";
      reasonCode: ScopedRemedyEffectVerificationReasonCodeV1;
      componentRefs: readonly string[];
    };

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

function matches(matcher: EffectMatcherV1, value: string): boolean {
  return matcher.kind === "EXACT" ? value === matcher.value : value.startsWith(matcher.value);
}

function fail(
  reasonCode: ScopedRemedyEffectVerificationReasonCodeV1,
  componentRefs: readonly string[] = [],
): ScopedRemedyEffectVerificationResultV1 {
  return { state: "EXCEPTION", reasonCode, componentRefs: stableUnique(componentRefs) };
}

function exactScope(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(stableUnique(left)) === JSON.stringify(stableUnique(right));
}

export class InventoryDeltaCompensationTargetResolverV1
  implements CompensationEffectTargetResolverV1
{
  readonly resolverRef = "INVENTORY-DELTA-COMPENSATION-TARGET-001";

  constructor(readonly capabilityRef: string) {}

  resolve(component: ExpectedEffectComponentV1): EffectMatcherV1 {
    if (component.matcher.kind !== "EXACT") {
      throw new Error("inventory_compensation_exact_delta_required");
    }
    const match = /^DELTA:([+-])(\d+(?:\.\d+)?)$/.exec(component.matcher.value);
    if (!match) throw new Error("inventory_compensation_delta_matcher_invalid");
    const inverse = match[1] === "+" ? "-" : "+";
    return { kind: "EXACT", value: `DELTA:${inverse}${match[2]}` };
  }
}

export function verifyScopedRemedyEffectV1(input: {
  contract: CompositeExpectedEffectContractV1;
  assessment: CompositeEffectAssessmentV1;
  proposal: ScopedRemedyProposalV1;
  authorization: ScopedRemedyAuthorizationGrantV1;
  receipt: ScopedRemedyExecutionReceiptV1;
  observations: readonly ScopedRemedyComponentObservationV1[];
  compensationResolvers?: readonly CompensationEffectTargetResolverV1[];
  verifiedAt: string;
}): ScopedRemedyEffectVerificationResultV1 {
  const {
    contract,
    assessment,
    proposal,
    authorization,
    receipt,
    observations,
    compensationResolvers = [],
    verifiedAt,
  } = input;

  if (proposal.kind !== "RECOVER" && proposal.kind !== "COMPENSATE") {
    return fail("REMEDY_EFFECT_UNEXECUTABLE_KIND", proposal.componentRefs);
  }
  if (contract.state !== "BOUND_PRE_EXECUTION" || contract.synthetic !== true) {
    return fail("REMEDY_EFFECT_CONTRACT_NOT_BOUND", proposal.componentRefs);
  }
  if (
    contract.effectSetRef !== assessment.effectSetRef ||
    contract.reservationRef !== assessment.reservationRef ||
    contract.wardenDecisionRef !== assessment.originalWardenDecisionRef ||
    contract.programRef !== assessment.programRef ||
    contract.eventRef !== assessment.eventRef ||
    contract.targetRef !== assessment.targetRef ||
    contract.correlationId !== assessment.correlationId
  ) {
    return fail("REMEDY_EFFECT_ASSESSMENT_MISMATCH", proposal.componentRefs);
  }
  const boundProposal = assessment.candidateRemedies.find(
    (candidate) => candidate.proposalRef === proposal.proposalRef,
  );
  if (
    !boundProposal ||
    boundProposal.kind !== proposal.kind ||
    boundProposal.capabilityRef !== proposal.capabilityRef ||
    boundProposal.effectSetRef !== proposal.effectSetRef ||
    !exactScope(boundProposal.componentRefs, proposal.componentRefs)
  ) {
    return fail("REMEDY_EFFECT_PROPOSAL_MISMATCH", proposal.componentRefs);
  }
  if (
    authorization.assessmentRef !== assessment.assessmentRef ||
    authorization.effectSetRef !== assessment.effectSetRef ||
    authorization.proposalRef !== proposal.proposalRef ||
    authorization.proposalKind !== proposal.kind ||
    authorization.capabilityRef !== proposal.capabilityRef ||
    authorization.targetRef !== assessment.targetRef ||
    authorization.parentCorrelationId !== assessment.correlationId ||
    authorization.originalWardenDecisionRef !== assessment.originalWardenDecisionRef ||
    !exactScope(authorization.componentRefs, proposal.componentRefs)
  ) {
    return fail("REMEDY_EFFECT_AUTHORIZATION_MISMATCH", proposal.componentRefs);
  }
  if (
    receipt.state !== "EXECUTED_UNVERIFIED_REMEDY" ||
    receipt.synthetic !== true ||
    receipt.authorizationRef !== authorization.authorizationRef ||
    receipt.assessmentRef !== assessment.assessmentRef ||
    receipt.effectSetRef !== assessment.effectSetRef ||
    receipt.proposalRef !== proposal.proposalRef ||
    receipt.proposalKind !== proposal.kind ||
    receipt.remedyWardenDecisionRef !== authorization.remedyWardenDecisionRef ||
    receipt.originalWardenDecisionRef !== assessment.originalWardenDecisionRef ||
    receipt.capabilityRef !== proposal.capabilityRef
  ) {
    return fail("REMEDY_EFFECT_EXECUTION_MISMATCH", proposal.componentRefs);
  }
  if (!exactScope(receipt.componentRefs, proposal.componentRefs)) {
    return fail("REMEDY_EFFECT_SCOPE_MISMATCH", proposal.componentRefs);
  }
  if (receipt.targetRef !== assessment.targetRef) {
    return fail("REMEDY_EFFECT_TARGET_MISMATCH", proposal.componentRefs);
  }
  if (
    receipt.parentCorrelationId !== assessment.correlationId ||
    receipt.remedyCorrelationId !== authorization.remedyCorrelationId
  ) {
    return fail("REMEDY_EFFECT_CORRELATION_MISMATCH", proposal.componentRefs);
  }
  if (observations.length === 0) {
    return fail("REMEDY_EFFECT_OBSERVATION_REQUIRED", proposal.componentRefs);
  }

  const executedAt = parseInstant(receipt.executedAt);
  const verifiedAtMs = parseInstant(verifiedAt);
  if (executedAt === null || verifiedAtMs === null) {
    return fail("REMEDY_EFFECT_INVALID_TIME", proposal.componentRefs);
  }

  const componentByRef = new Map(contract.components.map((component) => [component.componentRef, component]));
  const observationByComponent = new Map<string, ScopedRemedyComponentObservationV1>();
  const observationRefs: string[] = [];
  const evidenceRefs: string[] = [];

  for (const observation of observations) {
    if (observation.synthetic !== true) {
      return fail("REMEDY_EFFECT_NON_SYNTHETIC_OBSERVATION", [observation.componentRef]);
    }
    if (
      observation.remedyExecutionReceiptRef !== receipt.receiptRef ||
      observation.assessmentRef !== assessment.assessmentRef ||
      observation.effectSetRef !== assessment.effectSetRef ||
      observation.proposalRef !== proposal.proposalRef
    ) {
      return fail("REMEDY_EFFECT_OBSERVATION_LINEAGE_MISMATCH", [observation.componentRef]);
    }
    if (
      observation.targetRef !== assessment.targetRef ||
      observation.remedyCorrelationId !== authorization.remedyCorrelationId
    ) {
      return fail("REMEDY_EFFECT_OBSERVATION_LINEAGE_MISMATCH", [observation.componentRef]);
    }
    if (!observation.sourceEvidenceRef.trim()) {
      return fail("REMEDY_EFFECT_OBSERVATION_EVIDENCE_REQUIRED", [observation.componentRef]);
    }
    if (!proposal.componentRefs.includes(observation.componentRef)) {
      return fail("REMEDY_EFFECT_UNEXPECTED_COMPONENT", [observation.componentRef]);
    }
    if (observationByComponent.has(observation.componentRef)) {
      return fail("REMEDY_EFFECT_DUPLICATE_OBSERVATION", [observation.componentRef]);
    }
    const observedAt = parseInstant(observation.observedAt);
    if (observedAt === null) return fail("REMEDY_EFFECT_INVALID_TIME", [observation.componentRef]);
    if (observedAt < executedAt) {
      return fail("REMEDY_EFFECT_OBSERVATION_BEFORE_EXECUTION", [observation.componentRef]);
    }
    if (verifiedAtMs < observedAt) {
      return fail("REMEDY_EFFECT_VERIFICATION_BEFORE_OBSERVATION", [observation.componentRef]);
    }
    observationByComponent.set(observation.componentRef, observation);
    observationRefs.push(observation.observationRef);
    evidenceRefs.push(observation.sourceEvidenceRef);
  }

  const mismatched: string[] = [];
  for (const componentRef of stableUnique(proposal.componentRefs)) {
    const component = componentByRef.get(componentRef);
    const observation = observationByComponent.get(componentRef);
    if (!component || !observation) {
      mismatched.push(componentRef);
      continue;
    }
    if (observation.subjectRef !== component.subjectRef) {
      return fail("REMEDY_EFFECT_COMPONENT_SUBJECT_MISMATCH", [componentRef]);
    }

    let targetMatcher: EffectMatcherV1;
    if (proposal.kind === "RECOVER") {
      targetMatcher = component.matcher;
    } else {
      const resolver = compensationResolvers.find(
        (candidate) => candidate.capabilityRef === proposal.capabilityRef,
      );
      if (!resolver) {
        return fail("REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED", [componentRef]);
      }
      try {
        targetMatcher = resolver.resolve(component);
      } catch {
        return fail("REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED", [componentRef]);
      }
    }
    if (!matches(targetMatcher, observation.observedStateRef)) mismatched.push(componentRef);
  }

  if (mismatched.length > 0) return fail("REMEDY_EFFECT_STATE_MISMATCH", mismatched);

  const componentRefs = stableUnique(proposal.componentRefs);
  const normalizedObservationRefs = stableUnique(observationRefs);
  const sourceEvidenceRefs = stableUnique(evidenceRefs);
  const verificationRef = `REMEDY-EFFECT-VERIFICATION:${digest(
    JSON.stringify({
      assessmentRef: assessment.assessmentRef,
      effectSetRef: assessment.effectSetRef,
      proposalRef: proposal.proposalRef,
      authorizationRef: authorization.authorizationRef,
      remedyExecutionReceiptRef: receipt.receiptRef,
      componentRefs,
      observationRefs: normalizedObservationRefs,
      sourceEvidenceRefs,
      verifiedAt,
    }),
  ).slice(0, 24)}`;
  const effectRef = `VERIFIED-REMEDY-EFFECT:${digest(
    `${verificationRef}|${receipt.receiptRef}|${componentRefs.join("|")}`,
  ).slice(0, 24)}`;

  return {
    state: "VERIFIED_REMEDY_EFFECT",
    effect: {
      version: "SCOPED-REMEDY-EFFECT-VERIFICATION-001",
      effectRef,
      verificationRef,
      assessmentRef: assessment.assessmentRef,
      effectSetRef: assessment.effectSetRef,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      authorizationRef: authorization.authorizationRef,
      remedyExecutionReceiptRef: receipt.receiptRef,
      originalExecutionReceiptRef: assessment.executionReceiptRef,
      originalReservationRef: assessment.reservationRef,
      originalWardenDecisionRef: assessment.originalWardenDecisionRef,
      remedyWardenDecisionRef: authorization.remedyWardenDecisionRef,
      parentCorrelationId: assessment.correlationId,
      remedyCorrelationId: authorization.remedyCorrelationId,
      targetRef: assessment.targetRef,
      componentRefs,
      observationRefs: normalizedObservationRefs,
      sourceEvidenceRefs,
      verifiedAt,
      state: "VERIFIED_REMEDY_EFFECT",
      synthetic: true,
    },
  };
}
