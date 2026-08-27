import { createHash } from "node:crypto";

import type {
  AuthorityDeclarationV1,
  AuthorityResolutionReceiptV1,
  ReleaseAdmissionContextV1,
} from "./authority-release.ts";

export interface CompetentAuthorityRecordV1 {
  schema: "VSR_COMPETENT_AUTHORITY_RECORD/1.0";
  recordId: string;
  status: "UNDECLARED" | "EVIDENCED" | "REVOKED" | "SUPERSEDED";
  releaseBinding: {
    repository: string;
    sourceSha: string;
    rightsEvidenceArtifactDigest: string;
    authorityTransitionArtifactDigest: string;
  };
  decidingPrincipal: string | null;
  decidingCapacity: string | null;
  authorityBasis: string | null;
  authorityEvidenceRefs: readonly string[];
  governanceDecisionRef: string | null;
  postForkLicenseExpression: string | null;
  distributionAuthorized: boolean;
  permittedDistributionScopes: readonly string[];
  automationControllerPrincipal: string | null;
  automationControllerCapacity: string | null;
  automationControllerAuthorityBasis: string | null;
  automationControllerEvidenceRefs: readonly string[];
  attestations: {
    necessaryRightsOwnedOrControlled: boolean;
    authorityToLicensePostForkModifications: boolean;
    automationOutputAttributableToAuthorizedController: boolean;
    noKnownConflictingGrantOrAssignment: boolean;
  };
  signedAt: string | null;
  signatureRef: string | null;
  reviewedAt: string | null;
  reviewRef: string | null;
}

export interface AuthorityRecordIngestReceiptV1 {
  schema: "VSR_AUTHORITY_RECORD_INGEST_RECEIPT/1.0";
  receiptId: string;
  decision: "ACCEPTED" | "HOLD" | "REJECTED";
  recordId: string;
  recordDigest: string;
  repository: string;
  sourceSha: string;
  rightsEvidenceArtifactDigest: string;
  authorityTransitionArtifactDigest: string;
  reasonCodes: readonly string[];
  declaration: AuthorityDeclarationV1;
}

export interface AuthorityPromotionReceiptV1 {
  schema: "VSR_AUTHORITY_PROMOTION_RECEIPT/1.0";
  receiptId: string;
  decision: "PROMOTED" | "HOLD";
  authorityRecordIngestReceiptId: string;
  authorityResolutionReceiptId: string;
  reasonCodes: readonly string[];
  context: ReleaseAdmissionContextV1;
  wardenEffect: "NOT_EVALUATED";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalRecord(record: CompetentAuthorityRecordV1): Record<string, unknown> {
  return {
    schema: record.schema,
    recordId: record.recordId,
    status: record.status,
    releaseBinding: record.releaseBinding,
    decidingPrincipal: record.decidingPrincipal,
    decidingCapacity: record.decidingCapacity,
    authorityBasis: record.authorityBasis,
    authorityEvidenceRefs: stableUnique(record.authorityEvidenceRefs),
    governanceDecisionRef: record.governanceDecisionRef,
    postForkLicenseExpression: record.postForkLicenseExpression,
    distributionAuthorized: record.distributionAuthorized,
    permittedDistributionScopes: stableUnique(record.permittedDistributionScopes),
    automationControllerPrincipal: record.automationControllerPrincipal,
    automationControllerCapacity: record.automationControllerCapacity,
    automationControllerAuthorityBasis: record.automationControllerAuthorityBasis,
    automationControllerEvidenceRefs: stableUnique(record.automationControllerEvidenceRefs),
    attestations: record.attestations,
    signedAt: record.signedAt,
    signatureRef: record.signatureRef,
    reviewedAt: record.reviewedAt,
    reviewRef: record.reviewRef,
  };
}

function normalizedDeclarationStatus(
  record: CompetentAuthorityRecordV1,
  accepted: boolean,
): AuthorityDeclarationV1["status"] {
  if (record.status === "REVOKED") return "REVOKED";
  if (record.status === "SUPERSEDED") return "SUPERSEDED";
  if (record.status === "UNDECLARED") return "UNDECLARED";
  return accepted ? "EVIDENCED" : "SUPERSEDED";
}

function toDeclaration(
  record: CompetentAuthorityRecordV1,
  status: AuthorityDeclarationV1["status"],
): AuthorityDeclarationV1 {
  return {
    declarationId: record.recordId,
    status,
    decidingPrincipal: record.decidingPrincipal,
    decidingCapacity: record.decidingCapacity,
    authorityBasis: record.authorityBasis,
    authorityEvidenceRefs: stableUnique([
      ...record.authorityEvidenceRefs,
      ...(record.governanceDecisionRef ? [record.governanceDecisionRef] : []),
    ]),
    postForkLicenseExpression: record.postForkLicenseExpression,
    distributionAuthorized: record.distributionAuthorized,
    permittedDistributionScopes: stableUnique(record.permittedDistributionScopes),
    automationControllerPrincipal: record.automationControllerPrincipal,
    automationControllerCapacity: record.automationControllerCapacity,
    automationControllerAuthorityBasis: record.automationControllerAuthorityBasis,
    automationControllerEvidenceRefs: stableUnique(record.automationControllerEvidenceRefs),
    attestations: record.attestations,
    signedAt: record.signedAt,
    signatureRef: record.signatureRef,
    reviewedAt: record.reviewedAt,
    reviewRef: record.reviewRef,
  };
}

export function ingestCompetentAuthorityRecordV1(input: {
  record: CompetentAuthorityRecordV1;
  context: ReleaseAdmissionContextV1;
}): AuthorityRecordIngestReceiptV1 {
  const { record, context } = input;
  const reasons: string[] = [];

  if (record.status !== "EVIDENCED") reasons.push("AUTHORITY_RECORD_NOT_EVIDENCED");
  if (record.releaseBinding.repository !== context.repository) {
    reasons.push("REPOSITORY_BINDING_MISMATCH");
  }
  if (record.releaseBinding.sourceSha !== context.sourceSha) {
    reasons.push("SOURCE_SHA_BINDING_MISMATCH");
  }
  if (record.releaseBinding.rightsEvidenceArtifactDigest !== context.rightsEvidenceArtifactDigest) {
    reasons.push("RIGHTS_EVIDENCE_BINDING_MISMATCH");
  }
  if (
    record.releaseBinding.authorityTransitionArtifactDigest !==
    context.authorityTransitionArtifactDigest
  ) {
    reasons.push("AUTHORITY_TRANSITION_BINDING_MISMATCH");
  }
  if (!record.governanceDecisionRef) reasons.push("GOVERNANCE_DECISION_EVIDENCE_MISSING");
  if (!record.recordId.trim()) reasons.push("AUTHORITY_RECORD_ID_MISSING");

  const accepted = reasons.length === 0;
  const decision: AuthorityRecordIngestReceiptV1["decision"] =
    record.status === "REVOKED" ? "REJECTED" : accepted ? "ACCEPTED" : "HOLD";
  const declaration = toDeclaration(record, normalizedDeclarationStatus(record, accepted));
  const recordDigest = `sha256:${sha256(JSON.stringify(canonicalRecord(record)))}`;
  const receiptCore = {
    decision,
    recordId: record.recordId,
    recordDigest,
    repository: context.repository,
    sourceSha: context.sourceSha,
    rightsEvidenceArtifactDigest: context.rightsEvidenceArtifactDigest,
    authorityTransitionArtifactDigest: context.authorityTransitionArtifactDigest,
    reasonCodes: stableUnique(reasons),
    declaration,
  };

  return {
    schema: "VSR_AUTHORITY_RECORD_INGEST_RECEIPT/1.0",
    receiptId: `AUTHORITY-INGEST:${sha256(JSON.stringify(receiptCore))}`,
    ...receiptCore,
  };
}

function sameReleaseTuple(
  authorityResolution: AuthorityResolutionReceiptV1,
  ingest: AuthorityRecordIngestReceiptV1,
  context: ReleaseAdmissionContextV1,
): boolean {
  return (
    authorityResolution.repository === context.repository &&
    authorityResolution.sourceSha === context.sourceSha &&
    authorityResolution.rightsEvidenceArtifactDigest === context.rightsEvidenceArtifactDigest &&
    authorityResolution.authorityTransitionArtifactDigest ===
      context.authorityTransitionArtifactDigest &&
    ingest.repository === context.repository &&
    ingest.sourceSha === context.sourceSha &&
    ingest.rightsEvidenceArtifactDigest === context.rightsEvidenceArtifactDigest &&
    ingest.authorityTransitionArtifactDigest === context.authorityTransitionArtifactDigest
  );
}

export function promoteReleaseContextFromAuthorityV1(input: {
  ingest: AuthorityRecordIngestReceiptV1;
  authorityResolution: AuthorityResolutionReceiptV1;
  context: ReleaseAdmissionContextV1;
}): AuthorityPromotionReceiptV1 {
  const { ingest, authorityResolution, context } = input;
  const reasons: string[] = [];

  if (ingest.decision !== "ACCEPTED") reasons.push("AUTHORITY_RECORD_NOT_ACCEPTED");
  if (authorityResolution.decision !== "ALLOW_RIGHTS") {
    reasons.push("AUTHORITY_RESOLUTION_NOT_ALLOW_RIGHTS");
  }
  if (authorityResolution.declarationId !== ingest.declaration.declarationId) {
    reasons.push("AUTHORITY_DECLARATION_ID_MISMATCH");
  }
  if (!sameReleaseTuple(authorityResolution, ingest, context)) {
    reasons.push("AUTHORITY_RECEIPT_CONTEXT_MISMATCH");
  }
  if (
    authorityResolution.licenseExpression !== "MIT" ||
    !authorityResolution.distributionScope.includes("LAUNCHPAD_ALPHA")
  ) {
    reasons.push("AUTHORITY_SCOPE_NOT_PROMOTABLE");
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
    authorityResolutionReceiptId: authorityResolution.receiptId,
    reasonCodes: stableUnique(reasons),
    context: promotedContext,
    wardenEffect: "NOT_EVALUATED" as const,
  };

  return {
    schema: "VSR_AUTHORITY_PROMOTION_RECEIPT/1.0",
    receiptId: `AUTHORITY-PROMOTION:${sha256(JSON.stringify(receiptCore))}`,
    ...receiptCore,
  };
}
