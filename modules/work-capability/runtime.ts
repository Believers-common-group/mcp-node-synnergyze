import { createHash } from "node:crypto";

import type {
  CandidateCompositionV1,
  CapabilityDemandV1,
  CapabilityV1,
  ObjectiveWorkRefV1,
  WorkflowInstanceV1,
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
