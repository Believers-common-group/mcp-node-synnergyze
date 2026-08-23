import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import {
  makeSyntheticConditionObservationV01,
  type ConditionContaminationV01,
  type ConditionInferenceV01,
  type SyntheticConditionObservationV01,
} from "./condition-assessment-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import type { SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

export const QEL_FIXTURE_008_REF = "QEL-FIXTURE-008" as const;
export const VSR_QEL_CONDITION_EVIDENCE_CAPTURE_VERSION =
  "VSR-QEL-CONDITION-EVIDENCE-CAPTURE-001/0.1" as const;
export const QEL_CONDITION_EVIDENCE_ADAPTER_REF =
  "QEL-ADAPTER-CONDITION-EVIDENCE-001" as const;
export const QEL_CONDITION_EVIDENCE_ADAPTER_VERSION = "0.1.0" as const;

export type ConditionEvidenceModalityV01 =
  | "PASSPORT_READER"
  | "CAMERA"
  | "METROLOGY"
  | "MANUAL_INSPECTION"
  | "SYSTEM";

export type ConditionEvidenceSemanticV01 =
  | "IDENTITY_MATCHED"
  | "CONTAMINATION"
  | "MAX_TEAR_LENGTH_MM"
  | "SEAM_FAILURE_COUNT"
  | "STAIN_AREA_BPS"
  | "ABRASION_AREA_BPS"
  | "HARDWARE_MISSING_COUNT"
  | "DIMENSIONAL_DEVIATION_BPS"
  | "MATERIAL_INTEGRITY_BPS"
  | "ESTIMATED_REPAIR_COST_MINOR"
  | "REFERENCE_RESIDUAL_VALUE_MINOR";

export interface ConditionEvidenceSourceV01 {
  sourceRef: string;
  deviceRef: string;
  modality: ConditionEvidenceModalityV01;
  capturedAt: string;
  calibrationRequired: boolean;
  calibrationRef?: string;
  calibrationValidUntil?: string;
  firmwareRef?: string;
}

export interface ConditionEvidenceFactV01 {
  semanticId: ConditionEvidenceSemanticV01;
  value: number | string | boolean;
  unit: string;
  sourceRef: string;
  evidenceRef: string;
  kind: "FACT" | "DERIVED";
  derivationRef?: string;
}

export interface ConditionEvidenceModelInferenceV01 {
  label: string;
  confidence: number;
  modelRef: string;
  modelVersion: string;
  evidenceRef: string;
  sourceRef: string;
}

export interface SyntheticConditionEvidenceCaptureV01 {
  captureRef: string;
  registryRef: string;
  observedAt: string;
  correlationId: string;
  recoveryNodeRef: string;
  assetRef: string;
  passportCycleRef: string;
  currency: string;
  maximumEvidenceAgeMs: number;
  sources: readonly ConditionEvidenceSourceV01[];
  facts: readonly ConditionEvidenceFactV01[];
  inferences: readonly ConditionEvidenceModelInferenceV01[];
  synthetic: true;
}

export type ConditionEvidenceCaptureIssueV01 =
  | "capture_ref_missing"
  | "registry_ref_missing"
  | "observed_at_invalid"
  | "correlation_id_missing"
  | "identity_binding_mismatch"
  | "currency_invalid"
  | "maximum_evidence_age_invalid"
  | "source_ref_missing"
  | "source_device_ref_missing"
  | "source_time_invalid"
  | "source_from_future"
  | "source_stale"
  | "calibration_missing"
  | "calibration_expired"
  | "fact_missing"
  | "fact_duplicate"
  | "fact_source_unknown"
  | "fact_evidence_ref_missing"
  | "fact_unit_invalid"
  | "fact_value_invalid"
  | "derived_fact_derivation_missing"
  | "camera_fact_must_be_derived"
  | "semantic_source_incompatible"
  | "inference_metadata_invalid";

export interface ConditionEvidenceCaptureValidationV01 {
  ok: boolean;
  issues: readonly ConditionEvidenceCaptureIssueV01[];
}

const REQUIRED_SEMANTICS: readonly ConditionEvidenceSemanticV01[] = [
  "IDENTITY_MATCHED",
  "CONTAMINATION",
  "MAX_TEAR_LENGTH_MM",
  "SEAM_FAILURE_COUNT",
  "STAIN_AREA_BPS",
  "ABRASION_AREA_BPS",
  "HARDWARE_MISSING_COUNT",
  "DIMENSIONAL_DEVIATION_BPS",
  "MATERIAL_INTEGRITY_BPS",
  "ESTIMATED_REPAIR_COST_MINOR",
  "REFERENCE_RESIDUAL_VALUE_MINOR",
];

const METROLOGY_SEMANTICS = new Set<ConditionEvidenceSemanticV01>([
  "MAX_TEAR_LENGTH_MM",
  "DIMENSIONAL_DEVIATION_BPS",
  "MATERIAL_INTEGRITY_BPS",
]);

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isBps(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= 10_000;
}

function expectedUnit(semanticId: ConditionEvidenceSemanticV01, currency: string): string {
  switch (semanticId) {
    case "IDENTITY_MATCHED":
      return "BOOL";
    case "CONTAMINATION":
      return "ENUM";
    case "MAX_TEAR_LENGTH_MM":
      return "MM";
    case "SEAM_FAILURE_COUNT":
    case "HARDWARE_MISSING_COUNT":
      return "COUNT";
    case "STAIN_AREA_BPS":
    case "ABRASION_AREA_BPS":
    case "DIMENSIONAL_DEVIATION_BPS":
    case "MATERIAL_INTEGRITY_BPS":
      return "BPS";
    case "ESTIMATED_REPAIR_COST_MINOR":
    case "REFERENCE_RESIDUAL_VALUE_MINOR":
      return `${currency}_MINOR`;
  }
}

function validValue(fact: ConditionEvidenceFactV01): boolean {
  switch (fact.semanticId) {
    case "IDENTITY_MATCHED":
      return typeof fact.value === "boolean";
    case "CONTAMINATION":
      return ["NONE", "CLEANABLE", "HAZARDOUS"].includes(String(fact.value));
    case "STAIN_AREA_BPS":
    case "ABRASION_AREA_BPS":
    case "DIMENSIONAL_DEVIATION_BPS":
    case "MATERIAL_INTEGRITY_BPS":
      return isBps(fact.value);
    default:
      return isNonNegativeInteger(fact.value);
  }
}

function sourceCompatible(
  semanticId: ConditionEvidenceSemanticV01,
  modality: ConditionEvidenceModalityV01,
): boolean {
  if (semanticId === "IDENTITY_MATCHED") {
    return modality === "PASSPORT_READER" || modality === "SYSTEM";
  }
  if (semanticId === "ESTIMATED_REPAIR_COST_MINOR" || semanticId === "REFERENCE_RESIDUAL_VALUE_MINOR") {
    return modality === "SYSTEM" || modality === "MANUAL_INSPECTION";
  }
  if (METROLOGY_SEMANTICS.has(semanticId)) {
    return modality === "METROLOGY" || modality === "CAMERA";
  }
  return modality === "METROLOGY" || modality === "CAMERA" || modality === "MANUAL_INSPECTION";
}

function validateInference(inference: ConditionEvidenceModelInferenceV01, sourceRefs: Set<string>): boolean {
  return (
    Boolean(inference.label.trim()) &&
    Number.isFinite(inference.confidence) &&
    inference.confidence >= 0 &&
    inference.confidence <= 1 &&
    Boolean(inference.modelRef.trim()) &&
    Boolean(inference.modelVersion.trim()) &&
    Boolean(inference.evidenceRef.trim()) &&
    sourceRefs.has(inference.sourceRef)
  );
}

export function validateConditionEvidenceCaptureV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): ConditionEvidenceCaptureValidationV01 {
  const { capture, recovery, passport } = input;
  const issues: ConditionEvidenceCaptureIssueV01[] = [];
  const observedAtMs = Date.parse(capture.observedAt);

  if (!capture.captureRef.trim()) issues.push("capture_ref_missing");
  if (!capture.registryRef.trim()) issues.push("registry_ref_missing");
  if (!isIsoDate(capture.observedAt)) issues.push("observed_at_invalid");
  if (!capture.correlationId.trim()) issues.push("correlation_id_missing");
  if (!/^[A-Z]{3}$/.test(capture.currency)) issues.push("currency_invalid");
  if (!Number.isSafeInteger(capture.maximumEvidenceAgeMs) || capture.maximumEvidenceAgeMs < 0) {
    issues.push("maximum_evidence_age_invalid");
  }
  if (
    capture.recoveryNodeRef !== recovery.nodeRef ||
    capture.assetRef !== recovery.assetRef ||
    capture.passportCycleRef !== recovery.passportCycleRef ||
    capture.assetRef !== passport.assetRef ||
    capture.passportCycleRef !== passport.cycleRef
  ) {
    issues.push("identity_binding_mismatch");
  }

  const sourceRefs = new Set<string>();
  for (const source of capture.sources) {
    if (!source.sourceRef.trim()) issues.push("source_ref_missing");
    if (!source.deviceRef.trim()) issues.push("source_device_ref_missing");
    if (!isIsoDate(source.capturedAt)) {
      issues.push("source_time_invalid");
    } else if (Number.isFinite(observedAtMs)) {
      const capturedAtMs = Date.parse(source.capturedAt);
      if (capturedAtMs > observedAtMs) issues.push("source_from_future");
      if (observedAtMs - capturedAtMs > capture.maximumEvidenceAgeMs) issues.push("source_stale");
    }
    if (source.calibrationRequired) {
      if (!source.calibrationRef?.trim() || !source.calibrationValidUntil || !isIsoDate(source.calibrationValidUntil)) {
        issues.push("calibration_missing");
      } else if (Number.isFinite(observedAtMs) && Date.parse(source.calibrationValidUntil) < observedAtMs) {
        issues.push("calibration_expired");
      }
    }
    sourceRefs.add(source.sourceRef);
  }

  const bySemantic = new Map<ConditionEvidenceSemanticV01, ConditionEvidenceFactV01[]>();
  for (const fact of capture.facts) {
    const list = bySemantic.get(fact.semanticId) ?? [];
    list.push(fact);
    bySemantic.set(fact.semanticId, list);

    const source = capture.sources.find((candidate) => candidate.sourceRef === fact.sourceRef);
    if (!source) issues.push("fact_source_unknown");
    if (!fact.evidenceRef.trim()) issues.push("fact_evidence_ref_missing");
    if (fact.unit !== expectedUnit(fact.semanticId, capture.currency)) issues.push("fact_unit_invalid");
    if (!validValue(fact)) issues.push("fact_value_invalid");
    if (fact.kind === "DERIVED" && !fact.derivationRef?.trim()) issues.push("derived_fact_derivation_missing");
    if (source?.modality === "CAMERA" && fact.kind !== "DERIVED") issues.push("camera_fact_must_be_derived");
    if (source && !sourceCompatible(fact.semanticId, source.modality)) {
      issues.push("semantic_source_incompatible");
    }
  }

  for (const semanticId of REQUIRED_SEMANTICS) {
    const matches = bySemantic.get(semanticId) ?? [];
    if (matches.length === 0) issues.push("fact_missing");
    if (matches.length > 1) issues.push("fact_duplicate");
  }

  if (capture.inferences.some((inference) => !validateInference(inference, sourceRefs))) {
    issues.push("inference_metadata_invalid");
  }

  return { ok: issues.length === 0, issues };
}

function oneFact(
  capture: SyntheticConditionEvidenceCaptureV01,
  semanticId: ConditionEvidenceSemanticV01,
): ConditionEvidenceFactV01 {
  const matches = capture.facts.filter((fact) => fact.semanticId === semanticId);
  if (matches.length !== 1) throw new Error(`condition_evidence_fact_cardinality:${semanticId}:${matches.length}`);
  return matches[0]!;
}

export function buildConditionObservationFromEvidenceV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): SyntheticConditionObservationV01 {
  const validation = validateConditionEvidenceCaptureV01(input);
  if (!validation.ok) {
    throw new Error(`condition_evidence_not_assessment_ready:${validation.issues.join(",")}`);
  }
  const { capture } = input;
  const inferenceOutput: ConditionInferenceV01[] = capture.inferences.map((inference) => ({
    label: inference.label,
    confidence: inference.confidence,
    modelRef: inference.modelRef,
    modelVersion: inference.modelVersion,
    evidenceRef: inference.evidenceRef,
  }));

  return makeSyntheticConditionObservationV01({
    assessmentRef: `ASSESSMENT:${capture.passportCycleRef}`,
    registryRef: `GENESIS:ASSESSMENT:${capture.passportCycleRef}`,
    observedAt: capture.observedAt,
    correlationId: capture.correlationId,
    recoveryNodeRef: capture.recoveryNodeRef,
    assetRef: capture.assetRef,
    passportCycleRef: capture.passportCycleRef,
    identityMatched: oneFact(capture, "IDENTITY_MATCHED").value as boolean,
    contamination: oneFact(capture, "CONTAMINATION").value as ConditionContaminationV01,
    maximumTearLengthMm: oneFact(capture, "MAX_TEAR_LENGTH_MM").value as number,
    seamFailureCount: oneFact(capture, "SEAM_FAILURE_COUNT").value as number,
    stainAreaBps: oneFact(capture, "STAIN_AREA_BPS").value as number,
    abrasionAreaBps: oneFact(capture, "ABRASION_AREA_BPS").value as number,
    hardwareMissingCount: oneFact(capture, "HARDWARE_MISSING_COUNT").value as number,
    dimensionalDeviationBps: oneFact(capture, "DIMENSIONAL_DEVIATION_BPS").value as number,
    materialIntegrityBps: oneFact(capture, "MATERIAL_INTEGRITY_BPS").value as number,
    estimatedRepairCostMinor: oneFact(capture, "ESTIMATED_REPAIR_COST_MINOR").value as number,
    referenceResidualValueMinor: oneFact(capture, "REFERENCE_RESIDUAL_VALUE_MINOR").value as number,
    evidenceSourceRefs: capture.sources.map((source) => source.sourceRef),
    inferences: inferenceOutput,
  });
}

export function mapConditionEvidenceCaptureToQelFrameV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): QelOperationalFrameV01 {
  const validation = validateConditionEvidenceCaptureV01(input);
  const hasEvidence = input.capture.sources.length > 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_008_REF}:${input.capture.captureRef}:${input.capture.correlationId}`,
    correlationId: input.capture.correlationId,
    observedAt: input.capture.observedAt,
    object: {
      id: input.capture.captureRef,
      type: "CONDITION_EVIDENCE_CAPTURE",
      class: "CALIBRATED_PRODUCT_INSPECTION_EVIDENCE",
      registryRef: input.capture.registryRef,
      locationRef: input.recovery.locationRef,
    },
    state: { value: validation.ok ? "READY" : "BLOCKED", kind: "DERIVED", confidence: 1 },
    health: { value: validation.ok ? "GOOD" : "ACT", kind: "DERIVED", confidence: 1 },
    flow: {
      state: validation.ok ? "COMPLETE" : "BLOCKED",
      value: input.capture.facts.length,
      unit: "CONDITION_FACTS",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: validation.ok
      ? { type: "APPROVAL", priority: "MODERATE", target: "create_condition_assessment" }
      : { type: "INFORMATION", priority: "HIGH", target: "recapture_condition_evidence" },
    risk: validation.ok
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "CONDITION_EVIDENCE_INVALID", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.capture.captureRef },
      {
        action: "RECAPTURE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "condition.evidence.capture",
        targetRef: input.capture.assetRef,
      },
      {
        action: "CREATE_CONDITION_ASSESSMENT",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "condition.assessment.create",
        targetRef: input.capture.assetRef,
      },
    ],
    evidence: {
      status: hasEvidence ? "FRESH" : "MISSING",
      confidence: hasEvidence ? 1 : 0,
      freshness: {
        observedAt: input.capture.observedAt,
        ageMs: 0,
        status: hasEvidence ? "FRESH" : "MISSING",
        maximumValidAgeMs: input.capture.maximumEvidenceAgeMs,
      },
      sources: input.capture.sources.map((source) => ({
        sourceRef: source.sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: source.deviceRef,
      })),
    },
    outcome: validation.ok ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_CONDITION_EVIDENCE_FIXTURE",
      protocol: "CALIBRATED_SYNTHETIC_CAPTURE",
      sourceRef: input.capture.captureRef,
      rawValue: {
        contractVersion: VSR_QEL_CONDITION_EVIDENCE_CAPTURE_VERSION,
        sources: input.capture.sources,
        facts: input.capture.facts,
        inferences: input.capture.inferences,
        validationIssues: validation.issues,
        inferenceCanSetCanonicalFact: false,
        synthetic: true,
      },
      adapterRef: QEL_CONDITION_EVIDENCE_ADAPTER_REF,
      adapterVersion: QEL_CONDITION_EVIDENCE_ADAPTER_VERSION,
    },
  };
}

export function buildConditionEvidencePodPulseV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  podRef: string;
}): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.capture.observedAt,
    frames: [mapConditionEvidenceCaptureToQelFrameV01(input)],
  });
}

export function makeSyntheticConditionEvidenceCaptureV01(
  overrides: Partial<SyntheticConditionEvidenceCaptureV01> = {},
): SyntheticConditionEvidenceCaptureV01 {
  const observedAt = overrides.observedAt ?? "2026-08-23T08:30:00.000Z";
  const sources: readonly ConditionEvidenceSourceV01[] = overrides.sources ?? [
    {
      sourceRef: "SIM-PASSPORT-READER-001",
      deviceRef: "DEVICE-PASSPORT-READER-001",
      modality: "PASSPORT_READER",
      capturedAt: observedAt,
      calibrationRequired: false,
      firmwareRef: "FW-PASSPORT-1.0.0",
    },
    {
      sourceRef: "SIM-METROLOGY-001",
      deviceRef: "DEVICE-METROLOGY-001",
      modality: "METROLOGY",
      capturedAt: observedAt,
      calibrationRequired: true,
      calibrationRef: "CAL-METROLOGY-001",
      calibrationValidUntil: "2026-12-31T23:59:59.000Z",
      firmwareRef: "FW-METROLOGY-1.0.0",
    },
    {
      sourceRef: "SIM-CAMERA-001",
      deviceRef: "DEVICE-CAMERA-001",
      modality: "CAMERA",
      capturedAt: observedAt,
      calibrationRequired: true,
      calibrationRef: "CAL-CAMERA-001",
      calibrationValidUntil: "2026-12-31T23:59:59.000Z",
      firmwareRef: "FW-CAMERA-1.0.0",
    },
    {
      sourceRef: "SIM-INSPECTOR-001",
      deviceRef: "STATION-INSPECTOR-001",
      modality: "MANUAL_INSPECTION",
      capturedAt: observedAt,
      calibrationRequired: false,
    },
    {
      sourceRef: "SIM-VALUE-SYSTEM-001",
      deviceRef: "SYSTEM-RECOVERY-VALUE-001",
      modality: "SYSTEM",
      capturedAt: observedAt,
      calibrationRequired: false,
    },
  ];

  const facts: readonly ConditionEvidenceFactV01[] = overrides.facts ?? [
    { semanticId: "IDENTITY_MATCHED", value: true, unit: "BOOL", sourceRef: "SIM-PASSPORT-READER-001", evidenceRef: "EVIDENCE-IDENTITY-001", kind: "FACT" },
    { semanticId: "CONTAMINATION", value: "NONE", unit: "ENUM", sourceRef: "SIM-INSPECTOR-001", evidenceRef: "EVIDENCE-CONTAMINATION-001", kind: "FACT" },
    { semanticId: "MAX_TEAR_LENGTH_MM", value: 0, unit: "MM", sourceRef: "SIM-METROLOGY-001", evidenceRef: "EVIDENCE-TEAR-001", kind: "FACT" },
    { semanticId: "SEAM_FAILURE_COUNT", value: 0, unit: "COUNT", sourceRef: "SIM-INSPECTOR-001", evidenceRef: "EVIDENCE-SEAM-001", kind: "FACT" },
    { semanticId: "STAIN_AREA_BPS", value: 0, unit: "BPS", sourceRef: "SIM-CAMERA-001", evidenceRef: "EVIDENCE-STAIN-001", kind: "DERIVED", derivationRef: "DERIVE-PIXEL-AREA-001" },
    { semanticId: "ABRASION_AREA_BPS", value: 0, unit: "BPS", sourceRef: "SIM-CAMERA-001", evidenceRef: "EVIDENCE-ABRASION-001", kind: "DERIVED", derivationRef: "DERIVE-PIXEL-AREA-001" },
    { semanticId: "HARDWARE_MISSING_COUNT", value: 0, unit: "COUNT", sourceRef: "SIM-INSPECTOR-001", evidenceRef: "EVIDENCE-HARDWARE-001", kind: "FACT" },
    { semanticId: "DIMENSIONAL_DEVIATION_BPS", value: 0, unit: "BPS", sourceRef: "SIM-METROLOGY-001", evidenceRef: "EVIDENCE-DIMENSION-001", kind: "FACT" },
    { semanticId: "MATERIAL_INTEGRITY_BPS", value: 9_500, unit: "BPS", sourceRef: "SIM-METROLOGY-001", evidenceRef: "EVIDENCE-INTEGRITY-001", kind: "FACT" },
    { semanticId: "ESTIMATED_REPAIR_COST_MINOR", value: 0, unit: "INR_MINOR", sourceRef: "SIM-VALUE-SYSTEM-001", evidenceRef: "EVIDENCE-REPAIR-COST-001", kind: "FACT" },
    { semanticId: "REFERENCE_RESIDUAL_VALUE_MINOR", value: 10_000, unit: "INR_MINOR", sourceRef: "SIM-VALUE-SYSTEM-001", evidenceRef: "EVIDENCE-RESIDUAL-001", kind: "FACT" },
  ];

  return {
    captureRef: "CAPTURE:GARMENT-98F1:CYCLE-01",
    registryRef: "GENESIS:CAPTURE:GARMENT-98F1:CYCLE-01",
    observedAt,
    correlationId: "QEL-FIXTURE-008-CORR-001",
    recoveryNodeRef: "RECOVERY-NODE-BLR-001",
    assetRef: "GARMENT-98F1",
    passportCycleRef: "GARMENT-98F1:CYCLE-01",
    currency: "INR",
    maximumEvidenceAgeMs: 300_000,
    sources,
    facts,
    inferences: [],
    synthetic: true,
    ...overrides,
  };
}
