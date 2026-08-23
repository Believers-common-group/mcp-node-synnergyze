import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import {
  assessConditionV01,
  makeRecoveryValueAssessmentFromConditionV01,
  makeSyntheticConditionObservationV01,
  mapConditionAssessmentToQelFrameV01,
} from "./condition-assessment-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";
import {
  evaluateRecoveryValuePolicyV01,
  makeSyntheticRecoveryValuePriceBookV01,
} from "./recovery-value-policy-fixture.ts";

function makeBoundInputs() {
  const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "ASSESSED" });
  const recovery = makeSyntheticRecoveryNodeSnapshotV01({
    nodeState: "ROUTED",
    assetRef: passport.assetRef,
    passportCycleRef: passport.cycleRef,
    custodyRef: "CUSTODY-007-001",
    route: "REPAIR",
    routeDestinationRef: "REPAIR-NODE-BLR-001",
  });
  return { passport, recovery };
}

describe("QEL-FIXTURE-007 condition assessment and grading", () => {
  it("maps a clean evidenced product to deterministic Grade A", () => {
    const { passport, recovery } = makeBoundInputs();
    const observation = makeSyntheticConditionObservationV01();
    const result = assessConditionV01({ observation, recovery, passport });
    const frame = mapConditionAssessmentToQelFrameV01({ observation, recovery, passport });

    expect(result).toMatchObject({
      ok: true,
      grade: "A",
      repairability: "REPAIRABLE",
      gradeReasons: ["NO_MATERIAL_DEFECT"],
    });
    expect(result.epistemicSummary.inferenceUsedForCanonicalGrade).toBe(false);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object.type).toBe("CONDITION_ASSESSMENT");
    expect(frame.state.value).toBe("READY");
  });

  it("uses the worst deterministic evidenced rule when multiple defects coexist", () => {
    const { passport, recovery } = makeBoundInputs();
    const observation = makeSyntheticConditionObservationV01({
      contamination: "CLEANABLE",
      stainAreaBps: 600,
      maximumTearLengthMm: 125,
      seamFailureCount: 1,
      materialIntegrityBps: 8_000,
    });
    const result = assessConditionV01({ observation, recovery, passport });

    expect(result.grade).toBe("D");
    expect(result.gradeReasons).toContain("TEAR_MAJOR");
    expect(result.repairability).toBe("MARGINAL");
  });

  it("forces SCRAP for hazardous contamination or economically non-repairable damage", () => {
    const { passport, recovery } = makeBoundInputs();

    const hazardous = assessConditionV01({
      observation: makeSyntheticConditionObservationV01({ contamination: "HAZARDOUS" }),
      recovery,
      passport,
    });
    expect(hazardous.grade).toBe("SCRAP");
    expect(hazardous.gradeReasons).toContain("HAZARDOUS_CONTAMINATION");
    expect(hazardous.repairability).toBe("NOT_REPAIRABLE");

    const uneconomicRepair = assessConditionV01({
      observation: makeSyntheticConditionObservationV01({
        estimatedRepairCostMinor: 11_000,
        referenceResidualValueMinor: 10_000,
      }),
      recovery,
      passport,
    });
    expect(uneconomicRepair.grade).toBe("SCRAP");
    expect(uneconomicRepair.gradeReasons).toContain("REPAIR_COST_EXCEEDS_RESIDUAL");
  });

  it("keeps model inference advisory and never lets it alter the canonical grade", () => {
    const { passport, recovery } = makeBoundInputs();
    const observation = makeSyntheticConditionObservationV01({
      inferences: [
        {
          label: "looks severely damaged",
          confidence: 0.99,
          modelRef: "VISION-MODEL-001",
          modelVersion: "7.2.0",
          evidenceRef: "SIM-VISION-001",
        },
      ],
    });
    const result = assessConditionV01({ observation, recovery, passport });

    expect(result.grade).toBe("A");
    expect(result.epistemicSummary).toMatchObject({
      inferenceCount: 1,
      inferenceUsedForCanonicalGrade: false,
    });
  });

  it("fails closed when product identity or evidence does not bind", () => {
    const { passport, recovery } = makeBoundInputs();
    const observation = makeSyntheticConditionObservationV01({
      identityMatched: false,
      assetRef: "GARMENT-WRONG",
      evidenceSourceRefs: [],
    });
    const result = assessConditionV01({ observation, recovery, passport });
    const frame = mapConditionAssessmentToQelFrameV01({ observation, recovery, passport });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "identity_mismatch",
        "recovery_identity_mismatch",
        "passport_identity_mismatch",
        "evidence_missing",
      ]),
    );
    expect(frame.state.value).toBe("BLOCKED");
    expect(frame.risk).toMatchObject({
      type: "CONDITION_ASSESSMENT_INVALID",
      severity: "HIGH",
    });
  });

  it("hands the unadjusted reference residual value to Fixture 006 so condition is applied once", () => {
    const { passport, recovery } = makeBoundInputs();
    const observation = makeSyntheticConditionObservationV01({
      maximumTearLengthMm: 10,
      referenceResidualValueMinor: 10_000,
    });
    const valueAssessment = makeRecoveryValueAssessmentFromConditionV01({
      observation,
      recovery,
      passport,
      beneficiaryRef: "DIGITALME:RECOVERY-PARTICIPANT-001",
    });

    expect(valueAssessment.conditionGrade).toBe("B");
    expect(valueAssessment.assessedResidualValueMinor).toBe(10_000);

    const priced = evaluateRecoveryValuePolicyV01({
      priceBook: makeSyntheticRecoveryValuePriceBookV01({
        rewardShareBps: 10_000,
        minimumRewardMinor: 0,
        maximumRewardMinor: 100_000,
      }),
      assessment: valueAssessment,
      recovery,
      passport,
    });

    expect(priced.breakdown).toMatchObject({
      assessedResidualValueMinor: 10_000,
      conditionAdjustedResidualMinor: 8_000,
      routeAdjustedResidualMinor: 5_600,
      residualRewardMinor: 5_600,
      rewardAmountMinor: 5_600,
    });
  });
});
