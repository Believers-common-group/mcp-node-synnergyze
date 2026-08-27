import { describe, expect, it } from "vitest";

import { evaluateAuthorityResolutionV1, type ReleaseAdmissionContextV1 } from "./authority-release.ts";
import {
  ingestCompetentAuthorityRecordV1,
  promoteReleaseContextFromAuthorityV1,
  type CompetentAuthorityRecordV1,
} from "./authority-record.ts";

const SOURCE_SHA = "78e9c6543dfdb861df6d536040f33a9b6398400d";
const RIGHTS_EVIDENCE_DIGEST =
  "sha256:296109bdf1618af4b153985f69e298743916c1f3fc1bd05e6756d3e2d5f6f0ba";
const AUTHORITY_TRANSITION_DIGEST =
  "sha256:64e3777155fbd95ad7bbe4379e2940714ae5a1ad42d5f16c91027f3145b55c53";

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
    requestedAt: "2026-08-27T16:30:00.000Z",
    validUntil: "2026-08-27T17:30:00.000Z",
    ...overrides,
  };
}

function authorityRecord(
  overrides: Partial<CompetentAuthorityRecordV1> = {},
): CompetentAuthorityRecordV1 {
  return {
    schema: "VSR_COMPETENT_AUTHORITY_RECORD/1.0",
    recordId: "CAR-MCP-NODE-SYNNERGYZE-R0.14",
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
    signedAt: "2026-08-27T16:00:00.000Z",
    signatureRef: "SIGNATURE:AUTHORITY:001",
    reviewedAt: "2026-08-27T16:05:00.000Z",
    reviewRef: "REVIEW:AUTHORITY:001",
    ...overrides,
  };
}

describe("VSR-SOFTWARE-RIGHTS-GRAPH-001 R0.14 authority record ingestion", () => {
  it("accepts only an evidenced authority record bound to the exact release evidence tuple", () => {
    const ingest = ingestCompetentAuthorityRecordV1({ record: authorityRecord(), context: context() });

    expect(ingest.decision).toBe("ACCEPTED");
    expect(ingest.reasonCodes).toEqual([]);
    expect(ingest.recordDigest).toMatch(/^sha256:/);
    expect(ingest.declaration.status).toBe("EVIDENCED");
    expect(ingest.declaration.declarationId).toBe("CAR-MCP-NODE-SYNNERGYZE-R0.14");
  });

  it("holds a stale authority record when the source SHA does not match", () => {
    const record = authorityRecord({
      releaseBinding: {
        ...authorityRecord().releaseBinding,
        sourceSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });
    const ingest = ingestCompetentAuthorityRecordV1({ record, context: context() });

    expect(ingest.decision).toBe("HOLD");
    expect(ingest.reasonCodes).toContain("SOURCE_SHA_BINDING_MISMATCH");
    expect(ingest.declaration.status).toBe("SUPERSEDED");
  });

  it("holds when exact rights or authority-transition evidence digests differ", () => {
    const record = authorityRecord({
      releaseBinding: {
        ...authorityRecord().releaseBinding,
        rightsEvidenceArtifactDigest: "sha256:stale-rights-evidence",
      },
    });
    const ingest = ingestCompetentAuthorityRecordV1({ record, context: context() });

    expect(ingest.decision).toBe("HOLD");
    expect(ingest.reasonCodes).toContain("RIGHTS_EVIDENCE_BINDING_MISMATCH");
  });

  it("preserves the real undeclared boundary as HOLD rather than inferring authority", () => {
    const ingest = ingestCompetentAuthorityRecordV1({
      record: authorityRecord({
        status: "UNDECLARED",
        decidingPrincipal: null,
        decidingCapacity: null,
        authorityBasis: null,
        authorityEvidenceRefs: [],
        governanceDecisionRef: null,
        postForkLicenseExpression: null,
        distributionAuthorized: false,
        permittedDistributionScopes: [],
        automationControllerPrincipal: null,
        automationControllerCapacity: null,
        automationControllerAuthorityBasis: null,
        automationControllerEvidenceRefs: [],
        attestations: {
          necessaryRightsOwnedOrControlled: false,
          authorityToLicensePostForkModifications: false,
          automationOutputAttributableToAuthorizedController: false,
          noKnownConflictingGrantOrAssignment: false,
        },
        signedAt: null,
        signatureRef: null,
        reviewedAt: null,
        reviewRef: null,
      }),
      context: context(),
    });
    const rights = evaluateAuthorityResolutionV1({ declaration: ingest.declaration, context: context() });

    expect(ingest.decision).toBe("HOLD");
    expect(rights.decision).toBe("HOLD");
    expect(rights.reasonCodes).toContain("AUTHORITY_DECLARATION_NOT_EVIDENCED");
  });

  it("promotes rights and governance state only after exact ingestion and ALLOW_RIGHTS", () => {
    const base = context();
    const ingest = ingestCompetentAuthorityRecordV1({ record: authorityRecord(), context: base });
    const rights = evaluateAuthorityResolutionV1({ declaration: ingest.declaration, context: base });
    const promotion = promoteReleaseContextFromAuthorityV1({ ingest, authorityResolution: rights, context: base });

    expect(rights.decision).toBe("ALLOW_RIGHTS");
    expect(promotion.decision).toBe("PROMOTED");
    expect(promotion.context.postForkRightsStatus).toBe("CLEARED");
    expect(promotion.context.postForkLicenseExpression).toBe("MIT");
    expect(promotion.context.releaseRightsStatus).toBe("CLEARED");
    expect(promotion.context.governanceStatus).toBe("CLEARED");
    expect(promotion.context.platformPermissionStatus).toBe("ROUTE_PREPARED_NOT_AUTHORIZED");
    expect(promotion.wardenEffect).toBe("NOT_EVALUATED");
  });

  it("does not promote a context when the authority receipt is not bound to that exact context", () => {
    const base = context();
    const ingest = ingestCompetentAuthorityRecordV1({ record: authorityRecord(), context: base });
    const rights = evaluateAuthorityResolutionV1({ declaration: ingest.declaration, context: base });
    const changed = context({ sourceSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    const promotion = promoteReleaseContextFromAuthorityV1({ ingest, authorityResolution: rights, context: changed });

    expect(promotion.decision).toBe("HOLD");
    expect(promotion.reasonCodes).toContain("AUTHORITY_RECEIPT_CONTEXT_MISMATCH");
    expect(promotion.context.postForkRightsStatus).toBe("PENDING_AUTHORITY");
  });
});
