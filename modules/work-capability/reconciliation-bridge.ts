import { createHash } from "node:crypto";

import type { CausalTraceV1, EvidenceSealV1 } from "../river/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import {
  validateExpectedEffectContractV1,
  type ExpectedEffectContractV1,
} from "../synnergyze/effect-expectation.ts";
import type {
  EffectVerificationResultV1,
  PostExecutionObservationV1,
  VerifiedEffectV1,
} from "../synnergyze/effect-verification.ts";
import {
  ReconciliationFabricV1,
  type ReconciliationClassificationV1,
} from "../synnergyze/reconciliation-fabric.ts";
import type {
  CapabilityOutcomeV1,
  RemainingWorkProposalV1,
  WorkAssignmentV1,
  WorkUnitV1,
} from "./contracts.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface WorkReconciliationExpectationV1 {
  version: "WORK-RECONCILIATION-EXPECTATION-001";
  workExpectationRef: string;
  workUnitRef: string;
  objectiveRef: string;
  workflowRef: string;
  expectedEffectRef: string;
  expectedEffectContractRef: string;
  requiredQuantity: number;
  requiredFirstPassQuality: number;
  compiledAt: string;
  sourceDigest: string;
  state: "BOUND_PRE_EXECUTION";
  synthetic: true;
}

export interface WorkCapabilityReconciliationDeterminationV1 {
  version: "WORK-CAPABILITY-RECONCILIATION-BRIDGE-001";
  workReconciliationRef: string;
  workUnitRef: string;
  assignmentRef: string;
  executionReceiptRef: string;
  reconciliationRef: string;
  genericClassification: ReconciliationClassificationV1;
  workOutcomeRef: string;
  state: "CLOSED" | "EXCEPTION";
  classification:
    | "FULL_EFFECT"
    | "PARTIAL_EFFECT"
    | "FAILED_EFFECT"
    | "GENERIC_RECONCILIATION_EXCEPTION";
  remainingWorkProposalRef?: string;
  recoveryAuthorizationRequired: boolean;
  closedAt?: string;
  determinedAt: string;
  sourceDigest: string;
  synthetic: true;
}

export interface WorkRecoveryRequestV1 {
  recoveryRequestRef: string;
  parentWorkUnitRef: string;
  parentReconciliationRef: string;
  remainingWorkProposalRef: string;
  remainingQuantity: number;
  requiredCapabilityRefs: readonly string[];
  targetRef: string;
  requestedEffect: string;
  reasonCode: "PARTIAL_EFFECT_REMAINING_WORK";
  requiresFreshWardenDecision: true;
  authorized: false;
  synthetic: true;
}

export type WorkCapabilityReconciliationResultV1 =
  | {
      state: "DETERMINED";
      determination: WorkCapabilityReconciliationDeterminationV1;
      recoveryRequest?: WorkRecoveryRequestV1;
      idempotentReplay: boolean;
    }
  | {
      state: "REJECTED_INPUT";
      reasonCode: string;
    };

function workExpectationSourceMaterial(input: {
  workUnitRef: string;
  objectiveRef: string;
  workflowRef: string;
  expectedEffectRef: string;
  expectedEffectContractRef: string;
  requiredQuantity: number;
  requiredFirstPassQuality: number;
  compiledAt: string;
}): string {
  return JSON.stringify(input);
}

function workExpectationSourceDigest(input: {
  workUnitRef: string;
  objectiveRef: string;
  workflowRef: string;
  expectedEffectRef: string;
  expectedEffectContractRef: string;
  requiredQuantity: number;
  requiredFirstPassQuality: number;
  compiledAt: string;
}): string {
  return `sha256:${digest(workExpectationSourceMaterial(input))}`;
}

function workExpectationRef(workUnitRef: string, sourceDigest: string): string {
  return `WORK-RECONCILIATION-EXPECTATION:${digest(`${workUnitRef}|${sourceDigest}`).slice(0, 24)}`;
}

export function compileWorkReconciliationExpectationV1(input: {
  workUnit: WorkUnitV1;
  expectedEffectContract: ExpectedEffectContractV1;
  requiredQuantity: number;
  compiledAt: string;
}): WorkReconciliationExpectationV1 {
  const { workUnit, expectedEffectContract, requiredQuantity, compiledAt } = input;
  if (!Number.isInteger(requiredQuantity) || requiredQuantity <= 0) {
    throw new Error("work_reconciliation_required_quantity_invalid");
  }
  if (!Number.isFinite(Date.parse(compiledAt))) {
    throw new Error("work_reconciliation_expectation_invalid_time");
  }
  if (!validateExpectedEffectContractV1(expectedEffectContract)) {
    throw new Error("work_reconciliation_expected_effect_integrity_invalid");
  }
  if (expectedEffectContract.eventRef !== workUnit.workUnitRef) {
    throw new Error("work_reconciliation_expectation_work_unit_mismatch");
  }
  if (expectedEffectContract.programRef !== workUnit.workflowRef) {
    throw new Error("work_reconciliation_expectation_workflow_mismatch");
  }
  if (expectedEffectContract.targetRef !== workUnit.targetRef) {
    throw new Error("work_reconciliation_expectation_target_mismatch");
  }
  if (!workUnit.requiredCapabilityRefs.includes(expectedEffectContract.capabilityRef)) {
    throw new Error("work_reconciliation_expectation_capability_mismatch");
  }
  if (expectedEffectContract.requestedEffect !== workUnit.requiredOutputStateRef) {
    throw new Error("work_reconciliation_expectation_effect_mismatch");
  }

  const requiredFirstPassQuality = workUnit.qualityThresholds.firstPassQuality ?? 0;
  const material = {
    workUnitRef: workUnit.workUnitRef,
    objectiveRef: workUnit.objectiveRef,
    workflowRef: workUnit.workflowRef,
    expectedEffectRef: workUnit.requiredOutputStateRef,
    expectedEffectContractRef: expectedEffectContract.expectationRef,
    requiredQuantity,
    requiredFirstPassQuality,
    compiledAt,
  };
  const sourceDigest = workExpectationSourceDigest(material);
  return {
    version: "WORK-RECONCILIATION-EXPECTATION-001",
    workExpectationRef: workExpectationRef(workUnit.workUnitRef, sourceDigest),
    ...material,
    sourceDigest,
    state: "BOUND_PRE_EXECUTION",
    synthetic: true,
  };
}

export function validateWorkReconciliationExpectationV1(
  expectation: WorkReconciliationExpectationV1,
): boolean {
  if (
    expectation.version !== "WORK-RECONCILIATION-EXPECTATION-001" ||
    expectation.state !== "BOUND_PRE_EXECUTION" ||
    expectation.synthetic !== true ||
    !expectation.workUnitRef.trim() ||
    !expectation.objectiveRef.trim() ||
    !expectation.workflowRef.trim() ||
    !expectation.expectedEffectRef.trim() ||
    !expectation.expectedEffectContractRef.trim() ||
    !Number.isInteger(expectation.requiredQuantity) ||
    expectation.requiredQuantity <= 0 ||
    !Number.isFinite(expectation.requiredFirstPassQuality) ||
    expectation.requiredFirstPassQuality < 0 ||
    expectation.requiredFirstPassQuality > 1 ||
    !Number.isFinite(Date.parse(expectation.compiledAt))
  ) {
    return false;
  }

  const sourceDigest = workExpectationSourceDigest({
    workUnitRef: expectation.workUnitRef,
    objectiveRef: expectation.objectiveRef,
    workflowRef: expectation.workflowRef,
    expectedEffectRef: expectation.expectedEffectRef,
    expectedEffectContractRef: expectation.expectedEffectContractRef,
    requiredQuantity: expectation.requiredQuantity,
    requiredFirstPassQuality: expectation.requiredFirstPassQuality,
    compiledAt: expectation.compiledAt,
  });
  return (
    expectation.sourceDigest === sourceDigest &&
    expectation.workExpectationRef === workExpectationRef(expectation.workUnitRef, sourceDigest)
  );
}

function workDetermination(input: {
  workUnit: WorkUnitV1;
  assignment: WorkAssignmentV1;
  execution: SynnergyzeExecutionReceiptV1;
  reconciliationRef: string;
  genericClassification: ReconciliationClassificationV1;
  outcome: CapabilityOutcomeV1;
  state: "CLOSED" | "EXCEPTION";
  classification: WorkCapabilityReconciliationDeterminationV1["classification"];
  remainingWorkProposalRef?: string;
  recoveryAuthorizationRequired: boolean;
  determinedAt: string;
}): WorkCapabilityReconciliationDeterminationV1 {
  const material = {
    workUnitRef: input.workUnit.workUnitRef,
    assignmentRef: input.assignment.assignmentRef,
    executionReceiptRef: input.execution.receiptRef,
    reconciliationRef: input.reconciliationRef,
    genericClassification: input.genericClassification,
    workOutcomeRef: input.outcome.outcomeRef,
    state: input.state,
    classification: input.classification,
    remainingWorkProposalRef: input.remainingWorkProposalRef ?? null,
    recoveryAuthorizationRequired: input.recoveryAuthorizationRequired,
    closedAt: input.state === "CLOSED" ? input.determinedAt : null,
    determinedAt: input.determinedAt,
  };
  const sourceDigest = `sha256:${digest(JSON.stringify(material))}`;
  return {
    version: "WORK-CAPABILITY-RECONCILIATION-BRIDGE-001",
    workReconciliationRef: `WORK-CAPABILITY-RECONCILIATION:${digest(
      `${input.reconciliationRef}|${input.outcome.outcomeRef}|${sourceDigest}`,
    ).slice(0, 24)}`,
    workUnitRef: material.workUnitRef,
    assignmentRef: material.assignmentRef,
    executionReceiptRef: material.executionReceiptRef,
    reconciliationRef: material.reconciliationRef,
    genericClassification: material.genericClassification,
    workOutcomeRef: material.workOutcomeRef,
    state: material.state,
    classification: material.classification,
    remainingWorkProposalRef: input.remainingWorkProposalRef,
    recoveryAuthorizationRequired: material.recoveryAuthorizationRequired,
    closedAt: input.state === "CLOSED" ? input.determinedAt : undefined,
    determinedAt: material.determinedAt,
    sourceDigest,
    synthetic: true,
  };
}

export class WorkCapabilityReconciliationBridgeV1 {
  constructor(private readonly reconciliation: ReconciliationFabricV1) {}

  reconcile(input: {
    workExpectation: WorkReconciliationExpectationV1;
    expectedEffectContract: ExpectedEffectContractV1;
    workUnit: WorkUnitV1;
    assignment: WorkAssignmentV1;
    execution: SynnergyzeExecutionReceiptV1;
    observation: PostExecutionObservationV1;
    verification: EffectVerificationResultV1;
    seal?: EvidenceSealV1;
    causalTrace?: CausalTraceV1;
    outcome: CapabilityOutcomeV1;
    remainingWork?: RemainingWorkProposalV1;
    determinedAt: string;
  }): WorkCapabilityReconciliationResultV1 {
    const {
      workExpectation,
      expectedEffectContract,
      workUnit,
      assignment,
      execution,
      observation,
      verification,
      seal,
      causalTrace,
      outcome,
      remainingWork,
      determinedAt,
    } = input;

    if (!validateWorkReconciliationExpectationV1(workExpectation)) {
      return {
        state: "REJECTED_INPUT",
        reasonCode: "work_reconciliation_expectation_integrity_invalid",
      };
    }
    if (workExpectation.expectedEffectContractRef !== expectedEffectContract.expectationRef) {
      return {
        state: "REJECTED_INPUT",
        reasonCode: "work_reconciliation_expected_effect_mismatch",
      };
    }
    if (
      workExpectation.workUnitRef !== workUnit.workUnitRef ||
      workExpectation.objectiveRef !== workUnit.objectiveRef ||
      workExpectation.workflowRef !== workUnit.workflowRef ||
      workExpectation.expectedEffectRef !== workUnit.requiredOutputStateRef ||
      workExpectation.requiredFirstPassQuality !== (workUnit.qualityThresholds.firstPassQuality ?? 0)
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_work_unit_mismatch" };
    }
    if (assignment.workUnitRef !== workUnit.workUnitRef) {
      return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_assignment_mismatch" };
    }
    if (
      execution.eventRef !== workUnit.workUnitRef ||
      execution.programRef !== workUnit.workflowRef ||
      execution.targetRef !== workUnit.targetRef ||
      execution.correlationId !== workUnit.correlationId
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_execution_mismatch" };
    }
    if (
      outcome.workUnitRef !== workUnit.workUnitRef ||
      outcome.requiredQuantity !== workExpectation.requiredQuantity ||
      outcome.requiredFirstPassQuality !== workExpectation.requiredFirstPassQuality
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "work_reconciliation_outcome_mismatch" };
    }
    const compiledAt = Date.parse(workExpectation.compiledAt);
    const executedAt = Date.parse(execution.executedAt);
    if (Number.isFinite(compiledAt) && Number.isFinite(executedAt) && compiledAt > executedAt) {
      return {
        state: "REJECTED_INPUT",
        reasonCode: "work_reconciliation_expectation_after_execution",
      };
    }

    const generic = this.reconciliation.reconcile({
      expectation: expectedEffectContract,
      receipt: execution,
      observation,
      verification,
      seal,
      causalTrace,
      reconciledAt: determinedAt,
    });
    if (generic.state === "REJECTED_INPUT") {
      return {
        state: "REJECTED_INPUT",
        reasonCode: `generic_reconciliation:${generic.reasonCode}`,
      };
    }

    if (generic.determination.state === "EXCEPTION") {
      const determination = workDetermination({
        workUnit,
        assignment,
        execution,
        reconciliationRef: generic.determination.reconciliationRef,
        genericClassification: generic.determination.classification,
        outcome,
        state: "EXCEPTION",
        classification: "GENERIC_RECONCILIATION_EXCEPTION",
        recoveryAuthorizationRequired: true,
        determinedAt,
      });
      return { state: "DETERMINED", determination, idempotentReplay: false };
    }

    if (outcome.state === "FULL_EFFECT") {
      const determination = workDetermination({
        workUnit,
        assignment,
        execution,
        reconciliationRef: generic.determination.reconciliationRef,
        genericClassification: generic.determination.classification,
        outcome,
        state: "CLOSED",
        classification: "FULL_EFFECT",
        recoveryAuthorizationRequired: false,
        determinedAt,
      });
      return { state: "DETERMINED", determination, idempotentReplay: false };
    }

    if (outcome.state === "FAILED_EFFECT") {
      const determination = workDetermination({
        workUnit,
        assignment,
        execution,
        reconciliationRef: generic.determination.reconciliationRef,
        genericClassification: generic.determination.classification,
        outcome,
        state: "EXCEPTION",
        classification: "FAILED_EFFECT",
        recoveryAuthorizationRequired: true,
        determinedAt,
      });
      return { state: "DETERMINED", determination, idempotentReplay: false };
    }

    if (!remainingWork) {
      return {
        state: "REJECTED_INPUT",
        reasonCode: "work_reconciliation_remaining_work_required",
      };
    }
    const expectedRemaining = outcome.requiredQuantity - outcome.outputQuantity;
    if (
      remainingWork.workUnitRef !== workUnit.workUnitRef ||
      remainingWork.remainingQuantity !== expectedRemaining ||
      remainingWork.automaticExecutionAllowed !== false
    ) {
      return {
        state: "REJECTED_INPUT",
        reasonCode: "work_reconciliation_remaining_work_invalid",
      };
    }

    const determination = workDetermination({
      workUnit,
      assignment,
      execution,
      reconciliationRef: generic.determination.reconciliationRef,
      genericClassification: generic.determination.classification,
      outcome,
      state: "EXCEPTION",
      classification: "PARTIAL_EFFECT",
      remainingWorkProposalRef: remainingWork.proposalRef,
      recoveryAuthorizationRequired: true,
      determinedAt,
    });
    const recoveryRequest: WorkRecoveryRequestV1 = {
      recoveryRequestRef: `WORK-RECOVERY-REQUEST:${digest(
        `${workUnit.workUnitRef}|${generic.determination.reconciliationRef}|${remainingWork.proposalRef}|${remainingWork.remainingQuantity}`,
      ).slice(0, 24)}`,
      parentWorkUnitRef: workUnit.workUnitRef,
      parentReconciliationRef: generic.determination.reconciliationRef,
      remainingWorkProposalRef: remainingWork.proposalRef,
      remainingQuantity: remainingWork.remainingQuantity,
      requiredCapabilityRefs: [...workUnit.requiredCapabilityRefs],
      targetRef: workUnit.targetRef,
      requestedEffect: workUnit.requiredOutputStateRef,
      reasonCode: "PARTIAL_EFFECT_REMAINING_WORK",
      requiresFreshWardenDecision: true,
      authorized: false,
      synthetic: true,
    };
    return {
      state: "DETERMINED",
      determination,
      recoveryRequest,
      idempotentReplay: false,
    };
  }
}

interface StoredEvidenceFinalizationV1 {
  fingerprint: string;
  seal: EvidenceSealV1;
  causalTrace: CausalTraceV1;
}

export class SyntheticWorkCapabilityEvidenceFinalizerV1 {
  private readonly byEffectRef = new Map<string, StoredEvidenceFinalizationV1>();

  finalize(input: {
    reservationRef: string;
    correlationId: string;
    effect: VerifiedEffectV1;
    sealedAt: string;
  }): {
    seal: EvidenceSealV1;
    causalTrace: CausalTraceV1;
    idempotentReplay: boolean;
  } {
    const { reservationRef, correlationId, effect, sealedAt } = input;
    if (effect.reservationRef !== reservationRef) {
      throw new Error("work_capability_finalizer_reservation_mismatch");
    }
    if (effect.correlationId !== correlationId) {
      throw new Error("work_capability_finalizer_correlation_mismatch");
    }

    const verified = Date.parse(effect.verifiedAt);
    const sealed = Date.parse(sealedAt);
    if (!Number.isFinite(verified) || !Number.isFinite(sealed)) {
      throw new Error("work_capability_finalizer_invalid_time");
    }
    if (sealed < verified) {
      throw new Error("work_capability_finalizer_before_verification");
    }

    const fingerprint = digest(JSON.stringify({
      reservationRef,
      correlationId,
      effectRef: effect.effectRef,
      verificationRef: effect.verificationRef,
      verifiedAt: effect.verifiedAt,
      sealedAt,
    }));
    const existing = this.byEffectRef.get(effect.effectRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("work_capability_finalizer_idempotency_conflict");
      }
      return {
        seal: { ...existing.seal },
        causalTrace: {
          ...existing.causalTrace,
          eventReceiptRefs: [...existing.causalTrace.eventReceiptRefs],
        },
        idempotentReplay: true,
      };
    }

    const sealRef = `WORK-CAPABILITY-EVIDENCE-SEALED:${digest(
      `${reservationRef}|${effect.effectRef}|${effect.verificationRef}`,
    ).slice(0, 24)}`;
    const seal: EvidenceSealV1 = {
      sealRef,
      reservationRef,
      correlationId,
      state: "SEALED",
      traceDigest: [
        "RC1-TRACE-V1",
        reservationRef,
        sealRef,
        effect.effectRef,
        effect.verificationRef,
      ].join("|"),
      sealedAt,
    };
    const causalTrace: CausalTraceV1 = {
      correlationId,
      reservationRef,
      eventReceiptRefs: [],
      effectRef: effect.effectRef,
      sealRef,
      sealed: true,
    };

    this.byEffectRef.set(effect.effectRef, { fingerprint, seal, causalTrace });
    return {
      seal: { ...seal },
      causalTrace: { ...causalTrace, eventReceiptRefs: [] },
      idempotentReplay: false,
    };
  }
}
