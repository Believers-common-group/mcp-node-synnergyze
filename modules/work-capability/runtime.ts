import { createHash } from "node:crypto";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type {
  ResolvedDeviceSecurityContextV1,
  SynnergyzeExecutionReceiptV1,
} from "../synnergyze/contracts.ts";
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
import type { WardenExecutionCheckpointSourceV1 } from "../warden/checkpoint-service.ts";
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
const ASSIGNMENT_BINDING_PREFIX = "WORK-ASSIGNMENT-BINDING:";

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
  fingerprintMaterial(): unknown;
  currentStateRef(): string;
}

export interface AssignedWorkExecutionInputV1 {
  workUnit: WorkUnitV1;
  composition: CandidateCompositionV1;
  actorProfiles: readonly ActorCapabilityProfileV1[];
  request: WardenDecisionRequestV1;
  policy: SyntheticWardenDecisionPolicyV1;
  checkpointSource: WardenExecutionCheckpointSourceV1;
  executionDeviceSecurity?: ResolvedDeviceSecurityContextV1;
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

interface WorkExecutionServicesV1 {
  river: SyntheticRiverReservationServiceV1;
  gate: ControlledExecutionGateV1;
  adapter: CountedSyntheticCapabilityAdapterV1;
}

interface StoredWorkExecutionV1 {
  fingerprint: string;
  services: WorkExecutionServicesV1;
}

type WorkAssignmentIntentV1 = Omit<WorkAssignmentV1, "authorizationDecisionRef">;

const GARMENT_STEPS: readonly GarmentStepDefinitionV1[] = [
  { stage: "fabric_receipt", action: "receive_fabric", capabilityRef: "garment.fabric.receive", inputState: "fabric_inbound", outputState: "fabric_received", riskClass: "R1" },
  { stage: "fabric_inspection", action: "inspect_fabric", capabilityRef: "garment.fabric.inspect", inputState: "fabric_received", outputState: "fabric_accepted", riskClass: "R2", firstPassQuality: 0.98 },
  { stage: "relaxation", action: "relax_fabric", capabilityRef: "garment.fabric.relax", inputState: "fabric_accepted", outputState: "fabric_relaxed", riskClass: "R1" },
  { stage: "spreading", action: "spread_fabric", capabilityRef: "garment.fabric.spread", inputState: "fabric_relaxed", outputState: "fabric_spread", riskClass: "R2" },
  { stage: "cutting", action: "cut_components", capabilityRef: "garment.cut.components", inputState: "fabric_spread", outputState: "cut_components_ready", riskClass: "R2", firstPassQuality: 0.98 },
  { stage: "bundling", action: "bundle_components", capabilityRef: "garment.bundle.components", inputState: "cut_components_ready", outputState: "bundles_ready", riskClass: "R1" },
  { stage: "sewing_front", action: "assemble_front", capabilityRef: "garment.sew.front", inputState: "bundles_ready", outputState: "front_assembled", riskClass: "R2", firstPassQuality: 0.97 },
  { stage: "sewing_back", action: "assemble_back", capabilityRef: "garment.sew.back", inputState: "front_assembled", outputState: "back_assembled", riskClass: "R2", firstPassQuality: 0.97 },
  { stage: "waistband", action: "attach_waistband", capabilityRef: "garment.waistband.attach", inputState: "back_assembled", outputState: "waistband_attached", riskClass: "R2", firstPassQuality: 0.97 },
  { stage: "washing", action: "wash_garment", capabilityRef: "garment.wash.execute", inputState: "waistband_attached", outputState: "garment_washed", riskClass: "R3", firstPassQuality: 0.97 },
  { stage: "finishing", action: "finish_garment", capabilityRef: "garment.finish.execute", inputState: "garment_washed", outputState: "garment_finished", riskClass: "R2", firstPassQuality: 0.97 },
  { stage: "quality", action: "final_quality_check", capabilityRef: "garment.quality.final", inputState: "garment_finished", outputState: "garment_accepted", riskClass: "R3", firstPassQuality: 0.97 },
  { stage: "packing", action: "pack_garment", capabilityRef: "garment.pack", inputState: "garment_accepted", outputState: "garment_packed", riskClass: "R1" },
] as const;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function includesAll(actual: readonly string[], required: readonly string[]): boolean {
  const values = new Set(actual);
  return required.every((value) => values.has(value));
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function contextSatisfies(
  offered: Readonly<Record<string, string>>,
  required: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(required).every(([key, value]) => offered[key] === value);
}

function directCapabilityProviders(
  workUnit: WorkUnitV1,
  composition: CandidateCompositionV1,
  profiles: ReadonlyMap<string, ActorCapabilityProfileV1>,
  capabilityRef: string,
): readonly ActorCapabilityProfileV1[] {
  return composition.actorRefs
    .map((actorRef) => profiles.get(actorRef))
    .filter((profile): profile is ActorCapabilityProfileV1 => Boolean(profile))
    .filter(
      (profile) =>
        profile.capabilityRefs.includes(capabilityRef) &&
        contextSatisfies(profile.context, workUnit.requiredContext),
    );
}

function assertProfileEvidenceCurrent(
  profile: ActorCapabilityProfileV1,
  executedAt: string,
): void {
  if (profile.evidenceState !== "CURRENT") {
    throw new Error(`work_capability_actor_evidence_not_current:${profile.actorRef}`);
  }
  if (profile.evidenceRefs.length === 0) {
    throw new Error(`work_capability_actor_evidence_missing:${profile.actorRef}`);
  }
  if (!profile.evidenceValidUntil) {
    throw new Error(`work_capability_actor_evidence_validity_required:${profile.actorRef}`);
  }
  const validUntil = parseInstant(
    profile.evidenceValidUntil,
    `work_capability_actor_evidence_validity_invalid:${profile.actorRef}`,
  );
  if (parseInstant(executedAt, "work_capability_executed_at_invalid") > validUntil) {
    throw new Error(`work_capability_actor_evidence_expired:${profile.actorRef}`);
  }
}

function assertRequiredEvidence(
  workUnit: WorkUnitV1,
  composition: CandidateCompositionV1,
  profiles: ReadonlyMap<string, ActorCapabilityProfileV1>,
  executedAt: string,
): void {
  const profileEvidence = new Set<string>();
  for (const actorRef of composition.actorRefs) {
    const profile = profiles.get(actorRef);
    if (!profile) continue;
    for (const evidenceRef of profile.evidenceRefs) profileEvidence.add(evidenceRef);
  }

  for (const capabilityRef of workUnit.requiredCapabilityRefs) {
    const providers = directCapabilityProviders(workUnit, composition, profiles, capabilityRef);
    if (providers.length === 0) {
      throw new Error(`work_capability_contextual_provider_missing:${capabilityRef}`);
    }
    for (const provider of providers) assertProfileEvidenceCurrent(provider, executedAt);
  }

  for (const requirementRef of workUnit.requiredEvidenceRefs) {
    if (requirementRef.startsWith("EVIDENCE-REQUIREMENT:")) {
      const capabilityRef = requirementRef.slice("EVIDENCE-REQUIREMENT:".length);
      if (directCapabilityProviders(workUnit, composition, profiles, capabilityRef).length === 0) {
        throw new Error(`work_capability_required_evidence_unsatisfied:${requirementRef}`);
      }
    } else if (!profileEvidence.has(requirementRef)) {
      throw new Error(`work_capability_required_evidence_unsatisfied:${requirementRef}`);
    }
  }
}

function assertMachineSecurityBinding(
  input: AssignedWorkExecutionInputV1,
  profiles: ReadonlyMap<string, ActorCapabilityProfileV1>,
): void {
  const machines = input.composition.actorRefs
    .map((actorRef) => profiles.get(actorRef))
    .filter((profile): profile is ActorCapabilityProfileV1 => profile?.actorClass === "MACHINE");
  if (machines.length === 0) return;
  if (machines.length > 1) throw new Error("work_capability_machine_execution_device_ambiguous");
  const machine = machines[0];
  if (!machine.assetRef) throw new Error(`work_capability_machine_asset_required:${machine.actorRef}`);
  if (input.request.executionDeviceRef !== machine.assetRef) {
    throw new Error("work_capability_machine_execution_device_required");
  }
  if (!input.executionDeviceSecurity) {
    throw new Error("work_capability_machine_device_security_required");
  }
  if (input.executionDeviceSecurity.deviceRef !== machine.assetRef) {
    throw new Error("work_capability_machine_device_security_mismatch");
  }
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
  if (
    parseInstant(input.executedAt, "work_capability_executed_at_invalid") >
    parseInstant(workUnit.deadline, "work_capability_deadline_invalid")
  ) {
    throw new Error("work_capability_work_unit_expired");
  }
  if (adapter.currentStateRef() !== workUnit.inputStateRef) {
    throw new Error("work_capability_input_state_mismatch");
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
  assertRequiredEvidence(workUnit, composition, profiles, input.executedAt);
  assertMachineSecurityBinding(input, profiles);

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
  if (!request.representationSourceRefs.includes(`COMPOSITE-CAPABILITY:${composition.compositionRef}`)) {
    throw new Error("work_capability_request_composition_binding_required");
  }
}

function canonicalActorProfiles(
  actorProfiles: readonly ActorCapabilityProfileV1[],
): readonly ActorCapabilityProfileV1[] {
  return [...actorProfiles]
    .sort((left, right) => left.actorRef.localeCompare(right.actorRef))
    .map((profile) => ({
      ...profile,
      capabilityRefs: stableUnique(profile.capabilityRefs),
      evidenceRefs: stableUnique(profile.evidenceRefs),
      context: Object.fromEntries(Object.entries(profile.context).sort(([a], [b]) => a.localeCompare(b))),
    }));
}

function assignmentDigestFor(input: {
  workUnitRef: string;
  compositionRef: string;
  actorRefs: readonly string[];
}): string {
  return `sha256:${digest(JSON.stringify({
    workUnitRef: input.workUnitRef,
    compositionRef: input.compositionRef,
    actorRefs: stableUnique(input.actorRefs),
  }))}`;
}

function buildAssignmentIntent(input: AssignedWorkExecutionInputV1): WorkAssignmentIntentV1 {
  const assignmentDigest = assignmentDigestFor({
    workUnitRef: input.workUnit.workUnitRef,
    compositionRef: input.composition.compositionRef,
    actorRefs: input.composition.actorRefs,
  });
  return {
    assignmentRef: `WORK-ASSIGNMENT:${assignmentDigest.slice("sha256:".length, "sha256:".length + 24)}`,
    assignmentDigest,
    assignmentBindingRef: `${ASSIGNMENT_BINDING_PREFIX}${assignmentDigest}`,
    workUnitRef: input.workUnit.workUnitRef,
    compositionRef: input.composition.compositionRef,
    actorRefs: [...input.composition.actorRefs],
    selectedAt: input.request.requestedAt,
    selectionReasonCodes: ["CAPABILITY_COVERED", "EVIDENCE_CURRENT", "COMPOSITION_AVAILABLE"],
  };
}

function bindRequestToAssignment(
  request: WardenDecisionRequestV1,
  assignment: WorkAssignmentIntentV1,
): WardenDecisionRequestV1 {
  const existing = request.representationSourceRefs.filter((ref) =>
    ref.startsWith(ASSIGNMENT_BINDING_PREFIX),
  );
  if (existing.some((ref) => ref !== assignment.assignmentBindingRef)) {
    throw new Error("work_capability_request_assignment_binding_mismatch");
  }
  return {
    ...request,
    representationSourceRefs: stableUnique([
      ...request.representationSourceRefs,
      assignment.assignmentBindingRef,
    ]),
  };
}

function workExecutionIdentity(input: AssignedWorkExecutionInputV1): string {
  return `${input.workUnit.workUnitRef}|${input.composition.compositionRef}`;
}

function workExecutionFingerprint(input: AssignedWorkExecutionInputV1): string {
  return digest(JSON.stringify({
    workUnit: {
      ...input.workUnit,
      requiredCapabilityRefs: stableUnique(input.workUnit.requiredCapabilityRefs),
      requiredEvidenceRefs: stableUnique(input.workUnit.requiredEvidenceRefs),
      requiredContext: Object.fromEntries(Object.entries(input.workUnit.requiredContext).sort(([a], [b]) => a.localeCompare(b))),
    },
    composition: {
      ...input.composition,
      actorRefs: stableUnique(input.composition.actorRefs),
      capabilityRefs: stableUnique(input.composition.capabilityRefs),
    },
    actorProfiles: canonicalActorProfiles(input.actorProfiles),
    request: {
      ...input.request,
      authorityRefs: stableUnique(input.request.authorityRefs),
      policyRefs: stableUnique(input.request.policyRefs),
      representationSourceRefs: stableUnique(input.request.representationSourceRefs),
      deviceSecuritySourceRefs: stableUnique(input.request.deviceSecuritySourceRefs ?? []),
    },
    executionDeviceSecurity: input.executionDeviceSecurity ?? null,
    policy: {
      ...input.policy,
      requiredAuthorityRefs: stableUnique(input.policy.requiredAuthorityRefs),
      requiredPolicyRefs: stableUnique(input.policy.requiredPolicyRefs),
      allowedCapabilityRefs: stableUnique(input.policy.allowedCapabilityRefs),
      manualReviewCapabilityRefs: stableUnique(input.policy.manualReviewCapabilityRefs),
      constraints: stableUnique(input.policy.constraints),
    },
    decidedAt: input.decidedAt,
    reservedAt: input.reservedAt,
    checkedAt: input.checkedAt,
    executedAt: input.executedAt,
    adapter: {
      adapterRef: input.adapter.adapterRef,
      capabilityRef: input.adapter.capabilityRef,
      material: input.adapter.fingerprintMaterial(),
    },
  }));
}

function newWorkExecutionServices(adapter: CountedSyntheticCapabilityAdapterV1): WorkExecutionServicesV1 {
  return {
    river: new SyntheticRiverReservationServiceV1(),
    gate: new ControlledExecutionGateV1([adapter]),
    adapter,
  };
}

function executeAssignedWorkUnitWithServicesV1(
  input: AssignedWorkExecutionInputV1,
  services: WorkExecutionServicesV1,
): AssignedWorkExecutionProofV1 {
  assertAssignedWorkInput(input);
  if (
    services.adapter.adapterRef !== input.adapter.adapterRef ||
    services.adapter.capabilityRef !== input.adapter.capabilityRef
  ) {
    throw new Error("work_capability_runtime_adapter_mismatch");
  }

  const assignmentIntent = buildAssignmentIntent(input);
  const boundRequest = bindRequestToAssignment(input.request, assignmentIntent);
  const decision = evaluateSyntheticWardenDecisionV1({
    request: boundRequest,
    policy: input.policy,
    decidedAt: input.decidedAt,
  });
  if (decision.decision !== "ALLOW") {
    throw new Error(`work_capability_warden_${decision.decision.toLowerCase()}`);
  }

  const action = buildAuthorizedActionEnvelopeV1(boundRequest, decision);
  const reservation = services.river.reserve({
    request: boundRequest,
    decision,
    action,
    reservedAt: input.reservedAt,
  });
  const checkpoint = input.checkpointSource.check({ decision, checkedAt: input.checkedAt });
  const assignment: WorkAssignmentV1 = {
    ...assignmentIntent,
    authorizationDecisionRef: decision.decisionRef,
  };
  const execution = services.gate.execute({
    action,
    reservation,
    decision,
    checkpoint,
    executionDeviceSecurity: input.executionDeviceSecurity,
    executedAt: input.executedAt,
  });

  return {
    assignment,
    decision,
    checkpoint,
    execution,
    adapterInvocationCount: services.adapter.invocationCount(),
  };
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
  if (!objective.requiredEffectRef.trim()) throw new Error("work_capability_required_effect_ref_required");
  parseInstant(objective.deadline, "work_capability_deadline_invalid");

  const identity = digest([
    objective.objectiveRef,
    objective.principalRef,
    objective.requiredEffectRef,
    objective.deadline,
    GARMENT_BLUEPRINT_REF,
  ].join("|")).slice(0, 24);
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
      requiredContext: { materialFamily: "denim" },
      qualityThresholds: step.firstPassQuality === undefined ? {} : { firstPassQuality: step.firstPassQuality },
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
  return { objective: { ...objective }, workflow, workUnits };
}

export function resolveCapabilityDemandV1(input: {
  workUnit: WorkUnitV1;
  capabilities: readonly CapabilityV1[];
  candidates: readonly CandidateCompositionV1[];
  actorProfiles: readonly ActorCapabilityProfileV1[];
}): CapabilityDemandV1 {
  const compatibleCapabilityRefs = new Set(
    input.capabilities
      .filter((capability) => contextSatisfies(capability.context, input.workUnit.requiredContext))
      .map((capability) => capability.capabilityRef),
  );
  const missingCapabilityRefs = input.workUnit.requiredCapabilityRefs.filter(
    (capabilityRef) => !compatibleCapabilityRefs.has(capabilityRef),
  );
  const profiles = new Map(input.actorProfiles.map((profile) => [profile.actorRef, profile]));
  const matchingCandidates = input.candidates.filter((candidate) => {
    if (
      candidate.workUnitRef !== input.workUnit.workUnitRef ||
      !includesAll(candidate.capabilityRefs, input.workUnit.requiredCapabilityRefs)
    ) {
      return false;
    }
    return input.workUnit.requiredCapabilityRefs.every((capabilityRef) =>
      candidate.actorRefs.some((actorRef) => {
        const profile = profiles.get(actorRef);
        return Boolean(
          profile &&
          profile.capabilityRefs.includes(capabilityRef) &&
          contextSatisfies(profile.context, input.workUnit.requiredContext),
        );
      }),
    );
  });
  const eligibleCandidates = matchingCandidates.filter((candidate) => candidate.eligible);
  const state: CapabilityDemandV1["state"] =
    missingCapabilityRefs.length > 0
      ? "MISSING"
      : eligibleCandidates.length > 0
        ? "COVERED"
        : "CONSTRAINED";
  const demandMaterial = JSON.stringify({
    workUnitRef: input.workUnit.workUnitRef,
    requiredCapabilityRefs: stableUnique(input.workUnit.requiredCapabilityRefs),
    requiredContext: Object.fromEntries(Object.entries(input.workUnit.requiredContext).sort(([a], [b]) => a.localeCompare(b))),
  });
  return {
    demandRef: `CAPABILITY-DEMAND:${digest(demandMaterial).slice(0, 24)}`,
    workUnitRef: input.workUnit.workUnitRef,
    requiredCapabilityRefs: [...input.workUnit.requiredCapabilityRefs],
    state,
    candidateCompositionRefs: eligibleCandidates.map((candidate) => candidate.compositionRef).sort(),
    missingCapabilityRefs: [...missingCapabilityRefs].sort(),
  };
}

export function selectCandidateCompositionV1(
  candidates: readonly CandidateCompositionV1[],
): CandidateCompositionV1 | undefined {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  eligible.sort((left, right) => {
    if (left.evidenceConfidence !== right.evidenceConfidence) return right.evidenceConfidence - left.evidenceConfidence;
    if (left.expectedFirstPassQuality !== right.expectedFirstPassQuality) return right.expectedFirstPassQuality - left.expectedFirstPassQuality;
    if (left.expectedCycleSeconds !== right.expectedCycleSeconds) return left.expectedCycleSeconds - right.expectedCycleSeconds;
    return left.compositionRef.localeCompare(right.compositionRef);
  });
  const selected = eligible[0];
  return selected ? { ...selected, actorRefs: [...selected.actorRefs], capabilityRefs: [...selected.capabilityRefs] } : undefined;
}

export function executeAssignedWorkUnitV1(
  input: AssignedWorkExecutionInputV1,
): AssignedWorkExecutionProofV1 {
  return executeAssignedWorkUnitWithServicesV1(input, newWorkExecutionServices(input.adapter));
}

export class WorkCapabilityRuntimeV1 {
  private readonly byWorkComposition = new Map<string, StoredWorkExecutionV1>();

  run(input: AssignedWorkExecutionInputV1): AssignedWorkExecutionProofV1 {
    assertAssignedWorkInput(input);
    const identity = workExecutionIdentity(input);
    const fingerprint = workExecutionFingerprint(input);
    const existing = this.byWorkComposition.get(identity);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("work_capability_idempotency_conflict");
      return executeAssignedWorkUnitWithServicesV1(input, existing.services);
    }
    const services = newWorkExecutionServices(input.adapter);
    const result = executeAssignedWorkUnitWithServicesV1(input, services);
    this.byWorkComposition.set(identity, { fingerprint, services });
    return result;
  }

  executionCount(): number {
    return this.byWorkComposition.size;
  }
}

export function createWorkCapabilityRuntimeV1(): WorkCapabilityRuntimeV1 {
  return new WorkCapabilityRuntimeV1();
}

export function assertCapabilityObservedPerformanceV1(
  performance: CapabilityObservedPerformanceV1,
): void {
  const quantities = [
    performance.inputQuantity,
    performance.outputQuantity,
    performance.acceptedQuantity,
    performance.reworkQuantity,
  ].filter((value): value is number => value !== undefined);
  if (quantities.some((value) => !Number.isFinite(value) || !Number.isInteger(value) || value < 0)) {
    throw new Error("work_capability_observed_performance_quantity_invalid");
  }
  if (
    performance.firstPassQuality !== undefined &&
    (!Number.isFinite(performance.firstPassQuality) || performance.firstPassQuality < 0 || performance.firstPassQuality > 1)
  ) {
    throw new Error("work_capability_observed_performance_quality_invalid");
  }
  if (
    performance.cycleSeconds !== undefined &&
    (!Number.isFinite(performance.cycleSeconds) || performance.cycleSeconds < 0)
  ) {
    throw new Error("work_capability_observed_performance_cycle_invalid");
  }
  if (
    performance.firstPassQuality !== undefined &&
    performance.outputQuantity !== undefined &&
    performance.acceptedQuantity !== undefined &&
    performance.outputQuantity > 0 &&
    Math.abs(performance.acceptedQuantity / performance.outputQuantity - performance.firstPassQuality) > 1e-9
  ) {
    throw new Error("work_capability_observed_performance_quality_inconsistent");
  }
  if (
    performance.inputQuantity !== undefined &&
    performance.outputQuantity !== undefined &&
    performance.outputQuantity > performance.inputQuantity
  ) {
    throw new Error("work_capability_observed_performance_output_exceeds_input");
  }
  if (
    performance.outputQuantity !== undefined &&
    performance.acceptedQuantity !== undefined &&
    performance.reworkQuantity !== undefined &&
    performance.acceptedQuantity + performance.reworkQuantity !== performance.outputQuantity
  ) {
    throw new Error("work_capability_observed_performance_accounting_mismatch");
  }
}

function assertAssignmentIntegrity(assignment: WorkAssignmentV1): void {
  const expectedDigest = assignmentDigestFor({
    workUnitRef: assignment.workUnitRef,
    compositionRef: assignment.compositionRef,
    actorRefs: assignment.actorRefs,
  });
  const expectedRef = `WORK-ASSIGNMENT:${expectedDigest.slice("sha256:".length, "sha256:".length + 24)}`;
  const expectedBinding = `${ASSIGNMENT_BINDING_PREFIX}${expectedDigest}`;
  if (
    assignment.assignmentDigest !== expectedDigest ||
    assignment.assignmentRef !== expectedRef ||
    assignment.assignmentBindingRef !== expectedBinding
  ) {
    throw new Error("work_capability_assignment_integrity_mismatch");
  }
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
  assertAssignmentIntegrity(input.assignment);
  if (input.assignment.authorizationDecisionRef !== input.execution.wardenDecisionRef) {
    throw new Error("work_capability_evidence_assignment_authorization_mismatch");
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
  if (input.evidenceRefs.length === 0) throw new Error("work_capability_evidence_reference_required");
  assertCapabilityObservedPerformanceV1(input.observedPerformance);
  const executedAt = parseInstant(input.execution.executedAt, "work_capability_execution_time_invalid");
  const observedAt = parseInstant(input.observedAt, "work_capability_observed_at_invalid");
  const verifiedAt = parseInstant(input.verifiedEffect.verifiedAt, "work_capability_verified_at_invalid");
  if (observedAt < executedAt) throw new Error("work_capability_observation_before_execution");
  if (observedAt > verifiedAt) throw new Error("work_capability_observation_after_verification");

  return [...input.assignment.actorRefs, input.assignment.compositionRef].map((actorOrCompositionRef) => {
    const identity = JSON.stringify({
      capabilityRef: input.capabilityRef,
      actorOrCompositionRef,
      workUnitRef: input.workUnit.workUnitRef,
      assignmentDigest: input.assignment.assignmentDigest,
      executionReceiptRef: input.execution.receiptRef,
      verifiedEffectRef: input.verifiedEffect.effectRef,
      evidenceRefs: stableUnique(input.evidenceRefs),
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
  observedStateRef: string;
  observedPerformance: Required<Pick<CapabilityObservedPerformanceV1, "inputQuantity" | "outputQuantity" | "acceptedQuantity" | "reworkQuantity">>;
}): { outcome: CapabilityOutcomeV1; remainingWork?: RemainingWorkProposalV1 } {
  const { workUnit, requiredQuantity, observedPerformance, observedStateRef } = input;
  assertCapabilityObservedPerformanceV1(observedPerformance);
  if (!Number.isInteger(requiredQuantity) || requiredQuantity < 0) {
    throw new Error("work_capability_outcome_quantity_invalid");
  }
  if (!observedStateRef.trim()) throw new Error("work_capability_observed_state_required");

  const requiredFirstPassQuality = workUnit.qualityThresholds.firstPassQuality ?? 0;
  const firstPassQuality = observedPerformance.outputQuantity === 0
    ? 0
    : observedPerformance.acceptedQuantity / observedPerformance.outputQuantity;
  const qualityMet = firstPassQuality >= requiredFirstPassQuality;
  const quantityMet = observedPerformance.outputQuantity >= requiredQuantity;
  const stateMet = observedStateRef === workUnit.requiredOutputStateRef;
  const state: CapabilityOutcomeV1["state"] =
    stateMet && quantityMet && qualityMet
      ? "FULL_EFFECT"
      : stateMet && observedPerformance.outputQuantity > 0 && qualityMet
        ? "PARTIAL_EFFECT"
        : "FAILED_EFFECT";

  const outcomeIdentity = JSON.stringify({
    workUnitRef: workUnit.workUnitRef,
    requiredQuantity,
    observedPerformance,
    firstPassQuality,
    requiredFirstPassQuality,
    requiredOutputStateRef: workUnit.requiredOutputStateRef,
    observedStateRef,
    stateMet,
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
    requiredOutputStateRef: workUnit.requiredOutputStateRef,
    observedStateRef,
    stateMet,
  };
  if (state !== "PARTIAL_EFFECT" || observedPerformance.outputQuantity >= requiredQuantity) {
    return { outcome };
  }
  const remainingQuantity = requiredQuantity - observedPerformance.outputQuantity;
  return {
    outcome,
    remainingWork: {
      proposalRef: `REMAINING-WORK:${digest(`${workUnit.workUnitRef}|${outcome.outcomeRef}|${remainingQuantity}`).slice(0, 24)}`,
      workUnitRef: workUnit.workUnitRef,
      remainingQuantity,
      reasonCode: "QUANTITY_SHORTFALL",
      automaticExecutionAllowed: false,
    },
  };
}
