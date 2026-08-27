import { createHash } from "node:crypto";

export interface AuthorityDeclarationV1 {
  declarationId: string;
  status: "UNDECLARED" | "EVIDENCED" | "REVOKED" | "SUPERSEDED";
  decidingPrincipal: string | null;
  decidingCapacity: string | null;
  authorityBasis: string | null;
  authorityEvidenceRefs: readonly string[];
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

export interface ReleaseAdmissionContextV1 {
  repository: string;
  sourceSha: string;
  rightsEvidenceArtifactDigest: string;
  authorityTransitionArtifactDigest: string;
  upstreamRightsStatus: "EVIDENCED" | "UNKNOWN";
  upstreamLicenseExpression: string | null;
  postForkRightsStatus: "PENDING_AUTHORITY" | "CLEARED" | "DENIED";
  postForkLicenseExpression: string | null;
  releaseRightsStatus: "HOLD" | "CLEARED" | "DENIED";
  governanceStatus: "PENDING_AUTHORITY" | "CLEARED" | "DENIED";
  platformRoute: "OPEN_PUBLIC_PPA" | "PRIVATE_PPA" | "OTHER";
  platformPermissionStatus: "NOT_REQUIRED" | "EVIDENCED" | "ROUTE_PREPARED_NOT_AUTHORIZED" | "DENIED";
  platformApprovalReference?: string;
  purpose: string;
  requestedCapability: string;
  requestedAt: string;
  validUntil: string;
}

export interface AuthorityResolutionReceiptV1 {
  schema: "VSR_AUTHORITY_RESOLUTION_RECEIPT/1.0";
  receiptId: string;
  decision: "ALLOW_RIGHTS" | "HOLD" | "DENY_RIGHTS";
  declarationId: string;
  repository: string;
  sourceSha: string;
  rightsEvidenceArtifactDigest: string;
  authorityTransitionArtifactDigest: string;
  declarationDigest: string;
  contextDigest: string;
  licenseExpression: string | null;
  distributionScope: readonly string[];
  reasonCodes: readonly string[];
  wardenEffect: "NOT_EVALUATED";
}

export interface BuildAdmissionG0InputV1 {
  authorityResolution: AuthorityResolutionReceiptV1;
  context: ReleaseAdmissionContextV1;
  wardenRef: string;
  decidingPrincipal: string;
  capabilityGrantRef: string;
  decidedAt: string;
}

interface BuildAdmissionBaseV1 {
  schema: "VSR_WARDEN_BUILD_ADMISSION_G0/1.0";
  decisionRef: string;
  decision: "ALLOW_BUILD" | "DENY_BUILD";
  repository: string;
  sourceSha: string;
  rightsEvidenceArtifactDigest: string;
  authorityTransitionArtifactDigest: string;
  authorityResolutionReceiptId: string;
  wardenRef: string;
  decidingPrincipal: string;
  capabilityGrantRef: string;
  decidedAt: string;
  validUntil: string;
  purpose: string;
  requestedCapability: string;
  platformRoute: string;
  reasonCodes: readonly string[];
}

export interface BuildAdmissionAllowV1 extends BuildAdmissionBaseV1 {
  decision: "ALLOW_BUILD";
  authorizationToken: string;
}

export interface BuildAdmissionDenyV1 extends BuildAdmissionBaseV1 {
  decision: "DENY_BUILD";
  authorizationToken?: never;
}

export type BuildAdmissionG0DecisionV1 = BuildAdmissionAllowV1 | BuildAdmissionDenyV1;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalAuthorityDeclaration(value: AuthorityDeclarationV1): Record<string, unknown> {
  return {
    declarationId: value.declarationId,
    status: value.status,
    decidingPrincipal: value.decidingPrincipal,
    decidingCapacity: value.decidingCapacity,
    authorityBasis: value.authorityBasis,
    authorityEvidenceRefs: stableUnique(value.authorityEvidenceRefs),
    postForkLicenseExpression: value.postForkLicenseExpression,
    distributionAuthorized: value.distributionAuthorized,
    permittedDistributionScopes: stableUnique(value.permittedDistributionScopes),
    automationControllerPrincipal: value.automationControllerPrincipal,
    automationControllerCapacity: value.automationControllerCapacity,
    automationControllerAuthorityBasis: value.automationControllerAuthorityBasis,
    automationControllerEvidenceRefs: stableUnique(value.automationControllerEvidenceRefs),
    attestations: value.attestations,
    signedAt: value.signedAt,
    signatureRef: value.signatureRef,
    reviewedAt: value.reviewedAt,
    reviewRef: value.reviewRef,
  };
}

function canonicalContext(value: ReleaseAdmissionContextV1): Record<string, unknown> {
  return {
    repository: value.repository,
    sourceSha: value.sourceSha,
    rightsEvidenceArtifactDigest: value.rightsEvidenceArtifactDigest,
    authorityTransitionArtifactDigest: value.authorityTransitionArtifactDigest,
    upstreamRightsStatus: value.upstreamRightsStatus,
    upstreamLicenseExpression: value.upstreamLicenseExpression,
    postForkRightsStatus: value.postForkRightsStatus,
    postForkLicenseExpression: value.postForkLicenseExpression,
    releaseRightsStatus: value.releaseRightsStatus,
    governanceStatus: value.governanceStatus,
    platformRoute: value.platformRoute,
    platformPermissionStatus: value.platformPermissionStatus,
    platformApprovalReference: value.platformApprovalReference ?? null,
    purpose: value.purpose,
    requestedCapability: value.requestedCapability,
    requestedAt: value.requestedAt,
    validUntil: value.validUntil,
  };
}

function validTimeWindow(context: ReleaseAdmissionContextV1): boolean {
  const requestedAt = Date.parse(context.requestedAt);
  const validUntil = Date.parse(context.validUntil);
  return Number.isFinite(requestedAt) && Number.isFinite(validUntil) && validUntil > requestedAt;
}

export function evaluateAuthorityResolutionV1(input: {
  declaration: AuthorityDeclarationV1;
  context: ReleaseAdmissionContextV1;
}): AuthorityResolutionReceiptV1 {
  const { declaration, context } = input;
  const reasons: string[] = [];

  if (declaration.status !== "EVIDENCED") reasons.push("AUTHORITY_DECLARATION_NOT_EVIDENCED");
  if (!declaration.decidingPrincipal) reasons.push("DECIDING_PRINCIPAL_MISSING");
  if (!declaration.decidingCapacity) reasons.push("DECIDING_CAPACITY_MISSING");
  if (!declaration.authorityBasis) reasons.push("AUTHORITY_BASIS_MISSING");
  if (declaration.authorityEvidenceRefs.length === 0) reasons.push("AUTHORITY_EVIDENCE_MISSING");
  if (!declaration.automationControllerPrincipal) reasons.push("AUTOMATION_CONTROLLER_MISSING");
  if (!declaration.automationControllerCapacity) reasons.push("AUTOMATION_CONTROLLER_CAPACITY_MISSING");
  if (!declaration.automationControllerAuthorityBasis) reasons.push("AUTOMATION_CONTROLLER_AUTHORITY_MISSING");
  if (declaration.automationControllerEvidenceRefs.length === 0) reasons.push("AUTOMATION_CONTROLLER_EVIDENCE_MISSING");
  if (!declaration.distributionAuthorized) reasons.push("DISTRIBUTION_NOT_AUTHORIZED");
  if (!declaration.permittedDistributionScopes.includes("LAUNCHPAD_ALPHA")) reasons.push("LAUNCHPAD_ALPHA_SCOPE_MISSING");
  if (declaration.postForkLicenseExpression !== "MIT") reasons.push("POST_FORK_MIT_NOT_AUTHORIZED");
  if (!Object.values(declaration.attestations).every(Boolean)) reasons.push("AUTHORITY_ATTESTATION_INCOMPLETE");
  if (!declaration.signedAt || !declaration.signatureRef) reasons.push("AUTHORITY_SIGNATURE_MISSING");
  if (!declaration.reviewedAt || !declaration.reviewRef) reasons.push("AUTHORITY_REVIEW_MISSING");

  if (context.upstreamRightsStatus !== "EVIDENCED" || context.upstreamLicenseExpression !== "MIT") {
    reasons.push("UPSTREAM_RIGHTS_NOT_EVIDENCED");
  }
  if (context.postForkRightsStatus !== "CLEARED" || context.postForkLicenseExpression !== "MIT") {
    reasons.push("POST_FORK_RIGHTS_NOT_CLEARED");
  }
  if (context.releaseRightsStatus !== "CLEARED") reasons.push("RELEASE_RIGHTS_NOT_CLEARED");
  if (context.governanceStatus !== "CLEARED") reasons.push("GOVERNANCE_NOT_CLEARED");
  if (!validTimeWindow(context)) reasons.push("INVALID_VALIDITY_WINDOW");

  if (context.platformRoute === "OPEN_PUBLIC_PPA") {
    if (context.platformPermissionStatus !== "NOT_REQUIRED") reasons.push("PUBLIC_PPA_ROUTE_NOT_RESOLVED");
  } else if (
    context.platformPermissionStatus !== "EVIDENCED" ||
    !context.platformApprovalReference
  ) {
    reasons.push("PLATFORM_APPROVAL_NOT_EVIDENCED");
  }

  const declarationDigest = sha256(JSON.stringify(canonicalAuthorityDeclaration(declaration)));
  const contextDigest = sha256(JSON.stringify(canonicalContext(context)));
  const decision = reasons.length === 0 ? "ALLOW_RIGHTS" : declaration.status === "REVOKED" ? "DENY_RIGHTS" : "HOLD";
  const distributionScope = stableUnique(declaration.permittedDistributionScopes);
  const receiptCore = {
    decision,
    declarationId: declaration.declarationId,
    repository: context.repository,
    sourceSha: context.sourceSha,
    rightsEvidenceArtifactDigest: context.rightsEvidenceArtifactDigest,
    authorityTransitionArtifactDigest: context.authorityTransitionArtifactDigest,
    declarationDigest,
    contextDigest,
    licenseExpression: declaration.postForkLicenseExpression,
    distributionScope,
    reasonCodes: stableUnique(reasons),
    wardenEffect: "NOT_EVALUATED" as const,
  };

  return {
    schema: "VSR_AUTHORITY_RESOLUTION_RECEIPT/1.0",
    receiptId: `AUTHORITY-RESOLUTION:${sha256(JSON.stringify(receiptCore))}`,
    ...receiptCore,
  };
}

export function evaluateBuildAdmissionG0V1(input: BuildAdmissionG0InputV1): BuildAdmissionG0DecisionV1 {
  const { authorityResolution, context } = input;
  const reasons: string[] = [];

  if (authorityResolution.decision !== "ALLOW_RIGHTS") reasons.push("RIGHTS_NOT_ALLOWED");
  if (
    authorityResolution.repository !== context.repository ||
    authorityResolution.sourceSha !== context.sourceSha ||
    authorityResolution.rightsEvidenceArtifactDigest !== context.rightsEvidenceArtifactDigest ||
    authorityResolution.authorityTransitionArtifactDigest !== context.authorityTransitionArtifactDigest
  ) {
    reasons.push("SOURCE_OR_EVIDENCE_BINDING_MISMATCH");
  }
  if (!input.wardenRef || !input.decidingPrincipal || !input.capabilityGrantRef) {
    reasons.push("WARDEN_AUTHORITY_BINDING_INCOMPLETE");
  }
  if (!validTimeWindow(context)) reasons.push("INVALID_VALIDITY_WINDOW");
  if (context.platformRoute === "OPEN_PUBLIC_PPA") {
    if (context.platformPermissionStatus !== "NOT_REQUIRED") reasons.push("PLATFORM_ROUTE_NOT_RESOLVED");
  } else if (
    context.platformPermissionStatus !== "EVIDENCED" ||
    !context.platformApprovalReference
  ) {
    reasons.push("PLATFORM_ROUTE_NOT_RESOLVED");
  }

  const decidedAt = Date.parse(input.decidedAt);
  const requestedAt = Date.parse(context.requestedAt);
  const validUntil = Date.parse(context.validUntil);
  if (
    !Number.isFinite(decidedAt) ||
    !Number.isFinite(requestedAt) ||
    !Number.isFinite(validUntil) ||
    decidedAt < requestedAt ||
    decidedAt >= validUntil
  ) {
    reasons.push("WARDEN_DECISION_OUTSIDE_VALIDITY_WINDOW");
  }

  const core = {
    repository: context.repository,
    sourceSha: context.sourceSha,
    rightsEvidenceArtifactDigest: context.rightsEvidenceArtifactDigest,
    authorityTransitionArtifactDigest: context.authorityTransitionArtifactDigest,
    authorityResolutionReceiptId: authorityResolution.receiptId,
    wardenRef: input.wardenRef,
    decidingPrincipal: input.decidingPrincipal,
    capabilityGrantRef: input.capabilityGrantRef,
    decidedAt: input.decidedAt,
    validUntil: context.validUntil,
    purpose: context.purpose,
    requestedCapability: context.requestedCapability,
    platformRoute: context.platformRoute,
    reasonCodes: stableUnique(reasons),
  };
  const decisionRef = `WARDEN-G0:${sha256(JSON.stringify(core))}`;

  if (reasons.length > 0) {
    return {
      schema: "VSR_WARDEN_BUILD_ADMISSION_G0/1.0",
      decisionRef,
      decision: "DENY_BUILD",
      ...core,
    };
  }

  return {
    schema: "VSR_WARDEN_BUILD_ADMISSION_G0/1.0",
    decisionRef,
    decision: "ALLOW_BUILD",
    authorizationToken: `WARDEN-BUILD-TOKEN:${sha256(`${decisionRef}:${context.sourceSha}:${authorityResolution.receiptId}`)}`,
    ...core,
  };
}
