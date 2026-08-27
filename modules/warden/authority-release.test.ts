import { describe, expect, it } from "vitest";

import {
  evaluateAuthorityResolutionV1,
  evaluateBuildAdmissionG0V1,
  type AuthorityDeclarationV1,
  type ReleaseAdmissionContextV1,
} from "./authority-release.ts";

const SOURCE_SHA = "50b34d3892283b19db07f3d0e094555fa97f517c";
const EVIDENCE_DIGEST = "sha256:76fcc7a5e333d0d64898292dfbe60ec65b040fa735d9db7fd46065ae47a68baa";
const AUTHORITY_EVIDENCE_DIGEST = "sha256:54c2e1b58daa7bbd7ea17a14b558b571e31a778d43dce9335d93c6943dc0736c";

function declaration(overrides: Partial<AuthorityDeclarationV1> = {}): AuthorityDeclarationV1 {
  return {
    declarationId: "ARD-MCP-NODE-SYNNERGYZE-R0.13",
    status: "EVIDENCED",
    decidingPrincipal: "DIGITALME:COMPETENT-PRINCIPAL",
    decidingCapacity: "CAPACITY:IP-AUTHORITY",
    authorityBasis: "AUTHORITY:EVIDENCED",
    authorityEvidenceRefs: ["RIVER:AUTHORITY-EVIDENCE:001"],
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
    signedAt: "2026-08-27T15:00:00.000Z",
    signatureRef: "SIGNATURE:AUTHORITY:001",
    reviewedAt: "2026-08-27T15:05:00.000Z",
    reviewRef: "REVIEW:AUTHORITY:001",
    ...overrides,
  };
}

function context(overrides: Partial<ReleaseAdmissionContextV1> = {}): ReleaseAdmissionContextV1 {
  return {
    repository: "Believers-common-group/mcp-node-synnergyze",
    sourceSha: SOURCE_SHA,
    rightsEvidenceArtifactDigest: EVIDENCE_DIGEST,
    authorityTransitionArtifactDigest: AUTHORITY_EVIDENCE_DIGEST,
    upstreamRightsStatus: "EVIDENCED",
    upstreamLicenseExpression: "MIT",
    postForkRightsStatus: "CLEARED",
    postForkLicenseExpression: "MIT",
    releaseRightsStatus: "CLEARED",
    governanceStatus: "CLEARED",
    platformRoute: "OPEN_PUBLIC_PPA",
    platformPermissionStatus: "NOT_REQUIRED",
    purpose: "LAUNCHPAD_ALPHA_BUILD",
    requestedCapability: "software.build.launchpad.alpha",
    requestedAt: "2026-08-27T15:10:00.000Z",
    validUntil: "2026-08-27T16:10:00.000Z",
    ...overrides,
  };
}

describe("VSR-SOFTWARE-RIGHTS-GRAPH-001 R0.13", () => {
  it("fails closed and still emits an immutable receipt when competent authority is undeclared", () => {
    const receipt = evaluateAuthorityResolutionV1({
      declaration: declaration({ status: "UNDECLARED" }),
      context: context({
        postForkRightsStatus: "PENDING_AUTHORITY",
        releaseRightsStatus: "HOLD",
        governanceStatus: "PENDING_AUTHORITY",
      }),
    });

    expect(receipt.decision).toBe("HOLD");
    expect(receipt.reasonCodes).toContain("AUTHORITY_DECLARATION_NOT_EVIDENCED");
    expect(receipt.sourceSha).toBe(SOURCE_SHA);
    expect(receipt.rightsEvidenceArtifactDigest).toBe(EVIDENCE_DIGEST);
    expect(receipt.receiptId).toMatch(/^AUTHORITY-RESOLUTION:/);
  });

  it("resolves competent authority before downstream release, platform, or Warden state advances", () => {
    const receipt = evaluateAuthorityResolutionV1({
      declaration: declaration(),
      context: context({
        postForkRightsStatus: "PENDING_AUTHORITY",
        postForkLicenseExpression: null,
        releaseRightsStatus: "HOLD",
        governanceStatus: "PENDING_AUTHORITY",
        platformPermissionStatus: "ROUTE_PREPARED_NOT_AUTHORIZED",
        requestedAt: "",
        validUntil: "",
      }),
    });

    expect(receipt.decision).toBe("ALLOW_RIGHTS");
    expect(receipt.licenseExpression).toBe("MIT");
    expect(receipt.wardenEffect).toBe("NOT_EVALUATED");
  });

  it("resolves an evidenced MIT authority declaration without turning it into Warden authorization", () => {
    const receipt = evaluateAuthorityResolutionV1({ declaration: declaration(), context: context() });

    expect(receipt.decision).toBe("ALLOW_RIGHTS");
    expect(receipt.licenseExpression).toBe("MIT");
    expect(receipt.distributionScope).toEqual(["LAUNCHPAD_ALPHA"]);
    expect(receipt.wardenEffect).toBe("NOT_EVALUATED");
  });

  it("Warden G0 denies when source or evidence binding differs from the rights receipt", () => {
    const rights = evaluateAuthorityResolutionV1({ declaration: declaration(), context: context() });
    const decision = evaluateBuildAdmissionG0V1({
      authorityResolution: rights,
      context: context({ sourceSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      wardenRef: "WARDEN:ALPHA",
      decidingPrincipal: "DIGITALME:WARDEN-OPERATOR",
      capabilityGrantRef: "CAPABILITY:LAUNCHPAD-BUILD:001",
      decidedAt: "2026-08-27T15:11:00.000Z",
    });

    expect(decision.decision).toBe("DENY_BUILD");
    expect(decision.reasonCodes).toContain("SOURCE_OR_EVIDENCE_BINDING_MISMATCH");
    expect("authorizationToken" in decision).toBe(false);
  });

  it("Warden G0 denies when downstream rights or governance state has not advanced", () => {
    const rights = evaluateAuthorityResolutionV1({ declaration: declaration(), context: context() });
    const decision = evaluateBuildAdmissionG0V1({
      authorityResolution: rights,
      context: context({
        postForkRightsStatus: "PENDING_AUTHORITY",
        releaseRightsStatus: "HOLD",
        governanceStatus: "PENDING_AUTHORITY",
      }),
      wardenRef: "WARDEN:ALPHA",
      decidingPrincipal: "DIGITALME:WARDEN-OPERATOR",
      capabilityGrantRef: "CAPABILITY:LAUNCHPAD-BUILD:001",
      decidedAt: "2026-08-27T15:11:00.000Z",
    });

    expect(decision.decision).toBe("DENY_BUILD");
    expect(decision.reasonCodes).toContain("POST_FORK_RIGHTS_NOT_CLEARED");
    expect(decision.reasonCodes).toContain("RELEASE_RIGHTS_NOT_CLEARED");
    expect(decision.reasonCodes).toContain("GOVERNANCE_NOT_CLEARED");
  });

  it("Warden G0 allows only the exact evidenced rights/platform/source tuple", () => {
    const rights = evaluateAuthorityResolutionV1({ declaration: declaration(), context: context() });
    const first = evaluateBuildAdmissionG0V1({
      authorityResolution: rights,
      context: context(),
      wardenRef: "WARDEN:ALPHA",
      decidingPrincipal: "DIGITALME:WARDEN-OPERATOR",
      capabilityGrantRef: "CAPABILITY:LAUNCHPAD-BUILD:001",
      decidedAt: "2026-08-27T15:11:00.000Z",
    });
    const replay = evaluateBuildAdmissionG0V1({
      authorityResolution: rights,
      context: context(),
      wardenRef: "WARDEN:ALPHA",
      decidingPrincipal: "DIGITALME:WARDEN-OPERATOR",
      capabilityGrantRef: "CAPABILITY:LAUNCHPAD-BUILD:001",
      decidedAt: "2026-08-27T15:11:00.000Z",
    });

    expect(first.decision).toBe("ALLOW_BUILD");
    if (first.decision !== "ALLOW_BUILD" || replay.decision !== "ALLOW_BUILD") {
      throw new Error("expected allow");
    }
    expect(first.authorizationToken).toMatch(/^WARDEN-BUILD-TOKEN:/);
    expect(replay).toEqual(first);
  });
});
