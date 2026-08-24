import { createHash } from "node:crypto";

import type { CausalTraceV1, EvidenceSealV1 } from "../river/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type {
  EffectVerificationSuccessV1,
  PostExecutionObservationV1,
} from "../synnergyze/effect-verification.ts";
import type { ExpectedEffectContractV1 } from "../synnergyze/effect-expectation.ts";
import {
  ReconciliationFabricV1,
  type ReconciliationResultV1,
} from "../synnergyze/reconciliation-fabric.ts";
import type {
  CapabilityEvidenceV1,
  CapabilityOutcomeV1,
  RemainingWorkProposalV1,
  WorkAssignmentV1,
  WorkUnitV1,
} from "./contracts.ts";

export type WorkCapabilityClosureStateV1 = "WORK_CLOSED" | "EXCEPTION_OPEN";
export type WorkCapabilityRemedyKindV1 = "RECOVER" | "MANUAL_REVIEW";

export interface WorkCapabilityRemedyProposalV1 {
  proposalRef: string;
  kind: WorkCapabilityRemedyKindV1;
  capabilityRef: "work_capability.recover" | "work_capability.manual_review";
  reasonCode: "remaining_work_required" | "work_effect_failed";
  workUnitRef: string;
  outcomeRef: string;
  remainingWorkProposalRef?: string;
  requiresFreshWardenDecision: true;
  authorized: false;
}

export interface WorkCapabilityClosureGuardV1 {
  version: "WORK-CAPABILITY-RECONCILIATION-GUARD-001";
  guardRef: string;
  reconciliationRef: string;
  workUnitRef: string;
  assignmentRef: string;
  outcomeRef: string;
  capabilityEvidenceRefs: readonly string[];
  state: WorkCapabilityClosureStateV1;
  candidateRemedies: readonly WorkCapabilityRemedyProposalV1[];
  closureEligible: boolean;
  evaluatedAt: string;
  sourceDigest: string;
  synthetic: true;
}

export type WorkCapabilityReconciliationResultV1 =
  | {
      state: "RECONCILED_WORK";
      reconciliation: Extract<ReconciliationResultV1, { state: "DETERMINED" }>;
      guard: WorkCapabilityClosureGuardV1;
    }
  | {
      state: "REJECTED_RECONCILIATION";
      reconciliation: Extract<ReconciliationResultV1, { state: "REJECTED_INPUT" }>;
    };

export interface WorkCapabilityReconciliationInputV1 {
  workUnit: WorkUnitV1;
  assignment: WorkAssignmentV1;
  execution: SynnergyzeExecutionReceiptV1;
  observation: PostExecutionObservationV1;
  verification: EffectVerificationSuccessV1;
  capabilityEvidence: readonly CapabilityEvidenceV1[];
  outcome: CapabilityOutcomeV1;
  remainingWork?: RemainingWorkProposalV1;
  expectation: ExpectedEffectContractV1;
  seal: EvidenceSealV1;
  causalTrace: CausalTraceV1;
  reconciledAt: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function assertLineage(input: WorkCapabilityReconciliationInputV1): void {
  const {
    workUnit,
    assignment,
    execution,
    observation,
    verification,
    outcome,
    expectation,
  } = input;

  if (assignment.workUnitRef !== workUnit.workUnitRef) {
    throw new Error("work_capability_reconciliation_assignment_work_unit_mismatch");
  }
  if (assignment.authorizationDecisionRef !== execution.wardenDecisionRef) {
    throw new Error("work_capability_reconciliation_assignment_authorization_mismatch");
  }
  if (
    execution.programRef !== workUnit.workflowRef ||
    execution.eventRef !== workUnit.workUnitRef ||
    execution.targetRef !== workUnit.targetRef ||
    execution.correlationId !== workUnit.correlationId
  ) {
    throw new Error("work_capability_reconciliation_execution_lineage_mismatch");
  }
  if (!workUnit.requiredCapabilityRefs.includes(execution.capabilityRef)) {
    throw new Error("work_capability_reconciliation_execution_capability_mismatch");
  }
  if (
    observation.executionReceiptRef !== execution.receiptRef ||
    observation.actionRef !== execution.actionRef ||
    observation.programRef !== execution.programRef ||
    observation.eventRef !== execution.eventRef ||
    observation.targetRef !== execution.targetRef ||
    observation.correlationId !== execution.correlationId
  ) {
    throw new Error("work_capability_reconciliation_observation_lineage_mismatch");
  }
  if (
    verification.effect.executionReceiptRef !== execution.receiptRef ||
    verification.effect.reservationRef !== execution.reservationRef ||
    verification.effect.wardenDecisionRef !== execution.wardenDecisionRef ||
    verification.effect.programRef !== execution.programRef ||
    verification.effect.eventRef !== execution.eventRef ||
    verification.effect.targetRef !== execution.targetRef ||
    verification.effect.correlationId !== execution.correlationId ||
    verification.effect.observedStateRef !== observation.observedStateRef
  ) {
    throw new Error("work_capability_reconciliation_effect_lineage_mismatch");
  }
  if (
    expectation.actionRef !== execution.actionRef ||
    expectation.reservationRef !== execution.reservationRef ||
    expectation.wardenDecisionRef !== execution.wardenDecisionRef ||
    expectation.programRef !== execution.programRef ||
    expectation.eventRef !== execution.eventRef ||
    expectation.capabilityRef !== execution.capabilityRef ||
    expectation.targetRef !== execution.targetRef ||
    expectation.correlationId !== execution.correlationId ||
    expectation.requestedEffect !== workUnit.requiredOutputStateRef
  ) {
    throw new Error("work_capability_reconciliation_expectation_lineage_mismatch");
  }
  if (
    outcome.workUnitRef !== workUnit.workUnitRef ||
    outcome.requiredOutputStateRef !== workUnit.requiredOutputStateRef ||
    outcome.observedStateRef !== verification.effect.observedStateRef ||
    outcome.stateMet !== (outcome.observedStateRef === outcome.requiredOutputStateRef)
  ) {
    throw new Error("work_capability_reconciliation_outcome_lineage_mismatch");
  }

  const executedAt = parseInstant(execution.executedAt, "work_capability_reconciliation_execution_time_invalid");
  const observedAt = parseInstant(observation.observedAt, "work_capability_reconciliation_observation_time_invalid");
  const verifiedAt = parseInstant(verification.effect.verifiedAt, "work_capability_reconciliation_verification_time_invalid");
  const reconciledAt = parseInstant(input.reconciledAt, "work_capability_reconciliation_time_invalid");
  if (observedAt < executedAt || verifiedAt < observedAt || reconciledAt < verifiedAt) {
    throw new Error("work_capability_reconciliation_chronology_invalid");
  }
}

function assertCapabilityEvidence(input: WorkCapabilityReconciliationInputV1): readonly string[] {
  if (input.capabilityEvidence.length === 0) {
    throw new Error("work_capability_reconciliation_capability_evidence_required");
  }
  const expectedSubjects = stableUnique([
    ...input.assignment.actorRefs,
    input.assignment.compositionRef,
  ]);
  const actualSubjects = stableUnique(input.capabilityEvidence.map((item) => item.actorOrCompositionRef));
  if (
    expectedSubjects.length !== actualSubjects.length ||
    expectedSubjects.some((subject, index) => subject !== actualSubjects[index])
  ) {
    throw new Error("work_capability_reconciliation_capability_evidence_coverage_mismatch");
  }

  for (const evidence of input.capabilityEvidence) {
    if (
      evidence.workUnitRef !== input.workUnit.workUnitRef ||
      evidence.capabilityRef !== input.execution.capabilityRef ||
      evidence.executionReceiptRef !== input.execution.receiptRef ||
      evidence.verifiedEffectRef !== input.verification.effect.effectRef ||
      evidence.observedAt !== input.observation.observedAt ||
      evidence.evidenceRefs.length === 0
    ) {
      throw new Error("work_capability_reconciliation_capability_evidence_lineage_mismatch");
    }
  }
  return stableUnique(input.capabilityEvidence.map((item) => item.capabilityEvidenceRef));
}

function assertRemainingWork(input: WorkCapabilityReconciliationInputV1): void {
  if (input.outcome.state === "PARTIAL_EFFECT") {
    if (!input.remainingWork) {
      throw new Error("work_capability_reconciliation_remaining_work_required");
    }
    const expectedRemaining = input.outcome.requiredQuantity - input.outcome.outputQuantity;
    if (
      input.remainingWork.workUnitRef !== input.workUnit.workUnitRef ||
      input.remainingWork.remainingQuantity !== expectedRemaining ||
      input.remainingWork.reasonCode !== "QUANTITY_SHORTFALL" ||
      input.remainingWork.automaticExecutionAllowed !== false ||
      expectedRemaining <= 0
    ) {
      throw new Error("work_capability_reconciliation_remaining_work_invalid");
    }
    return;
  }
  if (input.remainingWork) {
    throw new Error("work_capability_reconciliation_unexpected_remaining_work");
  }
}

function remedyFor(
  input: WorkCapabilityReconciliationInputV1,
  guardSeed: string,
): readonly WorkCapabilityRemedyProposalV1[] {
  if (input.outcome.state === "FULL_EFFECT") return [];
  if (input.outcome.state === "PARTIAL_EFFECT") {
    return [{
      proposalRef: `WORK-CAPABILITY-REMEDY:${digest(`${guardSeed}|RECOVER|${input.remainingWork?.proposalRef}`).slice(0, 24)}`,
      kind: "RECOVER",
      capabilityRef: "work_capability.recover",
      reasonCode: "remaining_work_required",
      workUnitRef: input.workUnit.workUnitRef,
      outcomeRef: input.outcome.outcomeRef,
      remainingWorkProposalRef: input.remainingWork?.proposalRef,
      requiresFreshWardenDecision: true,
      authorized: false,
    }];
  }
  return [{
    proposalRef: `WORK-CAPABILITY-REMEDY:${digest(`${guardSeed}|MANUAL_REVIEW|${input.outcome.outcomeRef}`).slice(0, 24)}`,
    kind: "MANUAL_REVIEW",
    capabilityRef: "work_capability.manual_review",
    reasonCode: "work_effect_failed",
    workUnitRef: input.workUnit.workUnitRef,
    outcomeRef: input.outcome.outcomeRef,
    requiresFreshWardenDecision: true,
    authorized: false,
  }];
}

/**
 * Adapter over the existing ReconciliationFabricV1. It does not authorize a
 * remedy and does not replace generic reconciliation. The additional guard
 * only prevents semantic-state MATCH from closing quantified Work when the
 * Work outcome is partial or failed.
 */
export class WorkCapabilityReconciliationBridgeV1 {
  constructor(private readonly fabric = new ReconciliationFabricV1()) {}

  reconcile(input: WorkCapabilityReconciliationInputV1): WorkCapabilityReconciliationResultV1 {
    assertLineage(input);
    const capabilityEvidenceRefs = assertCapabilityEvidence(input);
    assertRemainingWork(input);

    const reconciliation = this.fabric.reconcile({
      expectation: input.expectation,
      receipt: input.execution,
      observation: input.observation,
      verification: input.verification,
      seal: input.seal,
      causalTrace: input.causalTrace,
      reconciledAt: input.reconciledAt,
    });
    if (reconciliation.state === "REJECTED_INPUT") {
      return { state: "REJECTED_RECONCILIATION", reconciliation };
    }

    const semanticClosed = reconciliation.determination.closureEligible;
    const closureEligible = semanticClosed && input.outcome.state === "FULL_EFFECT";
    const state: WorkCapabilityClosureStateV1 = closureEligible ? "WORK_CLOSED" : "EXCEPTION_OPEN";
    const semantic = {
      reconciliationRef: reconciliation.determination.reconciliationRef,
      workUnitRef: input.workUnit.workUnitRef,
      assignmentRef: input.assignment.assignmentRef,
      assignmentDigest: input.assignment.assignmentDigest,
      outcomeRef: input.outcome.outcomeRef,
      outcomeState: input.outcome.state,
      capabilityEvidenceRefs,
      remainingWorkProposalRef: input.remainingWork?.proposalRef ?? null,
      semanticClosureEligible: semanticClosed,
      closureEligible,
      evaluatedAt: input.reconciledAt,
    };
    const sourceDigest = `sha256:${digest(JSON.stringify(semantic))}`;
    const guardSeed = `${reconciliation.determination.reconciliationRef}|${sourceDigest}`;
    const guard: WorkCapabilityClosureGuardV1 = {
      version: "WORK-CAPABILITY-RECONCILIATION-GUARD-001",
      guardRef: `WORK-CAPABILITY-RECONCILIATION-GUARD:${digest(guardSeed).slice(0, 24)}`,
      reconciliationRef: reconciliation.determination.reconciliationRef,
      workUnitRef: input.workUnit.workUnitRef,
      assignmentRef: input.assignment.assignmentRef,
      outcomeRef: input.outcome.outcomeRef,
      capabilityEvidenceRefs,
      state,
      candidateRemedies: remedyFor(input, guardSeed),
      closureEligible,
      evaluatedAt: input.reconciledAt,
      sourceDigest,
      synthetic: true,
    };
    return { state: "RECONCILED_WORK", reconciliation, guard };
  }
}
