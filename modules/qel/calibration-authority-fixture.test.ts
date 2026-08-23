import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { makeSyntheticConditionEvidenceCaptureV01 } from "./condition-evidence-capture-fixture.ts";
import {
  bindConditionEvidenceThroughAccreditedCalibrationV01,
  makeSyntheticCalibrationAuthorityBundleV01,
  mapCalibrationAuthorityToQelFrameV01,
  validateCalibrationAuthorityChainV01,
  type CalibrationAccreditationGrantV01,
  type CalibrationCertificateIssuanceAttestationV01,
} from "./calibration-authority-fixture.ts";
import {
  bindConditionEvidenceCaptureToDeviceRegistryV01,
  makeSyntheticInspectionDeviceTrustBundleV01,
} from "./inspection-device-trust-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

function makeFixtureInputs() {
  const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "ASSESSED" });
  const recovery = makeSyntheticRecoveryNodeSnapshotV01({
    nodeState: "ROUTED",
    assetRef: passport.assetRef,
    passportCycleRef: passport.cycleRef,
    custodyRef: "CUSTODY-010-001",
    route: "REPAIR",
    routeDestinationRef: "REPAIR-NODE-BLR-001",
  });
  const capture = makeSyntheticConditionEvidenceCaptureV01({
    recoveryNodeRef: recovery.nodeRef,
    assetRef: passport.assetRef,
    passportCycleRef: passport.cycleRef,
  });
  const deviceTrust = makeSyntheticInspectionDeviceTrustBundleV01(capture);
  const authority = makeSyntheticCalibrationAuthorityBundleV01(deviceTrust.calibrationCertificates);
  return { passport, recovery, capture, ...deviceTrust, ...authority };
}

describe("QEL-FIXTURE-010 calibration authority and accreditation chain", () => {
  it("trusts active accredited issuers and allows the chain to proceed into Fixture 009", () => {
    const input = makeFixtureInputs();
    const authority = validateCalibrationAuthorityChainV01(input);
    const deviceTrust = bindConditionEvidenceCaptureToDeviceRegistryV01(input);
    const endToEnd = bindConditionEvidenceThroughAccreditedCalibrationV01(input);
    const frame = mapCalibrationAuthorityToQelFrameV01({
      calibrationCertificates: input.calibrationCertificates,
      organisations: input.organisations,
      accreditationGrants: input.accreditationGrants,
      calibrators: input.calibrators,
      issuanceAttestations: input.issuanceAttestations,
      observedAt: input.capture.observedAt,
      correlationId: "QEL-FIXTURE-010-CORR-001",
      locationRef: input.recovery.locationRef,
    });

    expect(authority.ok).toBe(true);
    expect(authority.trustedCertificateCount).toBe(input.calibrationCertificates.length);
    expect(deviceTrust.ok).toBe(true);
    expect(endToEnd.ok).toBe(true);
    expect(endToEnd.deviceTrust?.ok).toBe(true);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("CALIBRATION_AUTHORITY_TRUST");
    expect(frame.state.value).toBe("READY");
  });

  it("blocks a suspended issuer even when the certificate and Fixture 009 device binding are otherwise valid", () => {
    const input = makeFixtureInputs();
    const deviceTrust = bindConditionEvidenceCaptureToDeviceRegistryV01(input);
    const organisations = input.organisations.map((organisation, index) =>
      index === 0 ? { ...organisation, state: "SUSPENDED" as const } : organisation,
    );
    const authority = validateCalibrationAuthorityChainV01({ ...input, organisations });
    const endToEnd = bindConditionEvidenceThroughAccreditedCalibrationV01({ ...input, organisations });

    expect(deviceTrust.ok).toBe(true);
    expect(authority.ok).toBe(false);
    expect(authority.issues).toContain("issuer_not_active");
    expect(endToEnd.ok).toBe(false);
    expect(endToEnd.deviceTrust).toBeUndefined();
  });

  it("blocks revoked or superseded accreditation irrespective of the certificate expiry date", () => {
    const input = makeFixtureInputs();
    const revoked = input.accreditationGrants.map((grant, index) =>
      index === 0 ? { ...grant, status: "REVOKED" as const } : grant,
    );
    const revokedResult = validateCalibrationAuthorityChainV01({
      ...input,
      accreditationGrants: revoked,
    });
    expect(revokedResult.ok).toBe(false);
    expect(revokedResult.issues).toContain("accreditation_not_active");

    const superseded = input.accreditationGrants.map((grant, index) =>
      index === 0 ? { ...grant, status: "SUPERSEDED" as const } : grant,
    );
    const supersededResult = validateCalibrationAuthorityChainV01({
      ...input,
      accreditationGrants: superseded,
    });
    expect(supersededResult.ok).toBe(false);
    expect(supersededResult.issues).toContain("accreditation_not_active");
  });

  it("blocks standards, methods, and calibrated semantics outside the accreditation scope", () => {
    const input = makeFixtureInputs();
    const firstCertificate = input.calibrationCertificates[0]!;
    const accreditationGrants: readonly CalibrationAccreditationGrantV01[] = input.accreditationGrants.map(
      (grant) =>
        grant.organisationRef === firstCertificate.issuerRef
          ? {
              ...grant,
              permittedStandardRefs: [],
              permittedMethodRefs: [],
              permittedSemantics: [],
            }
          : grant,
    );
    const result = validateCalibrationAuthorityChainV01({ ...input, accreditationGrants });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["standard_out_of_scope", "method_out_of_scope", "semantic_scope_exceeded"]),
    );
  });

  it("blocks a suspended or expired calibrator and requires an authority reference", () => {
    const input = makeFixtureInputs();
    const suspended = input.calibrators.map((calibrator, index) =>
      index === 0
        ? { ...calibrator, status: "SUSPENDED" as const, authorityRef: "" }
        : calibrator,
    );
    const suspendedResult = validateCalibrationAuthorityChainV01({ ...input, calibrators: suspended });
    expect(suspendedResult.ok).toBe(false);
    expect(suspendedResult.issues).toEqual(
      expect.arrayContaining(["signer_not_active", "signer_authority_ref_missing"]),
    );

    const expired = input.calibrators.map((calibrator, index) =>
      index === 0
        ? { ...calibrator, validUntil: "2026-07-31T23:59:59.000Z" }
        : calibrator,
    );
    const expiredResult = validateCalibrationAuthorityChainV01({ ...input, calibrators: expired });
    expect(expiredResult.ok).toBe(false);
    expect(expiredResult.issues).toContain("signer_not_authorized_at_signing");
  });

  it("blocks missing signature provenance and standard/method issuance mismatch", () => {
    const input = makeFixtureInputs();
    const first = input.issuanceAttestations[0]!;
    const issuanceAttestations: readonly CalibrationCertificateIssuanceAttestationV01[] = [
      {
        ...first,
        signatureRef: "",
        standardRef: "STANDARD:WRONG",
        methodRef: "METHOD:WRONG",
      },
      ...input.issuanceAttestations.slice(1),
    ];
    const result = validateCalibrationAuthorityChainV01({ ...input, issuanceAttestations });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "signature_ref_missing",
        "issuance_standard_mismatch",
        "issuance_method_mismatch",
      ]),
    );
  });

  it("fails closed when the certificate has no issuance attestation", () => {
    const input = makeFixtureInputs();
    const result = validateCalibrationAuthorityChainV01({
      ...input,
      issuanceAttestations: input.issuanceAttestations.slice(1),
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("certificate_issuance_missing");
  });
});
