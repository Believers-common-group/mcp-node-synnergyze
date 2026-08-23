import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";
import {
  evaluateRecoveryValuePolicyV01,
  makeSettlementFromRecoveryValuePolicyV01,
  makeSyntheticRecoveryValueAssessmentV01,
  makeSyntheticRecoveryValuePriceBookV01,
  mapRecoveryValuePolicyToQelFrameV01,
} from "./recovery-value-policy-fixture.ts";

describe("QEL-FIXTURE-006 recovery value policy", () => {
  function makeContext() {
    const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "ASSESSED" });
    const recovery = makeSyntheticRecoveryNodeSnapshotV01({
      nodeState: "ASSESSED",
      assetRef: passport.assetRef,
      passportCycleRef: passport.cycleRef,
      custodyRef: "CUSTODY-001",
      route: "REPAIR",
    });
    return { passport, recovery };
  }

  it("reconstructs reward deterministically from price-book components", () => {
    const { passport, recovery } = makeContext();
    const priceBook = makeSyntheticRecoveryValuePriceBookV01();
    const assessment = makeSyntheticRecoveryValueAssessmentV01();

    const result = evaluateRecoveryValuePolicyV01({ priceBook, assessment, recovery, passport });

    expect(result).toMatchObject({ ok: true, eligible: true, issues: [] });
    expect(result.breakdown).toEqual({
      currency: "INR",
      assessedResidualValueMinor: 10_000,
      conditionAdjustedResidualMinor: 8_000,
      routeAdjustedResidualMinor: 5_600,
      residualRewardMinor: 2_800,
      materialRecoveryValueMinor: 500,
      programmeIncentiveMinor: 200,
      environmentalIncentiveMinor: 100,
      handlingDeductionMinor: 300,
      grossRewardMinor: 3_600,
      preClampNetRewardMinor: 3_300,
      rewardAmountMinor: 3_300,
    });
  });

  it("fails closed when environmental incentive lacks evidence", () => {
    const { passport, recovery } = makeContext();
    const result = evaluateRecoveryValuePolicyV01({
      priceBook: makeSyntheticRecoveryValuePriceBookV01(),
      assessment: makeSyntheticRecoveryValueAssessmentV01({ environmentalEvidenceRef: undefined }),
      recovery,
      passport,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("environmental_evidence_required");
  });

  it("fails closed when route differs from the assessed recovery route", () => {
    const { passport, recovery } = makeContext();
    const result = evaluateRecoveryValuePolicyV01({
      priceBook: makeSyntheticRecoveryValuePriceBookV01(),
      assessment: makeSyntheticRecoveryValueAssessmentV01({ route: "RECYCLE" }),
      recovery,
      passport,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("route_mismatch");
  });

  it("enforces policy effective dates", () => {
    const { passport, recovery } = makeContext();
    const result = evaluateRecoveryValuePolicyV01({
      priceBook: makeSyntheticRecoveryValuePriceBookV01({ validFrom: "2026-09-01T00:00:00.000Z" }),
      assessment: makeSyntheticRecoveryValueAssessmentV01(),
      recovery,
      passport,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("policy_not_effective");
  });

  it("clamps positive rewards to policy bounds without creating value from zero", () => {
    const { passport, recovery } = makeContext();
    const minimum = evaluateRecoveryValuePolicyV01({
      priceBook: makeSyntheticRecoveryValuePriceBookV01({ minimumRewardMinor: 500 }),
      assessment: makeSyntheticRecoveryValueAssessmentV01({
        assessedResidualValueMinor: 100,
        materialRecoveryValueMinor: 0,
        programmeIncentiveMinor: 0,
        environmentalIncentiveMinor: 0,
        environmentalEvidenceRef: undefined,
        handlingDeductionMinor: 0,
      }),
      recovery,
      passport,
    });
    expect(minimum.breakdown?.rewardAmountMinor).toBe(500);

    const zero = evaluateRecoveryValuePolicyV01({
      priceBook: makeSyntheticRecoveryValuePriceBookV01({ minimumRewardMinor: 500 }),
      assessment: makeSyntheticRecoveryValueAssessmentV01({
        assessedResidualValueMinor: 0,
        materialRecoveryValueMinor: 0,
        programmeIncentiveMinor: 0,
        environmentalIncentiveMinor: 0,
        environmentalEvidenceRef: undefined,
        handlingDeductionMinor: 0,
      }),
      recovery,
      passport,
    });
    expect(zero.breakdown?.rewardAmountMinor).toBe(0);
    expect(zero.eligible).toBe(false);
  });

  it("produces a QEL quote and only drafts a settlement obligation after deterministic pricing", () => {
    const { passport, recovery } = makeContext();
    const priceBook = makeSyntheticRecoveryValuePriceBookV01();
    const assessment = makeSyntheticRecoveryValueAssessmentV01();

    const frame = mapRecoveryValuePolicyToQelFrameV01({ priceBook, assessment, recovery, passport });
    expect(frame.object.type).toBe("RECOVERY_VALUE_QUOTE");
    expect(frame.state.value).toBe("READY");
    expect(frame.demand).toMatchObject({
      type: "APPROVAL",
      target: "create_recovery_settlement_obligation",
    });

    const settlement = makeSettlementFromRecoveryValuePolicyV01({
      priceBook,
      assessment,
      recovery,
      passport,
    });
    expect(settlement).toMatchObject({
      state: "APPROVAL_REQUIRED",
      authorityState: "UNRESOLVED",
      rewardAmountMinor: 3_300,
      currency: "INR",
      eligibilityPolicyRef: "RECOVERY-PRICE-BOOK-INDIA-001@1.0.0",
    });
  });
});
