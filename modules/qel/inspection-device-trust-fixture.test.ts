import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { makeSyntheticConditionEvidenceCaptureV01 } from "./condition-evidence-capture-fixture.ts";
import {
  assertConditionEvidenceCaptureTrustedV01,
  bindConditionEvidenceCaptureToDeviceRegistryV01,
  makeSyntheticInspectionDeviceTrustBundleV01,
  mapInspectionDeviceTrustToQelFrameV01,
} from "./inspection-device-trust-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

function makeBoundInputs() {
  const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "ASSESSED" });
  const recovery = makeSyntheticRecoveryNodeSnapshotV01({
    nodeState: "ROUTED",
    assetRef: passport.assetRef,
    passportCycleRef: passport.cycleRef,
    custodyRef: "CUSTODY-009-001",
    route: "REPAIR",
    routeDestinationRef: "REPAIR-NODE-BLR-001",
  });
  const capture = makeSyntheticConditionEvidenceCaptureV01();
  const trust = makeSyntheticInspectionDeviceTrustBundleV01(capture);
  return { passport, recovery, capture, trust };
}

describe("QEL-FIXTURE-009 inspection device and calibration registry binding", () => {
  it("trusts a capture only when all five sources bind to active Genesis records and calibration state", () => {
    const { passport, recovery, capture, trust } = makeBoundInputs();
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
    });
    const frame = mapInspectionDeviceTrustToQelFrameV01({
      capture,
      recovery,
      passport,
      ...trust,
    });

    expect(result).toMatchObject({ ok: true, trustedSourceCount: 5, issues: [] });
    expect(result.sourceBindings.every((binding) => binding.state === "TRUSTED")).toBe(true);
    expect(assertConditionEvidenceCaptureTrustedV01({ capture, recovery, passport, ...trust })).toBe(
      capture,
    );
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("INSPECTION_DEVICE_TRUST");
    expect(frame.flow.value).toBe(5);
  });

  it("blocks revoked calibration even while Fixture 008 local calibration dates still look valid", () => {
    const { passport, recovery, capture, trust } = makeBoundInputs();
    const calibrationCertificates = trust.calibrationCertificates.map((certificate) =>
      certificate.deviceRef === "DEVICE-METROLOGY-001"
        ? { ...certificate, status: "REVOKED" as const, revocationRef: "REVOCATION-001" }
        : certificate,
    );
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
      calibrationCertificates,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["calibration_certificate_revoked", "calibration_certificate_invalid"]),
    );
    expect(
      result.sourceBindings.find((binding) => binding.deviceRef === "DEVICE-METROLOGY-001")?.state,
    ).toBe("BLOCKED");
  });

  it("detects firmware and configuration drift from the registered and calibrated device state", () => {
    const { passport, recovery, capture, trust } = makeBoundInputs();
    const sourceAttestations = trust.sourceAttestations.map((attestation) =>
      attestation.deviceRef === "DEVICE-CAMERA-001"
        ? {
            ...attestation,
            observedFirmwareRef: "FW-CAMERA-2.0.0",
            observedConfigurationFingerprint: "CFG:DEVICE-CAMERA-001:DRIFTED",
          }
        : attestation,
    );
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
      sourceAttestations,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "firmware_mismatch",
        "configuration_fingerprint_mismatch",
        "calibration_configuration_mismatch",
      ]),
    );
  });

  it("requires Warden-resolved permitted use even for a correctly enrolled and calibrated device", () => {
    const { passport, recovery, capture, trust } = makeBoundInputs();
    const deviceRegistry = trust.deviceRegistry.map((device) =>
      device.deviceRef === "DEVICE-METROLOGY-001"
        ? { ...device, wardenUseState: "DENIED" as const, wardenAuthorityRef: "WARDEN-DENY-001" }
        : device,
    );
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
      deviceRegistry,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("warden_use_not_allowed");
  });

  it("blocks semantic overreach when a registered source measures outside its permitted capability", () => {
    const { passport, recovery, capture, trust } = makeBoundInputs();
    const deviceRegistry = trust.deviceRegistry.map((device) =>
      device.deviceRef === "DEVICE-METROLOGY-001"
        ? { ...device, permittedSemantics: ["MAX_TEAR_LENGTH_MM"] as const }
        : device,
    );
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
      deviceRegistry,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("semantic_not_permitted");
  });

  it("blocks a calibration that was issued for a different firmware/config or semantic scope", () => {
    const { passport, recovery, capture, trust } = makeBoundInputs();
    const calibrationCertificates = trust.calibrationCertificates.map((certificate) =>
      certificate.deviceRef === "DEVICE-METROLOGY-001"
        ? {
            ...certificate,
            firmwareRef: "FW-METROLOGY-OLD",
            configurationFingerprint: "CFG:DEVICE-METROLOGY-001:OLD",
            calibratedSemantics: ["MAX_TEAR_LENGTH_MM"] as const,
          }
        : certificate,
    );
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
      calibrationCertificates,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "calibration_firmware_mismatch",
        "calibration_configuration_mismatch",
        "semantic_not_calibrated",
      ]),
    );
  });

  it("keeps Fixture 008 validation and device trust as distinct fail-closed layers", () => {
    const { passport, recovery, trust } = makeBoundInputs();
    const capture = makeSyntheticConditionEvidenceCaptureV01({ assetRef: "GARMENT-WRONG" });
    const result = bindConditionEvidenceCaptureToDeviceRegistryV01({
      capture,
      recovery,
      passport,
      ...trust,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("capture_validation_failed");
    expect(() =>
      assertConditionEvidenceCaptureTrustedV01({ capture, recovery, passport, ...trust }),
    ).toThrow(/condition_evidence_device_trust_blocked/);
  });
});
