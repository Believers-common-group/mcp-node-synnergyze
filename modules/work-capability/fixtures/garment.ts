import { createHash } from "node:crypto";

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
  WorkUnitV1,
} from "../contracts.ts";
import type { AssignedWorkExecutionInputV1 } from "../runtime.ts";

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

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface SyntheticGarmentBatchStateV1 {
  batchRef: string;
  inputQuantity: number;
  processedQuantity: number;
  stateRef: string;
}

export class SyntheticGarmentWorkAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-GARMENT-WAISTBAND-ADAPTER-001";
  readonly capabilityRef = CAPABILITY_REF;
  private invocations = 0;

  constructor(private readonly batch: SyntheticGarmentBatchStateV1) {}

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

function fixture(decisionMode: "ALLOW" | "DENY" | "ESCALATE"): AssignedWorkExecutionInputV1 {
  const batch: SyntheticGarmentBatchStateV1 = {
    batchRef: "GARMENT-BATCH:B124",
    inputQuantity: 500,
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

export function validWaistbandFixtureV1(): AssignedWorkExecutionInputV1 {
  return fixture("ALLOW");
}

export function invalidWardenWaistbandFixtureV1(
  decision: "DENY" | "ESCALATE",
): AssignedWorkExecutionInputV1 {
  return fixture(decision);
}
