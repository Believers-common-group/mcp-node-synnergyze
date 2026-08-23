import { describe, expect, it } from "vitest";

import { makeSyntheticAccreditationRootSignatureBundleV01 } from "./accreditation-root-signature-fixture.ts";
import { makeSyntheticCalibrationAuthorityBundleV01 } from "./calibration-authority-fixture.ts";
import { makeSyntheticConditionEvidenceCaptureV01 } from "./condition-evidence-capture-fixture.ts";
import { makeSyntheticInspectionDeviceTrustBundleV01 } from "./inspection-device-trust-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import {
  bindAccreditationRootThroughFreshTrustStatusV01,
  digestTrustStatusPublicationV01,
  makeSyntheticTrustStatusPublicationBundleV01,
  mapTrustStatusPublicationToQelFrameV01,
  validateTrustStatusPublicationV01,
} from "./trust-status-publication-fixture.ts";

function makeTrustInputs(observedAt = "2026-08-23T08:30:00.000Z") {
  const capture = makeSyntheticConditionEvidenceCaptureV01({ observedAt });
  const deviceTrust = makeSyntheticInspectionDeviceTrustBundleV01(capture);
  const calibrationAuthority = makeSyntheticCalibrationAuthorityBundleV01(
    deviceTrust.calibrationCertificates,
  );
  const rootTrust = makeSyntheticAccreditationRootSignatureBundleV01({
    accreditationGrants: calibrationAuthority.accreditationGrants,
    calibrators: calibrationAuthority.calibrators,
    calibrationCertificates: deviceTrust.calibrationCertificates,
    issuanceAttestations: calibrationAuthority.issuanceAttestations,
  });
  const sources = {
    ...rootTrust,
    organisations: calibrationAuthority.organisations,
    accreditationGrants: calibrationAuthority.accreditationGrants,
    calibrators: calibrationAuthority.calibrators,
    calibrationCertificates: deviceTrust.calibrationCertificates,
    issuanceAttestations: calibrationAuthority.issuanceAttestations,
  };
  const status = makeSyntheticTrustStatusPublicationBundleV01({
    ...sources,
    observedAt,
    correlationId: "QEL-FIXTURE-012-001",
  });
  return { observedAt, sources, status };
}

describe("QEL-FIXTURE-012 trust status publication", () => {
  it("requires a fresh River-bound lifecycle publication before accepting root/signature trust", () => {
    const { observedAt, sources, status } = makeTrustInputs();
    const result = validateTrustStatusPublicationV01({
      ...sources,
      ...status,
      observedAt,
    });
    const rooted = bindAccreditationRootThroughFreshTrustStatusV01({
      ...sources,
      ...status,
      observedAt,
    });
    const frame = mapTrustStatusPublicationToQelFrameV01({
      ...sources,
      ...status,
      observedAt,
    });

    expect(result.publicationValid).toBe(true);
    expect(result.trustReady).toBe(true);
    expect(result.activeSubjectCount).toBe(result.expectedSubjectCount);
    expect(rooted.ok).toBe(true);
    expect(rooted.rootTrust?.ok).toBe(true);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("TRUST_STATUS_PUBLICATION");
    expect(frame.outcome.state).toBe("OBSERVED");
  });

  it("fails closed when a structurally valid status publication is stale", () => {
    const { sources, status } = makeTrustInputs("2026-08-23T08:30:00.000Z");
    const observedAt = "2026-08-23T09:00:00.000Z";
    const result = validateTrustStatusPublicationV01({
      ...sources,
      ...status,
      observedAt,
    });

    expect(result.trustReady).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(["publication_stale", "river_receipt_stale"]));
  });

  it("does not treat missing subject status as implied ACTIVE", () => {
    const { observedAt, sources, status } = makeTrustInputs();
    const publication = {
      ...status.publication,
      entries: status.publication.entries.slice(1),
    };
    const riverReceipt = {
      ...status.riverReceipt,
      publicationDigest: digestTrustStatusPublicationV01(publication),
    };
    const result = validateTrustStatusPublicationV01({
      ...sources,
      publication,
      riverReceipt,
      observedAt,
    });

    expect(result.publicationValid).toBe(false);
    expect(result.trustReady).toBe(false);
    expect(result.issues).toContain("status_subject_missing");
  });

  it("blocks a fresh revocation even when the older trust record still says ACTIVE", () => {
    const { observedAt, sources, status } = makeTrustInputs();
    const target = sources.signingKeys[0]!;
    const publication = {
      ...status.publication,
      entries: status.publication.entries.map((entry) =>
        entry.subjectRef === target.keyRef
          ? {
              ...entry,
              state: "REVOKED" as const,
              reasonRef: "REVOCATION:SYNTHETIC-001",
            }
          : entry,
      ),
    };
    const riverReceipt = {
      ...status.riverReceipt,
      publicationDigest: digestTrustStatusPublicationV01(publication),
    };
    const result = validateTrustStatusPublicationV01({
      ...sources,
      publication,
      riverReceipt,
      observedAt,
    });
    const rooted = bindAccreditationRootThroughFreshTrustStatusV01({
      ...sources,
      publication,
      riverReceipt,
      observedAt,
    });

    expect(result.trustReady).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["status_state_conflict", "status_subject_not_active"]),
    );
    expect(rooted.ok).toBe(false);
    expect(rooted.rootTrust).toBeUndefined();
  });

  it("rejects a River receipt whose digest no longer binds the exact status payload", () => {
    const { observedAt, sources, status } = makeTrustInputs();
    const riverReceipt = {
      ...status.riverReceipt,
      publicationDigest: "0".repeat(64),
    };
    const result = validateTrustStatusPublicationV01({
      ...sources,
      publication: status.publication,
      riverReceipt,
      observedAt,
    });

    expect(result.publicationValid).toBe(false);
    expect(result.issues).toContain("river_receipt_digest_mismatch");
  });

  it("requires an exact predecessor ref, sequence, and digest for later publications", () => {
    const { observedAt, sources, status } = makeTrustInputs();
    const nextObservedAt = "2026-08-23T08:31:00.000Z";
    const next = makeSyntheticTrustStatusPublicationBundleV01({
      ...sources,
      observedAt: nextObservedAt,
      correlationId: "QEL-FIXTURE-012-002",
      predecessorPublication: status.publication,
    });
    const valid = validateTrustStatusPublicationV01({
      ...sources,
      ...next,
      observedAt: nextObservedAt,
      predecessorPublication: status.publication,
    });
    expect(valid.trustReady).toBe(true);

    const publication = { ...next.publication, predecessorDigest: "f".repeat(64) };
    const riverReceipt = {
      ...next.riverReceipt,
      publicationDigest: digestTrustStatusPublicationV01(publication),
    };
    const invalid = validateTrustStatusPublicationV01({
      ...sources,
      publication,
      riverReceipt,
      observedAt: nextObservedAt,
      predecessorPublication: status.publication,
    });

    expect(invalid.trustReady).toBe(false);
    expect(invalid.issues).toContain("predecessor_digest_mismatch");
  });

  it("keeps fresh status evidence separate from Warden authority", () => {
    const { observedAt, sources, status } = makeTrustInputs();
    const frame = mapTrustStatusPublicationToQelFrameV01({
      ...sources,
      ...status,
      observedAt,
    });

    expect(frame.native.rawValue).toMatchObject({ statusPublicationGrantsAuthority: false });
    expect(
      frame.moves.find((move) => move.action === "ACCEPT_CURRENT_TRUST_STATUS")?.authority,
    ).toBe("APPROVAL_REQUIRED");
  });
});
