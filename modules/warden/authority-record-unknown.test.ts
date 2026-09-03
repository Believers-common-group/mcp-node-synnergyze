import { describe, expect, it } from "vitest";

import { type ReleaseAdmissionContextV1 } from "./authority-release.ts";
import {
  ingestCompetentAuthorityRecordV1,
  type CompetentAuthorityRecordV1,
} from "./authority-record.ts";

const context: ReleaseAdmissionContextV1 = {
  repository: "Believers-common-group/mcp-node-synnergyze",
  sourceSha: "a8b5b080df0c1450e1084bba4dab4ce305a73146",
  rightsEvidenceArtifactDigest:
    "sha256:80a6e018db5d0ea3d10fe4025d0f4168d7e87a8c30ef326d1e7b0e5afbbc7bbd",
  authorityTransitionArtifactDigest:
    "sha256:5efac07f82171eac6a63ac2a3c1e072c0cc45d95979a7dbaeb359ae787c9a5f8",
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
  requestedAt: "",
  validUntil: "",
};

describe("R0.14 unknown authority evidence semantics", () => {
  it("preserves unknown attestations in the source record while normalizing them fail-closed", () => {
    const record: CompetentAuthorityRecordV1 = {
      schema: "VSR_COMPETENT_AUTHORITY_RECORD/1.0",
      recordId: "CAR-MCP-NODE-SYNNERGYZE-R0.14",
      status: "UNDECLARED",
      releaseBinding: {
        repository: context.repository,
        sourceSha: context.sourceSha,
        rightsEvidenceArtifactDigest: context.rightsEvidenceArtifactDigest,
        authorityTransitionArtifactDigest: context.authorityTransitionArtifactDigest,
      },
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
        necessaryRightsOwnedOrControlled: null,
        authorityToLicensePostForkModifications: null,
        automationOutputAttributableToAuthorizedController: null,
        noKnownConflictingGrantOrAssignment: null,
      },
      signedAt: null,
      signatureRef: null,
      reviewedAt: null,
      reviewRef: null,
    };

    const ingest = ingestCompetentAuthorityRecordV1({ record, context });

    expect(ingest.decision).toBe("HOLD");
    expect(ingest.reasonCodes).toContain("AUTHORITY_ATTESTATION_UNKNOWN");
    expect(ingest.declaration.attestations).toEqual({
      necessaryRightsOwnedOrControlled: false,
      authorityToLicensePostForkModifications: false,
      automationOutputAttributableToAuthorizedController: false,
      noKnownConflictingGrantOrAssignment: false,
    });
  });
});
