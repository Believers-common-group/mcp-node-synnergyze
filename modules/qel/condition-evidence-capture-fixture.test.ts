import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { assessConditionV01 } from "./condition-assessment-fixture.ts";
import {
  buildConditionObservationFromEvidenceV01,
  makeSyntheticConditionEvidenceCaptureV01,
  mapConditionEvidenceCaptureToQelFrameV01,
  validateConditionEvidenceCaptureV01,
  type ConditionEvidenceFactV01,
  type ConditionEvidenceSourceV01,
} from "./condition-evidence-capture-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

function makeBoundInputs() {
  const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "ASSESSED" });
  const recovery = makeSyntheticRecoveryNodeSnapshotV01({
    nodeState: "ROUTED",
    assetRef: passport.assetRef,
    passportCycleRef: passport.cycleRef,
    custodyRef: "CUSTODY-008-001",
    route: "REPAIR",
    routeDestinationRef: "REPAIR-NODE-BLR-001",
  });
  return { passport, recovery };
}

function replaceFact(
  facts: readonly ConditionEvidenceFactV01[],
  semanticId: ConditionEvidenceFactV01["semanticId"],
  replacement: Partial<ConditionEvidenceFactV01>,
): readonly ConditionEvidenceFactV01[] {
  return facts.map((fact) => (fact.semanticId === semanticId ? { ...fact, ...replacement } : fact));
}

describe("QEL-FIXTURE-008 condition evidence capture", () => {
  it("validates calibrated native evidence and builds a Fixture 007 observation", () => {
    const { passport, recovery } = makeBoundInputs();
    const capture = makeSyntheticConditionEvidenceCaptureV01();
    const validation = validateConditionEvidenceCaptureV01({ capture, recovery, passport });
    const frame = mapConditionEvidenceCaptureToQelFrameV01({ capture, recovery, passport });
    const observation = buildConditionObservationFromEvidenceV01({ capture, recovery, passport });
    const assessed = assessConditionV01({ observation, recovery, passport });

    expect(validation).toEqual({ ok: true, issues: [] });
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("CONDITION_EVIDENCE_CAPTURE");
    expect(frame.flow.value).toBe(11);
    expect(observation).toMatchObject({
      assetRef: passport.assetRef,
      passportCycleRef: passport.cycleRef,
      identityMatched: true,
      materialIntegrityBps: 9_500,
      referenceResidualValueMinor: 10_000,
    });
    expect(assessed).toMatchObject({ ok: true, grade: "A", repairability: "REPAIRABLE" });
  });

  it("fails closed when a calibration-required source is expired or missing calibration provenance", () => {
    const { passport, recovery } = makeBoundInputs();
    const base = makeSyntheticConditionEvidenceCaptureV01();
    const expiredSources: readonly ConditionEvidenceSourceV01[] = base.sources.map((source) =>
      source.sourceRef === "SIM-METROLOGY-001"
        ? { ...source, calibrationValidUntil: "2026-08-22T23:59:59.000Z" }
        : source,
    );
    const expired = makeSyntheticConditionEvidenceCaptureV01({ sources: expiredSources });
    const expiredValidation = validateConditionEvidenceCaptureV01({
      capture: expired,
      recovery,
      passport,
    });
    expect(expiredValidation.ok).toBe(false);
    expect(expiredValidation.issues).toContain("calibration_expired");

    const missingSources: readonly ConditionEvidenceSourceV01[] = base.sources.map((source) =>
      source.sourceRef === "SIM-CAMERA-001"
        ? { ...source, calibrationRef: undefined, calibrationValidUntil: undefined }
        : source,
    );
    const missing = makeSyntheticConditionEvidenceCaptureV01({ sources: missingSources });
    const missingValidation = validateConditionEvidenceCaptureV01({
      capture: missing,
      recovery,
      passport,
    });
    expect(missingValidation.ok).toBe(false);
    expect(missingValidation.issues).toContain("calibration_missing");
  });

  it("rejects stale and future evidence timestamps", () => {
    const { passport, recovery } = makeBoundInputs();
    const base = makeSyntheticConditionEvidenceCaptureV01();
    const staleSources = base.sources.map((source) => ({
      ...source,
      capturedAt: "2026-08-23T08:00:00.000Z",
    }));
    const stale = makeSyntheticConditionEvidenceCaptureV01({
      maximumEvidenceAgeMs: 60_000,
      sources: staleSources,
    });
    expect(
      validateConditionEvidenceCaptureV01({ capture: stale, recovery, passport }).issues,
    ).toContain("source_stale");

    const futureSources = base.sources.map((source, index) =>
      index === 0 ? { ...source, capturedAt: "2026-08-23T08:31:00.000Z" } : source,
    );
    const future = makeSyntheticConditionEvidenceCaptureV01({ sources: futureSources });
    expect(
      validateConditionEvidenceCaptureV01({ capture: future, recovery, passport }).issues,
    ).toContain("source_from_future");
  });

  it("requires camera-produced canonical facts to be explicit deterministic derivations", () => {
    const { passport, recovery } = makeBoundInputs();
    const base = makeSyntheticConditionEvidenceCaptureV01();
    const facts = replaceFact(base.facts, "STAIN_AREA_BPS", {
      kind: "FACT",
      derivationRef: undefined,
    });
    const capture = makeSyntheticConditionEvidenceCaptureV01({ facts });
    const validation = validateConditionEvidenceCaptureV01({ capture, recovery, passport });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toContain("camera_fact_must_be_derived");
  });

  it("rejects wrong units, incompatible sources, duplicate facts, and identity mismatch", () => {
    const { passport, recovery } = makeBoundInputs();
    const base = makeSyntheticConditionEvidenceCaptureV01();
    const wrongUnit = replaceFact(base.facts, "MAX_TEAR_LENGTH_MM", { unit: "CM" });
    const wrongSource = replaceFact(wrongUnit, "IDENTITY_MATCHED", {
      sourceRef: "SIM-CAMERA-001",
      kind: "DERIVED",
      derivationRef: "DERIVE-ID-001",
    });
    const duplicate = [...wrongSource, wrongSource.find((fact) => fact.semanticId === "SEAM_FAILURE_COUNT")!];
    const capture = makeSyntheticConditionEvidenceCaptureV01({
      assetRef: "GARMENT-WRONG",
      facts: duplicate,
    });
    const validation = validateConditionEvidenceCaptureV01({ capture, recovery, passport });

    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        "identity_binding_mismatch",
        "fact_unit_invalid",
        "semantic_source_incompatible",
        "fact_duplicate",
      ]),
    );
  });

  it("keeps model detections advisory while deterministic camera derivations may become canonical facts", () => {
    const { passport, recovery } = makeBoundInputs();
    const base = makeSyntheticConditionEvidenceCaptureV01();
    const facts = replaceFact(base.facts, "STAIN_AREA_BPS", {
      value: 600,
      kind: "DERIVED",
      derivationRef: "DERIVE-SEGMENTED-PIXEL-AREA-002",
    });
    const capture = makeSyntheticConditionEvidenceCaptureV01({
      facts,
      inferences: [
        {
          label: "severe stain suspected",
          confidence: 0.98,
          modelRef: "VISION-STAIN-MODEL-001",
          modelVersion: "3.0.0",
          evidenceRef: "EVIDENCE-STAIN-001",
          sourceRef: "SIM-CAMERA-001",
        },
      ],
    });
    const observation = buildConditionObservationFromEvidenceV01({ capture, recovery, passport });
    const assessed = assessConditionV01({ observation, recovery, passport });

    expect(observation.stainAreaBps).toBe(600);
    expect(observation.inferences).toHaveLength(1);
    expect(assessed.grade).toBe("B");
    expect(assessed.epistemicSummary.inferenceUsedForCanonicalGrade).toBe(false);
  });

  it("refuses to build a condition observation from incomplete evidence", () => {
    const { passport, recovery } = makeBoundInputs();
    const base = makeSyntheticConditionEvidenceCaptureV01();
    const facts = base.facts.filter((fact) => fact.semanticId !== "MATERIAL_INTEGRITY_BPS");
    const capture = makeSyntheticConditionEvidenceCaptureV01({ facts });

    expect(() => buildConditionObservationFromEvidenceV01({ capture, recovery, passport })).toThrow(
      /condition_evidence_not_assessment_ready/,
    );
  });
});
