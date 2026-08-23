import { describe, expect, it } from "vitest";

import { SyntheticCpuComputeRunner } from "../../compute/runtime.ts";
import {
  bindCalibrationAuthorityThroughRootTrustV01,
  makeSyntheticAccreditationRootSignatureBundleV01,
  mapAccreditationRootSignatureToQelFrameV01,
} from "./accreditation-root-signature-fixture.ts";
import { mapAlphaComputeRunnerToQelFrameV01 } from "./alpha-compute-adapter.ts";
import {
  bindConditionEvidenceThroughAccreditedCalibrationV01,
  makeSyntheticCalibrationAuthorityBundleV01,
  mapCalibrationAuthorityToQelFrameV01,
} from "./calibration-authority-fixture.ts";
import {
  makeSyntheticCircularPassportSnapshotV01,
  mapSyntheticCircularPassportToQelFrameV01,
} from "./circular-passport-fixture.ts";
import {
  makeRecoveryValueAssessmentFromConditionV01,
  mapConditionAssessmentToQelFrameV01,
} from "./condition-assessment-fixture.ts";
import {
  buildConditionObservationFromEvidenceV01,
  makeSyntheticConditionEvidenceCaptureV01,
  mapConditionEvidenceCaptureToQelFrameV01,
} from "./condition-evidence-capture-fixture.ts";
import {
  makeSyntheticFactoryLineSnapshotV01,
  mapSyntheticFactoryLineToQelFrameV01,
} from "./factory-line-fixture.ts";
import {
  assertConditionEvidenceCaptureTrustedV01,
  makeSyntheticInspectionDeviceTrustBundleV01,
  mapInspectionDeviceTrustToQelFrameV01,
} from "./inspection-device-trust-fixture.ts";
import { buildQelPodPulseV01 } from "./pulse.ts";
import {
  makeSyntheticRecoveryNodeSnapshotV01,
  mapSyntheticRecoveryNodeToQelFrameV01,
} from "./recovery-node-fixture.ts";
import { mapSyntheticRecoverySettlementToQelFrameV01 } from "./recovery-settlement-fixture.ts";
import {
  makeSettlementFromRecoveryValuePolicyV01,
  makeSyntheticRecoveryValuePriceBookV01,
  mapRecoveryValuePolicyToQelFrameV01,
} from "./recovery-value-policy-fixture.ts";
import {
  makeSyntheticTrustStatusPublicationBundleV01,
  mapTrustStatusPublicationToQelFrameV01,
} from "./trust-status-publication-fixture.ts";
import {
  bindAccreditationRootThroughAuthorizedStatusPublisherV01,
  makeSyntheticTrustStatusPublisherAuthorityBundleV01,
  mapTrustStatusPublisherAuthorityToQelFrameV01,
} from "./trust-status-publisher-authority-fixture.ts";

describe("QEL cross-domain Pod Pulse", () => {
  it("reduces compute through authorized fresh trust status, cryptographic root trust, calibration, evidence, value, and settlement with one grammar", () => {
    const observedAt = "2026-08-23T08:30:00.000Z";
    const compute = mapAlphaComputeRunnerToQelFrameV01({
      registration: new SyntheticCpuComputeRunner().registration,
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-COMPUTE-001",
    });
    const factory = mapSyntheticFactoryLineToQelFrameV01(
      makeSyntheticFactoryLineSnapshotV01({
        observedAt,
        correlationId: "QEL-CROSS-DOMAIN-FACTORY-001",
        nativeState: "STARVED",
        outputRatePerHour: 0,
        materialCoverMinutes: 0,
      }),
    );
    const passportSnapshot = makeSyntheticCircularPassportSnapshotV01({
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-PASSPORT-001",
      lifecycleState: "ASSESSED",
    });
    const passport = mapSyntheticCircularPassportToQelFrameV01(passportSnapshot);
    const recoverySnapshot = makeSyntheticRecoveryNodeSnapshotV01({
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-RECOVERY-001",
      nodeState: "ASSESSED",
      assetRef: passportSnapshot.assetRef,
      passportCycleRef: passportSnapshot.cycleRef,
      custodyRef: "CUSTODY-CROSS-DOMAIN-001",
      route: "REPAIR",
    });
    const recovery = mapSyntheticRecoveryNodeToQelFrameV01(recoverySnapshot);

    const baseCapture = makeSyntheticConditionEvidenceCaptureV01({ observedAt });
    const captureSnapshot = makeSyntheticConditionEvidenceCaptureV01({
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-EVIDENCE-001",
      recoveryNodeRef: recoverySnapshot.nodeRef,
      assetRef: passportSnapshot.assetRef,
      passportCycleRef: passportSnapshot.cycleRef,
      facts: baseCapture.facts.map((fact) =>
        fact.semanticId === "MAX_TEAR_LENGTH_MM" ? { ...fact, value: 10 } : fact,
      ),
    });
    const trustBundle = makeSyntheticInspectionDeviceTrustBundleV01(captureSnapshot);
    const authorityBundle = makeSyntheticCalibrationAuthorityBundleV01(
      trustBundle.calibrationCertificates,
    );
    const rootBundle = makeSyntheticAccreditationRootSignatureBundleV01({
      accreditationGrants: authorityBundle.accreditationGrants,
      calibrators: authorityBundle.calibrators,
      calibrationCertificates: trustBundle.calibrationCertificates,
      issuanceAttestations: authorityBundle.issuanceAttestations,
    });
    const statusBundle = makeSyntheticTrustStatusPublicationBundleV01({
      rootAuthorities: rootBundle.rootAuthorities,
      accreditors: rootBundle.accreditors,
      rootDelegations: rootBundle.rootDelegations,
      signingKeys: rootBundle.signingKeys,
      organisations: authorityBundle.organisations,
      accreditationGrants: authorityBundle.accreditationGrants,
      calibrators: authorityBundle.calibrators,
      calibrationCertificates: trustBundle.calibrationCertificates,
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-TRUST-STATUS-001",
    });
    const publisherBundle = makeSyntheticTrustStatusPublisherAuthorityBundleV01(
      statusBundle.publication,
    );

    const currentRootTrust = bindAccreditationRootThroughAuthorizedStatusPublisherV01({
      rootAuthorities: rootBundle.rootAuthorities,
      accreditors: rootBundle.accreditors,
      rootDelegations: rootBundle.rootDelegations,
      signingKeys: rootBundle.signingKeys,
      signedArtifacts: rootBundle.signedArtifacts,
      organisations: authorityBundle.organisations,
      accreditationGrants: authorityBundle.accreditationGrants,
      calibrators: authorityBundle.calibrators,
      calibrationCertificates: trustBundle.calibrationCertificates,
      issuanceAttestations: authorityBundle.issuanceAttestations,
      ...statusBundle,
      ...publisherBundle,
      observedAt,
    });
    expect(currentRootTrust.ok).toBe(true);

    const rootedAuthority = bindCalibrationAuthorityThroughRootTrustV01({
      ...rootBundle,
      calibrationCertificates: trustBundle.calibrationCertificates,
      ...authorityBundle,
    });
    expect(rootedAuthority.ok).toBe(true);

    const accreditedTrust = bindConditionEvidenceThroughAccreditedCalibrationV01({
      capture: captureSnapshot,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
      ...trustBundle,
      ...authorityBundle,
    });
    expect(accreditedTrust.ok).toBe(true);

    const publisherAuthority = mapTrustStatusPublisherAuthorityToQelFrameV01({
      rootAuthorities: rootBundle.rootAuthorities,
      accreditors: rootBundle.accreditors,
      rootDelegations: rootBundle.rootDelegations,
      signingKeys: rootBundle.signingKeys,
      organisations: authorityBundle.organisations,
      accreditationGrants: authorityBundle.accreditationGrants,
      calibrators: authorityBundle.calibrators,
      calibrationCertificates: trustBundle.calibrationCertificates,
      ...statusBundle,
      ...publisherBundle,
      observedAt,
      locationRef: recoverySnapshot.locationRef,
    });
    const trustStatus = mapTrustStatusPublicationToQelFrameV01({
      rootAuthorities: rootBundle.rootAuthorities,
      accreditors: rootBundle.accreditors,
      rootDelegations: rootBundle.rootDelegations,
      signingKeys: rootBundle.signingKeys,
      organisations: authorityBundle.organisations,
      accreditationGrants: authorityBundle.accreditationGrants,
      calibrators: authorityBundle.calibrators,
      calibrationCertificates: trustBundle.calibrationCertificates,
      ...statusBundle,
      observedAt,
      locationRef: recoverySnapshot.locationRef,
    });
    const accreditationRoot = mapAccreditationRootSignatureToQelFrameV01({
      ...rootBundle,
      accreditationGrants: authorityBundle.accreditationGrants,
      calibrators: authorityBundle.calibrators,
      calibrationCertificates: trustBundle.calibrationCertificates,
      issuanceAttestations: authorityBundle.issuanceAttestations,
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-ROOT-TRUST-001",
      locationRef: recoverySnapshot.locationRef,
    });
    const calibrationAuthority = mapCalibrationAuthorityToQelFrameV01({
      calibrationCertificates: trustBundle.calibrationCertificates,
      ...authorityBundle,
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-CAL-AUTH-001",
      locationRef: recoverySnapshot.locationRef,
    });
    const deviceTrust = mapInspectionDeviceTrustToQelFrameV01({
      capture: captureSnapshot,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
      ...trustBundle,
    });
    const trustedCapture = assertConditionEvidenceCaptureTrustedV01({
      capture: captureSnapshot,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
      ...trustBundle,
    });
    const evidenceCapture = mapConditionEvidenceCaptureToQelFrameV01({
      capture: trustedCapture,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });
    const conditionObservation = buildConditionObservationFromEvidenceV01({
      capture: trustedCapture,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });
    const condition = mapConditionAssessmentToQelFrameV01({
      observation: conditionObservation,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });

    const priceBook = makeSyntheticRecoveryValuePriceBookV01();
    const assessment = makeRecoveryValueAssessmentFromConditionV01({
      observation: conditionObservation,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
      beneficiaryRef: "DIGITALME:RECOVERY-PARTICIPANT-001",
      materialRecoveryValueMinor: 500,
      programmeIncentiveMinor: 200,
      environmentalIncentiveMinor: 100,
      environmentalEvidenceRef: "RIVER:ENVIRONMENTAL-IMPACT-001",
      handlingDeductionMinor: 300,
    });
    const valueQuote = mapRecoveryValuePolicyToQelFrameV01({
      priceBook,
      assessment,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });
    const settlementDraft = makeSettlementFromRecoveryValuePolicyV01({
      priceBook,
      assessment,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
      settlementRef: "SILK-RECOVERY-SETTLEMENT-001",
    });
    const settlement = mapSyntheticRecoverySettlementToQelFrameV01({
      settlement: {
        ...settlementDraft,
        state: "AUTHORIZED",
        authorityState: "ALLOWED",
        authorityRef: "WARDEN-AUTH-CROSS-DOMAIN-001",
      },
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });

    const pulse = buildQelPodPulseV01({
      podRef: "POD-QEL-CROSS-DOMAIN-001",
      observedAt,
      frames: [
        compute,
        factory,
        passport,
        recovery,
        publisherAuthority,
        trustStatus,
        accreditationRoot,
        calibrationAuthority,
        deviceTrust,
        evidenceCapture,
        condition,
        valueQuote,
        settlement,
      ],
    });

    expect([
      compute.object.type,
      factory.object.type,
      passport.object.type,
      recovery.object.type,
      publisherAuthority.object.type,
      trustStatus.object.type,
      accreditationRoot.object.type,
      calibrationAuthority.object.type,
      deviceTrust.object.type,
      evidenceCapture.object.type,
      condition.object.type,
      valueQuote.object.type,
      settlement.object.type,
    ]).toEqual([
      "COMPUTE_SERVICE",
      "PRODUCTION_LINE",
      "PRODUCT_PASSPORT",
      "RECOVERY_NODE",
      "TRUST_STATUS_PUBLISHER_AUTHORITY",
      "TRUST_STATUS_PUBLICATION",
      "ACCREDITATION_ROOT_TRUST",
      "CALIBRATION_AUTHORITY_TRUST",
      "INSPECTION_DEVICE_TRUST",
      "CONDITION_EVIDENCE_CAPTURE",
      "CONDITION_ASSESSMENT",
      "RECOVERY_VALUE_QUOTE",
      "RECOVERY_SETTLEMENT",
    ]);
    expect(pulse.now.objectCount).toBe(13);
    expect(pulse.now.health).toBe("WATCH");
    expect(pulse.needs).toEqual(
      expect.arrayContaining([
        {
          objectRef: "FACTORY-LINE-03",
          type: "MATERIAL",
          priority: "HIGH",
          target: "restore_material_flow",
        },
        {
          objectRef: `TRUST-STATUS-PUBLISHER:${statusBundle.publication.publicationRef}`,
          type: "APPROVAL",
          priority: "MODERATE",
          target: "accept_signed_trust_status_publication",
        },
        {
          objectRef: statusBundle.publication.publicationRef,
          type: "APPROVAL",
          priority: "MODERATE",
          target: "accept_current_trust_status",
        },
        {
          objectRef: "ACCREDITATION-ROOT:QEL-CROSS-DOMAIN-ROOT-TRUST-001",
          type: "APPROVAL",
          priority: "MODERATE",
          target: "accept_accreditation_root_trust",
        },
        {
          objectRef: "SILK-RECOVERY-SETTLEMENT-001",
          type: "SETTLEMENT",
          priority: "HIGH",
          target: "submit_silk_settlement",
        },
      ]),
    );
    expect(pulse.risks[0]).toMatchObject({
      objectRef: "FACTORY-LINE-03",
      type: "MATERIAL_STARVATION",
      severity: "HIGH",
    });
    expect(
      pulse.moves.some(
        (move) => move.objectRef === publisherAuthority.object.id && move.action === "ACCEPT_SIGNED_TRUST_STATUS",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => move.objectRef === trustStatus.object.id && move.action === "ACCEPT_CURRENT_TRUST_STATUS",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some((move) => move.objectRef === accreditationRoot.object.id && move.action === "ACCEPT_ROOT_TRUST"),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => move.objectRef === calibrationAuthority.object.id && move.action === "ACCEPT_CALIBRATION_CHAIN",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some((move) => move.objectRef === deviceTrust.object.id && move.action === "ACCEPT_TRUSTED_CAPTURE"),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => valueQuote.object.id === move.objectRef && move.action === "CREATE_SETTLEMENT_OBLIGATION",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some((move) => move.objectRef === settlement.object.id && move.action === "SUBMIT_SETTLEMENT"),
    ).toBe(true);
    expect(pulse.proof.verifiedOutcomes).toBe(0);
    expect(pulse.proof.unresolvedOutcomes).toBe(13);
  });
});
