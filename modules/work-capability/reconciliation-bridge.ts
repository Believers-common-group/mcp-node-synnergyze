import { createHash } from "node:crypto";

import type { CausalTraceV1, EvidenceSealV1 } from "../river/contracts.ts";
import {
  validateExpectedEffectContractV1,
  type ExpectedEffectContractV1,
} from "../synnergyze/effect-expectation.ts";
import type { VerifiedEffectV1 } from "../synnergyze/effect-verification.ts";
import type { WorkUnitV1 } from "./contracts.ts";

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
