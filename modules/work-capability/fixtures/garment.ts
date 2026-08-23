import { createHash } from "node:crypto";

import type {
  ResolvedDeviceSecurityContextV1,
  SynnergyzeExecutionReceiptV1,
} from "../../synnergyze/contracts.ts";
import {
  EffectVerificationServiceV1,
  type EffectVerificationSuccessV1,
  type PostExecutionObservationV1,
} from "../../synnergyze/effect-verification.ts";
import type {
  SyntheticCapabilityAdapterInputV1,
  SyntheticCapabilityAdapterResultV1,
  SyntheticCapabilityAdapterV1,
} from "../../synnergyze/execution-gate.ts";
import type {
  WardenDecisionRequestV1,
  WardenExecutionCheckpointStateV1,
} from "../../warden/contracts.ts";
import { SyntheticWardenExecutionCheckpointServiceV1 } from "../../warden/checkpoint-service.ts";
import type { SyntheticWardenDecisionPolicyV1 } from "../../warden/decision-service.ts";
import type {
  ActorCapabilityProfileV1,
  CandidateCompositionV1,
  CapabilityEvidenceV1,
  CapabilityOutcomeV1,
  RemainingWorkProposalV1,
  WorkAssignmentV1,
  WorkUnitV1,
} from "../contracts.ts";
import { projectProfileBoundCapabilityEvidenceV1 } from "../evidence.ts";
import {
  executeAssignedWorkUnitV1,
  reconcileWorkUnitOutcomeV1,
  type AssignedWorkExecutionInputV1,
} from "../runtime.ts";

const CAPABILITY_REF = "garment.waistband.attach";
const TARGET_REF = "GARMENT-BATCH:B124:waistband";
const CORRELATION_ID = "WORK-CAPABILITY-CORR:B124-WAISTBAND-R01";
const WORKFLOW_REF = "WORKFLOW:B124:R0.1";
const WORK_UNIT_REF = "WORK-UNIT:B124:09";
const COMPOSITION_REF = "COMPOSITION:P17-M04-A2";
const MACHINE_ASSET_REF = "GENESIS-ASSET:LOCKSTITCH-M04";
const DEVICE_SECURITY_POLICY_REF = "POLICY:DEVICE-SECURITY:LOCKSTITCH-R0.1";
const DEVICE_SECURITY_EVIDENCE_REF = "DEVICE-SECURITY-EVIDENCE:M04:CURRENT";

const REQUESTED_AT = "2026-08-24T00:30:00.000Z";
const DEVICE_RESOLVED_AT = "2026-08-24T00:30:05.000Z";
const DECIDED_AT = "2026-08-24T00:30:10.000Z";
const RESERVED_AT = "2026-08-24T00:30:20.000Z";
const CHECKED_AT = "2026-08-24T00:30:25.000Z";
const EXECUTED_AT = "2026-08-24T00:30:30.000Z";
const OBSERVED_AT = "2026-08-24T00:30:40.000Z";
const VERIFIED_AT = "2026-08-24T00:30:50.000Z";
const SECURITY_VALID_UNTIL = "2026-08-24T00:35:00.000Z";
const CAPABILITY_EVIDENCE_VALID_UNTIL = "2026-08-24T00:40:00.000Z";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface SyntheticGarmentBatchStateV1 {
  batchRef: string;
  inputQuantity: number;
  processedQuantity: number;
  stateRef: string;
}

export interface SyntheticGarmentPerformanceInputV1 {
  inputQuantity: number;
  acceptedQuantity: number;
  reworkQuantity: number;
}

export interface VerifiedWaistbandFixtureResultV1 {
  workUnit: WorkUnitV1;
  assignment: WorkAssignmentV1;
  execution: SynnergyzeExecutionReceiptV1;
  observation: PostExecutionObservationV1;
  verification: EffectVerificationSuccessV1;
  capabilityEvidence: readonly CapabilityEvidenceV1[];
  outcome: CapabilityOutcomeV1;
  remainingWork?: RemainingWorkProposalV1;
}

export class SyntheticGarmentWorkAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-GARMENT-WAISTBAND-ADAPTER-001";
  readonly capabilityRef = CAPABILITY_REF;
  private invocations = 0;
  private readonly initialFingerprintMaterial: {
    batchRef: string;
    inputQuantity: number;
    stateRef: string;
  };

  constructor(private readonly batch: SyntheticGarmentBatchStateV1) {
    this.initialFingerprintMaterial = {
      batchRef: batch.batchRef,
      inputQuantity: batch.inputQuantity,
      stateRef: batch.stateRef,
    };
  }

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("garment_adapter_capability_mismatch");
    }
    if (input.action.targetRef !== TARGET_REF) {
      throw new Error("garment_adapter_target_mismatch");
    }
    if (this.batch.stateRef !== "GARMENT-STATE:back_assembled") {
      throw new Error("garment_adapter_input_state_mismatch");
    }
    if (this.batch.processedQuantity !== 0) {
      throw new Error("garment_batch_already_processed");
    }

    this.invocations += 1;
    this.batch.processedQuantity = this.batch.inputQuantity;
    this.batch.stateRef = "GARMENT-STATE:waistband_attached";

    return {
      adapterResultRef: `SYNTHETIC-GARMENT-WAISTBAND:${digest(
        `${input.action.actionRef}|${this.batch.batchRef}|${this.batch.processedQuantity}|${this.batch.stateRef}`,
      ).slice(0, 24)}`,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }

  fingerprintMaterial(): unknown {
    return { ...this.initialFingerprintMaterial };
  }

  currentStateRef(): string {
    return this.batch.stateRef;
  }
}

function workUnit(): WorkUnitV1 {
  return {
    workUnitRef: WORK_UNIT_REF,
    objectiveRef: "OBJECTIVE:B124",
    workflowRef: WORKFLOW_REF,
    stageRef: "WORK-STAGE:B124:09:waistband",
    action: "attach_waistband",
    targetRef: TARGET_REF,
    inputStateRef: "GARMENT-STATE:back_assembled",
    requiredOutputStateRef: "GARMENT-STATE:waistband_attached",
    requiredCapabilityRefs: [CAPABILITY_REF],
    requiredContext: { materialFamily: "denim" },
    qualityThresholds: { firstPassQuality: 0.97 },
    deadline: "2026-08-30T12:30:00.000Z",
    riskClass: "R2",
    requiredEvidenceRefs: [`EVIDENCE-REQUIREMENT:${CAPABILITY_REF}`],
    correlationId: CORRELATION_ID,
  };
}

function composition(): CandidateCompositionV1 {
  return {
    compositionRef: COMPOSITION_REF,
    workUnitRef: WORK_UNIT_REF,
    actorRefs: [
      "HUMAN:OPERATOR-P17",
      "AGENT:WORK-INSTRUCTION-A2",
      "MACHINE:LOCKSTITCH-M04",
    ],
    capabilityRefs: [CAPABILITY_REF],
    eligible: true,
    evidenceConfidence: 0.97,
    expectedFirstPassQuality: 0.985,
    expectedCycleSeconds: 41.7,
  };
}

function actorProfiles(): readonly ActorCapabilityProfileV1[] {
  return [
    {
      actorRef: "HUMAN:OPERATOR-P17",
      actorClass: "HUMAN",
      capabilityRefs: [CAPABILITY_REF],
      context: { materialFamily: "denim", role: "operator" },
      evidenceRefs: ["CAPABILITY-EVIDENCE:P17:WAISTBAND:CURRENT"],
      evidenceState: "CURRENT",
      evidenceValidUntil: CAPABILITY_EVIDENCE_VALID_UNTIL,
      available: true,
    },
    {
      actorRef: "AGENT:WORK-INSTRUCTION-A2",
      actorClass: "AGENT",
      capabilityRefs: ["garment.work_instruction.assist"],
      context: { domain: "garment-production", materialFamily: "denim" },
      evidenceRefs: ["CAPABILITY-EVIDENCE:A2:WORK-INSTRUCTION:CURRENT"],
      evidenceState: "CURRENT",
      evidenceValidUntil: CAPABILITY_EVIDENCE_VALID_UNTIL,
      available: true,
      implementationRef: "WORK-INSTRUCTION-AGENT-A2",
      versionRef: "A2-R1",
    },
    {
      actorRef: "MACHINE:LOCKSTITCH-M04",
      actorClass: "MACHINE",
      capabilityRefs: [CAPABILITY_REF],
      context: { machineClass: "lockstitch", materialFamily: "denim" },
      evidenceRefs: ["CAPABILITY-EVIDENCE:M04:LOCKSTITCH:CURRENT"],
      evidenceState: "CURRENT",
      evidenceValidUntil: CAPABILITY_EVIDENCE_VALID_UNTIL,
      available: true,
      assetRef: MACHINE_ASSET_REF,
    },
  ];
}

function request(): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:WORK:B124:WAISTBAND:P17-M04-A2",
    actorRef: "HUMAN:OPERATOR-P17",
    representedPrincipalRef: "ORG:DDB-01",
    actingCapacityRef: COMPOSITION_REF,
    contextRef: "LOCATION:DDB-SYNTHETIC-01",
    programRef: WORKFLOW_REF,
    eventRef: WORK_UNIT_REF,
    action: "attach_waistband",
    capabilityRef: CAPABILITY_REF,
    targetRef: TARGET_REF,
    requestedEffect: "GARMENT-STATE:waistband_attached",
    executionDeviceRef: MACHINE_ASSET_REF,
    deviceSecurityState: "ACTIVE",
    deviceSecurityPolicyRef: DEVICE_SECURITY_POLICY_REF,
    deviceSecuritySourceRefs: [DEVICE_SECURITY_EVIDENCE_REF],
    deviceSecurityResolvedAt: DEVICE_RESOLVED_AT,
    deviceSecurityValidUntil: SECURITY_VALID_UNTIL,
    authorityRefs: ["AUTHORITY:DDB-SYNTHETIC-PRODUCTION-001"],
    policyRefs: ["POLICY:WORK-CAPABILITY-R0.1"],
    representationSourceRefs: [
      "REGISTRY:REPRESENTATION:P17:DDB-01",
      `COMPOSITE-CAPABILITY:${COMPOSITION_REF}`,
    ],
    requestedAt: REQUESTED_AT,
    correlationId: CORRELATION_ID,
  };
}

function deviceSecurity(): ResolvedDeviceSecurityContextV1 {
  return {
    resolutionRef: "DEVICE-SECURITY-RESOLUTION:M04:CURRENT",
    deviceRef: MACHINE_ASSET_REF,
    state: "ACTIVE",
    policyRef: DEVICE_SECURITY_POLICY_REF,
    evidenceRef: DEVICE_SECURITY_EVIDENCE_REF,
    assuranceLevel: "L2",
    resolvedAt: DEVICE_RESOLVED_AT,
    validUntil: SECURITY_VALID_UNTIL,
  };
}

function policy(
  decisionMode: "ALLOW" | "DENY" | "ESCALATE" = "ALLOW",
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: `WARDEN-POLICY-SNAPSHOT:WORK-CAPABILITY:${decisionMode}`,
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-24T00:25:00.000Z",
    validUntil: "2026-08-24T00:35:00.000Z",
    actorRef: "HUMAN:OPERATOR-P17",
    representedPrincipalRef: "ORG:DDB-01",
    actingCapacityRef: COMPOSITION_REF,
    contextRef: "LOCATION:DDB-SYNTHETIC-01",
    programRef: WORKFLOW_REF,
    requiredAuthorityRefs: ["AUTHORITY:DDB-SYNTHETIC-PRODUCTION-001"],
    requiredPolicyRefs: ["POLICY:WORK-CAPABILITY-R0.1"],
    allowedCapabilityRefs: decisionMode === "ALLOW" ? [CAPABILITY_REF] : [],
    manualReviewCapabilityRefs: decisionMode === "ESCALATE" ? [CAPABILITY_REF] : [],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
  };
}

function fixture(
  decisionMode: "ALLOW" | "DENY" | "ESCALATE",
  inputQuantity = 500,
  initialStateRef = "GARMENT-STATE:back_assembled",
  checkpointState: WardenExecutionCheckpointStateV1 = "VALID",
): AssignedWorkExecutionInputV1 {
  const batch: SyntheticGarmentBatchStateV1 = {
    batchRef: "GARMENT-BATCH:B124",
    inputQuantity,
    processedQuantity: 0,
    stateRef: initialStateRef,
  };
  const adapter = new SyntheticGarmentWorkAdapterV1(batch);
  return {
    workUnit: workUnit(),
    composition: composition(),
    actorProfiles: actorProfiles(),
    request: request(),
    policy: policy(decisionMode),
    checkpointSource: new SyntheticWardenExecutionCheckpointServiceV1(checkpointState),
    executionDeviceSecurity: deviceSecurity(),
    adapter,
    decidedAt: DECIDED_AT,
    reservedAt: RESERVED_AT,
    checkedAt: CHECKED_AT,
    executedAt: EXECUTED_AT,
  };
}

export function observeSyntheticGarmentWorkV1(input: {
  execution: SynnergyzeExecutionReceiptV1;
  performance: SyntheticGarmentPerformanceInputV1;
  observedAt: string;
  observedStateRef?: string;
}): PostExecutionObservationV1 {
  const { execution, performance, observedAt } = input;
  const outputQuantity = performance.acceptedQuantity + performance.reworkQuantity;
  if (
    !Number.isInteger(performance.inputQuantity) ||
    !Number.isInteger(performance.acceptedQuantity) ||
    !Number.isInteger(performance.reworkQuantity) ||
    performance.inputQuantity < 0 ||
    performance.acceptedQuantity < 0 ||
    performance.reworkQuantity < 0 ||
    outputQuantity > performance.inputQuantity
  ) {
    throw new Error("garment_observation_quantity_invalid");
  }
  const observedStateRef = input.observedStateRef ??
    (outputQuantity > 0 ? "GARMENT-STATE:waistband_attached" : "GARMENT-STATE:back_assembled");
  const sourceEvidenceRef = `SYNTHETIC-GARMENT-EVIDENCE:${digest(JSON.stringify({
    executionReceiptRef: execution.receiptRef,
    inputQuantity: performance.inputQuantity,
    outputQuantity,
    acceptedQuantity: performance.acceptedQuantity,
    reworkQuantity: performance.reworkQuantity,
    observedStateRef,
    observedAt,
  })).slice(0, 24)}`;
  return {
    observationRef: `POST-EXECUTION-OBSERVATION:${digest(`${execution.receiptRef}|${sourceEvidenceRef}|${observedStateRef}`).slice(0, 24)}`,
    executionReceiptRef: execution.receiptRef,
    actionRef: execution.actionRef,
    programRef: execution.programRef,
    eventRef: execution.eventRef,
    targetRef: execution.targetRef,
    correlationId: execution.correlationId,
    observerRef: "SYNTHETIC-GARMENT-WAISTBAND-OBSERVER-001",
    observedStateRef,
    observedAt,
    sourceEvidenceRef,
    synthetic: true,
  };
}

export function validWaistbandFixtureV1(): AssignedWorkExecutionInputV1 {
  return fixture("ALLOW");
}

export function mutatedWaistbandFixtureV1(): AssignedWorkExecutionInputV1 {
  return fixture("ALLOW", 499);
}

export function wrongInputStateWaistbandFixtureV1(): AssignedWorkExecutionInputV1 {
  return fixture("ALLOW", 500, "GARMENT-STATE:front_assembled");
}

export function revokedCheckpointWaistbandFixtureV1(): AssignedWorkExecutionInputV1 {
  return fixture("ALLOW", 500, "GARMENT-STATE:back_assembled", "REVOKED");
}

export function invalidWardenWaistbandFixtureV1(
  decision: "DENY" | "ESCALATE",
): AssignedWorkExecutionInputV1 {
  return fixture(decision);
}

export function runVerifiedWaistbandFixtureV1(
  performance: SyntheticGarmentPerformanceInputV1,
  observedStateRef = "GARMENT-STATE:waistband_attached",
): VerifiedWaistbandFixtureResultV1 {
  const executionInput = fixture("ALLOW", performance.inputQuantity);
  const proof = executeAssignedWorkUnitV1(executionInput);
  const observation = observeSyntheticGarmentWorkV1({
    execution: proof.execution,
    performance,
    observedAt: OBSERVED_AT,
    observedStateRef,
  });
  const verificationResult = new EffectVerificationServiceV1().verify({
    receipt: proof.execution,
    observation,
    verifiedAt: VERIFIED_AT,
  });
  if (verificationResult.state !== "VERIFIED_EFFECT") {
    throw new Error(`garment_effect_verification_failed:${verificationResult.reasonCode}`);
  }
  const outputQuantity = performance.acceptedQuantity + performance.reworkQuantity;
  const firstPassQuality = outputQuantity === 0 ? 0 : performance.acceptedQuantity / outputQuantity;
  const observedPerformance = {
    inputQuantity: performance.inputQuantity,
    outputQuantity,
    acceptedQuantity: performance.acceptedQuantity,
    reworkQuantity: performance.reworkQuantity,
    firstPassQuality,
    cycleSeconds: executionInput.composition.expectedCycleSeconds,
  };
  const capabilityEvidence = projectProfileBoundCapabilityEvidenceV1({
    workUnit: executionInput.workUnit,
    assignment: proof.assignment,
    actorProfiles: executionInput.actorProfiles,
    capabilityRef: CAPABILITY_REF,
    execution: proof.execution,
    verifiedEffect: verificationResult.effect,
    observedPerformance,
    evidenceRefs: [observation.sourceEvidenceRef, verificationResult.effect.verificationRef],
    observedAt: observation.observedAt,
  });
  const reconciled = reconcileWorkUnitOutcomeV1({
    workUnit: executionInput.workUnit,
    requiredQuantity: performance.inputQuantity,
    observedStateRef: verificationResult.effect.observedStateRef,
    observedPerformance: {
      inputQuantity: performance.inputQuantity,
      outputQuantity,
      acceptedQuantity: performance.acceptedQuantity,
      reworkQuantity: performance.reworkQuantity,
    },
  });
  return {
    workUnit: executionInput.workUnit,
    assignment: proof.assignment,
    execution: proof.execution,
    observation,
    verification: verificationResult,
    capabilityEvidence,
    outcome: reconciled.outcome,
    remainingWork: reconciled.remainingWork,
  };
}
