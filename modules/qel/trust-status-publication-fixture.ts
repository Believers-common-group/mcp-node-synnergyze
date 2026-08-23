import { createHash } from "node:crypto";

import {
  validateAccreditationRootAndSignaturesV01,
  type AccreditationRootSignatureResultV01,
  type AccreditationRootAuthorityV01,
  type AccreditorRegistryRecordV01,
  type AccreditorRootDelegationV01,
  type TrustSigningKeyRecordV01,
} from "./accreditation-root-signature-fixture.ts";
import type {
  AuthorizedCalibratorV01,
  CalibrationAccreditationGrantV01,
  CalibrationOrganisationRecordV01,
} from "./calibration-authority-fixture.ts";
import type { InspectionCalibrationCertificateV01 } from "./inspection-device-trust-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";

export const QEL_FIXTURE_012_REF = "QEL-FIXTURE-012" as const;
export const VSR_QEL_TRUST_STATUS_PUBLICATION_VERSION =
  "VSR-QEL-TRUST-STATUS-PUBLICATION-001/0.1" as const;
export const QEL_TRUST_STATUS_PUBLICATION_ADAPTER_REF =
  "QEL-ADAPTER-TRUST-STATUS-PUBLICATION-001" as const;
export const QEL_TRUST_STATUS_PUBLICATION_ADAPTER_VERSION = "0.1.0" as const;

export type TrustStatusSubjectKindV01 =
  | "ROOT_AUTHORITY"
  | "ACCREDITOR"
  | "ROOT_DELEGATION"
  | "SIGNING_KEY"
  | "CALIBRATION_ORGANISATION"
  | "ACCREDITATION_GRANT"
  | "CALIBRATOR"
  | "CALIBRATION_CERTIFICATE";

export type TrustLifecycleStatusV01 =
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED"
  | "SUPERSEDED";

export interface TrustStatusEntryV01 {
  subjectRef: string;
  subjectKind: TrustStatusSubjectKindV01;
  state: TrustLifecycleStatusV01;
  effectiveAt: string;
  sourceAuthorityRef: string;
  evidenceRef: string;
  reasonRef?: string;
  supersededByRef?: string;
}

export interface TrustStatusPublicationV01 {
  publicationRef: string;
  registryRef: string;
  correlationId: string;
  publishedAt: string;
  sequence: number;
  predecessorPublicationRef?: string;
  predecessorDigest?: string;
  maximumStatusAgeMs: number;
  riverEvidenceRef: string;
  entries: readonly TrustStatusEntryV01[];
  synthetic: true;
}

export interface TrustStatusRiverReceiptV01 {
  receiptRef: string;
  publicationRef: string;
  publicationDigest: string;
  riverEvidenceRef: string;
  recordedAt: string;
  state: "RECORDED";
  synthetic: true;
}

export type TrustStatusPublicationIssueV01 =
  | "publication_ref_missing"
  | "registry_ref_missing"
  | "correlation_id_missing"
  | "published_at_invalid"
  | "publication_from_future"
  | "publication_stale"
  | "maximum_status_age_invalid"
  | "publication_sequence_invalid"
  | "predecessor_unexpected"
  | "predecessor_missing"
  | "predecessor_ref_mismatch"
  | "predecessor_sequence_mismatch"
  | "predecessor_digest_mismatch"
  | "river_evidence_ref_missing"
  | "river_receipt_missing"
  | "river_receipt_ref_missing"
  | "river_receipt_publication_mismatch"
  | "river_receipt_digest_mismatch"
  | "river_receipt_evidence_mismatch"
  | "river_receipt_time_invalid"
  | "river_receipt_before_publication"
  | "river_receipt_from_future"
  | "river_receipt_stale"
  | "status_subject_missing"
  | "status_subject_duplicate"
  | "status_subject_unknown"
  | "status_subject_kind_mismatch"
  | "status_state_conflict"
  | "status_effective_time_invalid"
  | "status_effective_after_publication"
  | "status_source_authority_missing"
  | "status_evidence_ref_missing"
  | "status_supersession_ref_missing"
  | "status_subject_not_active";

export interface TrustStatusPublicationResultV01 {
  contractVersion: typeof VSR_QEL_TRUST_STATUS_PUBLICATION_VERSION;
  publicationValid: boolean;
  trustReady: boolean;
  expectedSubjectCount: number;
  activeSubjectCount: number;
  publicationDigest: string;
  issues: readonly TrustStatusPublicationIssueV01[];
}

type ExpectedTrustSubjectV01 = {
  subjectRef: string;
  subjectKind: TrustStatusSubjectKindV01;
  state: TrustLifecycleStatusV01;
};

type TrustSourceInputsV01 = {
  rootAuthorities: readonly AccreditationRootAuthorityV01[];
  accreditors: readonly AccreditorRegistryRecordV01[];
  rootDelegations: readonly AccreditorRootDelegationV01[];
  signingKeys: readonly TrustSigningKeyRecordV01[];
  organisations: readonly CalibrationOrganisationRecordV01[];
  accreditationGrants: readonly CalibrationAccreditationGrantV01[];
  calibrators: readonly AuthorizedCalibratorV01[];
  calibrationCertificates: readonly InspectionCalibrationCertificateV01[];
};

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function calibrationCertificateState(
  state: InspectionCalibrationCertificateV01["status"],
): TrustLifecycleStatusV01 {
  return state === "VALID" ? "ACTIVE" : state;
}

function expectedSubjects(input: TrustSourceInputsV01): readonly ExpectedTrustSubjectV01[] {
  return [
    ...input.rootAuthorities.map((subject) => ({
      subjectRef: subject.rootAuthorityRef,
      subjectKind: "ROOT_AUTHORITY" as const,
      state: subject.state,
    })),
    ...input.accreditors.map((subject) => ({
      subjectRef: subject.accreditorRef,
      subjectKind: "ACCREDITOR" as const,
      state: subject.state,
    })),
    ...input.rootDelegations.map((subject) => ({
      subjectRef: subject.delegationRef,
      subjectKind: "ROOT_DELEGATION" as const,
      state: subject.status,
    })),
    ...input.signingKeys.map((subject) => ({
      subjectRef: subject.keyRef,
      subjectKind: "SIGNING_KEY" as const,
      state: subject.state,
    })),
    ...input.organisations.map((subject) => ({
      subjectRef: subject.organisationRef,
      subjectKind: "CALIBRATION_ORGANISATION" as const,
      state: subject.state,
    })),
    ...input.accreditationGrants.map((subject) => ({
      subjectRef: subject.grantRef,
      subjectKind: "ACCREDITATION_GRANT" as const,
      state: subject.status,
    })),
    ...input.calibrators.map((subject) => ({
      subjectRef: subject.signerRef,
      subjectKind: "CALIBRATOR" as const,
      state: subject.status,
    })),
    ...input.calibrationCertificates.map((subject) => ({
      subjectRef: subject.calibrationRef,
      subjectKind: "CALIBRATION_CERTIFICATE" as const,
      state: calibrationCertificateState(subject.status),
    })),
  ];
}

function sortedEntries(entries: readonly TrustStatusEntryV01[]): readonly TrustStatusEntryV01[] {
  return [...entries].sort((left, right) =>
    `${left.subjectKind}:${left.subjectRef}`.localeCompare(`${right.subjectKind}:${right.subjectRef}`),
  );
}

export function canonicalTrustStatusPublicationPayloadV01(
  publication: TrustStatusPublicationV01,
): string {
  return JSON.stringify({
    contractVersion: VSR_QEL_TRUST_STATUS_PUBLICATION_VERSION,
    publicationRef: publication.publicationRef,
    registryRef: publication.registryRef,
    correlationId: publication.correlationId,
    publishedAt: publication.publishedAt,
    sequence: publication.sequence,
    predecessorPublicationRef: publication.predecessorPublicationRef ?? null,
    predecessorDigest: publication.predecessorDigest ?? null,
    maximumStatusAgeMs: publication.maximumStatusAgeMs,
    riverEvidenceRef: publication.riverEvidenceRef,
    entries: sortedEntries(publication.entries).map((entry) => ({
      subjectRef: entry.subjectRef,
      subjectKind: entry.subjectKind,
      state: entry.state,
      effectiveAt: entry.effectiveAt,
      sourceAuthorityRef: entry.sourceAuthorityRef,
      evidenceRef: entry.evidenceRef,
      reasonRef: entry.reasonRef ?? null,
      supersededByRef: entry.supersededByRef ?? null,
    })),
    synthetic: publication.synthetic,
  });
}

export function digestTrustStatusPublicationV01(publication: TrustStatusPublicationV01): string {
  return createHash("sha256")
    .update(canonicalTrustStatusPublicationPayloadV01(publication), "utf8")
    .digest("hex");
}

export function validateTrustStatusPublicationV01(input: TrustSourceInputsV01 & {
  publication: TrustStatusPublicationV01;
  riverReceipt?: TrustStatusRiverReceiptV01;
  observedAt: string;
  predecessorPublication?: TrustStatusPublicationV01;
}): TrustStatusPublicationResultV01 {
  const issues: TrustStatusPublicationIssueV01[] = [];
  const expected = expectedSubjects(input);
  const publicationDigest = digestTrustStatusPublicationV01(input.publication);
  const publishedAtMs = Date.parse(input.publication.publishedAt);
  const observedAtMs = Date.parse(input.observedAt);

  if (!input.publication.publicationRef.trim()) issues.push("publication_ref_missing");
  if (!input.publication.registryRef.trim()) issues.push("registry_ref_missing");
  if (!input.publication.correlationId.trim()) issues.push("correlation_id_missing");
  if (!isIsoDate(input.publication.publishedAt) || !isIsoDate(input.observedAt)) {
    issues.push("published_at_invalid");
  } else {
    if (publishedAtMs > observedAtMs) issues.push("publication_from_future");
    if (observedAtMs - publishedAtMs > input.publication.maximumStatusAgeMs) {
      issues.push("publication_stale");
    }
  }
  if (
    !Number.isSafeInteger(input.publication.maximumStatusAgeMs) ||
    input.publication.maximumStatusAgeMs < 0
  ) {
    issues.push("maximum_status_age_invalid");
  }
  if (!Number.isSafeInteger(input.publication.sequence) || input.publication.sequence < 1) {
    issues.push("publication_sequence_invalid");
  }
  if (!input.publication.riverEvidenceRef.trim()) issues.push("river_evidence_ref_missing");

  if (input.publication.sequence === 1) {
    if (
      input.publication.predecessorPublicationRef ||
      input.publication.predecessorDigest ||
      input.predecessorPublication
    ) {
      issues.push("predecessor_unexpected");
    }
  } else {
    if (
      !input.publication.predecessorPublicationRef?.trim() ||
      !input.publication.predecessorDigest?.trim() ||
      !input.predecessorPublication
    ) {
      issues.push("predecessor_missing");
    } else {
      if (input.publication.predecessorPublicationRef !== input.predecessorPublication.publicationRef) {
        issues.push("predecessor_ref_mismatch");
      }
      if (input.publication.sequence !== input.predecessorPublication.sequence + 1) {
        issues.push("predecessor_sequence_mismatch");
      }
      if (
        input.publication.predecessorDigest !==
        digestTrustStatusPublicationV01(input.predecessorPublication)
      ) {
        issues.push("predecessor_digest_mismatch");
      }
    }
  }

  const expectedByRef = new Map(expected.map((subject) => [subject.subjectRef, subject]));
  const entriesByRef = new Map<string, TrustStatusEntryV01[]>();
  for (const entry of input.publication.entries) {
    const entries = entriesByRef.get(entry.subjectRef) ?? [];
    entries.push(entry);
    entriesByRef.set(entry.subjectRef, entries);

    const expectedSubject = expectedByRef.get(entry.subjectRef);
    if (!expectedSubject) {
      issues.push("status_subject_unknown");
      continue;
    }
    if (entry.subjectKind !== expectedSubject.subjectKind) issues.push("status_subject_kind_mismatch");
    if (entry.state !== expectedSubject.state) issues.push("status_state_conflict");
    if (!isIsoDate(entry.effectiveAt)) {
      issues.push("status_effective_time_invalid");
    } else if (isIsoDate(input.publication.publishedAt) && Date.parse(entry.effectiveAt) > publishedAtMs) {
      issues.push("status_effective_after_publication");
    }
    if (!entry.sourceAuthorityRef.trim()) issues.push("status_source_authority_missing");
    if (!entry.evidenceRef.trim()) issues.push("status_evidence_ref_missing");
    if (entry.state === "SUPERSEDED" && !entry.supersededByRef?.trim()) {
      issues.push("status_supersession_ref_missing");
    }
    if (entry.state !== "ACTIVE") issues.push("status_subject_not_active");
  }

  for (const subject of expected) {
    const matches = entriesByRef.get(subject.subjectRef) ?? [];
    if (matches.length === 0) issues.push("status_subject_missing");
    if (matches.length > 1) issues.push("status_subject_duplicate");
  }

  const receipt = input.riverReceipt;
  if (!receipt) {
    issues.push("river_receipt_missing");
  } else {
    if (!receipt.receiptRef.trim()) issues.push("river_receipt_ref_missing");
    if (receipt.publicationRef !== input.publication.publicationRef) {
      issues.push("river_receipt_publication_mismatch");
    }
    if (receipt.publicationDigest !== publicationDigest) issues.push("river_receipt_digest_mismatch");
    if (receipt.riverEvidenceRef !== input.publication.riverEvidenceRef) {
      issues.push("river_receipt_evidence_mismatch");
    }
    if (!isIsoDate(receipt.recordedAt)) {
      issues.push("river_receipt_time_invalid");
    } else if (isIsoDate(input.publication.publishedAt) && isIsoDate(input.observedAt)) {
      const recordedAtMs = Date.parse(receipt.recordedAt);
      if (recordedAtMs < publishedAtMs) issues.push("river_receipt_before_publication");
      if (recordedAtMs > observedAtMs) issues.push("river_receipt_from_future");
      if (observedAtMs - recordedAtMs > input.publication.maximumStatusAgeMs) {
        issues.push("river_receipt_stale");
      }
    }
  }

  const nonLifecycleIssues = issues.filter((issue) => issue !== "status_subject_not_active");
  const publicationValid = nonLifecycleIssues.length === 0;
  const activeSubjectCount = input.publication.entries.filter((entry) => entry.state === "ACTIVE").length;

  return {
    contractVersion: VSR_QEL_TRUST_STATUS_PUBLICATION_VERSION,
    publicationValid,
    trustReady: publicationValid && !issues.includes("status_subject_not_active"),
    expectedSubjectCount: expected.length,
    activeSubjectCount,
    publicationDigest,
    issues,
  };
}

export function bindAccreditationRootThroughFreshTrustStatusV01(
  input: Parameters<typeof validateAccreditationRootAndSignaturesV01>[0] &
    TrustSourceInputsV01 & {
      publication: TrustStatusPublicationV01;
      riverReceipt?: TrustStatusRiverReceiptV01;
      observedAt: string;
      predecessorPublication?: TrustStatusPublicationV01;
    },
): {
  ok: boolean;
  trustStatus: TrustStatusPublicationResultV01;
  rootTrust?: AccreditationRootSignatureResultV01;
} {
  const trustStatus = validateTrustStatusPublicationV01(input);
  if (!trustStatus.trustReady) return { ok: false, trustStatus };
  const rootTrust = validateAccreditationRootAndSignaturesV01(input);
  return { ok: rootTrust.ok, trustStatus, rootTrust };
}

export function mapTrustStatusPublicationToQelFrameV01(
  input: TrustSourceInputsV01 & {
    publication: TrustStatusPublicationV01;
    riverReceipt?: TrustStatusRiverReceiptV01;
    observedAt: string;
    predecessorPublication?: TrustStatusPublicationV01;
    locationRef?: string;
  },
): QelOperationalFrameV01 {
  const result = validateTrustStatusPublicationV01(input);
  const evidenceStatus = !input.riverReceipt
    ? "MISSING"
    : result.publicationValid
      ? "FRESH"
      : result.issues.some((issue) => issue === "publication_stale" || issue === "river_receipt_stale")
        ? "STALE"
        : "CONFLICTING";
  const ageMs =
    isIsoDate(input.publication.publishedAt) && isIsoDate(input.observedAt)
      ? Math.max(0, Date.parse(input.observedAt) - Date.parse(input.publication.publishedAt))
      : 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_012_REF}:${input.publication.publicationRef}:${input.publication.correlationId}`,
    correlationId: input.publication.correlationId,
    observedAt: input.observedAt,
    object: {
      id: input.publication.publicationRef,
      type: "TRUST_STATUS_PUBLICATION",
      class: "RIVER_BOUND_TRUST_LIFECYCLE_STATUS",
      registryRef: input.publication.registryRef,
      locationRef: input.locationRef,
    },
    state: { value: result.trustReady ? "READY" : "BLOCKED", kind: "DERIVED", confidence: 1 },
    health: { value: result.trustReady ? "GOOD" : "ACT", kind: "DERIVED", confidence: 1 },
    flow: {
      state: result.trustReady ? "COMPLETE" : "BLOCKED",
      value: result.activeSubjectCount,
      unit: "CURRENT_TRUST_SUBJECTS",
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: result.trustReady
      ? { type: "APPROVAL", priority: "MODERATE", target: "accept_current_trust_status" }
      : { type: "INFORMATION", priority: "HIGH", target: "refresh_or_resolve_trust_status" },
    risk: result.trustReady
      ? { type: "NONE", severity: "NONE", confidence: 1 }
      : { type: "TRUST_STATUS_NOT_CURRENT", severity: "HIGH", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.publication.publicationRef },
      {
        action: "REFRESH_TRUST_STATUS",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "trust.status.refresh",
        targetRef: input.publication.publicationRef,
      },
      {
        action: "ACCEPT_CURRENT_TRUST_STATUS",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "trust.status.accept",
        targetRef: input.publication.publicationRef,
      },
    ],
    evidence: {
      status: evidenceStatus,
      confidence: input.riverReceipt ? 1 : 0,
      freshness: {
        observedAt: input.observedAt,
        ageMs,
        status: evidenceStatus,
        maximumValidAgeMs: input.publication.maximumStatusAgeMs,
      },
      sources: [
        {
          sourceRef: input.publication.riverEvidenceRef,
          kind: "SYSTEM",
          nativeRef: input.riverReceipt?.receiptRef,
        },
      ].filter((source) => Boolean(source.sourceRef)),
      riverReceiptRef: input.riverReceipt?.receiptRef,
    },
    outcome: result.trustReady ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_TRUST_STATUS_PUBLICATION_FIXTURE",
      protocol: "SYNTHETIC_RIVER_STATUS_PUBLICATION",
      sourceRef: input.publication.publicationRef,
      rawValue: {
        contractVersion: VSR_QEL_TRUST_STATUS_PUBLICATION_VERSION,
        publicationValid: result.publicationValid,
        trustReady: result.trustReady,
        expectedSubjectCount: result.expectedSubjectCount,
        activeSubjectCount: result.activeSubjectCount,
        publicationDigest: result.publicationDigest,
        issues: result.issues,
        statusPublicationGrantsAuthority: false,
        synthetic: true,
      },
      adapterRef: QEL_TRUST_STATUS_PUBLICATION_ADAPTER_REF,
      adapterVersion: QEL_TRUST_STATUS_PUBLICATION_ADAPTER_VERSION,
    },
  };
}

export function buildTrustStatusPublicationPodPulseV01(
  input: Parameters<typeof mapTrustStatusPublicationToQelFrameV01>[0] & { podRef: string },
): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.observedAt,
    frames: [mapTrustStatusPublicationToQelFrameV01(input)],
  });
}

export function makeSyntheticTrustStatusPublicationBundleV01(
  input: TrustSourceInputsV01 & {
    observedAt: string;
    correlationId?: string;
    sequence?: number;
    predecessorPublication?: TrustStatusPublicationV01;
  },
): {
  publication: TrustStatusPublicationV01;
  riverReceipt: TrustStatusRiverReceiptV01;
} {
  const sequence = input.sequence ?? (input.predecessorPublication ? input.predecessorPublication.sequence + 1 : 1);
  const publicationRef = `TRUST-STATUS-PUBLICATION-${String(sequence).padStart(3, "0")}`;
  const entries: TrustStatusEntryV01[] = expectedSubjects(input).map((subject) => ({
    ...subject,
    effectiveAt: input.observedAt,
    sourceAuthorityRef: `STATUS-AUTHORITY:${subject.subjectKind}`,
    evidenceRef: `RIVER:STATUS:${subject.subjectRef}:${sequence}`,
    ...(subject.state === "SUPERSEDED"
      ? { supersededByRef: `SUPERSEDING:${subject.subjectRef}:${sequence}` }
      : {}),
  }));
  const publication: TrustStatusPublicationV01 = {
    publicationRef,
    registryRef: `GENESIS:TRUST-STATUS:${publicationRef}`,
    correlationId: input.correlationId ?? `QEL-TRUST-STATUS-${sequence}`,
    publishedAt: input.observedAt,
    sequence,
    ...(input.predecessorPublication
      ? {
          predecessorPublicationRef: input.predecessorPublication.publicationRef,
          predecessorDigest: digestTrustStatusPublicationV01(input.predecessorPublication),
        }
      : {}),
    maximumStatusAgeMs: 300_000,
    riverEvidenceRef: `RIVER:TRUST-STATUS:${publicationRef}`,
    entries,
    synthetic: true,
  };
  const riverReceipt: TrustStatusRiverReceiptV01 = {
    receiptRef: `RIVER-RECEIPT:${publicationRef}`,
    publicationRef,
    publicationDigest: digestTrustStatusPublicationV01(publication),
    riverEvidenceRef: publication.riverEvidenceRef,
    recordedAt: input.observedAt,
    state: "RECORDED",
    synthetic: true,
  };
  return { publication, riverReceipt };
}
