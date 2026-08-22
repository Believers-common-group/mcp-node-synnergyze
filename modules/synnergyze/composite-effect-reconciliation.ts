import { createHash } from "node:crypto";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import type { EffectMatcherV1 } from "./effect-expectation.ts";
import type {
  ReconciliationClassificationV1,
  ReconciliationRemedyKindV1,
} from "./reconciliation-fabric.ts";

export type PartialFailurePolicyV1 =
  | "COMPLETE_REMAINING_IF_SAFE"
  | "ROLLBACK_REALIZED_IF_SAFE"
  | "MANUAL_ONLY";

export interface ExpectedEffectComponentV1 {
  componentRef: string;
  subjectRef: string;
  matcher: EffectMatcherV1;
  recoveryCapabilityRef?: string;
  compensationCapabilityRef?: string;
  required: true;
}

export interface CompositeExpectedEffectContractV1 {
  version: "COMPOSITE-EXPECTED-EFFECT-001";
  effectSetRef: string;
  actionRef: string;
  reservationRef: string;
  wardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  capabilityRef: string;
  targetRef: string;
  correlationId: string;
  partialFailurePolicy: PartialFailurePolicyV1;
  components: readonly ExpectedEffectComponentV1[];
  sourceDigest: string;
  compiledAt: string;
  state: "BOUND_PRE_EXECUTION";
  synthetic: true;
}

export interface CompositeEffectObservationV1 {
  observationRef: string;
  executionReceiptRef: string;
  targetRef: string;
  correlationId: string;
  componentRef: string;
  subjectRef: string;
  observedStateRef: string;
  sourceEvidenceRef: string;
  observedAt: string;
  synthetic: true;
}

export interface ScopedRemedyProposalV1 {
  proposalRef: string;
  kind: ReconciliationRemedyKindV1;
  capabilityRef: string;
  effectSetRef: string;
  componentRefs: readonly string[];
  reasonCode: string;
  requiresFreshWardenDecision: true;
  authorized: false;
}

export interface CompositeEffectAssessmentV1 {
  version: "PARTIAL-EFFECT-ASSESSMENT-001";
  assessmentRef: string;
  effectSetRef: string;
  executionReceiptRef: string;
  reservationRef: string;
  originalWardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  targetRef: string;
  correlationId: string;
  classification: ReconciliationClassificationV1;
  matchedComponentRefs: readonly string[];
  missingComponentRefs: readonly string[];
  unexpectedComponentRefs: readonly string[];
  duplicateComponentRefs: readonly string[];
  conflictingComponentRefs: readonly string[];
  sourceEvidenceRefs: readonly string[];
  candidateRemedies: readonly ScopedRemedyProposalV1[];
  assessedAt: string;
  state: "DETERMINED_UNAUTHORIZED";
  authorized: false;
  synthetic: true;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function matcherMatches(matcher: EffectMatcherV1, observedStateRef: string): boolean {
  if (matcher.kind === "EXACT") return observedStateRef === matcher.value;
  return observedStateRef.startsWith(matcher.value);
}

function assertComponent(component: ExpectedEffectComponentV1): void {
  if (!component.componentRef.trim()) throw new Error("composite_effect_component_ref_required");
  if (!component.subjectRef.trim()) throw new Error("composite_effect_subject_ref_required");
  if (!component.matcher.value.trim()) throw new Error("composite_effect_matcher_required");
  if (component.required !== true) throw new Error("composite_effect_component_must_be_required");
}

export function bindCompositeExpectedEffectV1(input: {
  action: ActionEnvelopeV1;
  reservation: EvidenceReservationV1;
  partialFailurePolicy: PartialFailurePolicyV1;
  components: readonly ExpectedEffectComponentV1[];
  compiledAt: string;
}): CompositeExpectedEffectContractV1 {
  const { action, reservation, partialFailurePolicy, compiledAt } = input;
  if (reservation.state !== "RESERVED") throw new Error("composite_effect_reservation_required");
  if (reservation.actionRef !== action.actionRef) throw new Error("composite_effect_action_mismatch");
  if (reservation.wardenDecisionRef !== action.wardenDecisionRef) {
    throw new Error("composite_effect_decision_mismatch");
  }
  if (reservation.correlationId !== action.correlationId) {
    throw new Error("composite_effect_correlation_mismatch");
  }
  if (input.components.length < 2) throw new Error("composite_effect_requires_multiple_components");

  const reservedAtMs = parseInstant(reservation.reservedAt, "composite_effect_invalid_reservation_time");
  const compiledAtMs = parseInstant(compiledAt, "composite_effect_invalid_compilation_time");
  if (compiledAtMs < reservedAtMs) throw new Error("composite_effect_before_reservation");

  for (const component of input.components) assertComponent(component);
  const componentRefs = input.components.map((component) => component.componentRef);
  if (new Set(componentRefs).size !== componentRefs.length) {
    throw new Error("composite_effect_duplicate_component_ref");
  }

  const components = [...input.components]
    .map((component) => ({ ...component, matcher: { ...component.matcher } }))
    .sort((left, right) => left.componentRef.localeCompare(right.componentRef));
  const sourceDigest = `sha256:${digest(
    JSON.stringify({
      actionRef: action.actionRef,
      reservationRef: reservation.reservationRef,
      wardenDecisionRef: action.wardenDecisionRef,
      programRef: action.programRef,
      eventRef: action.eventRef,
      capabilityRef: action.capabilityRef,
      targetRef: action.targetRef,
      correlationId: action.correlationId,
      partialFailurePolicy,
      components,
    }),
  )}`;

  return {
    version: "COMPOSITE-EXPECTED-EFFECT-001",
    effectSetRef: `EXPECTED-EFFECT-SET:${digest(`${action.actionRef}|${sourceDigest}`).slice(0, 24)}`,
    actionRef: action.actionRef,
    reservationRef: reservation.reservationRef,
    wardenDecisionRef: action.wardenDecisionRef,
    programRef: action.programRef,
    eventRef: action.eventRef,
    capabilityRef: action.capabilityRef,
    targetRef: action.targetRef,
    correlationId: action.correlationId,
    partialFailurePolicy,
    components,
    sourceDigest,
    compiledAt,
    state: "BOUND_PRE_EXECUTION",
    synthetic: true,
  };
}

function scopedProposal(input: {
  assessmentSeed: string;
  effectSetRef: string;
  kind: ReconciliationRemedyKindV1;
  capabilityRef: string;
  componentRefs: readonly string[];
  reasonCode: string;
}): ScopedRemedyProposalV1 {
  const componentRefs = stableUnique(input.componentRefs);
  const proposalRef = `REMEDY-PROPOSAL:${digest(
    JSON.stringify({
      assessmentSeed: input.assessmentSeed,
      effectSetRef: input.effectSetRef,
      kind: input.kind,
      capabilityRef: input.capabilityRef,
      componentRefs,
      reasonCode: input.reasonCode,
    }),
  ).slice(0, 24)}`;
  return {
    proposalRef,
    kind: input.kind,
    capabilityRef: input.capabilityRef,
    effectSetRef: input.effectSetRef,
    componentRefs,
    reasonCode: input.reasonCode,
    requiresFreshWardenDecision: true,
    authorized: false,
  };
}

function buildRemedies(input: {
  contract: CompositeExpectedEffectContractV1;
  classification: ReconciliationClassificationV1;
  matched: readonly string[];
  missing: readonly string[];
  unexpected: readonly string[];
  duplicates: readonly string[];
  conflicts: readonly string[];
  assessmentSeed: string;
}): readonly ScopedRemedyProposalV1[] {
  const { contract, classification, matched, missing, unexpected, duplicates, conflicts } = input;
  if (classification === "MATCH") return [];

  const unsafe = unexpected.length > 0 || duplicates.length > 0 || conflicts.length > 0;
  if (unsafe || contract.partialFailurePolicy === "MANUAL_ONLY") {
    return [
      scopedProposal({
        assessmentSeed: input.assessmentSeed,
        effectSetRef: contract.effectSetRef,
        kind: "MANUAL_REVIEW",
        capabilityRef: "reconciliation.manual_review",
        componentRefs: stableUnique([...missing, ...unexpected, ...duplicates, ...conflicts]),
        reasonCode: unsafe ? "ambiguous_or_conflicting_partial_effect" : "partial_failure_policy_manual_only",
      }),
    ];
  }

  if (contract.partialFailurePolicy === "COMPLETE_REMAINING_IF_SAFE") {
    const byCapability = new Map<string, string[]>();
    for (const componentRef of missing) {
      const component = contract.components.find((candidate) => candidate.componentRef === componentRef);
      if (!component?.recoveryCapabilityRef) {
        return [
          scopedProposal({
            assessmentSeed: input.assessmentSeed,
            effectSetRef: contract.effectSetRef,
            kind: "MANUAL_REVIEW",
            capabilityRef: "reconciliation.manual_review",
            componentRefs: missing,
            reasonCode: "missing_component_not_recoverable",
          }),
        ];
      }
      const refs = byCapability.get(component.recoveryCapabilityRef) ?? [];
      refs.push(componentRef);
      byCapability.set(component.recoveryCapabilityRef, refs);
    }
    return [...byCapability.entries()].map(([capabilityRef, componentRefs]) =>
      scopedProposal({
        assessmentSeed: input.assessmentSeed,
        effectSetRef: contract.effectSetRef,
        kind: "RECOVER",
        capabilityRef,
        componentRefs,
        reasonCode: "complete_exact_missing_components",
      }),
    );
  }

  const byCapability = new Map<string, string[]>();
  for (const componentRef of matched) {
    const component = contract.components.find((candidate) => candidate.componentRef === componentRef);
    if (!component?.compensationCapabilityRef) {
      return [
        scopedProposal({
          assessmentSeed: input.assessmentSeed,
          effectSetRef: contract.effectSetRef,
          kind: "MANUAL_REVIEW",
          capabilityRef: "reconciliation.manual_review",
          componentRefs: matched,
          reasonCode: "realized_component_not_compensatable",
        }),
      ];
    }
    const refs = byCapability.get(component.compensationCapabilityRef) ?? [];
    refs.push(componentRef);
    byCapability.set(component.compensationCapabilityRef, refs);
  }
  return [...byCapability.entries()].map(([capabilityRef, componentRefs]) =>
    scopedProposal({
      assessmentSeed: input.assessmentSeed,
      effectSetRef: contract.effectSetRef,
      kind: "COMPENSATE",
      capabilityRef,
      componentRefs,
      reasonCode: "rollback_exact_realized_components",
    }),
  );
}

export function assessCompositeEffectV1(input: {
  contract: CompositeExpectedEffectContractV1;
  receipt: SynnergyzeExecutionReceiptV1;
  observations: readonly CompositeEffectObservationV1[];
  assessedAt: string;
}): CompositeEffectAssessmentV1 {
  const { contract, receipt, observations, assessedAt } = input;
  if (contract.state !== "BOUND_PRE_EXECUTION" || contract.synthetic !== true) {
    throw new Error("partial_effect_contract_not_bound");
  }
  if (receipt.receiptRef.trim().length === 0) throw new Error("partial_effect_receipt_required");
  if (receipt.actionRef !== contract.actionRef) throw new Error("partial_effect_action_mismatch");
  if (receipt.reservationRef !== contract.reservationRef) throw new Error("partial_effect_reservation_mismatch");
  if (receipt.wardenDecisionRef !== contract.wardenDecisionRef) throw new Error("partial_effect_decision_mismatch");
  if (receipt.programRef !== contract.programRef) throw new Error("partial_effect_program_mismatch");
  if (receipt.eventRef !== contract.eventRef) throw new Error("partial_effect_event_mismatch");
  if (receipt.capabilityRef !== contract.capabilityRef) throw new Error("partial_effect_capability_mismatch");
  if (receipt.targetRef !== contract.targetRef) throw new Error("partial_effect_target_mismatch");
  if (receipt.correlationId !== contract.correlationId) throw new Error("partial_effect_correlation_mismatch");

  const compiledAtMs = parseInstant(contract.compiledAt, "partial_effect_invalid_contract_time");
  const executedAtMs = parseInstant(receipt.executedAt, "partial_effect_invalid_execution_time");
  const assessedAtMs = parseInstant(assessedAt, "partial_effect_invalid_assessment_time");
  if (compiledAtMs > executedAtMs) throw new Error("partial_effect_contract_after_execution");
  if (assessedAtMs < executedAtMs) throw new Error("partial_effect_assessment_before_execution");

  const expectedByRef = new Map(contract.components.map((component) => [component.componentRef, component]));
  const observationsByRef = new Map<string, CompositeEffectObservationV1[]>();
  const unexpected = new Set<string>();
  const evidenceRefs: string[] = [];

  for (const observation of observations) {
    if (observation.synthetic !== true) throw new Error("partial_effect_non_synthetic_observation");
    if (observation.executionReceiptRef !== receipt.receiptRef) {
      throw new Error("partial_effect_observation_execution_mismatch");
    }
    if (observation.targetRef !== contract.targetRef) throw new Error("partial_effect_observation_target_mismatch");
    if (observation.correlationId !== contract.correlationId) {
      throw new Error("partial_effect_observation_correlation_mismatch");
    }
    if (!observation.sourceEvidenceRef.trim()) throw new Error("partial_effect_observation_evidence_required");
    const observedAtMs = parseInstant(observation.observedAt, "partial_effect_invalid_observation_time");
    if (observedAtMs < executedAtMs) throw new Error("partial_effect_observation_before_execution");
    if (observedAtMs > assessedAtMs) throw new Error("partial_effect_observation_after_assessment");
    evidenceRefs.push(observation.sourceEvidenceRef);

    if (!expectedByRef.has(observation.componentRef)) unexpected.add(observation.componentRef);
    const existing = observationsByRef.get(observation.componentRef) ?? [];
    existing.push(observation);
    observationsByRef.set(observation.componentRef, existing);
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const duplicates: string[] = [];
  const conflicts: string[] = [];

  for (const component of contract.components) {
    const componentObservations = observationsByRef.get(component.componentRef) ?? [];
    if (componentObservations.length === 0) {
      missing.push(component.componentRef);
      continue;
    }

    const uniqueObservedStates = stableUnique(componentObservations.map((value) => value.observedStateRef));
    if (uniqueObservedStates.length > 1) {
      conflicts.push(component.componentRef);
      continue;
    }
    if (componentObservations.length > 1) duplicates.push(component.componentRef);

    const observation = componentObservations[0];
    if (
      observation.subjectRef !== component.subjectRef ||
      !matcherMatches(component.matcher, observation.observedStateRef)
    ) {
      conflicts.push(component.componentRef);
      continue;
    }
    matched.push(component.componentRef);
  }

  let classification: ReconciliationClassificationV1;
  if (conflicts.length > 0) classification = "CONFLICTING_EFFECT";
  else if (unexpected.size > 0) classification = "UNEXPECTED_EFFECT";
  else if (duplicates.length > 0) classification = "DUPLICATE_EFFECT";
  else if (matched.length === contract.components.length) classification = "MATCH";
  else if (matched.length === 0) classification = "MISSING_EFFECT";
  else classification = "PARTIAL_EFFECT";

  const normalized = {
    matched: stableUnique(matched),
    missing: stableUnique(missing),
    unexpected: stableUnique([...unexpected]),
    duplicates: stableUnique(duplicates),
    conflicts: stableUnique(conflicts),
    evidenceRefs: stableUnique(evidenceRefs),
  };
  const assessmentSeed = `sha256:${digest(
    JSON.stringify({
      effectSetRef: contract.effectSetRef,
      executionReceiptRef: receipt.receiptRef,
      classification,
      ...normalized,
    }),
  )}`;
  const candidateRemedies = buildRemedies({
    contract,
    classification,
    matched: normalized.matched,
    missing: normalized.missing,
    unexpected: normalized.unexpected,
    duplicates: normalized.duplicates,
    conflicts: normalized.conflicts,
    assessmentSeed,
  });

  return {
    version: "PARTIAL-EFFECT-ASSESSMENT-001",
    assessmentRef: `PARTIAL-EFFECT-ASSESSMENT:${digest(assessmentSeed).slice(0, 24)}`,
    effectSetRef: contract.effectSetRef,
    executionReceiptRef: receipt.receiptRef,
    reservationRef: receipt.reservationRef,
    originalWardenDecisionRef: receipt.wardenDecisionRef,
    programRef: receipt.programRef,
    eventRef: receipt.eventRef,
    targetRef: receipt.targetRef,
    correlationId: receipt.correlationId,
    classification,
    matchedComponentRefs: normalized.matched,
    missingComponentRefs: normalized.missing,
    unexpectedComponentRefs: normalized.unexpected,
    duplicateComponentRefs: normalized.duplicates,
    conflictingComponentRefs: normalized.conflicts,
    sourceEvidenceRefs: normalized.evidenceRefs,
    candidateRemedies,
    assessedAt,
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
  };
}
