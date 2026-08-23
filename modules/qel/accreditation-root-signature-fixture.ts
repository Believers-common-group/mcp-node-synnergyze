import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";

import {
  validateCalibrationAuthorityChainV01,
  type AuthorizedCalibratorV01,
  type CalibrationAccreditationGrantV01,
  type CalibrationAuthorityResultV01,
  type CalibrationCertificateIssuanceAttestationV01,
  type CalibrationOrganisationRecordV01,
} from "./calibration-authority-fixture.ts";
import type { InspectionCalibrationCertificateV01 } from "./inspection-device-trust-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";

export const QEL_FIXTURE_011_REF = "QEL-FIXTURE-011" as const;
export const VSR_QEL_ACCREDITATION_ROOT_SIGNATURE_VERSION =
  "VSR-QEL-ACCREDITATION-ROOT-SIGNATURE-001/0.1" as const;
export const QEL_ACCREDITATION_ROOT_SIGNATURE_ADAPTER_REF =
  "QEL-ADAPTER-ACCREDITATION-ROOT-SIGNATURE-001" as const;
export const QEL_ACCREDITATION_ROOT_SIGNATURE_ADAPTER_VERSION = "0.1.0" as const;

export type TrustPrincipalStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type TrustGrantStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED" | "SUPERSEDED";
export type TrustKeyStateV01 = "ACTIVE" | "REVOKED" | "SUPERSEDED";
export type TrustSigningPurposeV01 =
  | "ROOT_DELEGATION"
  | "ACCREDITATION_GRANT"
  | "CALIBRATION_ISSUANCE";
export type SignedTrustArtifactKindV01 =
  | "ROOT_DELEGATION"
  | "ACCREDITATION_GRANT"
  | "CALIBRATION_ISSUANCE";

export interface AccreditationRootAuthorityV01 {
  rootAuthorityRef: string;
  registryRef: string;
  state: TrustPrincipalStateV01;
  validFrom: string;
  validUntil: string;
  jurisdictions: readonly string[];
  authorityDomains: readonly string[];
}

export interface AccreditorRegistryRecordV01 {
  accreditorRef: string;
  registryRef: string;
  state: TrustPrincipalStateV01;
  jurisdiction: string;
  registeredAt: string;
}

export interface AccreditorRootDelegationV01 {
  delegationRef: string;
  rootAuthorityRef: string;
  accreditorRef: string;
  jurisdiction: string;
  authorityDomain: "CALIBRATION_ACCREDITATION";
  validFrom: string;
  validUntil: string;
  status: TrustGrantStateV01;
}

export interface TrustSigningKeyRecordV01 {
  keyRef: string;
  principalRef: string;
  purpose: TrustSigningPurposeV01;
  algorithm: "ED25519";
  publicKeyPem: string;
  validFrom: string;
  validUntil: string;
  state: TrustKeyStateV01;
  replacementKeyRef?: string;
}

export interface SignedTrustArtifactV01 {
  signatureRef: string;
  subjectRef: string;
  kind: SignedTrustArtifactKindV01;
  keyRef: string;
  signedAt: string;
  payload: string;
  signatureBase64: string;
}

export type AccreditationRootSignatureIssueV01 =
  | "root_authority_missing"
  | "root_authority_duplicate"
  | "root_registry_ref_missing"
  | "root_not_active"
  | "root_time_invalid"
  | "root_not_effective"
  | "accreditor_missing"
  | "accreditor_duplicate"
  | "accreditor_registry_ref_missing"
  | "accreditor_not_active"
  | "accreditor_registration_time_invalid"
  | "root_delegation_missing"
  | "root_delegation_duplicate"
  | "root_delegation_not_active"
  | "root_delegation_time_invalid"
  | "root_delegation_root_mismatch"
  | "root_delegation_accreditor_mismatch"
  | "jurisdiction_mismatch"
  | "jurisdiction_out_of_scope"
  | "authority_domain_out_of_scope"
  | "root_delegation_does_not_cover_grant"
  | "signed_artifact_missing"
  | "signed_artifact_duplicate"
  | "signature_ref_missing"
  | "signature_time_invalid"
  | "signing_key_missing"
  | "signing_key_duplicate"
  | "signing_key_not_active"
  | "signing_key_time_invalid"
  | "signing_key_not_effective"
  | "signing_key_principal_mismatch"
  | "signing_key_purpose_mismatch"
  | "signing_key_public_material_missing"
  | "signed_payload_mismatch"
  | "signature_encoding_invalid"
  | "signature_invalid"
  | "accreditation_signer_not_registered"
  | "calibration_signer_not_registered"
  | "calibration_signature_ref_mismatch";

export interface AccreditationRootSignatureResultV01 {
  contractVersion: typeof VSR_QEL_ACCREDITATION_ROOT_SIGNATURE_VERSION;
  ok: boolean;
  verifiedRootDelegations: number;
  verifiedAccreditationGrants: number;
  verifiedCalibrationIssuances: number;
  issues: readonly AccreditationRootSignatureIssueV01[];
}

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function effectiveAt(validFrom: string, validUntil: string, at: string): boolean {
  if (!isIsoDate(validFrom) || !isIsoDate(validUntil) || !isIsoDate(at)) return false;
  const timestamp = Date.parse(at);
  return Date.parse(validFrom) <= timestamp && timestamp <= Date.parse(validUntil);
}

function coversWindow(
  outerFrom: string,
  outerUntil: string,
  innerFrom: string,
  innerUntil: string,
): boolean {
  if (![outerFrom, outerUntil, innerFrom, innerUntil].every(isIsoDate)) return false;
  return Date.parse(outerFrom) <= Date.parse(innerFrom) && Date.parse(innerUntil) <= Date.parse(outerUntil);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

export function canonicalRootDelegationPayloadV01(delegation: AccreditorRootDelegationV01): string {
  return JSON.stringify({
    delegationRef: delegation.delegationRef,
    rootAuthorityRef: delegation.rootAuthorityRef,
    accreditorRef: delegation.accreditorRef,
    jurisdiction: delegation.jurisdiction,
    authorityDomain: delegation.authorityDomain,
    validFrom: delegation.validFrom,
    validUntil: delegation.validUntil,
    status: delegation.status,
  });
}

export function canonicalAccreditationGrantPayloadV01(grant: CalibrationAccreditationGrantV01): string {
  return JSON.stringify({
    grantRef: grant.grantRef,
    organisationRef: grant.organisationRef,
    accreditorRef: grant.accreditorRef,
    status: grant.status,
    validFrom: grant.validFrom,
    validUntil: grant.validUntil,
    permittedStandardRefs: sorted(grant.permittedStandardRefs),
    permittedMethodRefs: sorted(grant.permittedMethodRefs),
    permittedSemantics: sorted(grant.permittedSemantics),
  });
}

export function canonicalCalibrationIssuancePayloadV01(input: {
  certificate: InspectionCalibrationCertificateV01;
  issuance: CalibrationCertificateIssuanceAttestationV01;
}): string {
  return JSON.stringify({
    certificate: {
      calibrationRef: input.certificate.calibrationRef,
      deviceRef: input.certificate.deviceRef,
      issuerRef: input.certificate.issuerRef,
      methodRef: input.certificate.methodRef,
      standardRef: input.certificate.standardRef,
      calibratedAt: input.certificate.calibratedAt,
      validUntil: input.certificate.validUntil,
      firmwareRef: input.certificate.firmwareRef,
      configurationFingerprint: input.certificate.configurationFingerprint,
      calibratedSemantics: sorted(input.certificate.calibratedSemantics),
      status: input.certificate.status,
      revocationRef: input.certificate.revocationRef ?? null,
    },
    issuance: {
      certificateRef: input.issuance.certificateRef,
      issuerOrganisationRef: input.issuance.issuerOrganisationRef,
      accreditationGrantRef: input.issuance.accreditationGrantRef,
      signerRef: input.issuance.signerRef,
      signedAt: input.issuance.signedAt,
      signatureRef: input.issuance.signatureRef,
      standardRef: input.issuance.standardRef,
      methodRef: input.issuance.methodRef,
    },
  });
}

function validBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function verifySignedArtifactV01(input: {
  artifact: SignedTrustArtifactV01 | undefined;
  expectedSubjectRef: string;
  expectedKind: SignedTrustArtifactKindV01;
  expectedPrincipalRef: string;
  expectedPurpose: TrustSigningPurposeV01;
  expectedPayload: string;
  signingKeys: readonly TrustSigningKeyRecordV01[];
}): readonly AccreditationRootSignatureIssueV01[] {
  const issues: AccreditationRootSignatureIssueV01[] = [];
  const artifact = input.artifact;
  if (!artifact) return ["signed_artifact_missing"];
  if (!artifact.signatureRef.trim()) issues.push("signature_ref_missing");
  if (!isIsoDate(artifact.signedAt)) issues.push("signature_time_invalid");
  if (artifact.subjectRef !== input.expectedSubjectRef || artifact.kind !== input.expectedKind) {
    issues.push("signed_payload_mismatch");
  }
  if (artifact.payload !== input.expectedPayload) issues.push("signed_payload_mismatch");

  const keys = input.signingKeys.filter((key) => key.keyRef === artifact.keyRef);
  if (keys.length === 0) issues.push("signing_key_missing");
  if (keys.length > 1) issues.push("signing_key_duplicate");
  const key = keys.length === 1 ? keys[0] : undefined;
  if (!key) return issues;

  if (key.state !== "ACTIVE") issues.push("signing_key_not_active");
  if (!isIsoDate(key.validFrom) || !isIsoDate(key.validUntil)) {
    issues.push("signing_key_time_invalid");
  } else if (isIsoDate(artifact.signedAt) && !effectiveAt(key.validFrom, key.validUntil, artifact.signedAt)) {
    issues.push("signing_key_not_effective");
  }
  if (key.principalRef !== input.expectedPrincipalRef) issues.push("signing_key_principal_mismatch");
  if (key.purpose !== input.expectedPurpose) issues.push("signing_key_purpose_mismatch");
  if (!key.publicKeyPem.trim()) issues.push("signing_key_public_material_missing");
  if (!validBase64(artifact.signatureBase64)) {
    issues.push("signature_encoding_invalid");
    return issues;
  }

  if (
    key.state === "ACTIVE" &&
    key.algorithm === "ED25519" &&
    key.publicKeyPem.trim() &&
    artifact.payload === input.expectedPayload
  ) {
    try {
      const verified = cryptoVerify(
        null,
        Buffer.from(artifact.payload, "utf8"),
        key.publicKeyPem,
        Buffer.from(artifact.signatureBase64, "base64"),
      );
      if (!verified) issues.push("signature_invalid");
    } catch {
      issues.push("signature_invalid");
    }
  }

  return issues;
}

function uniqueArtifact(
  artifacts: readonly SignedTrustArtifactV01[],
  kind: SignedTrustArtifactKindV01,
  subjectRef: string,
  issues: AccreditationRootSignatureIssueV01[],
): SignedTrustArtifactV01 | undefined {
  const matches = artifacts.filter((artifact) => artifact.kind === kind && artifact.subjectRef === subjectRef);
  if (matches.length === 0) issues.push("signed_artifact_missing");
  if (matches.length > 1) issues.push("signed_artifact_duplicate");
  return matches.length === 1 ? matches[0] : undefined;
}

export function validateAccreditationRootAndSignaturesV01(input: {
  rootAuthorities: readonly AccreditationRootAuthorityV01[];
  accreditors: readonly AccreditorRegistryRecordV01[];
  rootDelegations: readonly AccreditorRootDelegationV01[];
  signingKeys: readonly TrustSigningKeyRecordV01[];
  signedArtifacts: readonly SignedTrustArtifactV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
}): AccreditationRootSignatureResultV01 {
  const issues: AccreditationRootSignatureIssueV01[] = [];
  let verifiedRootDelegations = 0;
  let verifiedAccreditationGrants = 0;
  let verifiedCalibrationIssuances = 0;

  const accreditorRefs = [...new Set(input.accreditationGrants.map((grant) => grant.accreditorRef))];
  for (const accreditorRef of accreditorRefs) {
    const accreditorMatches = input.accreditors.filter((accreditor) => accreditor.accreditorRef === accreditorRef);
    if (accreditorMatches.length === 0) issues.push("accreditor_missing");
    if (accreditorMatches.length > 1) issues.push("accreditor_duplicate");
    const accreditor = accreditorMatches.length === 1 ? accreditorMatches[0] : undefined;
    if (!accreditor) continue;
    if (!accreditor.registryRef.trim()) issues.push("accreditor_registry_ref_missing");
    if (accreditor.state !== "ACTIVE") issues.push("accreditor_not_active");
    if (!isIsoDate(accreditor.registeredAt)) issues.push("accreditor_registration_time_invalid");

    const delegations = input.rootDelegations.filter((delegation) => delegation.accreditorRef === accreditorRef);
    if (delegations.length === 0) issues.push("root_delegation_missing");
    if (delegations.length > 1) issues.push("root_delegation_duplicate");
    const delegation = delegations.length === 1 ? delegations[0] : undefined;
    if (!delegation) continue;
    if (delegation.status !== "ACTIVE") issues.push("root_delegation_not_active");
    if (!isIsoDate(delegation.validFrom) || !isIsoDate(delegation.validUntil)) {
      issues.push("root_delegation_time_invalid");
    }
    if (delegation.accreditorRef !== accreditor.accreditorRef) issues.push("root_delegation_accreditor_mismatch");
    if (delegation.jurisdiction !== accreditor.jurisdiction) issues.push("jurisdiction_mismatch");

    const roots = input.rootAuthorities.filter((root) => root.rootAuthorityRef === delegation.rootAuthorityRef);
    if (roots.length === 0) issues.push("root_authority_missing");
    if (roots.length > 1) issues.push("root_authority_duplicate");
    const root = roots.length === 1 ? roots[0] : undefined;
    if (!root) continue;
    if (!root.registryRef.trim()) issues.push("root_registry_ref_missing");
    if (root.state !== "ACTIVE") issues.push("root_not_active");
    if (!isIsoDate(root.validFrom) || !isIsoDate(root.validUntil)) {
      issues.push("root_time_invalid");
    } else if (!effectiveAt(root.validFrom, root.validUntil, delegation.validFrom)) {
      issues.push("root_not_effective");
    }
    if (delegation.rootAuthorityRef !== root.rootAuthorityRef) issues.push("root_delegation_root_mismatch");
    if (!root.jurisdictions.includes(delegation.jurisdiction)) issues.push("jurisdiction_out_of_scope");
    if (!root.authorityDomains.includes(delegation.authorityDomain)) issues.push("authority_domain_out_of_scope");

    for (const grant of input.accreditationGrants.filter((candidate) => candidate.accreditorRef === accreditorRef)) {
      if (!coversWindow(delegation.validFrom, delegation.validUntil, grant.validFrom, grant.validUntil)) {
        issues.push("root_delegation_does_not_cover_grant");
      }
    }

    const delegationArtifactIssues: AccreditationRootSignatureIssueV01[] = [];
    const delegationArtifact = uniqueArtifact(
      input.signedArtifacts,
      "ROOT_DELEGATION",
      delegation.delegationRef,
      delegationArtifactIssues,
    );
    issues.push(...delegationArtifactIssues);
    const signatureIssues = verifySignedArtifactV01({
      artifact: delegationArtifact,
      expectedSubjectRef: delegation.delegationRef,
      expectedKind: "ROOT_DELEGATION",
      expectedPrincipalRef: root.rootAuthorityRef,
      expectedPurpose: "ROOT_DELEGATION",
      expectedPayload: canonicalRootDelegationPayloadV01(delegation),
      signingKeys: input.signingKeys,
    });
    issues.push(...signatureIssues);
    if (signatureIssues.length === 0 && delegationArtifactIssues.length === 0) verifiedRootDelegations += 1;
  }

  for (const grant of input.accreditationGrants) {
    const accreditor = input.accreditors.find((candidate) => candidate.accreditorRef === grant.accreditorRef);
    if (!accreditor) {
      issues.push("accreditation_signer_not_registered");
      continue;
    }
    const artifactIssues: AccreditationRootSignatureIssueV01[] = [];
    const artifact = uniqueArtifact(input.signedArtifacts, "ACCREDITATION_GRANT", grant.grantRef, artifactIssues);
    issues.push(...artifactIssues);
    const signatureIssues = verifySignedArtifactV01({
      artifact,
      expectedSubjectRef: grant.grantRef,
      expectedKind: "ACCREDITATION_GRANT",
      expectedPrincipalRef: accreditor.accreditorRef,
      expectedPurpose: "ACCREDITATION_GRANT",
      expectedPayload: canonicalAccreditationGrantPayloadV01(grant),
      signingKeys: input.signingKeys,
    });
    issues.push(...signatureIssues);
    if (signatureIssues.length === 0 && artifactIssues.length === 0) verifiedAccreditationGrants += 1;
  }

  for (const issuance of input.issuanceAttestations) {
    const certificate = input.calibrationCertificates.find(
      (candidate) => candidate.calibrationRef === issuance.certificateRef,
    );
    const calibrator = input.calibrators.find((candidate) => candidate.signerRef === issuance.signerRef);
    if (!certificate || !calibrator) {
      issues.push("calibration_signer_not_registered");
      continue;
    }
    const artifactIssues: AccreditationRootSignatureIssueV01[] = [];
    const artifact = uniqueArtifact(
      input.signedArtifacts,
      "CALIBRATION_ISSUANCE",
      issuance.certificateRef,
      artifactIssues,
    );
    issues.push(...artifactIssues);
    if (artifact && artifact.signatureRef !== issuance.signatureRef) {
      issues.push("calibration_signature_ref_mismatch");
    }
    const signatureIssues = verifySignedArtifactV01({
      artifact,
      expectedSubjectRef: issuance.certificateRef,
      expectedKind: "CALIBRATION_ISSUANCE",
      expectedPrincipalRef: calibrator.signerRef,
      expectedPurpose: "CALIBRATION_ISSUANCE",
      expectedPayload: canonicalCalibrationIssuancePayloadV01({ certificate, issuance }),
      signingKeys: input.signingKeys,
    });
    issues.push(...signatureIssues);
    if (
      signatureIssues.length === 0 &&
      artifactIssues.length === 0 &&
      artifact?.signatureRef === issuance.signatureRef
    ) {
      verifiedCalibrationIssuances += 1;
    }
  }

  return {
    contractVersion: VSR_QEL_ACCREDITATION_ROOT_SIGNATURE_VERSION,
    ok: issues.length === 0,
    verifiedRootDelegations,
    verifiedAccreditationGrants,
    verifiedCalibrationIssuances,
    issues,
  };
}

export function bindCalibrationAuthorityThroughRootTrustV01(input: {
  rootAuthorities: readonly AccreditationRootAuthorityV01[];
  accreditors: readonly AccreditorRegistryRecordV01[];
  rootDelegations: readonly AccreditorRootDelegationV01[];
  signingKeys: readonly TrustSigningKeyRecordV01[];
  signedArtifacts: readonly SignedTrustArtifactV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  organisations: readonly CalibrationOrganisationRecordV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
}): {
  ok: boolean;
  rootTrust: AccreditationRootSignatureResultV01;
  calibrationAuthority?: CalibrationAuthorityResultV01;
} {
  const rootTrust = validateAccreditationRootAndSignaturesV01(input);
  if (!rootTrust.ok) return { ok: false, rootTrust };
  const calibrationAuthority = validateCalibrationAuthorityChainV01(input);
  return { ok: calibrationAuthority.ok, rootTrust, calibrationAuthority };
}

export function mapAccreditationRootSignatureToQelFrameV01(input: {
  rootAuthorities: readonly AccreditationRootAuthorityV01[];
  accreditors: readonly AccreditorRegistryRecordV01[];
  rootDelegations: readonly AccreditorRootDelegationV01[];
  signingKeys: readonly TrustSigningKeyRecordV01[];
  signedArtifacts: readonly SignedTrustArtifactV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
  observedAt: string;
  correlationId: string;
  locationRef?: string;
}): QelOperationalFrameV01 {
  const result = validateAccreditationRootAndSignaturesV01(input);
  const evidenceRefs = [
    ...input.rootAuthorities.map((root) => root.registryRef),
    ...input.accreditors.map((accreditor) => accreditor.registryRef),
    ...input.rootDelegations.map((delegation) => delegation.delegationRef),
    ...input.signingKeys.map((key) => key.keyRef),
    ...input.signedArtifacts.map((artifact) => artifact.signatureRef),
  ].filter(Boolean);

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_011_REF}:${input.correlationId}`,
    correlationId: input.correlationId,
    observedAt: input.observedAt,
    object: {
      id: `ACCREDITATION-ROOT:${input.correlationId}`,
      type: "ACCREDITATION_ROOT_TRUST",
      class: "CRYPTOGRAPHIC_ACCREDITATION_TRUST_CHAIN",
      registryRef: `GENESIS:ACCREDITATION-ROOT:${input.correlationId}`,
      locationRef: input.locationRef,
    },
    state: { value: result.ok ? "READY" : "BLOCKED", kind: "DERIVED", confidence: 1 },
    health: { value: result.ok ? "GOOD" : "ACT", kind: "DERIVED", confidence: 1 },
    flow: {
      state: result.ok ? "COMPLETE" : "BLOCKED",
      value:
        result.verifiedRootDelegations +
        result.verifiedAccreditationGrants +
        result.verifiedCalibrationIssuances,
      unit: "VERIFIED_TRUST_SIGNATURES",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: result.ok
      ? { type: "APPROVAL", priority: "MODERATE", target: "accept_accreditation_root_trust" }
      : { type: "INFORMATION", priority: "HIGH", target: "resolve_accreditation_root_or_signature" },
    risk: result.ok
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "ACCREDITATION_ROOT_SIGNATURE_INVALID", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.correlationId },
      {
        action: "REVERIFY_SIGNATURE_CHAIN",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "accreditation.signature.verify",
        targetRef: input.correlationId,
      },
      {
        action: "ROTATE_TRUST_KEY",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "trust.key.rotate",
        targetRef: input.correlationId,
      },
      {
        action: "ACCEPT_ROOT_TRUST",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "accreditation.root.accept",
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
      provider: "SYNNERGYZE_ACCREDITATION_ROOT_SIGNATURE_FIXTURE",
      protocol: "ED25519_SYNTHETIC_TRUST_CHAIN",
      sourceRef: input.correlationId,
      rawValue: {
        contractVersion: VSR_QEL_ACCREDITATION_ROOT_SIGNATURE_VERSION,
        verifiedRootDelegations: result.verifiedRootDelegations,
        verifiedAccreditationGrants: result.verifiedAccreditationGrants,
        verifiedCalibrationIssuances: result.verifiedCalibrationIssuances,
        issues: result.issues,
        privateKeysPersisted: false,
        synthetic: true,
      },
      adapterRef: QEL_ACCREDITATION_ROOT_SIGNATURE_ADAPTER_REF,
      adapterVersion: QEL_ACCREDITATION_ROOT_SIGNATURE_ADAPTER_VERSION,
    },
  };
}

export function buildAccreditationRootSignaturePodPulseV01(
  input: Parameters<typeof mapAccreditationRootSignatureToQelFrameV01>[0] & { podRef: string },
): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapAccreditationRootSignatureToQelFrameV01(input)],
  });
}

function generateSigningKey(input: {
  keyRef: string;
  principalRef: string;
  purpose: TrustSigningPurposeV01;
  validFrom: string;
  validUntil: string;
}): { record: TrustSigningKeyRecordV01; privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"] } {
  const pair = generateKeyPairSync("ed25519");
  return {
    record: {
      keyRef: input.keyRef,
      principalRef: input.principalRef,
      purpose: input.purpose,
      algorithm: "ED25519",
      publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      state: "ACTIVE",
    },
    privateKey: pair.privateKey,
  };
}

function signedArtifact(input: {
  signatureRef: string;
  subjectRef: string;
  kind: SignedTrustArtifactKindV01;
  keyRef: string;
  signedAt: string;
  payload: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
}): SignedTrustArtifactV01 {
  return {
    signatureRef: input.signatureRef,
    subjectRef: input.subjectRef,
    kind: input.kind,
    keyRef: input.keyRef,
    signedAt: input.signedAt,
    payload: input.payload,
    signatureBase64: cryptoSign(null, Buffer.from(input.payload, "utf8"), input.privateKey).toString("base64"),
  };
}

export function makeSyntheticAccreditationRootSignatureBundleV01(input: {
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
}): {
  rootAuthorities: readonly AccreditationRootAuthorityV01[];
  accreditors: readonly AccreditorRegistryRecordV01[];
  rootDelegations: readonly AccreditorRootDelegationV01[];
  signingKeys: readonly TrustSigningKeyRecordV01[];
  signedArtifacts: readonly SignedTrustArtifactV01[];
} {
  const rootAuthorityRef = "ROOT:SYNTHETIC-CALIBRATION-AUTHORITY-001";
  const jurisdiction = "GLOBAL_SYNTHETIC";
  const validFrom = "2026-01-01T00:00:00.000Z";
  const validUntil = "2027-01-01T00:00:00.000Z";
  const rootAuthorities: AccreditationRootAuthorityV01[] = [
    {
      rootAuthorityRef,
      registryRef: `GENESIS:AUTHORITY:${rootAuthorityRef}`,
      state: "ACTIVE",
      validFrom,
      validUntil,
      jurisdictions: [jurisdiction],
      authorityDomains: ["CALIBRATION_ACCREDITATION"],
    },
  ];

  const accreditorRefs = [...new Set(input.accreditationGrants.map((grant) => grant.accreditorRef))];
  const accreditors: AccreditorRegistryRecordV01[] = accreditorRefs.map((accreditorRef) => ({
    accreditorRef,
    registryRef: `GENESIS:ACCREDITOR:${accreditorRef}`,
    state: "ACTIVE",
    jurisdiction,
    registeredAt: validFrom,
  }));
  const rootDelegations: AccreditorRootDelegationV01[] = accreditorRefs.map((accreditorRef) => ({
    delegationRef: `ROOT-DELEGATION:${accreditorRef}:001`,
    rootAuthorityRef,
    accreditorRef,
    jurisdiction,
    authorityDomain: "CALIBRATION_ACCREDITATION",
    validFrom,
    validUntil,
    status: "ACTIVE",
  }));

  const signingKeys: TrustSigningKeyRecordV01[] = [];
  const signedArtifacts: SignedTrustArtifactV01[] = [];

  const rootKey = generateSigningKey({
    keyRef: `KEY:${rootAuthorityRef}:001`,
    principalRef: rootAuthorityRef,
    purpose: "ROOT_DELEGATION",
    validFrom,
    validUntil,
  });
  signingKeys.push(rootKey.record);
  for (const delegation of rootDelegations) {
    const payload = canonicalRootDelegationPayloadV01(delegation);
    signedArtifacts.push(
      signedArtifact({
        signatureRef: `SIGNATURE:${delegation.delegationRef}:001`,
        subjectRef: delegation.delegationRef,
        kind: "ROOT_DELEGATION",
        keyRef: rootKey.record.keyRef,
        signedAt: validFrom,
        payload,
        privateKey: rootKey.privateKey,
      }),
    );
  }

  for (const accreditorRef of accreditorRefs) {
    const accreditorKey = generateSigningKey({
      keyRef: `KEY:${accreditorRef}:ACCREDITATION:001`,
      principalRef: accreditorRef,
      purpose: "ACCREDITATION_GRANT",
      validFrom,
      validUntil,
    });
    signingKeys.push(accreditorKey.record);
    for (const grant of input.accreditationGrants.filter((candidate) => candidate.accreditorRef === accreditorRef)) {
      const payload = canonicalAccreditationGrantPayloadV01(grant);
      signedArtifacts.push(
        signedArtifact({
          signatureRef: `SIGNATURE:${grant.grantRef}:001`,
          subjectRef: grant.grantRef,
          kind: "ACCREDITATION_GRANT",
          keyRef: accreditorKey.record.keyRef,
          signedAt: grant.validFrom,
          payload,
          privateKey: accreditorKey.privateKey,
        }),
      );
    }
  }

  for (const calibrator of input.calibrators) {
    const calibratorKey = generateSigningKey({
      keyRef: `KEY:${calibrator.signerRef}:CALIBRATION:001`,
      principalRef: calibrator.signerRef,
      purpose: "CALIBRATION_ISSUANCE",
      validFrom: calibrator.validFrom,
      validUntil: calibrator.validUntil,
    });
    signingKeys.push(calibratorKey.record);
    for (const issuance of input.issuanceAttestations.filter(
      (candidate) => candidate.signerRef === calibrator.signerRef,
    )) {
      const certificate = input.calibrationCertificates.find(
        (candidate) => candidate.calibrationRef === issuance.certificateRef,
      );
      if (!certificate) continue;
      const payload = canonicalCalibrationIssuancePayloadV01({ certificate, issuance });
      signedArtifacts.push(
        signedArtifact({
          signatureRef: issuance.signatureRef,
          subjectRef: issuance.certificateRef,
          kind: "CALIBRATION_ISSUANCE",
          keyRef: calibratorKey.record.keyRef,
          signedAt: issuance.signedAt,
          payload,
          privateKey: calibratorKey.privateKey,
        }),
      );
    }
  }

  return { rootAuthorities, accreditors, rootDelegations, signingKeys, signedArtifacts };
}
