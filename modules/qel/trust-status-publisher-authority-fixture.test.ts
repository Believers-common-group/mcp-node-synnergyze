import { describe, expect, it } from "vitest";

import { makeSyntheticAccreditationRootSignatureBundleV01 } from "./accreditation-root-signature-fixture.ts";
import { makeSyntheticCalibrationAuthorityBundleV01 } from "./calibration-authority-fixture.ts";
import { makeSyntheticConditionEvidenceCaptureV01 } from "./condition-evidence-capture-fixture.ts";
import { makeSyntheticInspectionDeviceTrustBundleV01 } from "./inspection-device-trust-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import {
  makeSyntheticTrustStatusPublicationBundleV01,
  type TrustStatusPublicationV01,
} from "./trust-status-publication-fixture.ts";
import {
  bindAccreditationRootThroughAuthorizedStatusPublisherV01,
  makeSyntheticTrustStatusPublisherAuthorityBundleV01,
  mapTrustStatusPublisherAuthorityToQelFrameV01,
  validateTrustStatusPublisherAuthorityV01,
} from "./trust-status-publisher-authority-fixture.ts";

function makePublisherInputs(observedAt = "2026-08-23T08:30:00.000Z") {
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
  const trustSources = {
    ...rootTrust,
    organisations: calibrationAuthority.organisations,
    accreditationGrants: calibrationAuthority.accreditationGrants,
    calibrators: calibrationAuthority.calibrators,
    calibrationCertificates: deviceTrust.calibrationCertificates,
    issuanceAttestations: calibrationAuthority.issuanceAttestations,
  };
  const status = makeSyntheticTrustStatusPublicationBundleV01({
    ...trustSources,
    observedAt,
    correlationId: "QEL-FIXTURE-013-STATUS-001",
  });
  const publisher = makeSyntheticTrustStatusPublisherAuthorityBundleV01(status.publication);
  return { observedAt, trustSources, status, publisher };
}

function resignPublication(
  publication: TrustStatusPublicationV01,
  input: ReturnType<typeof makePublisherInputs>,
) {
  return makeSyntheticTrustStatusPublisherAuthorityBundleV01(publication, {
    publisherRef: input.publisher.publishers[0]!.publisherRef,
    authorityGrantRef: input.publisher.authorityGrants[0]!.grantRef,
  });
}

describe("QEL-FIXTURE-013 trust status publisher authority", () => {
  it("accepts only a scoped active publisher with an exact Ed25519-bound status publication", () => {
    const input = makePublisherInputs();
    const result = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      observedAt: input.observedAt,
    });
    const rooted = bindAccreditationRootThroughAuthorizedStatusPublisherV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      observedAt: input.observedAt,
    });
    const frame = mapTrustStatusPublisherAuthorityToQelFrameV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      observedAt: input.observedAt,
    });

    expect(result.ok).toBe(true);
    expect(result.signatureVerified).toBe(true);
    expect(result.publisherAuthorized).toBe(true);
    expect(rooted.ok).toBe(true);
    expect(rooted.rootTrust?.ok).toBe(true);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("TRUST_STATUS_PUBLISHER_AUTHORITY");
  });

  it("rejects a fresh River-bound publication when the publisher signature no longer binds the payload", () => {
    const input = makePublisherInputs();
    const publication = {
      ...input.status.publication,
      correlationId: "QEL-FIXTURE-013-FORGED-001",
    };
    const forgedStatus = makeSyntheticTrustStatusPublicationBundleV01({
      ...input.trustSources,
      observedAt: input.observedAt,
      correlationId: publication.correlationId,
    });
    const result = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      publication: forgedStatus.publication,
      riverReceipt: forgedStatus.riverReceipt,
      ...input.publisher,
      observedAt: input.observedAt,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(["signature_publication_mismatch", "signature_digest_mismatch"]),
    );
  });

  it("fails when publisher subject-kind or source-authority scope is exceeded", () => {
    const input = makePublisherInputs();
    const grant = input.publisher.authorityGrants[0]!;
    const subjectScoped = {
      ...grant,
      permittedSubjectKinds: grant.permittedSubjectKinds.slice(1),
    };
    const subjectResult = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      authorityGrants: [subjectScoped],
      observedAt: input.observedAt,
    });
    expect(subjectResult.issues).toContain("publisher_subject_scope_exceeded");

    const sourceScoped = {
      ...grant,
      permittedSourceAuthorityRefs: grant.permittedSourceAuthorityRefs.slice(1),
    };
    const sourceResult = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      authorityGrants: [sourceScoped],
      observedAt: input.observedAt,
    });
    expect(sourceResult.issues).toContain("publisher_source_authority_scope_exceeded");
  });

  it("blocks suspended publishers and revoked signing keys even when the old signature is mathematically valid", () => {
    const input = makePublisherInputs();
    const suspendedPublisher = {
      ...input.publisher.publishers[0]!,
      state: "SUSPENDED" as const,
    };
    const publisherResult = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      publishers: [suspendedPublisher],
      observedAt: input.observedAt,
    });
    expect(publisherResult.issues).toContain("publisher_not_active");

    const revokedKey = {
      ...input.publisher.signingKeys[0]!,
      state: "REVOKED" as const,
    };
    const keyResult = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      signingKeys: [revokedKey],
      observedAt: input.observedAt,
    });
    expect(keyResult.issues).toContain("publisher_signing_key_not_active");
  });

  it("requires the publisher, grant, and key to remain current at observation time", () => {
    const input = makePublisherInputs("2026-08-23T08:30:00.000Z");
    const observedAt = "2026-08-23T08:31:00.000Z";
    const publisher = {
      ...input.publisher.publishers[0]!,
      validUntil: "2026-08-23T08:30:30.000Z",
    };
    const grant = {
      ...input.publisher.authorityGrants[0]!,
      validUntil: "2026-08-23T08:30:30.000Z",
    };
    const key = {
      ...input.publisher.signingKeys[0]!,
      validUntil: "2026-08-23T08:30:30.000Z",
    };
    const result = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      publishers: [publisher],
      authorityGrants: [grant],
      signingKeys: [key],
      publicationSignature: input.publisher.publicationSignature,
      observedAt,
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        "publisher_not_current",
        "publisher_authority_not_current",
        "publisher_signing_key_not_current",
      ]),
    );
  });

  it("enforces publication -> signature -> River chronology", () => {
    const input = makePublisherInputs();
    const publicationSignature = {
      ...input.publisher.publicationSignature,
      signedAt: "2026-08-23T08:31:00.000Z",
    };
    const result = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      publicationSignature,
      observedAt: input.observedAt,
    });

    expect(result.issues).toEqual(
      expect.arrayContaining(["signature_after_river_record", "signature_from_future"]),
    );
  });

  it("does not convert publisher authenticity into Warden action authority", () => {
    const input = makePublisherInputs();
    const frame = mapTrustStatusPublisherAuthorityToQelFrameV01({
      ...input.trustSources,
      ...input.status,
      ...input.publisher,
      observedAt: input.observedAt,
    });

    expect(frame.native?.rawValue).toMatchObject({ statusPublisherGrantsWardenAuthority: false });
    expect(
      frame.moves.find((move) => move.action === "ACCEPT_SIGNED_TRUST_STATUS")?.authority,
    ).toBe("APPROVAL_REQUIRED");
  });

  it("can rotate to a newly generated publisher key without persisting private key material", () => {
    const input = makePublisherInputs();
    const rotated = resignPublication(input.status.publication, input);
    const result = validateTrustStatusPublisherAuthorityV01({
      ...input.trustSources,
      ...input.status,
      ...rotated,
      observedAt: input.observedAt,
    });

    expect(result.ok).toBe(true);
    expect(rotated.signingKeys[0]!.publicKeyPem).toContain("PUBLIC KEY");
    expect("privateKey" in rotated).toBe(false);
  });
});
