import { describe, expect, it } from "vitest";

import {
  bindCalibrationAuthorityThroughRootTrustV01,
  makeSyntheticAccreditationRootSignatureBundleV01,
  mapAccreditationRootSignatureToQelFrameV01,
  validateAccreditationRootAndSignaturesV01,
  type SignedTrustArtifactV01,
  type TrustSigningKeyRecordV01,
} from "./accreditation-root-signature-fixture.ts";
import { makeSyntheticCalibrationAuthorityBundleV01 } from "./calibration-authority-fixture.ts";
import { makeSyntheticConditionEvidenceCaptureV01 } from "./condition-evidence-capture-fixture.ts";
import { makeSyntheticInspectionDeviceTrustBundleV01 } from "./inspection-device-trust-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";

function makeFixtureInputs() {
  const capture = makeSyntheticConditionEvidenceCaptureV01();
  const deviceTrust = makeSyntheticInspectionDeviceTrustBundleV01(capture);
  const authority = makeSyntheticCalibrationAuthorityBundleV01(deviceTrust.calibrationCertificates);
  const rootTrust = makeSyntheticAccreditationRootSignatureBundleV01({
    accreditationGrants: authority.accreditationGrants,
    calibrators: authority.calibrators,
    calibrationCertificates: deviceTrust.calibrationCertificates,
    issuanceAttestations: authority.issuanceAttestations,
  });
  return { capture, ...deviceTrust, ...authority, ...rootTrust };
}

describe("QEL-FIXTURE-011 accreditation root and signature verification", () => {
  it("verifies a complete Ed25519-rooted chain before Fixture 010 authority validation", () => {
    const input = makeFixtureInputs();
    const result = validateAccreditationRootAndSignaturesV01(input);
    const endToEnd = bindCalibrationAuthorityThroughRootTrustV01(input);
    const frame = mapAccreditationRootSignatureToQelFrameV01({
      rootAuthorities: input.rootAuthorities,
      accreditors: input.accreditors,
      rootDelegations: input.rootDelegations,
      signingKeys: input.signingKeys,
      signedArtifacts: input.signedArtifacts,
      accreditationGrants: input.accreditationGrants,
      calibrators: input.calibrators,
      calibrationCertificates: input.calibrationCertificates,
      issuanceAttestations: input.issuanceAttestations,
      observedAt: input.capture.observedAt,
      correlationId: "QEL-FIXTURE-011-CORR-001",
    });

    expect(result.ok).toBe(true);
    expect(result.verifiedRootDelegations).toBe(input.rootDelegations.length);
    expect(result.verifiedAccreditationGrants).toBe(input.accreditationGrants.length);
    expect(result.verifiedCalibrationIssuances).toBe(input.issuanceAttestations.length);
    expect(endToEnd.ok).toBe(true);
    expect(endToEnd.calibrationAuthority?.ok).toBe(true);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("ACCREDITATION_ROOT_TRUST");
    expect(frame.native?.protocol).toBe("ED25519_SYNTHETIC_TRUST_CHAIN");
  });

  it("blocks a suspended root authority even though all signatures remain mathematically valid", () => {
    const input = makeFixtureInputs();
    const rootAuthorities = input.rootAuthorities.map((root) => ({ ...root, state: "SUSPENDED" as const }));
    const result = validateAccreditationRootAndSignaturesV01({ ...input, rootAuthorities });
    const endToEnd = bindCalibrationAuthorityThroughRootTrustV01({ ...input, rootAuthorities });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("root_not_active");
    expect(endToEnd.ok).toBe(false);
    expect(endToEnd.calibrationAuthority).toBeUndefined();
  });

  it("blocks a revoked or superseded signing key even when its old signature still verifies cryptographically", () => {
    const input = makeFixtureInputs();
    const rootKeyRef = input.signedArtifacts.find((artifact) => artifact.kind === "ROOT_DELEGATION")!.keyRef;
    const signingKeys: readonly TrustSigningKeyRecordV01[] = input.signingKeys.map((key) =>
      key.keyRef === rootKeyRef
        ? { ...key, state: "SUPERSEDED" as const, replacementKeyRef: "KEY:ROOT:ROTATED-002" }
        : key,
    );
    const result = validateAccreditationRootAndSignaturesV01({ ...input, signingKeys });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("signing_key_not_active");
  });

  it("blocks jurisdiction and root-delegation scope that do not authorize the accreditor", () => {
    const input = makeFixtureInputs();
    const rootAuthorities = input.rootAuthorities.map((root) => ({
      ...root,
      jurisdictions: ["OTHER_JURISDICTION"],
    }));
    const rootDelegations = input.rootDelegations.map((delegation) => ({
      ...delegation,
      validUntil: "2026-06-30T00:00:00.000Z",
    }));
    const result = validateAccreditationRootAndSignaturesV01({
      ...input,
      rootAuthorities,
      rootDelegations,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["jurisdiction_out_of_scope", "root_delegation_does_not_cover_grant", "signed_payload_mismatch"]),
    );
  });

  it("detects tampering with a signed root-delegation payload", () => {
    const input = makeFixtureInputs();
    const signedArtifacts: readonly SignedTrustArtifactV01[] = input.signedArtifacts.map((artifact) =>
      artifact.kind === "ROOT_DELEGATION"
        ? { ...artifact, payload: `${artifact.payload}tampered` }
        : artifact,
    );
    const result = validateAccreditationRootAndSignaturesV01({ ...input, signedArtifacts });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(["signed_payload_mismatch"]));
  });

  it("detects tampering with an accreditation grant independently of Fixture 010 metadata checks", () => {
    const input = makeFixtureInputs();
    const grantArtifact = input.signedArtifacts.find((artifact) => artifact.kind === "ACCREDITATION_GRANT")!;
    const signedArtifacts = input.signedArtifacts.map((artifact) =>
      artifact.signatureRef === grantArtifact.signatureRef
        ? { ...artifact, signatureBase64: `${artifact.signatureBase64.slice(0, -4)}AAAA` }
        : artifact,
    );
    const result = validateAccreditationRootAndSignaturesV01({ ...input, signedArtifacts });
    const endToEnd = bindCalibrationAuthorityThroughRootTrustV01({ ...input, signedArtifacts });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("signature_invalid");
    expect(endToEnd.ok).toBe(false);
    expect(endToEnd.calibrationAuthority).toBeUndefined();
  });

  it("requires the calibration issuance signature to match Fixture 010 signatureRef", () => {
    const input = makeFixtureInputs();
    const issuance = input.issuanceAttestations[0]!;
    const signedArtifacts = input.signedArtifacts.map((artifact) =>
      artifact.kind === "CALIBRATION_ISSUANCE" && artifact.subjectRef === issuance.certificateRef
        ? { ...artifact, signatureRef: "SIGNATURE:WRONG-CALIBRATION-ISSUANCE" }
        : artifact,
    );
    const result = validateAccreditationRootAndSignaturesV01({ ...input, signedArtifacts });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("calibration_signature_ref_mismatch");
  });

  it("fails closed when a required signed trust artifact is absent", () => {
    const input = makeFixtureInputs();
    const signedArtifacts = input.signedArtifacts.filter((artifact) => artifact.kind !== "ROOT_DELEGATION");
    const result = validateAccreditationRootAndSignaturesV01({ ...input, signedArtifacts });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("signed_artifact_missing");
  });
});
