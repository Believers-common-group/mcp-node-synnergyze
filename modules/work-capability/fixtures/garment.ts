import { createHash } from "node:crypto";

import type { SynnergyzeExecutionReceiptV1 } from "../../synnergyze/contracts.ts";
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
import type { WardenDecisionRequestV1 } from "../../warden/contracts.ts";
import type { SyntheticWardenDecisionPolicyV1 } from "../../warden/decision-service.ts";
import type {
  ActorCapabilityProfileV1,
  CandidateCompositionV1,
  CapabilityEvidenceV1,
  CapabilityOutcomeV1,
  RemainingWorkProposalV1,
  WorkUnitV1,
} from "../contracts.ts";
import {
  executeAssignedWorkUnitV1,
  projectCapabilityEvidenceV1,
  reconcileWorkUnitOutcomeV1,
  type AssignedWorkExecutionInputV1,
} from "../runtime.ts";

const CAPABILITY_REF = "garment.waistband.attach";
const TARGET_REF = "GARMENT-BATCH:B124:waistband";
const CORRELATION_ID = "WORK-CAPABILITY-CORR:B124-WAISTBAND-R01";
const WORKFLOW_REF = "WORKFLOW:B124:R0.1";
const WORK_UNIT_REF = "WORK-UNIT:B124:09";
const COMPOSITION_REF = "COMPOSITION:P17-M04-A2";

const REQUESTED_AT = "2026-08-24T00:30:00.000Z";
const DECIDED_AT = "2026-08-24T00:30:10.000Z";
const RESERVED_AT = "2026-08-24T00:30:20.000Z";
const CHECKED_AT = "2026-08-24T00:30:25.000Z";
const EXECUTED_AT = "2026-08-24T00:30:30.000Z";
const OBSERVED_AT = "2026-08-24T00:30:40.000Z";
const VERIFIED_AT = "2026-08-24T00:30:50.000Z";

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
    if (this.batch.processedQuantity !== 0) {
      throw new Error("garment_batch_already_processed");
    }

    this.invocations += 1;
    this.batch.processedQuantity = this.batch.inputQuantity;
    this.batch.stateRef = "GARMENT-STATE:waistband_execution_complete";

    return {
      adapterResultRef: `SYNTHETIC-GARMENT-WAISTBAND:${digest(
        `${input.action.actionRef}|${this.batch.batchRef}|${this.batch.processedQuantity}`,
      ).slice(0, 24)}`,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }

  fingerprintMaterial(): unknown {
    return { ...this.initialFingerprintMaterial };
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
    qualityThresholds: { firstPassQuality: 0.97 },
    deadline: "2026-08-30T12:30:00.000Z",
    riskClass: "R2",
    requiredEvidenceRefs: ["EVIDENCE-REQUIREMENT:garment.waistband.attach"],
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
      available: true,
    },
    {
      actorRef: "AGENT:WORK-INSTRUCTION-A2",
      actorClass: "AGENT",
      capabilityRefs: ["garment.work_instruction.assist"],
      context: { domain: "garment-production" },
      evidenceRefs: ["CAPABILITY-EVIDENCE:A2:WORK-INSTRUCTION:CURRENT"],
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
      available: true,
      assetRef: "GENESIS-ASSET:LOCKSTITCH-M04",
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
): AssignedWorkExecutionInputV1 {
  const batch: SyntheticGarmentBatchStateV1 = {
    batchRef: "GARMENT-BATCH:B124",
    inputQuantity,
    processedQuantity: 0,
    stateRef: "GARMENT-STATE:back_assembled",
  };
  const adapter = new SyntheticGarmentWorkAdapterV1(batch);

  return {
    workUnit: workUnit(),
    composition: composition(),
    actorProfiles: actorProfiles(),
    request: request(),
    policy: policy(decisionMode),
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

  const observedStateRef = `GARMENT-WAISTBAND-OBSERVED:${digest(
    JSON.stringify({
      executionReceiptRef: execution.receiptRef,
      inputQuantity: performance.inputQuantity,
      outputQuantity,
      acceptedQuantity: performance.acceptedQuantity,
      reworkQuantity: performance.reworkQuantity,
    }),
  ).slice(0, 24)}`;
  const sourceEvidenceRef = `SYNTHETIC-GARMENT-EVIDENCE:${digest(
    `${execution.receiptRef}|${observedStateRef}|${observedAt}`,
  ).slice(0, 24)}`;

  return {
    observationRef: `POST-EXECUTION-OBSERVATION:${digest(
      `${execution.receiptRef}|${sourceEvidenceRef}`,
    ).slice(0, 24)}`,
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

export function invalidWardenWaistbandFixtureV1(
  decision: "DENY" | "ESCALATE",
): AssignedWorkExecutionInputV1 {
  return fixture(decision);
}

export function runVerifiedWaistbandFixtureV1(
  performance: SyntheticGarmentPerformanceInputV1,
): VerifiedWaistbandFixtureResultV1 {
  const executionInput = fixture("ALLOW", performance.inputQuantity);
  const proof = executeAssignedWorkUnitV1(executionInput);
  const observation = observeSyntheticGarmentWorkV1({
    execution: proof.execution,
    performance,
    observedAt: OBSERVED_AT,
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
  const firstPassQuality =
    outputQuantity === 0 ? 0 : performance.acceptedQuantity / outputQuantity;
  const observedPerformance = {
    inputQuantity: performance.inputQuantity,
    outputQuantity,
    acceptedQuantity: performance.acceptedQuantity,
    reworkQuantity: performance.reworkQuantity,
    firstPassQuality,
    cycleSeconds: executionInput.composition.expectedCycleSeconds,
  };
  const capabilityEvidence = projectCapabilityEvidenceV1({
    workUnit: executionInput.workUnit,
    assignment: proof.assignment,
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
    observedPerformance: {
      inputQuantity: performance.inputQuantity,
      outputQuantity,
      acceptedQuantity: performance.acceptedQuantity,
      reworkQuantity: performance.reworkQuantity,
    },
  });

  return {
    execution: proof.execution,
    observation,
    verification: verificationResult,
    capabilityEvidence,
    outcome: reconciled.outcome,
    remainingWork: reconciled.remainingWork,
  };
}
