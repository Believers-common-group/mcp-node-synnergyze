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

const SOURCE_SHA = "2251c606e0abebf38a7419e6689874b11c97759b";
const RIGHTS_EVIDENCE_DIGEST =
  "sha256:0bc52a3cc2123db99f4bb5849c5389f2564ae192871223f7da1991e4d88b302b";
const AUTHORITY_TRANSITION_DIGEST =
  "sha256:979a6cd3d03d447ed2a07780bbf3b4856dd9540ac1de8f7969a6efa790ce4317";

function context(overrides: Partial<ReleaseAdmissionContextV1> = {}): ReleaseAdmissionContextV1 {
  return {
    repository: "Believers-common-group/mcp-node-synnergyze",
    sourceSha: SOURCE_SHA,
    rightsEvidenceArtifactDigest: RIGHTS_EVIDENCE_DIGEST,
    authorityTransitionArtifactDigest: AUTHORITY_TRANSITION_DIGEST,
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
    ...overrides,
  };
}

function authorityRecord(overrides: Partial<CompetentAuthorityRecordV1> = {}): CompetentAuthorityRecordV1 {
  return {
    schema: "VSR_COMPETENT_AUTHORITY_RECORD/1.0",
    recordId: "CAR-MCP-NODE-SYNNERGYZE-R0.15",
    status: "EVIDENCED",
    releaseBinding: {
      repository: "Believers-common-group/mcp-node-synnergyze",
      sourceSha: SOURCE_SHA,
      rightsEvidenceArtifactDigest: RIGHTS_EVIDENCE_DIGEST,
      authorityTransitionArtifactDigest: AUTHORITY_TRANSITION_DIGEST,
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
    ...overrides,
  };
}

function evidenceBundle(overrides: Partial<AuthorityEvidenceBundleV1> = {}): AuthorityEvidenceBundleV1 {
  return {
    schema: "VSR_AUTHORITY_EVIDENCE_BUNDLE/1.0",
    bundleId: "AEB-MCP-NODE-SYNNERGYZE-R0.15",
    recordId: "CAR-MCP-NODE-SYNNERGYZE-R0.15",
    releaseBinding: {
      repository: "Believers-common-group/mcp-node-synnergyze",
      sourceSha: SOURCE_SHA,
      rightsEvidenceArtifactDigest: RIGHTS_EVIDENCE_DIGEST,
      authorityTransitionArtifactDigest: AUTHORITY_TRANSITION_DIGEST,
    },
    provenanceEvidence: [
      {
        ref: "RIVER:AUTHORITY-EVIDENCE:001",
        digest: "sha256:authority-evidence-001",
        subject: "CAR-MCP-NODE-SYNNERGYZE-R0.15",
        issuer: "ORG:COMPETENT-AUTHORITY",
        observedAt: "2026-08-27T19:00:00.000Z",
      },
      {
        ref: "RIVER:AUTOMATION-AUTHORITY:001",
        digest: "sha256:automation-authority-001",
        subject: "CAR-MCP-NODE-SYNNERGYZE-R0.15",
        issuer: "ORG:COMPETENT-AUTHORITY",
        observedAt: "2026-08-27T19:00:00.000Z",
      },
    ],
    signatureVerification: {
      signatureRef: "SIGNATURE:AUTHORITY:001",
      signerPrincipal: "DIGITALME:COMPETENT-PRINCIPAL",
      recordDigest: "sha256:record-digest",
      verificationRef: "VERIFY:SIGNATURE:001",
      verifiedAt: "2026-08-27T19:12:00.000Z",
      result: "VALID",
    },
    reviewVerification: {
      reviewRef: "REVIEW:AUTHORITY:001",
      reviewerPrincipal: "DIGITALME:INDEPENDENT-REVIEWER",
      reviewerCapacity: "CAPACITY:LEGAL-REVIEW",
      recordDigest: "sha256:record-digest",
      verificationRef: "VERIFY:REVIEW:001",
      reviewedAt: "2026-08-27T19:20:00.000Z",
      outcome: "APPROVED",
    },
    effectiveFrom: "2026-08-27T19:15:00.000Z",
    validUntil: "2026-08-28T19:15:00.000Z",
    ...overrides,
  };
}

function acceptedIngest() {
  return ingestCompetentAuthorityRecordV1({ record: authorityRecord(), context: context() });
}

describe("VSR-SOFTWARE-RIGHTS-GRAPH-001 R0.15 authority evidence admissibility", () => {
  it("holds when provenance evidence does not bind the authority record", () => {
    const ingest = acceptedIngest();
    const bundle = evidenceBundle({
      provenanceEvidence: [
        {
          ...evidenceBundle().provenanceEvidence[0],
          subject: "CAR-OTHER",
        },
      ],
    });

    const receipt = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: bundle,
      evaluatedAt: "2026-08-27T19:30:00.000Z",
    });

    expect(receipt.decision).toBe("HOLD");
    expect(receipt.reasonCodes).toContain("PROVENANCE_SUBJECT_MISMATCH");
  });

  it("holds when signature verification is missing, stale, or not valid", () => {
    const ingest = acceptedIngest();
    const receipt = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: evidenceBundle({
        signatureVerification: {
          ...evidenceBundle().signatureVerification,
          result: "INVALID",
        },
      }),
      evaluatedAt: "2026-08-27T19:30:00.000Z",
    });

    expect(receipt.decision).toBe("HOLD");
    expect(receipt.reasonCodes).toContain("SIGNATURE_VERIFICATION_NOT_VALID");
  });

  it("holds when review evidence is not approved or is performed by the deciding principal", () => {
    const ingest = acceptedIngest();
    const receipt = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: evidenceBundle({
        reviewVerification: {
          ...evidenceBundle().reviewVerification,
          reviewerPrincipal: "DIGITALME:COMPETENT-PRINCIPAL",
          outcome: "APPROVED",
        },
      }),
      evaluatedAt: "2026-08-27T19:30:00.000Z",
    });

    expect(receipt.decision).toBe("HOLD");
    expect(receipt.reasonCodes).toContain("REVIEWER_NOT_INDEPENDENT");
  });

  it("holds before effectiveFrom and at-or-after validUntil", () => {
    const ingest = acceptedIngest();
    const before = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: evidenceBundle(),
      evaluatedAt: "2026-08-27T19:14:59.000Z",
    });
    const expired = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: evidenceBundle(),
      evaluatedAt: "2026-08-28T19:15:00.000Z",
    });

    expect(before.decision).toBe("HOLD");
    expect(before.reasonCodes).toContain("AUTHORITY_NOT_YET_EFFECTIVE");
    expect(expired.decision).toBe("HOLD");
    expect(expired.reasonCodes).toContain("AUTHORITY_EVIDENCE_EXPIRED");
  });

  it("marks evidence admissible only when release binding, provenance, signature, review and validity all pass", () => {
    const ingest = acceptedIngest();
    const receipt = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: evidenceBundle(),
      evaluatedAt: "2026-08-27T19:30:00.000Z",
    });

    expect(receipt.decision).toBe("ADMISSIBLE");
    expect(receipt.reasonCodes).toEqual([]);
    expect(receipt.receiptId).toMatch(/^AUTHORITY-ADMISSIBILITY:/);
  });

  it("requires both R0.14 ACCEPTED ingest and R0.15 ADMISSIBLE evidence before promotion", () => {
    const base = context();
    const ingest = acceptedIngest();
    const rights = evaluateAuthorityResolutionV1({ declaration: ingest.declaration, context: base });
    const admissibility = evaluateAuthorityEvidenceAdmissibilityV1({
      ingest,
      evidence: evidenceBundle(),
      evaluatedAt: "2026-08-27T19:30:00.000Z",
    });
    const promotion = promoteReleaseContextFromAdmissibleAuthorityV1({
      ingest,
      admissibility,
      authorityResolution: rights,
      context: base,
    });

    expect(rights.decision).toBe("ALLOW_RIGHTS");
    expect(admissibility.decision).toBe("ADMISSIBLE");
    expect(promotion.decision).toBe("PROMOTED");
    expect(promotion.context.releaseRightsStatus).toBe("CLEARED");
    expect(promotion.wardenEffect).toBe("NOT_EVALUATED");
  });
});
