import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

import type {
  AccreditationRootSignatureResultV01,
  SignedTrustArtifactV01,
  TrustSigningKeyRecordV01,
} from "./accreditation-root-signature-fixture.ts";
import type { CalibrationCertificateIssuanceAttestationV01 } from "./calibration-authority-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import {
  bindAccreditationRootThroughFreshTrustStatusV01,
  digestTrustStatusPublicationV01,
  validateTrustStatusPublicationV01,
  type TrustStatusPublicationResultV01,
  type TrustStatusPublicationV01,
  type TrustStatusSubjectKindV01,
} from "./trust-status-publication-fixture.ts";

export const QEL_FIXTURE_013_REF = "QEL-FIXTURE-013" as const;
export const VSR_QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_VERSION =
  "VSR-QEL-TRUST-STATUS-PUBLISHER-AUTHORITY-001/0.1" as const;
export const QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_ADAPTER_REF =
  "QEL-ADAPTER-TRUST-STATUS-PUBLISHER-AUTHORITY-001" as const;
export const QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_ADAPTER_VERSION = "0.1.0" as const;

export type TrustStatusPublisherStateV01 = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type TrustStatusPublisherGrantStateV01 =
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED"
  | "SUPERSEDED";
export type TrustStatusPublisherKeyStateV01 = "ACTIVE" | "REVOKED" | "SUPERSEDED";

export interface TrustStatusPublisherRecordV01 {
  publisherRef: string;
  registryRef: string;
  state: TrustStatusPublisherStateV01;
  registeredAt: string;
  validFrom: string;
  validUntil: string;
}

export interface TrustStatusPublisherAuthorityGrantV01 {
  grantRef: string;
  publisherRef: string;
  issuingAuthorityRef: string;
  issuerRegistryRef: string;
  authorityEvidenceRef: string;
  capabilityRef: "trust.status.publish";
  status: TrustStatusPublisherGrantStateV01;
  validFrom: string;
  validUntil: string;
  permittedSubjectKinds: readonly TrustStatusSubjectKindV01[];
  permittedSourceAuthorityRefs: readonly string[];
}

export interface TrustStatusPublisherSigningKeyV01 {
  keyRef: string;
  publisherRef: string;
  purpose: "TRUST_STATUS_PUBLICATION";
  algorithm: "ED25519";
  publicKeyPem: string;
  state: TrustStatusPublisherKeyStateV01;
  validFrom: string;
  validUntil: string;
}

export interface TrustStatusPublicationSignatureV01 {
  signatureRef: string;
  publicationRef: string;
  publisherRef: string;
  authorityGrantRef: string;
  keyRef: string;
  signedAt: string;
  publicationDigest: string;
  signatureBase64: string;
  synthetic: true;
}

export type TrustStatusPublisherAuthorityIssueV01 =
  | "trust_status_publication_invalid"
  | "publisher_missing"
  | "publisher_duplicate"
  | "publisher_registry_ref_missing"
  | "publisher_not_active"
  | "publisher_time_invalid"
  | "publisher_not_registered_at_signing"
  | "publisher_not_effective_at_signing"
  | "publisher_not_current"
  | "publisher_authority_missing"
  | "publisher_authority_duplicate"
  | "publisher_authority_publisher_mismatch"
  | "publisher_authority_issuer_missing"
  | "publisher_authority_issuer_registry_missing"
  | "publisher_authority_evidence_missing"
  | "publisher_authority_capability_mismatch"
  | "publisher_authority_not_active"
  | "publisher_authority_time_invalid"
  | "publisher_authority_not_effective_at_signing"
  | "publisher_authority_not_current"
  | "publisher_subject_scope_exceeded"
  | "publisher_source_authority_scope_exceeded"
  | "publisher_signing_key_missing"
  | "publisher_signing_key_duplicate"
  | "publisher_signing_key_publisher_mismatch"
  | "publisher_signing_key_purpose_mismatch"
  | "publisher_signing_key_not_active"
  | "publisher_signing_key_time_invalid"
  | "publisher_signing_key_not_effective_at_signing"
  | "publisher_signing_key_not_current"
  | "publisher_signing_key_public_material_missing"
  | "signature_ref_missing"
  | "signature_publication_mismatch"
  | "signature_publisher_mismatch"
  | "signature_authority_grant_mismatch"
  | "signature_key_mismatch"
  | "signature_time_invalid"
  | "signature_before_publication"
  | "signature_after_river_record"
  | "signature_from_future"
  | "signature_digest_mismatch"
  | "signature_encoding_invalid"
  | "signature_invalid";

export interface TrustStatusPublisherAuthorityResultV01 {
  contractVersion: typeof VSR_QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_VERSION;
  ok: boolean;
  publisherAuthorized: boolean;
  signatureVerified: boolean;
  publicationDigest: string;
  publisherRef?: string;
  authorityGrantRef?: string;
  keyRef?: string;
  issues: readonly TrustStatusPublisherAuthorityIssueV01[];
}

type TrustStatusBaseInputV01 = Omit<
  Parameters<typeof validateTrustStatusPublicationV01>[0],
  "signingKeys"
> & {
  rootSigningKeys: readonly TrustSigningKeyRecordV01[];
};

export type TrustStatusPublisherValidationInputV01 = TrustStatusBaseInputV01 & {
  publishers: readonly TrustStatusPublisherRecordV01[];
  authorityGrants: readonly TrustStatusPublisherAuthorityGrantV01[];
  publisherSigningKeys: readonly TrustStatusPublisherSigningKeyV01[];
  publicationSignature: TrustStatusPublicationSignatureV01;
};

export type TrustStatusPublisherRootBindingInputV01 = TrustStatusPublisherValidationInputV01 & {
  signedArtifacts: readonly SignedTrustArtifactV01[];
  issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[];
};

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function effectiveAt(validFrom: string, validUntil: string, at: string): boolean {
  if (!isIsoDate(validFrom) || !isIsoDate(validUntil) || !isIsoDate(at)) return false;
  const timestamp = Date.parse(at);
  return Date.parse(validFrom) <= timestamp && timestamp <= Date.parse(validUntil);
}

function containsAll<T>(allowed: readonly T[], required: readonly T[]): boolean {
  const set = new Set(allowed);
  return required.every((value) => set.has(value));
}

function validBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function trustStatusInput(input: TrustStatusBaseInputV01): Parameters<typeof validateTrustStatusPublicationV01>[0] {
  return {
    rootAuthorities: input.rootAuthorities,
    accreditors: input.accreditors,
    rootDelegations: input.rootDelegations,
    signingKeys: input.rootSigningKeys,
    organisations: input.organisations,
    accreditationGrants: input.accreditationGrants,
    calibrators: input.calibrators,
    calibrationCertificates: input.calibrationCertificates,
    publication: input.publication,
    riverReceipt: input.riverReceipt,
    observedAt: input.observedAt,
    predecessorPublication: input.predecessorPublication,
  };
}

export function canonicalTrustStatusPublisherSignaturePayloadV01(input: {
  publication: TrustStatusPublicationV01;
  signature: Omit<TrustStatusPublicationSignatureV01, "signatureBase64">;
}): string {
  return JSON.stringify({
    contractVersion: VSR_QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_VERSION,
    publicationRef: input.signature.publicationRef,
    publicationDigest: input.signature.publicationDigest,
    publisherRef: input.signature.publisherRef,
    authorityGrantRef: input.signature.authorityGrantRef,
    keyRef: input.signature.keyRef,
    signedAt: input.signature.signedAt,
    synthetic: input.signature.synthetic,
  });
}

export function validateTrustStatusPublisherAuthorityV01(
  input: TrustStatusPublisherValidationInputV01,
): TrustStatusPublisherAuthorityResultV01 {
  const issues: TrustStatusPublisherAuthorityIssueV01[] = [];
  const trustStatus = validateTrustStatusPublicationV01(trustStatusInput(input));
  const publicationDigest = digestTrustStatusPublicationV01(input.publication);
  if (!trustStatus.publicationValid) issues.push("trust_status_publication_invalid");

  const signature = input.publicationSignature;
  if (!signature.signatureRef.trim()) issues.push("signature_ref_missing");
  if (signature.publicationRef !== input.publication.publicationRef) {
    issues.push("signature_publication_mismatch");
  }
  if (signature.publicationDigest !== publicationDigest) issues.push("signature_digest_mismatch");
  if (!isIsoDate(signature.signedAt)) {
    issues.push("signature_time_invalid");
  } else {
    const signedAtMs = Date.parse(signature.signedAt);
    if (isIsoDate(input.publication.publishedAt) && signedAtMs < Date.parse(input.publication.publishedAt)) {
      issues.push("signature_before_publication");
    }
    if (
      input.riverReceipt &&
      isIsoDate(input.riverReceipt.recordedAt) &&
      signedAtMs > Date.parse(input.riverReceipt.recordedAt)
    ) {
      issues.push("signature_after_river_record");
    }
    if (isIsoDate(input.observedAt) && signedAtMs > Date.parse(input.observedAt)) {
      issues.push("signature_from_future");
    }
  }

  const publishers = input.publishers.filter((publisher) => publisher.publisherRef === signature.publisherRef);
  if (publishers.length === 0) issues.push("publisher_missing");
  if (publishers.length > 1) issues.push("publisher_duplicate");
  const publisher = publishers.length === 1 ? publishers[0] : undefined;
  if (publisher) {
    if (!publisher.registryRef.trim()) issues.push("publisher_registry_ref_missing");
    if (publisher.state !== "ACTIVE") issues.push("publisher_not_active");
    if (![publisher.registeredAt, publisher.validFrom, publisher.validUntil].every(isIsoDate)) {
      issues.push("publisher_time_invalid");
    } else if (isIsoDate(signature.signedAt)) {
      if (Date.parse(publisher.registeredAt) > Date.parse(signature.signedAt)) {
        issues.push("publisher_not_registered_at_signing");
      }
      if (!effectiveAt(publisher.validFrom, publisher.validUntil, signature.signedAt)) {
        issues.push("publisher_not_effective_at_signing");
      }
      if (
        isIsoDate(input.observedAt) &&
        !effectiveAt(publisher.validFrom, publisher.validUntil, input.observedAt)
      ) {
        issues.push("publisher_not_current");
      }
    }
  }

  const grants = input.authorityGrants.filter((grant) => grant.grantRef === signature.authorityGrantRef);
  if (grants.length === 0) issues.push("publisher_authority_missing");
  if (grants.length > 1) issues.push("publisher_authority_duplicate");
  const grant = grants.length === 1 ? grants[0] : undefined;
  if (grant) {
    if (grant.publisherRef !== signature.publisherRef) issues.push("publisher_authority_publisher_mismatch");
    if (!grant.issuingAuthorityRef.trim()) issues.push("publisher_authority_issuer_missing");
    if (!grant.issuerRegistryRef.trim()) issues.push("publisher_authority_issuer_registry_missing");
    if (!grant.authorityEvidenceRef.trim()) issues.push("publisher_authority_evidence_missing");
    if (grant.capabilityRef !== "trust.status.publish") issues.push("publisher_authority_capability_mismatch");
    if (grant.status !== "ACTIVE") issues.push("publisher_authority_not_active");
    if (!isIsoDate(grant.validFrom) || !isIsoDate(grant.validUntil)) {
      issues.push("publisher_authority_time_invalid");
    } else if (isIsoDate(signature.signedAt)) {
      if (!effectiveAt(grant.validFrom, grant.validUntil, signature.signedAt)) {
        issues.push("publisher_authority_not_effective_at_signing");
      }
      if (
        isIsoDate(input.observedAt) &&
        !effectiveAt(grant.validFrom, grant.validUntil, input.observedAt)
      ) {
        issues.push("publisher_authority_not_current");
      }
    }
    const usedKinds = [...new Set(input.publication.entries.map((entry) => entry.subjectKind))];
    if (!containsAll(grant.permittedSubjectKinds, usedKinds)) {
      issues.push("publisher_subject_scope_exceeded");
    }
    const usedAuthorities = [
      ...new Set(input.publication.entries.map((entry) => entry.sourceAuthorityRef)),
    ];
    if (!containsAll(grant.permittedSourceAuthorityRefs, usedAuthorities)) {
      issues.push("publisher_source_authority_scope_exceeded");
    }
  }

  const keys = input.publisherSigningKeys.filter((key) => key.keyRef === signature.keyRef);
  if (keys.length === 0) issues.push("publisher_signing_key_missing");
  if (keys.length > 1) issues.push("publisher_signing_key_duplicate");
  const signingKey = keys.length === 1 ? keys[0] : undefined;
  if (signingKey) {
    if (signingKey.publisherRef !== signature.publisherRef) {
      issues.push("publisher_signing_key_publisher_mismatch");
    }
    if (signingKey.purpose !== "TRUST_STATUS_PUBLICATION") {
      issues.push("publisher_signing_key_purpose_mismatch");
    }
    if (signingKey.state !== "ACTIVE") issues.push("publisher_signing_key_not_active");
    if (!isIsoDate(signingKey.validFrom) || !isIsoDate(signingKey.validUntil)) {
      issues.push("publisher_signing_key_time_invalid");
    } else if (isIsoDate(signature.signedAt)) {
      if (!effectiveAt(signingKey.validFrom, signingKey.validUntil, signature.signedAt)) {
        issues.push("publisher_signing_key_not_effective_at_signing");
      }
      if (
        isIsoDate(input.observedAt) &&
        !effectiveAt(signingKey.validFrom, signingKey.validUntil, input.observedAt)
      ) {
        issues.push("publisher_signing_key_not_current");
      }
    }
    if (!signingKey.publicKeyPem.trim()) issues.push("publisher_signing_key_public_material_missing");
  }

  if (publisher && signature.publisherRef !== publisher.publisherRef) issues.push("signature_publisher_mismatch");
  if (grant && signature.authorityGrantRef !== grant.grantRef) issues.push("signature_authority_grant_mismatch");
  if (signingKey && signature.keyRef !== signingKey.keyRef) issues.push("signature_key_mismatch");

  let signatureVerified = false;
  if (!validBase64(signature.signatureBase64)) {
    issues.push("signature_encoding_invalid");
  } else if (signingKey?.publicKeyPem.trim()) {
    try {
      const payload = canonicalTrustStatusPublisherSignaturePayloadV01({
        publication: input.publication,
        signature: {
          signatureRef: signature.signatureRef,
          publicationRef: signature.publicationRef,
          publisherRef: signature.publisherRef,
          authorityGrantRef: signature.authorityGrantRef,
          keyRef: signature.keyRef,
          signedAt: signature.signedAt,
          publicationDigest: signature.publicationDigest,
          synthetic: signature.synthetic,
        },
      });
      signatureVerified = cryptoVerify(
        null,
        Buffer.from(payload, "utf8"),
        signingKey.publicKeyPem,
        Buffer.from(signature.signatureBase64, "base64"),
      );
      if (!signatureVerified) issues.push("signature_invalid");
    } catch {
      issues.push("signature_invalid");
    }
  }

  const authorizationIssues = issues.filter(
    (issue) =>
      issue.startsWith("publisher_") ||
      issue.startsWith("signature_publisher") ||
      issue.startsWith("signature_authority") ||
      issue.startsWith("signature_key"),
  );

  return {
    contractVersion: VSR_QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_VERSION,
    ok: issues.length === 0 && signatureVerified,
    publisherAuthorized: authorizationIssues.length === 0,
    signatureVerified,
    publicationDigest,
    publisherRef: publisher?.publisherRef,
    authorityGrantRef: grant?.grantRef,
    keyRef: signingKey?.keyRef,
    issues,
  };
}

export function bindAccreditationRootThroughAuthorizedStatusPublisherV01(
  input: TrustStatusPublisherRootBindingInputV01,
): {
  ok: boolean;
  publisherAuthority: TrustStatusPublisherAuthorityResultV01;
  trustStatus?: TrustStatusPublicationResultV01;
  rootTrust?: AccreditationRootSignatureResultV01;
} {
  const publisherAuthority = validateTrustStatusPublisherAuthorityV01(input);
  if (!publisherAuthority.ok) return { ok: false, publisherAuthority };
  const rooted = bindAccreditationRootThroughFreshTrustStatusV01({
    rootAuthorities: input.rootAuthorities,
    accreditors: input.accreditors,
    rootDelegations: input.rootDelegations,
    signingKeys: input.rootSigningKeys,
    signedArtifacts: input.signedArtifacts,
    organisations: input.organisations,
    accreditationGrants: input.accreditationGrants,
    calibrators: input.calibrators,
    calibrationCertificates: input.calibrationCertificates,
    issuanceAttestations: input.issuanceAttestations,
    publication: input.publication,
    riverReceipt: input.riverReceipt,
    observedAt: input.observedAt,
    predecessorPublication: input.predecessorPublication,
  });
  return {
    ok: rooted.ok,
    publisherAuthority,
    trustStatus: rooted.trustStatus,
    rootTrust: rooted.rootTrust,
  };
}

export function mapTrustStatusPublisherAuthorityToQelFrameV01(
  input: TrustStatusPublisherValidationInputV01 & { locationRef?: string },
): QelOperationalFrameV01 {
  const result = validateTrustStatusPublisherAuthorityV01(input);
  const evidenceRefs = [
    ...input.publishers.map((publisher) => publisher.registryRef),
    ...input.authorityGrants.flatMap((grant) => [grant.issuerRegistryRef, grant.authorityEvidenceRef]),
    ...input.publisherSigningKeys.map((key) => key.keyRef),
    input.publicationSignature.signatureRef,
    input.riverReceipt?.receiptRef,
  ].filter((value): value is string => Boolean(value));
  const evidenceStatus = result.ok ? "FRESH" : evidenceRefs.length > 0 ? "CONFLICTING" : "MISSING";

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_013_REF}:${input.publication.publicationRef}:${input.publication.correlationId}`,
    correlationId: input.publication.correlationId,
    observedAt: input.observedAt,
    object: {
      id: `TRUST-STATUS-PUBLISHER:${input.publication.publicationRef}`,
      type: "TRUST_STATUS_PUBLISHER_AUTHORITY",
      class: "AUTHORIZED_SIGNED_TRUST_STATUS_PUBLISHER",
      registryRef: `GENESIS:TRUST-STATUS-PUBLISHER:${input.publication.publicationRef}`,
      locationRef: input.locationRef,
    },
    state: { value: result.ok ? "READY" : "BLOCKED", kind: "DERIVED", confidence: 1 },
    health: { value: result.ok ? "GOOD" : "ACT", kind: "DERIVED", confidence: 1 },
    flow: {
      state: result.ok ? "COMPLETE" : "BLOCKED",
      value: result.ok ? 1 : 0,
      unit: "AUTHORIZED_STATUS_PUBLISHERS",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: result.ok
      ? { type: "APPROVAL", priority: "MODERATE", target: "accept_signed_trust_status_publication" }
      : { type: "INFORMATION", priority: "HIGH", target: "resolve_status_publisher_authority" },
    risk: result.ok
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "TRUST_STATUS_PUBLISHER_UNVERIFIED", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.publication.publicationRef },
      {
        action: "REAUTHORIZE_STATUS_PUBLISHER",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "trust.status.publisher.authorize",
        targetRef: input.publication.publicationRef,
      },
      {
        action: "ROTATE_STATUS_PUBLISHER_KEY",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "trust.status.publisher.key.rotate",
        targetRef: input.publication.publicationRef,
      },
      {
        action: "ACCEPT_SIGNED_TRUST_STATUS",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "trust.status.publisher.accept",
        targetRef: input.publication.publicationRef,
      },
    ],
    evidence: {
      status: evidenceStatus,
      confidence: evidenceRefs.length > 0 ? 1 : 0,
      freshness: {
        observedAt: input.observedAt,
        ageMs:
          isIsoDate(input.publication.publishedAt) && isIsoDate(input.observedAt)
            ? Math.max(0, Date.parse(input.observedAt) - Date.parse(input.publication.publishedAt))
            : 0,
        status: evidenceStatus,
        maximumValidAgeMs: input.publication.maximumStatusAgeMs,
      },
      sources: evidenceRefs.map((sourceRef) => ({
        sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: sourceRef,
      })),
      riverReceiptRef: input.riverReceipt?.receiptRef,
    },
    outcome: result.ok ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_TRUST_STATUS_PUBLISHER_AUTHORITY_FIXTURE",
      protocol: "ED25519_SYNTHETIC_STATUS_PUBLISHER",
      sourceRef: input.publication.publicationRef,
      rawValue: {
        contractVersion: VSR_QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_VERSION,
        publisherAuthorized: result.publisherAuthorized,
        signatureVerified: result.signatureVerified,
        publicationDigest: result.publicationDigest,
        issues: result.issues,
        statusPublisherGrantsWardenAuthority: false,
        privateKeysPersisted: false,
        synthetic: true,
      },
      adapterRef: QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_ADAPTER_REF,
      adapterVersion: QEL_TRUST_STATUS_PUBLISHER_AUTHORITY_ADAPTER_VERSION,
    },
  };
}

export function buildTrustStatusPublisherAuthorityPodPulseV01(
  input: Parameters<typeof mapTrustStatusPublisherAuthorityToQelFrameV01>[0] & { podRef: string },
): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapTrustStatusPublisherAuthorityToQelFrameV01(input)],
  });
}

export function makeSyntheticTrustStatusPublisherAuthorityBundleV01(
  publication: TrustStatusPublicationV01,
  overrides: { publisherRef?: string; authorityGrantRef?: string } = {},
): {
  publishers: readonly TrustStatusPublisherRecordV01[];
  authorityGrants: readonly TrustStatusPublisherAuthorityGrantV01[];
  publisherSigningKeys: readonly TrustStatusPublisherSigningKeyV01[];
  publicationSignature: TrustStatusPublicationSignatureV01;
} {
  const publisherRef = overrides.publisherRef ?? "TRUST-STATUS-PUBLISHER-SYNTHETIC-001";
  const grantRef = overrides.authorityGrantRef ?? `STATUS-PUBLISHER-GRANT:${publisherRef}:001`;
  const validFrom = "2026-01-01T00:00:00.000Z";
  const validUntil = "2027-01-01T00:00:00.000Z";
  const pair = generateKeyPairSync("ed25519");
  const keyRef = `KEY:${publisherRef}:${keySuffix(pair.publicKey.export({ type: "spki", format: "der" }))}`;
  const publisher: TrustStatusPublisherRecordV01 = {
    publisherRef,
    registryRef: `GENESIS:TRUST-STATUS-PUBLISHER:${publisherRef}`,
    state: "ACTIVE",
    registeredAt: validFrom,
    validFrom,
    validUntil,
  };
  const authorityGrant: TrustStatusPublisherAuthorityGrantV01 = {
    grantRef,
    publisherRef,
    issuingAuthorityRef: "TRUST-STATUS-ROOT-AUTHORITY-SYNTHETIC-001",
    issuerRegistryRef: "GENESIS:AUTHORITY:TRUST-STATUS-ROOT-AUTHORITY-SYNTHETIC-001",
    authorityEvidenceRef: `RIVER:AUTHORITY:${grantRef}`,
    capabilityRef: "trust.status.publish",
    status: "ACTIVE",
    validFrom,
    validUntil,
    permittedSubjectKinds: [...new Set(publication.entries.map((entry) => entry.subjectKind))],
    permittedSourceAuthorityRefs: [
      ...new Set(publication.entries.map((entry) => entry.sourceAuthorityRef)),
    ],
  };
  const signingKey: TrustStatusPublisherSigningKeyV01 = {
    keyRef,
    publisherRef,
    purpose: "TRUST_STATUS_PUBLICATION",
    algorithm: "ED25519",
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    state: "ACTIVE",
    validFrom,
    validUntil,
  };
  const unsigned: Omit<TrustStatusPublicationSignatureV01, "signatureBase64"> = {
    signatureRef: `SIGNATURE:${publication.publicationRef}:${keyRef}`,
    publicationRef: publication.publicationRef,
    publisherRef,
    authorityGrantRef: grantRef,
    keyRef,
    signedAt: publication.publishedAt,
    publicationDigest: digestTrustStatusPublicationV01(publication),
    synthetic: true,
  };
  const payload = canonicalTrustStatusPublisherSignaturePayloadV01({ publication, signature: unsigned });
  const publicationSignature: TrustStatusPublicationSignatureV01 = {
    ...unsigned,
    signatureBase64: cryptoSign(null, Buffer.from(payload, "utf8"), pair.privateKey).toString("base64"),
  };
  return {
    publishers: [publisher],
    authorityGrants: [authorityGrant],
    publisherSigningKeys: [signingKey],
    publicationSignature,
  };
}

function keySuffix(publicKeyDer: Buffer): string {
  return publicKeyDer.subarray(0, 6).toString("hex").toUpperCase();
}
