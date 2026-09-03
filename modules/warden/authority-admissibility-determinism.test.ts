import { describe, expect, it } from "vitest";

import {
  evaluateAuthorityEvidenceAdmissibilityV1,
  promoteReleaseContextFromAdmissibleAuthorityV1,
  type AuthorityEvidenceBundleV1,
} from "./authority-admissibility.ts";
import {
  ingestCompetentAuthorityRecordV1,
  type CompetentAuthorityRecordV1,
} from "./authority-record.ts";
import { evaluateAuthorityResolutionV1, type ReleaseAdmissionContextV1 } from "./authority-release.ts";

const context: ReleaseAdmissionContextV1 = {
  repository: "Believers-common-group/mcp-node-synnergyze",
  sourceSha: "2251c606e0abebf38a7419e6689874b11c97759b",
  rightsEvidenceArtifactDigest:
    "sha256:0bc52a3cc2123db99f4bb5849c5389f2564ae192871223f7da1991e4d88b302b",
  authorityTransitionArtifactDigest:
    "sha256:979a6cd3d03d447ed2a07780bbf3b4856dd9540ac1de8f7969a6efa790ce4317",
  upstreamRightsStatus: "EVIDENCED",
  upstreamLicenseExpression: "MIT",
  postForkRightsStatus: "PENDING_AUTHORITY",
  postForkLicenseExpression: null,
  releaseRightsStatus: "HOLD",
  governanceStatus: "PENDING_AUTHORITY",
  platformRoute: "OPEN_PUBLIC_PPA",
  platformPermissionStatus: "ROUTE_PREPARED_NOT_AUTHORIZED",
  purpose: "LAUNCHPAD_ALPHA_BUILD",
  requestedCapability: "software.build.launchpad.alpha",
  requestedAt: "2026-08-27T19:30:00.000Z",
  validUntil: "2026-08-27T20:30:00.000Z",
};

const record: CompetentAuthorityRecordV1 = {
  schema: "VSR_COMPETENT_AUTHORITY_RECORD/1.0",
  recordId: "CAR-MCP-NODE-SYNNERGYZE-R0.15-DETERMINISM",
  status: "EVIDENCED",
  releaseBinding: {
    repository: context.repository,
    sourceSha: context.sourceSha,
    rightsEvidenceArtifactDigest: context.rightsEvidenceArtifactDigest,
    authorityTransitionArtifactDigest: context.authorityTransitionArtifactDigest,
  },
  decidingPrincipal: "DIGITALME:COMPETENT-PRINCIPAL",
  decidingCapacity: "CAPACITY:IP-AUTHORITY",
  authorityBasis: "AUTHORITY:EVIDENCED",
  authorityEvidenceRefs: ["RIVER:AUTHORITY-EVIDENCE:001"],
  governanceDecisionRef: "GOVERNANCE:SYNNERGYZE:AUTHORITY:001",
  postForkLicenseExpression: "MIT",
  distributionAuthorized: true,
  permittedDistributionScopes: ["LAUNCHPAD_ALPHA"],
  automationControllerPrincipal: "DIGITALME:AUTHORIZED-CONTROLLER",
  automationControllerCapacity: "CAPACITY:AUTOMATION-CONTROLLER",
  automationControllerAuthorityBasis: "AUTHORITY:AUTOMATION-EVIDENCED",
  automationControllerEvidenceRefs: ["RIVER:AUTOMATION-AUTHORITY:001"],
  attestations: {
    necessaryRightsOwnedOrControlled: true,
    authorityToLicensePostForkModifications: true,
    automationOutputAttributableToAuthorizedController: true,
    noKnownConflictingGrantOrAssignment: true,
  },
  signedAt: "2026-08-27T19:10:00.000Z",
  signatureRef: "SIGNATURE:AUTHORITY:001",
  reviewedAt: "2026-08-27T19:20:00.000Z",
  reviewRef: "REVIEW:AUTHORITY:001",
};

function makeEvidence(recordDigest: string): AuthorityEvidenceBundleV1 {
  return {
    schema: "VSR_AUTHORITY_EVIDENCE_BUNDLE/1.0",
    bundleId: "AEB-MCP-NODE-SYNNERGYZE-R0.15-DETERMINISM",
    status: "EVIDENCED",
    recordId: record.recordId,
    releaseBinding: { ...record.releaseBinding },
    provenanceEvidence: [
      {
        ref: "RIVER:AUTHORITY-EVIDENCE:001",
        digest: "sha256:authority-evidence-001",
        subject: record.recordId,
        issuer: "ORG:COMPETENT-AUTHORITY",
        observedAt: "2026-08-27T19:00:00.000Z",
      },
      {
        ref: "RIVER:AUTOMATION-AUTHORITY:001",
        digest: "sha256:automation-authority-001",
        subject: record.recordId,
        issuer: "ORG:COMPETENT-AUTHORITY",
        observedAt: "2026-08-27T19:00:00.000Z",
      },
    ],
    signatureVerification: {
      signatureRef: "SIGNATURE:AUTHORITY:001",
      signerPrincipal: "DIGITALME:COMPETENT-PRINCIPAL",
      recordDigest,
      verificationRef: "VERIFY:SIGNATURE:001",
      verifiedAt: "2026-08-27T19:12:00.000Z",
      result: "VALID",
    },
    reviewVerification: {
      reviewRef: "REVIEW:AUTHORITY:001",
      reviewerPrincipal: "DIGITALME:INDEPENDENT-REVIEWER",
      reviewerCapacity: "CAPACITY:LEGAL-REVIEW",
      recordDigest,
      verificationRef: "VERIFY:REVIEW:001",
      reviewedAt: "2026-08-27T19:20:00.000Z",
      outcome: "APPROVED",
    },
    effectiveFrom: "2026-08-27T19:15:00.000Z",
    validUntil: "2026-08-28T19:15:00.000Z",
  };
}

describe("R0.15 receipt determinism", () => {
  it("keeps the promotion receipt id stable when equivalent context properties arrive in a different insertion order", () => {
    const ingest = ingestCompetentAuthorityRecordV1({ record, context });
    const rights = evaluateAuthorityResolutionV1({ declaration: ingest.declaration, context });
    const admissibility = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: makeEvidence(ingest.recordDigest),
      evaluatedAt: "2026-08-27T19:30:00.000Z",
    });
    const first = promoteReleaseContextFromAdmissibleAuthorityV1({
      ingest,
      admissibility,
      authorityResolution: rights,
      context,
    });

    const reordered: ReleaseAdmissionContextV1 = {
      validUntil: context.validUntil,
      requestedAt: context.requestedAt,
      requestedCapability: context.requestedCapability,
      purpose: context.purpose,
      platformPermissionStatus: context.platformPermissionStatus,
      platformRoute: context.platformRoute,
      governanceStatus: context.governanceStatus,
      releaseRightsStatus: context.releaseRightsStatus,
      postForkLicenseExpression: context.postForkLicenseExpression,
      postForkRightsStatus: context.postForkRightsStatus,
      upstreamLicenseExpression: context.upstreamLicenseExpression,
      upstreamRightsStatus: context.upstreamRightsStatus,
      authorityTransitionArtifactDigest: context.authorityTransitionArtifactDigest,
      rightsEvidenceArtifactDigest: context.rightsEvidenceArtifactDigest,
      sourceSha: context.sourceSha,
      repository: context.repository,
    };
    const replay = promoteReleaseContextFromAdmissibleAuthorityV1({
      ingest,
      admissibility,
      authorityResolution: rights,
      context: reordered,
    });

    expect(first.decision).toBe("PROMOTED");
    expect(replay.decision).toBe("PROMOTED");
    expect(replay.context).toEqual(first.context);
    expect(replay.receiptId).toBe(first.receiptId);
  });
});
