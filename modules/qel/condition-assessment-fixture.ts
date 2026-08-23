import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import type { SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";
import {
  makeSyntheticRecoveryValueAssessmentV01,
  type RecoveryConditionGradeV01,
  type SyntheticRecoveryValueAssessmentV01,
} from "./recovery-value-policy-fixture.ts";

export const QEL_FIXTURE_007_REF = "QEL-FIXTURE-007" as const;
export const VSR_QEL_CONDITION_ASSESSMENT_VERSION =
  "VSR-QEL-CONDITION-ASSESSMENT-001/0.1" as const;
export const QEL_CONDITION_ASSESSMENT_ADAPTER_REF =
  "QEL-ADAPTER-CONDITION-ASSESSMENT-001" as const;
export const QEL_CONDITION_ASSESSMENT_ADAPTER_VERSION = "0.1.0" as const;

export type ConditionContaminationV01 = "NONE" | "CLEANABLE" | "HAZARDOUS";
export type ConditionRepairabilityV01 = "REPAIRABLE" | "MARGINAL" | "NOT_REPAIRABLE";

export interface ConditionInferenceV01 {
  label: string;
  confidence: number;
  modelRef: string;
  modelVersion: string;
  evidenceRef: string;
}

export interface SyntheticConditionObservationV01 {
  assessmentRef: string;
  registryRef: string;
  observedAt: string;
  correlationId: string;
  recoveryNodeRef: string;
  assetRef: string;
  passportCycleRef: string;
  identityMatched: boolean;
  contamination: ConditionContaminationV01;
  maximumTearLengthMm: number;
  seamFailureCount: number;
  stainAreaBps: number;
  abrasionAreaBps: number;
  hardwareMissingCount: number;
  dimensionalDeviationBps: number;
  materialIntegrityBps: number;
  estimatedRepairCostMinor: number;
  referenceResidualValueMinor: number;
  evidenceSourceRefs: readonly string[];
  inferences: readonly ConditionInferenceV01[];
  synthetic: true;
}

export type ConditionAssessmentIssueV01 =
  | "assessment_ref_missing"
  | "registry_ref_missing"
  | "observed_at_invalid"
  | "correlation_id_missing"
  | "recovery_node_ref_missing"
  | "asset_ref_missing"
  | "passport_cycle_ref_missing"
  | "identity_mismatch"
  | "recovery_identity_mismatch"
  | "passport_identity_mismatch"
  | "evidence_missing"
  | "measurement_invalid"
  | "inference_metadata_invalid";

export type ConditionGradeReasonV01 =
  | "HAZARDOUS_CONTAMINATION"
  | "MATERIAL_INTEGRITY_CRITICAL"
  | "TEAR_CRITICAL"
  | "REPAIR_COST_EXCEEDS_RESIDUAL"
  | "MATERIAL_INTEGRITY_POOR"
  | "TEAR_MAJOR"
  | "SEAM_FAILURES_MAJOR"
  | "STAIN_MAJOR"
  | "ABRASION_MAJOR"
  | "HARDWARE_LOSS_MAJOR"
  | "DIMENSIONAL_DEVIATION_MAJOR"
  | "MATERIAL_INTEGRITY_MODERATE"
  | "TEAR_MODERATE"
  | "SEAM_FAILURES_MODERATE"
  | "STAIN_MODERATE"
  | "ABRASION_MODERATE"
  | "HARDWARE_LOSS_MODERATE"
  | "DIMENSIONAL_DEVIATION_MODERATE"
  | "CLEANABLE_CONTAMINATION"
  | "TEAR_MINOR"
  | "SEAM_FAILURE_MINOR"
  | "STAIN_MINOR"
  | "ABRASION_MINOR"
  | "HARDWARE_LOSS_MINOR"
  | "DIMENSIONAL_DEVIATION_MINOR"
  | "NO_MATERIAL_DEFECT";

export interface ConditionAssessmentResultV01 {
  contractVersion: typeof VSR_QEL_CONDITION_ASSESSMENT_VERSION;
  ok: boolean;
  issues: readonly ConditionAssessmentIssueV01[];
  grade?: RecoveryConditionGradeV01;
  repairability?: ConditionRepairabilityV01;
  gradeReasons: readonly ConditionGradeReasonV01[];
  referenceResidualValueMinor?: number;
  epistemicSummary: {
    factCount: number;
    derivedCount: number;
    inferenceCount: number;
    inferenceUsedForCanonicalGrade: false;
  };
}

const BPS_MAX = 10_000;

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isBps(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= BPS_MAX;
}

function validateInference(inference: ConditionInferenceV01): boolean {
  return (
    Boolean(inference.label.trim()) &&
    Number.isFinite(inference.confidence) &&
    inference.confidence >= 0 &&
    inference.confidence <= 1 &&
    Boolean(inference.modelRef.trim()) &&
    Boolean(inference.modelVersion.trim()) &&
    Boolean(inference.evidenceRef.trim())
  );
}

function deriveRepairability(observation: SyntheticConditionObservationV01): ConditionRepairabilityV01 {
  if (
    observation.contamination === "HAZARDOUS" ||
    observation.materialIntegrityBps < 4_000 ||
    observation.maximumTearLengthMm > 200 ||
    (observation.referenceResidualValueMinor > 0 &&
      observation.estimatedRepairCostMinor > observation.referenceResidualValueMinor)
  ) {
    return "NOT_REPAIRABLE";
  }

  if (
    observation.materialIntegrityBps < 6_000 ||
    observation.maximumTearLengthMm > 100 ||
    observation.seamFailureCount >= 4 ||
    observation.estimatedRepairCostMinor * 2 > observation.referenceResidualValueMinor
  ) {
    return "MARGINAL";
  }

  return "REPAIRABLE";
}

function gradeFromFacts(observation: SyntheticConditionObservationV01): {
  grade: RecoveryConditionGradeV01;
  reasons: ConditionGradeReasonV01[];
} {
  const scrapReasons: ConditionGradeReasonV01[] = [];
  if (observation.contamination === "HAZARDOUS") scrapReasons.push("HAZARDOUS_CONTAMINATION");
  if (observation.materialIntegrityBps < 4_000) scrapReasons.push("MATERIAL_INTEGRITY_CRITICAL");
  if (observation.maximumTearLengthMm > 200) scrapReasons.push("TEAR_CRITICAL");
  if (
    observation.referenceResidualValueMinor > 0 &&
    observation.estimatedRepairCostMinor > observation.referenceResidualValueMinor
  ) {
    scrapReasons.push("REPAIR_COST_EXCEEDS_RESIDUAL");
  }
  if (scrapReasons.length > 0) return { grade: "SCRAP", reasons: scrapReasons };

  const dReasons: ConditionGradeReasonV01[] = [];
  if (observation.materialIntegrityBps < 6_000) dReasons.push("MATERIAL_INTEGRITY_POOR");
  if (observation.maximumTearLengthMm > 100) dReasons.push("TEAR_MAJOR");
  if (observation.seamFailureCount >= 4) dReasons.push("SEAM_FAILURES_MAJOR");
  if (observation.stainAreaBps > 2_500) dReasons.push("STAIN_MAJOR");
  if (observation.abrasionAreaBps > 3_000) dReasons.push("ABRASION_MAJOR");
  if (observation.hardwareMissingCount >= 3) dReasons.push("HARDWARE_LOSS_MAJOR");
  if (observation.dimensionalDeviationBps > 800) dReasons.push("DIMENSIONAL_DEVIATION_MAJOR");
  if (dReasons.length > 0) return { grade: "D", reasons: dReasons };

  const cReasons: ConditionGradeReasonV01[] = [];
  if (observation.materialIntegrityBps < 7_500) cReasons.push("MATERIAL_INTEGRITY_MODERATE");
  if (observation.maximumTearLengthMm > 50) cReasons.push("TEAR_MODERATE");
  if (observation.seamFailureCount >= 2) cReasons.push("SEAM_FAILURES_MODERATE");
  if (observation.stainAreaBps > 1_200) cReasons.push("STAIN_MODERATE");
  if (observation.abrasionAreaBps > 1_800) cReasons.push("ABRASION_MODERATE");
  if (observation.hardwareMissingCount >= 2) cReasons.push("HARDWARE_LOSS_MODERATE");
  if (observation.dimensionalDeviationBps > 500) cReasons.push("DIMENSIONAL_DEVIATION_MODERATE");
  if (cReasons.length > 0) return { grade: "C", reasons: cReasons };

  const bReasons: ConditionGradeReasonV01[] = [];
  if (observation.contamination === "CLEANABLE") bReasons.push("CLEANABLE_CONTAMINATION");
  if (observation.maximumTearLengthMm > 0) bReasons.push("TEAR_MINOR");
  if (observation.seamFailureCount > 0) bReasons.push("SEAM_FAILURE_MINOR");
  if (observation.stainAreaBps > 0) bReasons.push("STAIN_MINOR");
  if (observation.abrasionAreaBps > 0) bReasons.push("ABRASION_MINOR");
  if (observation.hardwareMissingCount > 0) bReasons.push("HARDWARE_LOSS_MINOR");
  if (observation.dimensionalDeviationBps > 0) bReasons.push("DIMENSIONAL_DEVIATION_MINOR");
  if (bReasons.length > 0) return { grade: "B", reasons: bReasons };

  return { grade: "A", reasons: ["NO_MATERIAL_DEFECT"] };
}

export function assessConditionV01(input: {
  observation: SyntheticConditionObservationV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): ConditionAssessmentResultV01 {
  const { observation, recovery, passport } = input;
  const issues: ConditionAssessmentIssueV01[] = [];

  if (!observation.assessmentRef.trim()) issues.push("assessment_ref_missing");
  if (!observation.registryRef.trim()) issues.push("registry_ref_missing");
  if (!isIsoDate(observation.observedAt)) issues.push("observed_at_invalid");
  if (!observation.correlationId.trim()) issues.push("correlation_id_missing");
  if (!observation.recoveryNodeRef.trim()) issues.push("recovery_node_ref_missing");
  if (!observation.assetRef.trim()) issues.push("asset_ref_missing");
  if (!observation.passportCycleRef.trim()) issues.push("passport_cycle_ref_missing");
  if (!observation.identityMatched) issues.push("identity_mismatch");
  if (
    observation.recoveryNodeRef !== recovery.nodeRef ||
    observation.assetRef !== recovery.assetRef ||
    observation.passportCycleRef !== recovery.passportCycleRef
  ) {
    issues.push("recovery_identity_mismatch");
  }
  if (observation.assetRef !== passport.assetRef || observation.passportCycleRef !== passport.cycleRef) {
    issues.push("passport_identity_mismatch");
  }
  if (observation.evidenceSourceRefs.length === 0) issues.push("evidence_missing");
  if (
    !isNonNegativeInteger(observation.maximumTearLengthMm) ||
    !isNonNegativeInteger(observation.seamFailureCount) ||
    !isBps(observation.stainAreaBps) ||
    !isBps(observation.abrasionAreaBps) ||
    !isNonNegativeInteger(observation.hardwareMissingCount) ||
    !isBps(observation.dimensionalDeviationBps) ||
    !isBps(observation.materialIntegrityBps) ||
    !isNonNegativeInteger(observation.estimatedRepairCostMinor) ||
    !isNonNegativeInteger(observation.referenceResidualValueMinor)
  ) {
    issues.push("measurement_invalid");
  }
  if (observation.inferences.some((inference) => !validateInference(inference))) {
    issues.push("inference_metadata_invalid");
  }

  const epistemicSummary = {
    factCount: 12 + observation.evidenceSourceRefs.length,
    derivedCount: 2,
    inferenceCount: observation.inferences.length,
    inferenceUsedForCanonicalGrade: false as const,
  };

  if (issues.length > 0) {
    return {
      contractVersion: VSR_QEL_CONDITION_ASSESSMENT_VERSION,
      ok: false,
      issues,
      gradeReasons: [],
      epistemicSummary,
    };
  }

  const grading = gradeFromFacts(observation);
  return {
    contractVersion: VSR_QEL_CONDITION_ASSESSMENT_VERSION,
    ok: true,
    issues: [],
    grade: grading.grade,
    repairability: deriveRepairability(observation),
    gradeReasons: grading.reasons,
    referenceResidualValueMinor: observation.referenceResidualValueMinor,
    epistemicSummary,
  };
}

export function mapConditionAssessmentToQelFrameV01(input: {
  observation: SyntheticConditionObservationV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): QelOperationalFrameV01 {
  const result = assessConditionV01(input);
  const hasEvidence = input.observation.evidenceSourceRefs.length > 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_007_REF}:${input.observation.assessmentRef}:${input.observation.correlationId}`,
    correlationId: input.observation.correlationId,
    observedAt: input.observation.observedAt,
    object: {
      id: input.observation.assessmentRef,
      type: "CONDITION_ASSESSMENT",
      class: "EVIDENCE_GROUNDED_PRODUCT_CONDITION",
      registryRef: input.observation.registryRef,
      locationRef: input.recovery.locationRef,
    },
    state: {
      value: result.ok ? "READY" : "BLOCKED",
      kind: "DERIVED",
      confidence: 1,
    },
    health: {
      value: result.ok ? "GOOD" : "ACT",
      kind: "DERIVED",
      confidence: 1,
    },
    flow: {
      state: result.ok ? "COMPLETE" : "BLOCKED",
      value: result.referenceResidualValueMinor,
      unit: "INR_MINOR_REFERENCE_RESIDUAL",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: result.ok
      ? { type: "APPROVAL", priority: "MODERATE", target: "create_recovery_value_quote" }
      : { type: "INFORMATION", priority: "HIGH", target: "resolve_condition_assessment" },
    risk: result.ok
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "CONDITION_ASSESSMENT_INVALID", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.observation.assessmentRef },
      {
        action: "REASSESS",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "condition.assessment.repeat",
        targetRef: input.observation.assetRef,
      },
      {
        action: "CREATE_VALUE_QUOTE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "recovery.value.assess",
        targetRef: input.observation.assetRef,
      },
    ],
    evidence: {
      status: hasEvidence ? "FRESH" : "MISSING",
      confidence: hasEvidence ? 1 : 0,
      freshness: {
        observedAt: input.observation.observedAt,
        ageMs: 0,
        status: hasEvidence ? "FRESH" : "MISSING",
        maximumValidAgeMs: 30_000,
      },
      sources: input.observation.evidenceSourceRefs.map((sourceRef) => ({
        sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: sourceRef,
      })),
    },
    outcome: result.ok ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_CONDITION_ASSESSMENT_FIXTURE",
      protocol: "DETERMINISTIC_RULE_FIXTURE",
      sourceRef: input.observation.assessmentRef,
      rawValue: {
        contractVersion: VSR_QEL_CONDITION_ASSESSMENT_VERSION,
        grade: result.grade,
        repairability: result.repairability,
        gradeReasons: result.gradeReasons,
        epistemicSummary: result.epistemicSummary,
        observations: {
          identityMatched: input.observation.identityMatched,
          contamination: input.observation.contamination,
          maximumTearLengthMm: input.observation.maximumTearLengthMm,
          seamFailureCount: input.observation.seamFailureCount,
          stainAreaBps: input.observation.stainAreaBps,
          abrasionAreaBps: input.observation.abrasionAreaBps,
          hardwareMissingCount: input.observation.hardwareMissingCount,
          dimensionalDeviationBps: input.observation.dimensionalDeviationBps,
          materialIntegrityBps: input.observation.materialIntegrityBps,
          estimatedRepairCostMinor: input.observation.estimatedRepairCostMinor,
          referenceResidualValueMinor: input.observation.referenceResidualValueMinor,
        },
        inferences: input.observation.inferences,
        issues: result.issues,
        synthetic: true,
      },
      adapterRef: QEL_CONDITION_ASSESSMENT_ADAPTER_REF,
      adapterVersion: QEL_CONDITION_ASSESSMENT_ADAPTER_VERSION,
    },
  };
}

export function makeRecoveryValueAssessmentFromConditionV01(input: {
  observation: SyntheticConditionObservationV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  beneficiaryRef: string;
  programmeIncentiveMinor?: number;
  environmentalIncentiveMinor?: number;
  environmentalEvidenceRef?: string;
  materialRecoveryValueMinor?: number;
  handlingDeductionMinor?: number;
}): SyntheticRecoveryValueAssessmentV01 {
  const result = assessConditionV01(input);
  if (!result.ok || !result.grade || result.referenceResidualValueMinor === undefined) {
    throw new Error(`condition_assessment_not_value_ready:${result.issues.join(",")}`);
  }
  if (!input.recovery.route) {
    throw new Error("condition_assessment_recovery_route_required");
  }

  return makeSyntheticRecoveryValueAssessmentV01({
    valuationRef: `RECOVERY-VALUE:${input.passport.assetRef}:${input.passport.cycleRef}`,
    registryRef: `GENESIS:RECOVERY-VALUE:${input.passport.assetRef}:${input.passport.cycleRef}`,
    observedAt: input.observation.observedAt,
    correlationId: input.observation.correlationId,
    recoveryNodeRef: input.recovery.nodeRef,
    assetRef: input.passport.assetRef,
    passportCycleRef: input.passport.cycleRef,
    beneficiaryRef: input.beneficiaryRef,
    conditionGrade: result.grade,
    route: input.recovery.route,
    assessmentRef: input.observation.assessmentRef,
    assessedResidualValueMinor: result.referenceResidualValueMinor,
    materialRecoveryValueMinor: input.materialRecoveryValueMinor ?? 0,
    programmeIncentiveMinor: input.programmeIncentiveMinor ?? 0,
    environmentalIncentiveMinor: input.environmentalIncentiveMinor ?? 0,
    environmentalEvidenceRef: input.environmentalEvidenceRef,
    handlingDeductionMinor: input.handlingDeductionMinor ?? 0,
    evidenceSourceRefs: input.observation.evidenceSourceRefs,
  });
}

export function buildConditionAssessmentPodPulseV01(input: {
  observation: SyntheticConditionObservationV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  podRef: string;
}): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observation.observedAt,
    frames: [mapConditionAssessmentToQelFrameV01(input)],
  });
}

export function makeSyntheticConditionObservationV01(
  overrides: Partial<SyntheticConditionObservationV01> = {},
): SyntheticConditionObservationV01 {
  return {
    assessmentRef: "ASSESSMENT:GARMENT-98F1:CYCLE-01",
    registryRef: "GENESIS:ASSESSMENT:GARMENT-98F1:CYCLE-01",
    observedAt: "2026-08-23T08:00:00.000Z",
    correlationId: "QEL-FIXTURE-007-CORR-001",
    recoveryNodeRef: "RECOVERY-NODE-BLR-001",
    assetRef: "GARMENT-98F1",
    passportCycleRef: "GARMENT-98F1:CYCLE-01",
    identityMatched: true,
    contamination: "NONE",
    maximumTearLengthMm: 0,
    seamFailureCount: 0,
    stainAreaBps: 0,
    abrasionAreaBps: 0,
    hardwareMissingCount: 0,
    dimensionalDeviationBps: 0,
    materialIntegrityBps: 9_500,
    estimatedRepairCostMinor: 0,
    referenceResidualValueMinor: 10_000,
    evidenceSourceRefs: ["SIM-VISION-001", "SIM-METROLOGY-001", "SIM-PASSPORT-MATCH-001"],
    inferences: [],
    synthetic: true,
    ...overrides,
  };
}
