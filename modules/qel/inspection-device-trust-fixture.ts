import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import {
  makeSyntheticConditionEvidenceCaptureV01,
  validateConditionEvidenceCaptureV01,
  type ConditionEvidenceModalityV01,
  type ConditionEvidenceSemanticV01,
  type SyntheticConditionEvidenceCaptureV01,
} from "./condition-evidence-capture-fixture.ts";
import {
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelAuthorityStateV01,
  type QelOperationalFrameV01,
} from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import type { SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

export const QEL_FIXTURE_009_REF = "QEL-FIXTURE-009" as const;
export const VSR_QEL_INSPECTION_DEVICE_TRUST_VERSION =
  "VSR-QEL-INSPECTION-DEVICE-TRUST-001/0.1" as const;
export const QEL_INSPECTION_DEVICE_TRUST_ADAPTER_REF =
  "QEL-ADAPTER-INSPECTION-DEVICE-TRUST-001" as const;
export const QEL_INSPECTION_DEVICE_TRUST_ADAPTER_VERSION = "0.1.0" as const;

export type InspectionDeviceClassV01 =
  | "PASSPORT_READER"
  | "CAMERA"
  | "METROLOGY"
  | "INSPECTION_STATION"
  | "SYSTEM";

export type InspectionDeviceEnrollmentStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type CalibrationCertificateStatusV01 = "VALID" | "REVOKED" | "SUPERSEDED";

export interface InspectionDeviceRegistryRecordV01 {
  deviceRef: string;
  registryRef: string;
  deviceClass: InspectionDeviceClassV01;
  enrollmentState: InspectionDeviceEnrollmentStateV01;
  firmwareRef?: string;
  configurationFingerprint: string;
  permittedSemantics: readonly ConditionEvidenceSemanticV01[];
  wardenUseState: QelAuthorityStateV01;
  wardenAuthorityRef?: string;
  attestedAt: string;
}

export interface InspectionCalibrationCertificateV01 {
  calibrationRef: string;
  deviceRef: string;
  issuerRef: string;
  methodRef: string;
  standardRef: string;
  calibratedAt: string;
  validUntil: string;
  firmwareRef: string;
  configurationFingerprint: string;
  calibratedSemantics: readonly ConditionEvidenceSemanticV01[];
  status: CalibrationCertificateStatusV01;
  revocationRef?: string;
}

export interface InspectionSourceAttestationV01 {
  sourceRef: string;
  deviceRef: string;
  observedFirmwareRef?: string;
  observedConfigurationFingerprint: string;
}

export type InspectionDeviceTrustIssueV01 =
  | "capture_validation_failed"
  | "source_attestation_missing"
  | "source_attestation_duplicate"
  | "source_device_mismatch"
  | "device_registry_missing"
  | "device_registry_duplicate"
  | "device_registry_ref_missing"
  | "device_class_mismatch"
  | "device_not_active"
  | "device_attestation_time_invalid"
  | "device_attestation_from_future"
  | "firmware_mismatch"
  | "configuration_fingerprint_mismatch"
  | "warden_use_not_allowed"
  | "warden_authority_ref_missing"
  | "semantic_not_permitted"
  | "calibration_certificate_missing"
  | "calibration_certificate_duplicate"
  | "calibration_certificate_invalid"
  | "calibration_certificate_revoked"
  | "calibration_device_mismatch"
  | "calibration_issuer_missing"
  | "calibration_method_missing"
  | "calibration_standard_missing"
  | "calibration_time_invalid"
  | "calibration_not_effective_at_capture"
  | "calibration_firmware_mismatch"
  | "calibration_configuration_mismatch"
  | "calibration_validity_mismatch"
  | "semantic_not_calibrated";

export interface InspectionSourceTrustBindingV01 {
  sourceRef: string;
  deviceRef: string;
  registryRef?: string;
  calibrationRef?: string;
  state: "TRUSTED" | "BLOCKED";
  issues: readonly InspectionDeviceTrustIssueV01[];
}

export interface InspectionDeviceTrustResultV01 {
  contractVersion: typeof VSR_QEL_INSPECTION_DEVICE_TRUST_VERSION;
  ok: boolean;
  trustedSourceCount: number;
  issues: readonly InspectionDeviceTrustIssueV01[];
  sourceBindings: readonly InspectionSourceTrustBindingV01[];
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function expectedDeviceClass(modality: ConditionEvidenceModalityV01): InspectionDeviceClassV01 {
  switch (modality) {
    case "MANUAL_INSPECTION":
      return "INSPECTION_STATION";
    default:
      return modality;
  }
}

function semanticsForSource(
  capture: SyntheticConditionEvidenceCaptureV01,
  sourceRef: string,
): readonly ConditionEvidenceSemanticV01[] {
  return capture.facts
    .filter((fact) => fact.sourceRef === sourceRef)
    .map((fact) => fact.semanticId);
}

function containsAllSemantics(
  allowed: readonly ConditionEvidenceSemanticV01[],
  required: readonly ConditionEvidenceSemanticV01[],
): boolean {
  const set = new Set(allowed);
  return required.every((semantic) => set.has(semantic));
}

export function bindConditionEvidenceCaptureToDeviceRegistryV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  deviceRegistry: readonly InspectionDeviceRegistryRecordV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  sourceAttestations: readonly InspectionSourceAttestationV01[];
}): InspectionDeviceTrustResultV01 {
  const issues: InspectionDeviceTrustIssueV01[] = [];
  const sourceBindings: InspectionSourceTrustBindingV01[] = [];
  const baseCaptureValidation = validateConditionEvidenceCaptureV01({
    capture: input.capture,
    recovery: input.recovery,
    passport: input.passport,
  });

  if (!baseCaptureValidation.ok) issues.push("capture_validation_failed");

  for (const source of input.capture.sources) {
    const sourceIssues: InspectionDeviceTrustIssueV01[] = [];
    const attestations = input.sourceAttestations.filter(
      (attestation) => attestation.sourceRef === source.sourceRef,
    );
    if (attestations.length === 0) sourceIssues.push("source_attestation_missing");
    if (attestations.length > 1) sourceIssues.push("source_attestation_duplicate");
    const attestation = attestations.length === 1 ? attestations[0] : undefined;

    if (attestation && attestation.deviceRef !== source.deviceRef) {
      sourceIssues.push("source_device_mismatch");
    }

    const registryRecords = input.deviceRegistry.filter(
      (record) => record.deviceRef === source.deviceRef,
    );
    if (registryRecords.length === 0) sourceIssues.push("device_registry_missing");
    if (registryRecords.length > 1) sourceIssues.push("device_registry_duplicate");
    const device = registryRecords.length === 1 ? registryRecords[0] : undefined;

    if (device) {
      if (!device.registryRef.trim()) sourceIssues.push("device_registry_ref_missing");
      if (device.deviceClass !== expectedDeviceClass(source.modality)) {
        sourceIssues.push("device_class_mismatch");
      }
      if (device.enrollmentState !== "ACTIVE") sourceIssues.push("device_not_active");
      if (!isIsoDate(device.attestedAt)) {
        sourceIssues.push("device_attestation_time_invalid");
      } else if (Date.parse(device.attestedAt) > Date.parse(source.capturedAt)) {
        sourceIssues.push("device_attestation_from_future");
      }
      if (device.wardenUseState !== "ALLOWED") sourceIssues.push("warden_use_not_allowed");
      if (device.wardenUseState === "ALLOWED" && !device.wardenAuthorityRef?.trim()) {
        sourceIssues.push("warden_authority_ref_missing");
      }

      const usedSemantics = semanticsForSource(input.capture, source.sourceRef);
      if (!containsAllSemantics(device.permittedSemantics, usedSemantics)) {
        sourceIssues.push("semantic_not_permitted");
      }

      const observedFirmwareRef = attestation?.observedFirmwareRef ?? source.firmwareRef;
      if (device.firmwareRef || observedFirmwareRef || source.firmwareRef) {
        if (
          !device.firmwareRef ||
          !observedFirmwareRef ||
          !source.firmwareRef ||
          device.firmwareRef !== observedFirmwareRef ||
          device.firmwareRef !== source.firmwareRef
        ) {
          sourceIssues.push("firmware_mismatch");
        }
      }

      if (
        !attestation ||
        attestation.observedConfigurationFingerprint !== device.configurationFingerprint
      ) {
        sourceIssues.push("configuration_fingerprint_mismatch");
      }

      if (source.calibrationRequired) {
        const certificates = input.calibrationCertificates.filter(
          (certificate) => certificate.calibrationRef === source.calibrationRef,
        );
        if (certificates.length === 0) sourceIssues.push("calibration_certificate_missing");
        if (certificates.length > 1) sourceIssues.push("calibration_certificate_duplicate");
        const certificate = certificates.length === 1 ? certificates[0] : undefined;

        if (certificate) {
          if (certificate.status === "REVOKED") sourceIssues.push("calibration_certificate_revoked");
          if (certificate.status !== "VALID") sourceIssues.push("calibration_certificate_invalid");
          if (certificate.deviceRef !== source.deviceRef) {
            sourceIssues.push("calibration_device_mismatch");
          }
          if (!certificate.issuerRef.trim()) sourceIssues.push("calibration_issuer_missing");
          if (!certificate.methodRef.trim()) sourceIssues.push("calibration_method_missing");
          if (!certificate.standardRef.trim()) sourceIssues.push("calibration_standard_missing");
          if (!isIsoDate(certificate.calibratedAt) || !isIsoDate(certificate.validUntil)) {
            sourceIssues.push("calibration_time_invalid");
          } else {
            const capturedAt = Date.parse(source.capturedAt);
            if (
              capturedAt < Date.parse(certificate.calibratedAt) ||
              capturedAt > Date.parse(certificate.validUntil)
            ) {
              sourceIssues.push("calibration_not_effective_at_capture");
            }
          }
          if (
            !source.firmwareRef ||
            certificate.firmwareRef !== source.firmwareRef ||
            certificate.firmwareRef !== device.firmwareRef
          ) {
            sourceIssues.push("calibration_firmware_mismatch");
          }
          if (
            !attestation ||
            certificate.configurationFingerprint !== attestation.observedConfigurationFingerprint ||
            certificate.configurationFingerprint !== device.configurationFingerprint
          ) {
            sourceIssues.push("calibration_configuration_mismatch");
          }
          if (source.calibrationValidUntil !== certificate.validUntil) {
            sourceIssues.push("calibration_validity_mismatch");
          }
          const usedSemantics = semanticsForSource(input.capture, source.sourceRef);
          if (!containsAllSemantics(certificate.calibratedSemantics, usedSemantics)) {
            sourceIssues.push("semantic_not_calibrated");
          }
        }
      }
    }

    issues.push(...sourceIssues);
    sourceBindings.push({
      sourceRef: source.sourceRef,
      deviceRef: source.deviceRef,
      registryRef: device?.registryRef,
      calibrationRef: source.calibrationRef,
      state: sourceIssues.length === 0 ? "TRUSTED" : "BLOCKED",
      issues: sourceIssues,
    });
  }

  return {
    contractVersion: VSR_QEL_INSPECTION_DEVICE_TRUST_VERSION,
    ok: issues.length === 0,
    trustedSourceCount: sourceBindings.filter((binding) => binding.state === "TRUSTED").length,
    issues,
    sourceBindings,
  };
}

export function assertConditionEvidenceCaptureTrustedV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  deviceRegistry: readonly InspectionDeviceRegistryRecordV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  sourceAttestations: readonly InspectionSourceAttestationV01[];
}): SyntheticConditionEvidenceCaptureV01 {
  const result = bindConditionEvidenceCaptureToDeviceRegistryV01(input);
  if (!result.ok) {
    throw new Error(`condition_evidence_device_trust_blocked:${result.issues.join(",")}`);
  }
  return input.capture;
}

export function mapInspectionDeviceTrustToQelFrameV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  deviceRegistry: readonly InspectionDeviceRegistryRecordV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  sourceAttestations: readonly InspectionSourceAttestationV01[];
}): QelOperationalFrameV01 {
  const result = bindConditionEvidenceCaptureToDeviceRegistryV01(input);
  const evidenceRefs = [
    ...input.deviceRegistry.map((record) => record.registryRef),
    ...input.calibrationCertificates.map((certificate) => certificate.calibrationRef),
  ];

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_009_REF}:${input.capture.captureRef}:${input.capture.correlationId}`,
    correlationId: input.capture.correlationId,
    observedAt: input.capture.observedAt,
    object: {
      id: `DEVICE-TRUST:${input.capture.captureRef}`,
      type: "INSPECTION_DEVICE_TRUST",
      class: "GENESIS_CALIBRATION_TRUST_BINDING",
      registryRef: `GENESIS:DEVICE-TRUST:${input.capture.captureRef}`,
      locationRef: input.recovery.locationRef,
    },
    state: { value: result.ok ? "READY" : "BLOCKED", kind: "DERIVED", confidence: 1 },
    health: { value: result.ok ? "GOOD" : "ACT", kind: "DERIVED", confidence: 1 },
    flow: {
      state: result.ok ? "COMPLETE" : "BLOCKED",
      value: result.trustedSourceCount,
      unit: "TRUSTED_CAPTURE_SOURCES",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: result.ok
      ? { type: "APPROVAL", priority: "MODERATE", target: "accept_trusted_condition_capture" }
      : { type: "INFORMATION", priority: "HIGH", target: "resolve_device_calibration_binding" },
    risk: result.ok
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "INSPECTION_DEVICE_TRUST_INVALID", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.capture.captureRef },
      {
        action: "REENROLL_DEVICE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "genesis.device.enroll",
        targetRef: input.capture.captureRef,
      },
      {
        action: "RECALIBRATE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "inspection.device.calibrate",
        targetRef: input.capture.captureRef,
      },
      {
        action: "ACCEPT_TRUSTED_CAPTURE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "condition.evidence.accept",
        targetRef: input.capture.captureRef,
      },
    ],
    evidence: {
      status: evidenceRefs.length > 0 ? "FRESH" : "MISSING",
      confidence: evidenceRefs.length > 0 ? 1 : 0,
      freshness: {
        observedAt: input.capture.observedAt,
        ageMs: 0,
        status: evidenceRefs.length > 0 ? "FRESH" : "MISSING",
        maximumValidAgeMs: input.capture.maximumEvidenceAgeMs,
      },
      sources: evidenceRefs.map((sourceRef) => ({
        sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: sourceRef,
      })),
    },
    outcome: result.ok ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_INSPECTION_DEVICE_TRUST_FIXTURE",
      protocol: "SYNTHETIC_GENESIS_CALIBRATION_BINDING",
      sourceRef: input.capture.captureRef,
      rawValue: {
        contractVersion: VSR_QEL_INSPECTION_DEVICE_TRUST_VERSION,
        sourceBindings: result.sourceBindings,
        issues: result.issues,
        synthetic: true,
      },
      adapterRef: QEL_INSPECTION_DEVICE_TRUST_ADAPTER_REF,
      adapterVersion: QEL_INSPECTION_DEVICE_TRUST_ADAPTER_VERSION,
    },
  };
}

export function buildInspectionDeviceTrustPodPulseV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  deviceRegistry: readonly InspectionDeviceRegistryRecordV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  sourceAttestations: readonly InspectionSourceAttestationV01[];
  podRef: string;
}): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.capture.observedAt,
    frames: [mapInspectionDeviceTrustToQelFrameV01(input)],
  });
}

function configurationFingerprint(deviceRef: string): string {
  return `CFG:${deviceRef}:V1`;
}

export function makeSyntheticInspectionDeviceTrustBundleV01(
  capture: SyntheticConditionEvidenceCaptureV01 = makeSyntheticConditionEvidenceCaptureV01(),
): {
  deviceRegistry: readonly InspectionDeviceRegistryRecordV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  sourceAttestations: readonly InspectionSourceAttestationV01[];
} {
  const deviceRegistry: InspectionDeviceRegistryRecordV01[] = capture.sources.map((source) => ({
    deviceRef: source.deviceRef,
    registryRef: `GENESIS:DEVICE:${source.deviceRef}`,
    deviceClass: expectedDeviceClass(source.modality),
    enrollmentState: "ACTIVE",
    firmwareRef: source.firmwareRef,
    configurationFingerprint: configurationFingerprint(source.deviceRef),
    permittedSemantics: semanticsForSource(capture, source.sourceRef),
    wardenUseState: "ALLOWED",
    wardenAuthorityRef: `WARDEN:DEVICE-USE:${source.deviceRef}`,
    attestedAt: "2026-08-01T00:00:00.000Z",
  }));

  const sourceAttestations: InspectionSourceAttestationV01[] = capture.sources.map((source) => ({
    sourceRef: source.sourceRef,
    deviceRef: source.deviceRef,
    observedFirmwareRef: source.firmwareRef,
    observedConfigurationFingerprint: configurationFingerprint(source.deviceRef),
  }));

  const calibrationCertificates: InspectionCalibrationCertificateV01[] = capture.sources
    .filter((source) => source.calibrationRequired)
    .map((source) => ({
      calibrationRef: source.calibrationRef!,
      deviceRef: source.deviceRef,
      issuerRef: "CALIBRATION-LAB-SYNTHETIC-001",
      methodRef: `METHOD:${source.modality}:001`,
      standardRef: "STANDARD:SYNTHETIC-METROLOGY-001",
      calibratedAt: "2026-08-01T00:00:00.000Z",
      validUntil: source.calibrationValidUntil!,
      firmwareRef: source.firmwareRef!,
      configurationFingerprint: configurationFingerprint(source.deviceRef),
      calibratedSemantics: semanticsForSource(capture, source.sourceRef),
      status: "VALID",
    }));

  return { deviceRegistry, calibrationCertificates, sourceAttestations };
}
