import { createHash } from "node:crypto";

import type {
  AuthorityPromotionReceiptV1,
  AuthorityRecordIngestReceiptV1,
} from "./authority-record.ts";
import type {
  AuthorityResolutionReceiptV1,
  ReleaseAdmissionContextV1,
} from "./authority-release.ts";

export interface AuthorityEvidenceBundleV1 {
  schema: "VSR_AUTHORITY_EVIDENCE_BUNDLE/1.0";
  bundleId: string;
  status: "UNAVAILABLE" | "EVIDENCED" | "REVOKED" | "SUPERSEDED";
  recordId: string;
  releaseBinding: {
    repository: string;
    sourceSha: string;
    rightsEvidenceArtifactDigest: string;
    authorityTransitionArtifactDigest: string;
  };
  provenanceEvidence: readonly {
    ref: string;
    digest: string;
    subject: string;
    issuer: string;
    observedAt: string;
  }[];
  signatureVerification: {
    signatureRef: string;
    signerPrincipal: string;
    recordDigest: string;
    verificationRef: string;
    verifiedAt: string;
    result: "VALID" | "INVALID" | "UNKNOWN";
  } | null;
  reviewVerification: {
    reviewRef: string;
    reviewerPrincipal: string;
    reviewerCapacity: string;
    recordDigest: string;
    verificationRef: string;
    reviewedAt: string;
    outcome: "APPROVED" | "REJECTED" | "UNKNOWN";
  } | null;
  effectiveFrom: string | null;
  validUntil: string | null;
}

export interface AuthorityEvidenceAdmissibilityReceiptV1 {
  schema: "VSR_AUTHORITY_EVIDENCE_ADMISSIBILITY_RECEIPT/1.0";
  receiptId: string;
  decision: "ADMISSIBLE" | "HOLD";
  authorityRecordIngestReceiptId: string;
  recordId: string;
  recordDigest: string;
  bundleId: string;
  bundleDigest: string;
  repository: string;
  sourceSha: string;
  rightsEvidenceArtifactDigest: string;
  authorityTransitionArtifactDigest: string;
  evaluatedAt: string;
  effectiveFrom: string | null;
  validUntil: string | null;
  provenanceRefs: readonly string[];
  signatureVerificationRef: string | null;
  reviewVerificationRef: string | null;
  reasonCodes: readonly string[];
  wardenEffect: "NOT_EVALUATED";
}

export interface AdmissibleAuthorityPromotionReceiptV1
  extends Omit<AuthorityPromotionReceiptV1, "schema" | "receiptId"> {
  schema: "VSR_ADMISSIBLE_AUTHORITY_PROMOTION_RECEIPT/1.0";
  receiptId: string;
  authorityEvidenceAdmissibilityReceiptId: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalBundle(bundle: AuthorityEvidenceBundleV1): Record<string, unknown> {
  return {
    schema: bundle.schema,
    bundleId: bundle.bundleId,
    status: bundle.status,
    recordId: bundle.recordId,
    releaseBinding: bundle.releaseBinding,
    provenanceEvidence: [...bundle.provenanceEvidence]
      .map((item) => ({ ...item }))
      .sort((a, b) => `${a.ref}:${a.digest}`.localeCompare(`${b.ref}:${b.digest}`)),
    signatureVerification: bundle.signatureVerification,
    reviewVerification: bundle.reviewVerification,
    effectiveFrom: bundle.effectiveFrom,
    validUntil: bundle.validUntil,
  };
}

function sameReleaseBinding(
  ingest: AuthorityRecordIngestReceiptV1,
  bundle: AuthorityEvidenceBundleV1,
): boolean {
  return (
    bundle.releaseBinding.repository === ingest.repository &&
    bundle.releaseBinding.sourceSha === ingest.sourceSha &&
    bundle.releaseBinding.rightsEvidenceArtifactDigest === ingest.rightsEvidenceArtifactDigest &&
    bundle.releaseBinding.authorityTransitionArtifactDigest ===
      ingest.authorityTransitionArtifactDigest
  );
}

function validateProvenance(
  ingest: AuthorityRecordIngestReceiptV1,
  evidence: AuthorityEvidenceBundleV1,
  evaluatedAt: number | null,
  reasons: string[],
): void {
  if (evidence.provenanceEvidence.length === 0) {
    reasons.push("PROVENANCE_EVIDENCE_MISSING");
    return;
  }

  let authorityEvidenceBound = false;
  let automationEvidenceBound = false;
  for (const item of evidence.provenanceEvidence) {
    if (item.subject !== ingest.recordId) reasons.push("PROVENANCE_SUBJECT_MISMATCH");
    if (!item.ref || !item.digest.startsWith("sha256:") || !item.issuer) {
      reasons.push("PROVENANCE_EVIDENCE_INCOMPLETE");
    }
    const observedAt = parseTime(item.observedAt);
    if (observedAt === null || evaluatedAt === null || observedAt > evaluatedAt) {
      reasons.push("PROVENANCE_OBSERVATION_INVALID");
    }
    if (ingest.declaration.authorityEvidenceRefs.includes(item.ref)) authorityEvidenceBound = true;
    if (ingest.declaration.automationControllerEvidenceRefs.includes(item.ref)) {
      automationEvidenceBound = true;
    }
  }

  if (!authorityEvidenceBound) reasons.push("AUTHORITY_PROVENANCE_NOT_BOUND");
  if (!automationEvidenceBound) reasons.push("AUTOMATION_PROVENANCE_NOT_BOUND");
}

function validateSignature(
  ingest: AuthorityRecordIngestReceiptV1,
  evidence: AuthorityEvidenceBundleV1,
  evaluatedAt: number | null,
  reasons: string[],
): void {
  const signature = evidence.signatureVerification;
  if (signature === null) {
    reasons.push("SIGNATURE_VERIFICATION_MISSING");
    return;
  }

  if (signature.signatureRef !== ingest.declaration.signatureRef) {
    reasons.push("SIGNATURE_REFERENCE_MISMATCH");
  }
  if (signature.signerPrincipal !== ingest.declaration.decidingPrincipal) {
    reasons.push("SIGNER_PRINCIPAL_MISMATCH");
  }
  if (signature.recordDigest !== ingest.recordDigest) reasons.push("SIGNATURE_RECORD_DIGEST_MISMATCH");
  if (signature.result !== "VALID") reasons.push("SIGNATURE_VERIFICATION_NOT_VALID");
  if (!signature.verificationRef) reasons.push("SIGNATURE_VERIFICATION_EVIDENCE_MISSING");

  const signedAt = parseTime(ingest.declaration.signedAt);
  const verifiedAt = parseTime(signature.verifiedAt);
  if (
    signedAt === null ||
    verifiedAt === null ||
    evaluatedAt === null ||
    verifiedAt < signedAt ||
    verifiedAt > evaluatedAt
  ) {
    reasons.push("SIGNATURE_VERIFICATION_TIME_INVALID");
  }
}

function validateReview(
  ingest: AuthorityRecordIngestReceiptV1,
  evidence: AuthorityEvidenceBundleV1,
  evaluatedAt: number | null,
  reasons: string[],
): void {
  const review = evidence.reviewVerification;
  if (review === null) {
    reasons.push("REVIEW_VERIFICATION_MISSING");
    return;
  }

  if (review.reviewRef !== ingest.declaration.reviewRef) reasons.push("REVIEW_REFERENCE_MISMATCH");
  if (review.recordDigest !== ingest.recordDigest) reasons.push("REVIEW_RECORD_DIGEST_MISMATCH");
  if (!review.reviewerPrincipal || !review.reviewerCapacity || !review.verificationRef) {
    reasons.push("REVIEW_EVIDENCE_INCOMPLETE");
  }
  if (review.reviewerPrincipal === ingest.declaration.decidingPrincipal) {
    reasons.push("REVIEWER_NOT_INDEPENDENT");
  }
  if (review.outcome !== "APPROVED") reasons.push("REVIEW_NOT_APPROVED");

  const declaredReviewedAt = parseTime(ingest.declaration.reviewedAt);
  const reviewedAt = parseTime(review.reviewedAt);
  if (
    declaredReviewedAt === null ||
    reviewedAt === null ||
    evaluatedAt === null ||
    reviewedAt !== declaredReviewedAt ||
    reviewedAt > evaluatedAt
  ) {
    reasons.push("REVIEW_VERIFICATION_TIME_INVALID");
  }
}

export function evaluateAuthorityEvidenceAdmissibilityV1(input: {
  ingest: AuthorityRecordIngestReceiptV1;
  evidence: AuthorityEvidenceBundleV1;
  evaluatedAt: string;
}): AuthorityEvidenceAdmissibilityReceiptV1 {
  const { ingest, evidence } = input;
  const reasons: string[] = [];
  const evaluatedAt = parseTime(input.evaluatedAt);
  const effectiveFrom = parseTime(evidence.effectiveFrom);
  const validUntil = parseTime(evidence.validUntil);

  if (ingest.decision !== "ACCEPTED") reasons.push("AUTHORITY_RECORD_NOT_ACCEPTED");
  if (evidence.status !== "EVIDENCED") reasons.push("AUTHORITY_EVIDENCE_BUNDLE_NOT_EVIDENCED");
  if (evidence.recordId !== ingest.recordId) reasons.push("AUTHORITY_RECORD_ID_MISMATCH");
  if (!sameReleaseBinding(ingest, evidence)) reasons.push("AUTHORITY_EVIDENCE_RELEASE_BINDING_MISMATCH");

  validateProvenance(ingest, evidence, evaluatedAt, reasons);
  validateSignature(ingest, evidence, evaluatedAt, reasons);
  validateReview(ingest, evidence, evaluatedAt, reasons);

  if (evidence.effectiveFrom === null || evidence.validUntil === null) {
    reasons.push("AUTHORITY_VALIDITY_WINDOW_MISSING");
  } else if (
    evaluatedAt === null ||
    effectiveFrom === null ||
    validUntil === null ||
    validUntil <= effectiveFrom
  ) {
    reasons.push("AUTHORITY_VALIDITY_WINDOW_INVALID");
  } else {
    if (evaluatedAt < effectiveFrom) reasons.push("AUTHORITY_NOT_YET_EFFECTIVE");
    if (evaluatedAt >= validUntil) reasons.push("AUTHORITY_EVIDENCE_EXPIRED");
  }

  const bundleDigest = `sha256:${sha256(JSON.stringify(canonicalBundle(evidence)))}`;
  const decision = reasons.length === 0 ? ("ADMISSIBLE" as const) : ("HOLD" as const);
  const receiptCore = {
    decision,
    authorityRecordIngestReceiptId: ingest.receiptId,
    recordId: ingest.recordId,
    recordDigest: ingest.recordDigest,
    bundleId: evidence.bundleId,
    bundleDigest,
    repository: ingest.repository,
    sourceSha: ingest.sourceSha,
    rightsEvidenceArtifactDigest: ingest.rightsEvidenceArtifactDigest,
    authorityTransitionArtifactDigest: ingest.authorityTransitionArtifactDigest,
    evaluatedAt: input.evaluatedAt,
    effectiveFrom: evidence.effectiveFrom,
    validUntil: evidence.validUntil,
    provenanceRefs: stableUnique(evidence.provenanceEvidence.map((item) => item.ref)),
    signatureVerificationRef: evidence.signatureVerification?.verificationRef || null,
    reviewVerificationRef: evidence.reviewVerification?.verificationRef || null,
    reasonCodes: stableUnique(reasons),
    wardenEffect: "NOT_EVALUATED" as const,
  };

  return {
    schema: "VSR_AUTHORITY_EVIDENCE_ADMISSIBILITY_RECEIPT/1.0",
    receiptId: `AUTHORITY-ADMISSIBILITY:${sha256(JSON.stringify(receiptCore))}`,
    ...receiptCore,
  };
}

function samePromotionTuple(
  ingest: AuthorityRecordIngestReceiptV1,
  admissibility: AuthorityEvidenceAdmissibilityReceiptV1,
  authorityResolution: AuthorityResolutionReceiptV1,
  context: ReleaseAdmissionContextV1,
): boolean {
  return (
    ingest.repository === context.repository &&
    ingest.sourceSha === context.sourceSha &&
    ingest.rightsEvidenceArtifactDigest === context.rightsEvidenceArtifactDigest &&
    ingest.authorityTransitionArtifactDigest === context.authorityTransitionArtifactDigest &&
    admissibility.repository === context.repository &&
    admissibility.sourceSha === context.sourceSha &&
    admissibility.rightsEvidenceArtifactDigest === context.rightsEvidenceArtifactDigest &&
    admissibility.authorityTransitionArtifactDigest === context.authorityTransitionArtifactDigest &&
    authorityResolution.repository === context.repository &&
    authorityResolution.sourceSha === context.sourceSha &&
    authorityResolution.rightsEvidenceArtifactDigest === context.rightsEvidenceArtifactDigest &&
    authorityResolution.authorityTransitionArtifactDigest === context.authorityTransitionArtifactDigest
  );
}

export function promoteReleaseContextFromAdmissibleAuthorityV1(input: {
  ingest: AuthorityRecordIngestReceiptV1;
  admissibility: AuthorityEvidenceAdmissibilityReceiptV1;
  authorityResolution: AuthorityResolutionReceiptV1;
  context: ReleaseAdmissionContextV1;
}): AdmissibleAuthorityPromotionReceiptV1 {
  const { ingest, admissibility, authorityResolution, context } = input;
  const reasons: string[] = [];

  if (ingest.decision !== "ACCEPTED") reasons.push("AUTHORITY_RECORD_NOT_ACCEPTED");
  if (admissibility.decision !== "ADMISSIBLE") reasons.push("AUTHORITY_EVIDENCE_NOT_ADMISSIBLE");
  if (
    admissibility.authorityRecordIngestReceiptId !== ingest.receiptId ||
    admissibility.recordId !== ingest.recordId ||
    admissibility.recordDigest !== ingest.recordDigest
  ) {
    reasons.push("ADMISSIBILITY_RECEIPT_BINDING_MISMATCH");
  }
  if (authorityResolution.decision !== "ALLOW_RIGHTS") {
    reasons.push("AUTHORITY_RESOLUTION_NOT_ALLOW_RIGHTS");
  }
  if (authorityResolution.declarationId !== ingest.declaration.declarationId) {
    reasons.push("AUTHORITY_DECLARATION_ID_MISMATCH");
  }
  if (!samePromotionTuple(ingest, admissibility, authorityResolution, context)) {
    reasons.push("AUTHORITY_RECEIPT_CONTEXT_MISMATCH");
  }
  if (
    authorityResolution.licenseExpression !== "MIT" ||
    !authorityResolution.distributionScope.includes("LAUNCHPAD_ALPHA")
  ) {
    reasons.push("AUTHORITY_SCOPE_NOT_PROMOTABLE");
  }

  const requestedAt = parseTime(context.requestedAt);
  const admissibleFrom = parseTime(admissibility.effectiveFrom);
  const admissibleUntil = parseTime(admissibility.validUntil);
  if (
    requestedAt === null ||
    admissibleFrom === null ||
    admissibleUntil === null ||
    requestedAt < admissibleFrom ||
    requestedAt >= admissibleUntil
  ) {
    reasons.push("RELEASE_REQUEST_OUTSIDE_AUTHORITY_VALIDITY");
  }

  const promoted = reasons.length === 0;
  const promotedContext: ReleaseAdmissionContextV1 = promoted
    ? {
        ...context,
        postForkRightsStatus: "CLEARED",
        postForkLicenseExpression: authorityResolution.licenseExpression,
        releaseRightsStatus: "CLEARED",
        governanceStatus: "CLEARED",
      }
    : { ...context };
  const receiptCore = {
    decision: promoted ? ("PROMOTED" as const) : ("HOLD" as const),
    authorityRecordIngestReceiptId: ingest.receiptId,
    authorityEvidenceAdmissibilityReceiptId: admissibility.receiptId,
    authorityResolutionReceiptId: authorityResolution.receiptId,
    reasonCodes: stableUnique(reasons),
    context: promotedContext,
    wardenEffect: "NOT_EVALUATED" as const,
  };

  return {
    schema: "VSR_ADMISSIBLE_AUTHORITY_PROMOTION_RECEIPT/1.0",
    receiptId: `AUTHORITY-PROMOTION-R0.15:${sha256(JSON.stringify(receiptCore))}`,
    ...receiptCore,
  };
}
