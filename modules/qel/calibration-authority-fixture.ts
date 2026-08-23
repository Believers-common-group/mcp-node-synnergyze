import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import type { ConditionEvidenceSemanticV01, SyntheticConditionEvidenceCaptureV01 } from "./condition-evidence-capture-fixture.ts";
import {
  bindConditionEvidenceCaptureToDeviceRegistryV01,
  type InspectionCalibrationCertificateV01,
  type InspectionDeviceRegistryRecordV01,
  type InspectionDeviceTrustResultV01,
  type InspectionSourceAttestationV01,
} from "./inspection-device-trust-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import type { SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

export const QEL_FIXTURE_010_REF = "QEL-FIXTURE-010" as const;
export const VSR_QEL_CALIBRATION_AUTHORITY_VERSION =
  "VSR-QEL-CALIBRATION-AUTHORITY-001/0.1" as const;
export const QEL_CALIBRATION_AUTHORITY_ADAPTER_REF =
  "QEL-ADAPTER-CALIBRATION-AUTHORITY-001" as const;
export const QEL_CALIBRATION_AUTHORITY_ADAPTER_VERSION = "0.1.0" as const;

export type CalibrationAuthorityStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type AccreditationGrantStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED" | "SUPERSEDED";
export type CalibratorStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface CalibrationOrganisationRecordV01 {
  organisationRef: string;
  registryRef: string;
  state: CalibrationAuthorityStateV01;
  registeredAt: string;
}

export interface CalibrationAccreditationGrantV01 {
  grantRef: string;
  organisationRef: string;
  accreditorRef: string;
  status: AccreditationGrantStateV01;
  validFrom: string;
  validUntil: string;
  permittedStandardRefs: readonly string[];
  permittedMethodRefs: readonly string[];
  permittedSemantics: readonly ConditionEvidenceSemanticV01[];
}

export interface AuthorizedCalibratorV01 {
  signerRef: string;
  organisationRef: string;
  status: CalibratorStateV01;
  authorityRef: string;
  validFrom: string;
  validUntil: string;
  permittedStandardRefs: readonly string[];
  permittedMethodRefs: readonly string[];
}

export interface CalibrationCertificateIssuanceAttestationV01 {
  certificateRef: string;
  issuerOrganisationRef: string;
  accreditationGrantRef: string;
  signerRef: string;
  signedAt: string;
  signatureRef: string;
  standardRef: string;
  methodRef: string;
}

export type CalibrationAuthorityIssueV01 =
  | "certificate_issuance_missing"
  | "certificate_issuance_duplicate"
  | "issuer_mismatch"
  | "issuer_registry_missing"
  | "issuer_registry_duplicate"
  | "issuer_registry_ref_missing"
  | "issuer_not_active"
  | "issuer_registration_time_invalid"
  | "issuer_registered_after_calibration"
  | "accreditation_grant_missing"
  | "accreditation_grant_duplicate"
  | "accreditation_organisation_mismatch"
  | "accreditor_ref_missing"
  | "accreditation_not_active"
  | "accreditation_time_invalid"
  | "accreditation_not_effective"
  | "standard_out_of_scope"
  | "method_out_of_scope"
  | "semantic_scope_exceeded"
  | "signer_missing"
  | "signer_duplicate"
  | "signer_organisation_mismatch"
  | "signer_not_active"
  | "signer_authority_ref_missing"
  | "signer_time_invalid"
  | "signer_not_authorized_at_signing"
  | "signer_standard_out_of_scope"
  | "signer_method_out_of_scope"
  | "signed_time_invalid"
  | "signed_before_calibration"
  | "signature_ref_missing"
  | "issuance_standard_mismatch"
  | "issuance_method_mismatch";

export interface CalibrationCertificateAuthorityBindingV01 {
  calibrationRef: string;
  issuerOrganisationRef: string;
  accreditationGrantRef?: string;
  signerRef?: string;
  state: "TRUSTED" | "BLOCKED";
  issues: readonly CalibrationAuthorityIssueV01[];
}

export interface CalibrationAuthorityResultV01 {
  contractVersion: typeof VSR_QEL_CALIBRATION_AUTHORITY_VERSION;
  ok: boolean;
  trustedCertificateCount: number;
  issues: readonly CalibrationAuthorityIssueV01[];
  certificateBindings: readonly CalibrationCertificateAuthorityBindingV01[];
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function containsAll<T>(allowed: readonly T[], required: readonly T[]): boolean {
  const set = new Set(allowed);
  return required.every((value) => set.has(value));
}

function effectiveAt(validFrom: string, validUntil: string, at: string): boolean {
  if (!isIsoDate(validFrom) || !isIsoDate(validUntil) || !isIsoDate(at)) return false;
  const timestamp = Date.parse(at);
  return Date.parse(validFrom) <= timestamp && timestamp <= Date.parse(validUntil);
}

export function validateCalibrationAuthorityChainV01(input: {
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  organisations: readonly CalibrationOrganisationRecordV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
}): CalibrationAuthorityResultV01 {
  const issues: CalibrationAuthorityIssueV01[] = [];
  const certificateBindings: CalibrationCertificateAuthorityBindingV01[] = [];

  for (const certificate of input.calibrationCertificates) {
    const certificateIssues: CalibrationAuthorityIssueV01[] = [];
    const issuances = input.issuanceAttestations.filter(
      (issuance) => issuance.certificateRef === certificate.calibrationRef,
    );
    if (issuances.length === 0) certificateIssues.push("certificate_issuance_missing");
    if (issuances.length > 1) certificateIssues.push("certificate_issuance_duplicate");
    const issuance = issuances.length === 1 ? issuances[0] : undefined;

    if (issuance && issuance.issuerOrganisationRef !== certificate.issuerRef) {
      certificateIssues.push("issuer_mismatch");
    }

    const organisations = input.organisations.filter(
      (organisation) => organisation.organisationRef === certificate.issuerRef,
    );
    if (organisations.length === 0) certificateIssues.push("issuer_registry_missing");
    if (organisations.length > 1) certificateIssues.push("issuer_registry_duplicate");
    const organisation = organisations.length === 1 ? organisations[0] : undefined;
    if (organisation) {
      if (!organisation.registryRef.trim()) certificateIssues.push("issuer_registry_ref_missing");
      if (organisation.state !== "ACTIVE") certificateIssues.push("issuer_not_active");
      if (!isIsoDate(organisation.registeredAt)) {
        certificateIssues.push("issuer_registration_time_invalid");
      } else if (Date.parse(organisation.registeredAt) > Date.parse(certificate.calibratedAt)) {
        certificateIssues.push("issuer_registered_after_calibration");
      }
    }

    let grant: CalibrationAccreditationGrantV01 | undefined;
    if (issuance) {
      const grants = input.accreditationGrants.filter(
        (candidate) => candidate.grantRef === issuance.accreditationGrantRef,
      );
      if (grants.length === 0) certificateIssues.push("accreditation_grant_missing");
      if (grants.length > 1) certificateIssues.push("accreditation_grant_duplicate");
      grant = grants.length === 1 ? grants[0] : undefined;
    }
    if (grant) {
      if (grant.organisationRef !== certificate.issuerRef) {
        certificateIssues.push("accreditation_organisation_mismatch");
      }
      if (!grant.accreditorRef.trim()) certificateIssues.push("accreditor_ref_missing");
      if (grant.status !== "ACTIVE") certificateIssues.push("accreditation_not_active");
      if (!isIsoDate(grant.validFrom) || !isIsoDate(grant.validUntil)) {
        certificateIssues.push("accreditation_time_invalid");
      } else if (!effectiveAt(grant.validFrom, grant.validUntil, certificate.calibratedAt)) {
        certificateIssues.push("accreditation_not_effective");
      }
      if (!grant.permittedStandardRefs.includes(certificate.standardRef)) {
        certificateIssues.push("standard_out_of_scope");
      }
      if (!grant.permittedMethodRefs.includes(certificate.methodRef)) {
        certificateIssues.push("method_out_of_scope");
      }
      if (!containsAll(grant.permittedSemantics, certificate.calibratedSemantics)) {
        certificateIssues.push("semantic_scope_exceeded");
      }
    }

    let signer: AuthorizedCalibratorV01 | undefined;
    if (issuance) {
      const signers = input.calibrators.filter((candidate) => candidate.signerRef === issuance.signerRef);
      if (signers.length === 0) certificateIssues.push("signer_missing");
      if (signers.length > 1) certificateIssues.push("signer_duplicate");
      signer = signers.length === 1 ? signers[0] : undefined;
    }
    if (signer && issuance) {
      if (signer.organisationRef !== certificate.issuerRef) {
        certificateIssues.push("signer_organisation_mismatch");
      }
      if (signer.status !== "ACTIVE") certificateIssues.push("signer_not_active");
      if (!signer.authorityRef.trim()) certificateIssues.push("signer_authority_ref_missing");
      if (!isIsoDate(signer.validFrom) || !isIsoDate(signer.validUntil)) {
        certificateIssues.push("signer_time_invalid");
      } else if (!effectiveAt(signer.validFrom, signer.validUntil, issuance.signedAt)) {
        certificateIssues.push("signer_not_authorized_at_signing");
      }
      if (!signer.permittedStandardRefs.includes(certificate.standardRef)) {
        certificateIssues.push("signer_standard_out_of_scope");
      }
      if (!signer.permittedMethodRefs.includes(certificate.methodRef)) {
        certificateIssues.push("signer_method_out_of_scope");
      }
    }

    if (issuance) {
      if (!isIsoDate(issuance.signedAt)) {
        certificateIssues.push("signed_time_invalid");
      } else if (Date.parse(issuance.signedAt) < Date.parse(certificate.calibratedAt)) {
        certificateIssues.push("signed_before_calibration");
      }
      if (!issuance.signatureRef.trim()) certificateIssues.push("signature_ref_missing");
      if (issuance.standardRef !== certificate.standardRef) {
        certificateIssues.push("issuance_standard_mismatch");
      }
      if (issuance.methodRef !== certificate.methodRef) {
        certificateIssues.push("issuance_method_mismatch");
      }
    }

    issues.push(...certificateIssues);
    certificateBindings.push({
      calibrationRef: certificate.calibrationRef,
      issuerOrganisationRef: certificate.issuerRef,
      accreditationGrantRef: issuance?.accreditationGrantRef,
      signerRef: issuance?.signerRef,
      state: certificateIssues.length === 0 ? "TRUSTED" : "BLOCKED",
      issues: certificateIssues,
    });
  }

  return {
    contractVersion: VSR_QEL_CALIBRATION_AUTHORITY_VERSION,
    ok: issues.length === 0,
    trustedCertificateCount: certificateBindings.filter((binding) => binding.state === "TRUSTED").length,
    issues,
    certificateBindings,
  };
}

export function bindConditionEvidenceThroughAccreditedCalibrationV01(input: {
  capture: SyntheticConditionEvidenceCaptureV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  deviceRegistry: readonly InspectionDeviceRegistryRecordV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  sourceAttestations: readonly InspectionSourceAttestationV01[];
  organisations: readonly CalibrationOrganisationRecordV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
}): {
  ok: boolean;
  authority: CalibrationAuthorityResultV01;
  deviceTrust?: InspectionDeviceTrustResultV01;
} {
  const authority = validateCalibrationAuthorityChainV01(input);
  if (!authority.ok) return { ok: false, authority };

  const deviceTrust = bindConditionEvidenceCaptureToDeviceRegistryV01({
    capture: input.capture,
    recovery: input.recovery,
    passport: input.passport,
    deviceRegistry: input.deviceRegistry,
    calibrationCertificates: input.calibrationCertificates,
    sourceAttestations: input.sourceAttestations,
  });
  return { ok: deviceTrust.ok, authority, deviceTrust };
}

export function mapCalibrationAuthorityToQelFrameV01(input: {
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  organisations: readonly CalibrationOrganisationRecordV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
  observedAt: string;
  correlationId: string;
  locationRef?: string;
}): QelOperationalFrameV01 {
  const result = validateCalibrationAuthorityChainV01(input);
  const evidenceRefs = [
    ...input.organisations.map((organisation) => organisation.registryRef),
    ...input.accreditationGrants.map((grant) => grant.grantRef),
    ...input.calibrators.map((calibrator) => calibrator.authorityRef),
    ...input.issuanceAttestations.map((issuance) => issuance.signatureRef),
  ].filter(Boolean);

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_010_REF}:${input.correlationId}`,
    correlationId: input.correlationId,
    observedAt: input.observedAt,
    object: {
      id: `CALIBRATION-AUTHORITY:${input.correlationId}`,
      type: "CALIBRATION_AUTHORITY_TRUST",
      class: "ACCREDITED_CALIBRATION_ISSUANCE_CHAIN",
      registryRef: `GENESIS:CALIBRATION-AUTHORITY:${input.correlationId}`,
      locationRef: input.locationRef,
    },
    state: { value: result.ok ? "READY" : "BLOCKED", kind: "DERIVED", confidence: 1 },
    health: { value: result.ok ? "GOOD" : "ACT", kind: "DERIVED", confidence: 1 },
    flow: {
      state: result.ok ? "COMPLETE" : "BLOCKED",
      value: result.trustedCertificateCount,
      unit: "ACCREDITED_CALIBRATION_CERTIFICATES",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: result.ok
      ? { type: "APPROVAL", priority: "MODERATE", target: "accept_accredited_calibration_chain" }
      : { type: "INFORMATION", priority: "HIGH", target: "resolve_calibration_authority_chain" },
    risk: result.ok
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "CALIBRATION_AUTHORITY_INVALID", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.correlationId },
      {
        action: "REVERIFY_ACCREDITATION",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "calibration.accreditation.verify",
        targetRef: input.correlationId,
      },
      {
        action: "ACCEPT_CALIBRATION_CHAIN",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "calibration.authority.accept",
        targetRef: input.correlationId,
      },
    ],
    evidence: {
      status: evidenceRefs.length > 0 ? "FRESH" : "MISSING",
      confidence: evidenceRefs.length > 0 ? 1 : 0,
      freshness: {
        observedAt: input.observedAt,
        ageMs: 0,
        status: evidenceRefs.length > 0 ? "FRESH" : "MISSING",
        maximumValidAgeMs: 300_000,
      },
      sources: evidenceRefs.map((sourceRef) => ({ sourceRef, kind: "SYSTEM" as const, nativeRef: sourceRef })),
    },
    outcome: result.ok ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_CALIBRATION_AUTHORITY_FIXTURE",
      protocol: "SYNTHETIC_ACCREDITATION_CHAIN",
      sourceRef: input.correlationId,
      rawValue: {
        contractVersion: VSR_QEL_CALIBRATION_AUTHORITY_VERSION,
        certificateBindings: result.certificateBindings,
        issues: result.issues,
        synthetic: true,
      },
      adapterRef: QEL_CALIBRATION_AUTHORITY_ADAPTER_REF,
      adapterVersion: QEL_CALIBRATION_AUTHORITY_ADAPTER_VERSION,
    },
  };
}

export function buildCalibrationAuthorityPodPulseV01(input: Parameters<typeof mapCalibrationAuthorityToQelFrameV01>[0] & { podRef: string }): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapCalibrationAuthorityToQelFrameV01(input)],
  });
}

export function makeSyntheticCalibrationAuthorityBundleV01(
  certificates: readonly InspectionCalibrationCertificateV01[],
): {
  organisations: readonly CalibrationOrganisationRecordV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
} {
  const issuerRefs = [...new Set(certificates.map((certificate) => certificate.issuerRef))];
  const organisations = issuerRefs.map((organisationRef) => ({
    organisationRef,
    registryRef: `GENESIS:ORG:${organisationRef}`,
    state: "ACTIVE" as const,
    registeredAt: "2026-01-01T00:00:00.000Z",
  }));

  const accreditationGrants = issuerRefs.map((organisationRef) => {
    const issuerCertificates = certificates.filter((certificate) => certificate.issuerRef === organisationRef);
    return {
      grantRef: `ACCREDITATION:${organisationRef}:001`,
      organisationRef,
      accreditorRef: "ACCREDITOR:SYNTHETIC-001",
      status: "ACTIVE" as const,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      permittedStandardRefs: [...new Set(issuerCertificates.map((certificate) => certificate.standardRef))],
      permittedMethodRefs: [...new Set(issuerCertificates.map((certificate) => certificate.methodRef))],
      permittedSemantics: [...new Set(issuerCertificates.flatMap((certificate) => certificate.calibratedSemantics))],
    };
  });

  const calibrators = issuerRefs.map((organisationRef) => {
    const grant = accreditationGrants.find((candidate) => candidate.organisationRef === organisationRef)!;
    return {
      signerRef: `CALIBRATOR:${organisationRef}:001`,
      organisationRef,
      status: "ACTIVE" as const,
      authorityRef: `WARDEN:CALIBRATOR-AUTHORITY:${organisationRef}:001`,
      validFrom: grant.validFrom,
      validUntil: grant.validUntil,
      permittedStandardRefs: grant.permittedStandardRefs,
      permittedMethodRefs: grant.permittedMethodRefs,
    };
  });

  const issuanceAttestations = certificates.map((certificate) => ({
    certificateRef: certificate.calibrationRef,
    issuerOrganisationRef: certificate.issuerRef,
    accreditationGrantRef: `ACCREDITATION:${certificate.issuerRef}:001`,
    signerRef: `CALIBRATOR:${certificate.issuerRef}:001`,
    signedAt: certificate.calibratedAt,
    signatureRef: `SIGNATURE:${certificate.calibrationRef}:001`,
    standardRef: certificate.standardRef,
    methodRef: certificate.methodRef,
  }));

  return { organisations, accreditationGrants, calibrators, issuanceAttestations };
}
