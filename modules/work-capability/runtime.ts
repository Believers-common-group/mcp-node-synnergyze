import { createHash } from "node:crypto";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type { VerifiedEffectV1 } from "../synnergyze/effect-verification.ts";
import {
  ControlledExecutionGateV1,
  type SyntheticCapabilityAdapterV1,
} from "../synnergyze/execution-gate.ts";
import type {
  WardenDecisionRequestV1,
  WardenDecisionV1,
  WardenExecutionCheckpointV1,
} from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import type {
  ActorCapabilityProfileV1,
  CandidateCompositionV1,
  CapabilityDemandV1,
  CapabilityEvidenceV1,
  CapabilityObservedPerformanceV1,
  CapabilityOutcomeV1,
  CapabilityV1,
  ObjectiveWorkRefV1,
  RemainingWorkProposalV1,
  WorkflowInstanceV1,
  WorkAssignmentV1,
  WorkUnitV1,
} from "./contracts.ts";

const GARMENT_BLUEPRINT_REF = "WORKFLOW-BLUEPRINT:GARMENT-5-POCKET-DENIM:R0.1";
const WAISTBAND_CAPABILITY_REF = "garment.waistband.attach";

interface GarmentStepDefinitionV1 {
  stage: string;
  action: string;
  capabilityRef: string;
  inputState: string;
  outputState: string;
  riskClass: WorkUnitV1["riskClass"];
  firstPassQuality?: number;
}

export interface CountedSyntheticCapabilityAdapterV1 extends SyntheticCapabilityAdapterV1 {
  invocationCount(): number;
}

export interface AssignedWorkExecutionInputV1 {
  workUnit: WorkUnitV1;
  composition: CandidateCompositionV1;
  actorProfiles: readonly ActorCapabilityProfileV1[];
  request: WardenDecisionRequestV1;
  policy: SyntheticWardenDecisionPolicyV1;
  adapter: CountedSyntheticCapabilityAdapterV1;
  decidedAt: string;
  reservedAt: string;
  checkedAt: string;
  executedAt: string;
}

export interface AssignedWorkExecutionProofV1 {
  assignment: WorkAssignmentV1;
  decision: Extract<WardenDecisionV1, { decision: "ALLOW" }>;
  checkpoint: WardenExecutionCheckpointV1;
  execution: SynnergyzeExecutionReceiptV1;
  adapterInvocationCount: number;
}

const GARMENT_STEPS: readonly GarmentStepDefinitionV1[] = [
  {
    stage: "fabric_receipt",
    action: "receive_fabric",
    capabilityRef: "garment.fabric.receive",
    inputState: "fabric_inbound",
    outputState: "fabric_received",
    riskClass: "R1",
  },
  {
    stage: "fabric_inspection",
    action: "inspect_fabric",
    capabilityRef: "garment.fabric.inspect",
    inputState: "fabric_received",
    outputState: "fabric_accepted",
    riskClass: "R2",
    firstPassQuality: 0.98,
  },
  {
    stage: "relaxation",
    action: "relax_fabric",
    capabilityRef: "garment.fabric.relax",
    inputState: "fabric_accepted",
    outputState: "fabric_relaxed",
    riskClass: "R1",
  },
  {
    stage: "spreading",
    action: "spread_fabric",
    capabilityRef: "garment.fabric.spread",
    inputState: "fabric_relaxed",
    outputState: "fabric_spread",
    riskClass: "R2",
  },
  {
    stage: "cutting",
    action: "cut_components",
    capabilityRef: "garment.cut.components",
    inputState: "fabric_spread",
    outputState: "cut_components_ready",
    riskClass: "R2",
    firstPassQuality: 0.98,
  },
  {
    stage: "bundling",
    action: "bundle_components",
    capabilityRef: "garment.bundle.components",
    inputState: "cut_components_ready",
    outputState: "bundles_ready",
    riskClass: "R1",
  },
  {
    stage: "sewing_front",
    action: "assemble_front",
    capabilityRef: "garment.sew.front",
    inputState: "bundles_ready",
    outputState: "front_assembled",
    riskClass: "R2",
    firstPassQuality: 0.97,
  },
  {
    stage: "sewing_back",
    action: "assemble_back",
    capabilityRef: "garment.sew.back",
    inputState: "front_assembled",
    outputState: "back_assembled",
    riskClass: "R2",
    firstPassQuality: 0.97,
  },
  {
    stage: "waistband",
    action: "attach_waistband",
    capabilityRef: WAISTBAND_CAPABILITY_REF,
    inputState: "back_assembled",
    outputState: "waistband_attached",
    riskClass: "R2",
    firstPassQuality: 0.97,
  },
  {
    stage: "washing",
    action: "wash_garment",
    capabilityRef: "garment.wash.execute",
    inputState: "waistband_attached",
    outputState: "garment_washed",
    riskClass: "R3",
    firstPassQuality: 0.97,
  },
  {
    stage: "finishing",
    action: "finish_garment",
    capabilityRef: "garment.finish.execute",
    inputState: "garment_washed",
    outputState: "garment_finished",
    riskClass: "R2",
    firstPassQuality: 0.97,
  },
  {
    stage: "quality",
    action: "final_quality_check",
    capabilityRef: "garment.quality.final",
    inputState: "garment_finished",
    outputState: "garment_accepted",
    riskClass: "R3",
    firstPassQuality: 0.97,
  },
  {
    stage: "packing",
    action: "pack_garment",
    capabilityRef: "garment.pack",
    inputState: "garment_accepted",
    outputState: "garment_packed",
    riskClass: "R1",
  },
] as const;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertInstant(value: string, errorCode: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(errorCode);
}

function includesAll(actual: readonly string[], required: readonly string[]): boolean {
  const values = new Set(actual);
  return required.every((value) => values.has(value));
}

function assertAssignedWorkInput(input: AssignedWorkExecutionInputV1): void {
  const { workUnit, composition, actorProfiles, request, adapter } = input;
  if (composition.workUnitRef !== workUnit.workUnitRef) {
    throw new Error("work_capability_composition_work_unit_mismatch");
  }
  if (!composition.eligible) throw new Error("work_capability_composition_ineligible");
  if (!includesAll(composition.capabilityRefs, workUnit.requiredCapabilityRefs)) {
    throw new Error("work_capability_composition_capability_gap");
  }
  if (adapter.capabilityRef !== request.capabilityRef) {
    throw new Error("work_capability_adapter_capability_mismatch");
  }

  const actorRefs = new Set(composition.actorRefs);
  if (actorRefs.size === 0 || actorRefs.size !== composition.actorRefs.length) {
    throw new Error("work_capability_composition_actor_identity_invalid");
  }
  const profiles = new Map(actorProfiles.map((profile) => [profile.actorRef, profile]));
  for (const actorRef of composition.actorRefs) {
    const profile = profiles.get(actorRef);
    if (!profile) throw new Error(`work_capability_actor_profile_missing:${actorRef}`);
    if (!profile.available) throw new Error(`work_capability_actor_unavailable:${actorRef}`);
  }

  if (!composition.actorRefs.includes(request.actorRef)) {
    throw new Error("work_capability_request_actor_not_in_composition");
  }
  if (request.actingCapacityRef !== composition.compositionRef) {
    throw new Error("work_capability_request_composition_mismatch");
  }
  if (request.programRef !== workUnit.workflowRef) {
    throw new Error("work_capability_request_workflow_mismatch");
  }
  if (request.eventRef !== workUnit.workUnitRef) {
    throw new Error("work_capability_request_work_unit_mismatch");
  }
  if (request.action !== workUnit.action) throw new Error("work_capability_request_action_mismatch");
  if (!workUnit.requiredCapabilityRefs.includes(request.capabilityRef)) {
    throw new Error("work_capability_request_capability_mismatch");
  }
  if (request.targetRef !== workUnit.targetRef) {
    throw new Error("work_capability_request_target_mismatch");
  }
  if (request.requestedEffect !== workUnit.requiredOutputStateRef) {
    throw new Error("work_capability_request_effect_mismatch");
  }
  if (request.correlationId !== workUnit.correlationId) {
    throw new Error("work_capability_request_correlation_mismatch");
  }
  if (
    !request.representationSourceRefs.includes(
      `COMPOSITE-CAPABILITY:${composition.compositionRef}`,
    )
  ) {
    throw new Error("work_capability_request_composition_binding_required");
  }
}

export function compileSyntheticGarmentWorkflowV1(
  objective: ObjectiveWorkRefV1,
): {
  objective: ObjectiveWorkRefV1;
  workflow: WorkflowInstanceV1;
  workUnits: readonly WorkUnitV1[];
} {
  if (!objective.objectiveRef.trim()) throw new Error("work_capability_objective_ref_required");
  if (!objective.principalRef.trim()) throw new Error("work_capability_principal_ref_required");
  if (!objective.requiredEffectRef.trim()) {
    throw new Error("work_capability_required_effect_ref_required");
  }
  assertInstant(objective.deadline, "work_capability_deadline_invalid");

  const identity = digest(
    [
      objective.objectiveRef,
      objective.principalRef,
      objective.requiredEffectRef,
      objective.deadline,
      GARMENT_BLUEPRINT_REF,
    ].join("|"),
  ).slice(0, 24);
  const workflowRef = `WORKFLOW:${identity}`;
  const correlationId = `WORK-CAPABILITY-CORR:${identity}`;

  const workUnits: WorkUnitV1[] = GARMENT_STEPS.map((step, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    return {
      workUnitRef: `WORK-UNIT:${identity}:${sequence}`,
      objectiveRef: objective.objectiveRef,
      workflowRef,
      stageRef: `WORK-STAGE:${identity}:${sequence}:${step.stage}`,
      action: step.action,
      targetRef: `GARMENT-BATCH:B124:${step.stage}`,
      inputStateRef: `GARMENT-STATE:${step.inputState}`,
      requiredOutputStateRef: `GARMENT-STATE:${step.outputState}`,
      requiredCapabilityRefs: [step.capabilityRef],
      qualityThresholds:
        step.firstPassQuality === undefined
          ? {}
          : { firstPassQuality: step.firstPassQuality },
      deadline: objective.deadline,
      riskClass: step.riskClass,
      requiredEvidenceRefs: [`EVIDENCE-REQUIREMENT:${step.capabilityRef}`],
      correlationId,
    };
  });

  const workflow: WorkflowInstanceV1 = {
    workflowRef,
    objectiveRef: objective.objectiveRef,
    blueprintRef: GARMENT_BLUEPRINT_REF,
    stageRefs: workUnits.map((unit) => unit.stageRef),
    workUnitRefs: workUnits.map((unit) => unit.workUnitRef),
    synthetic: true,
  };

  return {
    objective: { ...objective },
    workflow,
    workUnits,
  };
}

export function resolveCapabilityDemandV1(input: {
  workUnit: WorkUnitV1;
  capabilities: readonly CapabilityV1[];
  candidates: readonly CandidateCompositionV1[];
}): CapabilityDemandV1 {
  const availableCapabilityRefs = new Set(input.capabilities.map((item) => item.capabilityRef));
  const missingCapabilityRefs = input.workUnit.requiredCapabilityRefs.filter(
    (capabilityRef) => !availableCapabilityRefs.has(capabilityRef),
  );

  const matchingCandidates = input.candidates.filter(
    (candidate) =>
      candidate.workUnitRef === input.workUnit.workUnitRef &&
      includesAll(candidate.capabilityRefs, input.workUnit.requiredCapabilityRefs),
  );
  const eligibleCandidates = matchingCandidates.filter((candidate) => candidate.eligible);

  const state: CapabilityDemandV1["state"] =
    missingCapabilityRefs.length > 0
      ? "MISSING"
      : eligibleCandidates.length > 0
        ? "COVERED"
        : "CONSTRAINED";

  const material = JSON.stringify({
    workUnitRef: input.workUnit.workUnitRef,
    requiredCapabilityRefs: [...input.workUnit.requiredCapabilityRefs].sort(),
  });

  return {
    demandRef: `CAPABILITY-DEMAND:${digest(material).slice(0, 24)}`,
    workUnitRef: input.workUnit.workUnitRef,
    requiredCapabilityRefs: [...input.workUnit.requiredCapabilityRefs],
    state,
    candidateCompositionRefs: eligibleCandidates
      .map((candidate) => candidate.compositionRef)
      .sort(),
    missingCapabilityRefs: [...missingCapabilityRefs].sort(),
  };
}

export function selectCandidateCompositionV1(
  candidates: readonly CandidateCompositionV1[],
): CandidateCompositionV1 | undefined {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  eligible.sort((left, right) => {
    if (left.evidenceConfidence !== right.evidenceConfidence) {
      return right.evidenceConfidence - left.evidenceConfidence;
    }
    if (left.expectedFirstPassQuality !== right.expectedFirstPassQuality) {
      return right.expectedFirstPassQuality - left.expectedFirstPassQuality;
    }
    if (left.expectedCycleSeconds !== right.expectedCycleSeconds) {
      return left.expectedCycleSeconds - right.expectedCycleSeconds;
    }
    return left.compositionRef.localeCompare(right.compositionRef);
  });

  const selected = eligible[0];
  return selected
    ? {
        ...selected,
        actorRefs: [...selected.actorRefs],
        capabilityRefs: [...selected.capabilityRefs],
      }
    : undefined;
}

export function executeAssignedWorkUnitV1(
  input: AssignedWorkExecutionInputV1,
): AssignedWorkExecutionProofV1 {
  assertAssignedWorkInput(input);

  const decision = evaluateSyntheticWardenDecisionV1({
    request: input.request,
    policy: input.policy,
    decidedAt: input.decidedAt,
  });
  if (decision.decision !== "ALLOW") {
    throw new Error(`work_capability_warden_${decision.decision.toLowerCase()}`);
  }

  const action = buildAuthorizedActionEnvelopeV1(input.request, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({
    request: input.request,
    decision,
    action,
    reservedAt: input.reservedAt,
  });

  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${digest(
      `${decision.decisionRef}|${reservation.reservationRef}|${input.checkedAt}`,
    ).slice(0, 24)}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: input.checkedAt,
    reasonCodes: ["decision_active_for_work_execution"],
  };

  const assignmentMaterial = JSON.stringify({
    workUnitRef: input.workUnit.workUnitRef,
    compositionRef: input.composition.compositionRef,
    actorRefs: [...input.composition.actorRefs],
    decisionRef: decision.decisionRef,
    reservationRef: reservation.reservationRef,
  });
  const assignment: WorkAssignmentV1 = {
    assignmentRef: `WORK-ASSIGNMENT:${digest(assignmentMaterial).slice(0, 24)}`,
    workUnitRef: input.workUnit.workUnitRef,
    compositionRef: input.composition.compositionRef,
    actorRefs: [...input.composition.actorRefs],
    selectedAt: input.checkedAt,
    selectionReasonCodes: [
      "CAPABILITY_COVERED",
      "WARDEN_ALLOWED",
      "COMPOSITION_AVAILABLE",
    ],
  };

  const gate = new ControlledExecutionGateV1([input.adapter]);
  const execution = gate.execute({
    action,
    reservation,
    decision,
    checkpoint,
    executedAt: input.executedAt,
  });

  return {
    assignment,
    decision,
    checkpoint,
    execution,
    adapterInvocationCount: input.adapter.invocationCount(),
  };
}

export function projectCapabilityEvidenceV1(input: {
  workUnit: WorkUnitV1;
  assignment: WorkAssignmentV1;
  capabilityRef: string;
  execution: SynnergyzeExecutionReceiptV1;
  verifiedEffect: VerifiedEffectV1;
  observedPerformance: CapabilityObservedPerformanceV1;
  evidenceRefs: readonly string[];
  observedAt: string;
}): readonly CapabilityEvidenceV1[] {
  if (input.assignment.workUnitRef !== input.workUnit.workUnitRef) {
    throw new Error("work_capability_evidence_assignment_mismatch");
  }
  if (!input.workUnit.requiredCapabilityRefs.includes(input.capabilityRef)) {
    throw new Error("work_capability_evidence_capability_mismatch");
  }
  if (input.execution.capabilityRef !== input.capabilityRef) {
    throw new Error("work_capability_evidence_execution_capability_mismatch");
  }
  if (input.verifiedEffect.executionReceiptRef !== input.execution.receiptRef) {
    throw new Error("work_capability_evidence_effect_execution_mismatch");
  }
  if (
    input.verifiedEffect.programRef !== input.workUnit.workflowRef ||
    input.verifiedEffect.eventRef !== input.workUnit.workUnitRef ||
    input.verifiedEffect.targetRef !== input.workUnit.targetRef ||
    input.verifiedEffect.correlationId !== input.workUnit.correlationId
  ) {
    throw new Error("work_capability_evidence_effect_lineage_mismatch");
  }
  if (input.evidenceRefs.length === 0) {
    throw new Error("work_capability_evidence_reference_required");
  }
  assertInstant(input.observedAt, "work_capability_observed_at_invalid");

  const participants = [...input.assignment.actorRefs, input.assignment.compositionRef];
  return participants.map((actorOrCompositionRef) => {
    const identity = JSON.stringify({
      capabilityRef: input.capabilityRef,
      actorOrCompositionRef,
      workUnitRef: input.workUnit.workUnitRef,
      executionReceiptRef: input.execution.receiptRef,
      verifiedEffectRef: input.verifiedEffect.effectRef,
      evidenceRefs: [...input.evidenceRefs].sort(),
      observedPerformance: input.observedPerformance,
      observedAt: input.observedAt,
    });
    return {
      capabilityEvidenceRef: `CAPABILITY-EVIDENCE:${digest(identity).slice(0, 24)}`,
      capabilityRef: input.capabilityRef,
      actorOrCompositionRef,
      workUnitRef: input.workUnit.workUnitRef,
      executionReceiptRef: input.execution.receiptRef,
      verifiedEffectRef: input.verifiedEffect.effectRef,
      observedPerformance: { ...input.observedPerformance },
      evidenceRefs: [...input.evidenceRefs],
      observedAt: input.observedAt,
      synthetic: true,
    };
  });
}

export function reconcileWorkUnitOutcomeV1(input: {
  workUnit: WorkUnitV1;
  requiredQuantity: number;
  observedPerformance: Required<
    Pick<
      CapabilityObservedPerformanceV1,
      "inputQuantity" | "outputQuantity" | "acceptedQuantity" | "reworkQuantity"
    >
  >;
}): { outcome: CapabilityOutcomeV1; remainingWork?: RemainingWorkProposalV1 } {
  const { workUnit, requiredQuantity, observedPerformance } = input;
  const quantities = [
    requiredQuantity,
    observedPerformance.inputQuantity,
    observedPerformance.outputQuantity,
    observedPerformance.acceptedQuantity,
    observedPerformance.reworkQuantity,
  ];
  if (quantities.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("work_capability_outcome_quantity_invalid");
  }
  if (observedPerformance.outputQuantity > observedPerformance.inputQuantity) {
    throw new Error("work_capability_output_exceeds_input");
  }
  if (
    observedPerformance.acceptedQuantity + observedPerformance.reworkQuantity !==
    observedPerformance.outputQuantity
  ) {
    throw new Error("work_capability_output_accounting_mismatch");
  }

  const requiredFirstPassQuality = workUnit.qualityThresholds.firstPassQuality ?? 0;
  const firstPassQuality =
    observedPerformance.outputQuantity === 0
      ? 0
      : observedPerformance.acceptedQuantity / observedPerformance.outputQuantity;
  const qualityMet = firstPassQuality >= requiredFirstPassQuality;
  const quantityMet = observedPerformance.outputQuantity >= requiredQuantity;
  const state: CapabilityOutcomeV1["state"] =
    quantityMet && qualityMet
      ? "FULL_EFFECT"
      : observedPerformance.outputQuantity > 0 && qualityMet
        ? "PARTIAL_EFFECT"
        : "FAILED_EFFECT";

  const outcomeIdentity = JSON.stringify({
    workUnitRef: workUnit.workUnitRef,
    requiredQuantity,
    observedPerformance,
    firstPassQuality,
    requiredFirstPassQuality,
    state,
  });
  const outcome: CapabilityOutcomeV1 = {
    outcomeRef: `CAPABILITY-OUTCOME:${digest(outcomeIdentity).slice(0, 24)}`,
    workUnitRef: workUnit.workUnitRef,
    state,
    requiredQuantity,
    outputQuantity: observedPerformance.outputQuantity,
    acceptedQuantity: observedPerformance.acceptedQuantity,
    reworkQuantity: observedPerformance.reworkQuantity,
    firstPassQuality,
    requiredFirstPassQuality,
  };

  if (state !== "PARTIAL_EFFECT" || observedPerformance.outputQuantity >= requiredQuantity) {
    return { outcome };
  }

  const remainingQuantity = requiredQuantity - observedPerformance.outputQuantity;
  const proposal: RemainingWorkProposalV1 = {
    proposalRef: `REMAINING-WORK:${digest(
      `${workUnit.workUnitRef}|${outcome.outcomeRef}|${remainingQuantity}`,
    ).slice(0, 24)}`,
    workUnitRef: workUnit.workUnitRef,
    remainingQuantity,
    reasonCode: "QUANTITY_SHORTFALL",
    automaticExecutionAllowed: false,
  };
  return { outcome, remainingWork: proposal };
}
