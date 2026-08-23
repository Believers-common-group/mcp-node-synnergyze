import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";
import {
  QEL_SILK_SETTLEMENT_CAPABILITY_REF,
  buildSyntheticRecoverySettlementPodPulseV01,
  makeSyntheticRecoverySettlementSnapshotV01,
  mapSyntheticRecoverySettlementToQelFrameV01,
  validateSyntheticRecoverySettlementV01,
} from "./recovery-settlement-fixture.ts";

function assessedRecovery() {
  return makeSyntheticRecoveryNodeSnapshotV01({
    nodeState: "ASSESSED",
    assetRef: "GARMENT-98F1",
    passportCycleRef: "GARMENT-98F1:CYCLE-01",
    custodyRef: "CUSTODY-001",
  });
}

function recoveredPassport() {
  return makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "ASSESSED" });
}

describe("QEL-FIXTURE-005 recovery value and SILK settlement", () => {
  it("maps a draft settlement without claiming that money moved", () => {
    const frame = mapSyntheticRecoverySettlementToQelFrameV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01(),
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    });

    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object).toMatchObject({
      id: "SILK-RECOVERY-SETTLEMENT-001",
      type: "RECOVERY_SETTLEMENT",
      class: "SILK_RECOVERY_REWARD",
    });
    expect(frame.state.value).toBe("READY");
    expect(frame.outcome.state).toBe("OBSERVED");
    expect(frame.demand).toEqual({
      type: "INFORMATION",
      priority: "MODERATE",
      target: "complete_recovery_value_assessment",
    });
  });

  it("requires assessed recovery, assessment evidence, and positive reward before eligibility", () => {
    const invalid = validateSyntheticRecoverySettlementV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        state: "ELIGIBLE",
        assessedValueMinor: 5000,
        rewardAmountMinor: 0,
      }),
      recovery: makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "CUSTODY_HELD",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
      }),
      passport: recoveredPassport(),
    });

    expect(invalid.issues).toEqual([
      "recovery_assessment_required",
      "assessment_ref_missing",
      "positive_reward_required",
    ]);
  });

  it("blocks settlement when recovery/passport identity binding does not match", () => {
    const validation = validateSyntheticRecoverySettlementV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        state: "ELIGIBLE",
        assessedValueMinor: 5000,
        rewardAmountMinor: 1000,
        assessmentRef: "ASSESSMENT-001",
      }),
      recovery: assessedRecovery(),
      passport: makeSyntheticCircularPassportSnapshotV01({
        assetRef: "GARMENT-WRONG",
        cycleRef: "GARMENT-WRONG:CYCLE-01",
        registryRef: "GENESIS:GARMENT-WRONG",
        lifecycleState: "ASSESSED",
      }),
    });

    expect(validation.issues).toContain("recovery_passport_binding_blocked");
  });

  it("requires Warden authority before settlement submission", () => {
    const unauthorized = validateSyntheticRecoverySettlementV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        state: "AUTHORIZED",
        assessedValueMinor: 5000,
        rewardAmountMinor: 1000,
        assessmentRef: "ASSESSMENT-001",
        authorityState: "APPROVAL_REQUIRED",
      }),
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    });

    expect(unauthorized.issues).toEqual([
      "authority_allow_required",
      "authority_ref_missing",
    ]);
  });

  it("keeps SILK provider settlement receipts unverified until River observes the effect", () => {
    const settlement = makeSyntheticRecoverySettlementSnapshotV01({
      state: "CLAIMED_SETTLED",
      assessedValueMinor: 5000,
      rewardAmountMinor: 1000,
      assessmentRef: "ASSESSMENT-001",
      authorityState: "ALLOWED",
      authorityRef: "WARDEN-AUTH-SETTLEMENT-001",
      silkSubmissionRef: "SILK-SUBMISSION-001",
      silkReceiptRef: "SILK-RECEIPT-001",
      settlementEffectRef: "SILK-EFFECT-001",
    });
    const frame = mapSyntheticRecoverySettlementToQelFrameV01({
      settlement,
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    });

    expect(validateSyntheticRecoverySettlementV01({
      settlement,
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    })).toEqual({ ok: true, issues: [] });
    expect(frame.state.value).toBe("ACTIVE");
    expect(frame.health.value).toBe("WATCH");
    expect(frame.risk).toMatchObject({
      type: "UNVERIFIED_SETTLEMENT_CLAIM",
      severity: "MODERATE",
    });
    expect(frame.outcome).toEqual({
      state: "EVIDENCE_BOUND",
      effectRef: "SILK-EFFECT-001",
    });
  });

  it("requires matching River verification for VERIFIED_SETTLED", () => {
    const missingRiver = validateSyntheticRecoverySettlementV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        state: "VERIFIED_SETTLED",
        assessedValueMinor: 5000,
        rewardAmountMinor: 1000,
        assessmentRef: "ASSESSMENT-001",
        authorityState: "ALLOWED",
        authorityRef: "WARDEN-AUTH-SETTLEMENT-001",
        silkSubmissionRef: "SILK-SUBMISSION-001",
        silkReceiptRef: "SILK-RECEIPT-001",
        settlementEffectRef: "SILK-EFFECT-001",
      }),
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    });
    expect(missingRiver.issues).toEqual(["river_verification_required"]);

    const settlement = makeSyntheticRecoverySettlementSnapshotV01({
      state: "VERIFIED_SETTLED",
      assessedValueMinor: 5000,
      rewardAmountMinor: 1000,
      assessmentRef: "ASSESSMENT-001",
      authorityState: "ALLOWED",
      authorityRef: "WARDEN-AUTH-SETTLEMENT-001",
      silkSubmissionRef: "SILK-SUBMISSION-001",
      silkReceiptRef: "SILK-RECEIPT-001",
      settlementEffectRef: "SILK-EFFECT-001",
      riverVerification: {
        receiptRef: "RIVER:SILK-EFFECT-001",
        correlationId: "QEL-FIXTURE-005-CORR-001",
        effectRef: "SILK-EFFECT-001",
        verifiedAt: "2026-08-23T06:59:50.000Z",
        verificationState: "VERIFIED",
      },
    });
    const frame = mapSyntheticRecoverySettlementToQelFrameV01({
      settlement,
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    });

    expect(validateSyntheticRecoverySettlementV01({
      settlement,
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    })).toEqual({ ok: true, issues: [] });
    expect(frame.outcome).toEqual({
      state: "VERIFIED",
      effectRef: "SILK-EFFECT-001",
      riverReceiptRef: "RIVER:SILK-EFFECT-001",
    });
  });

  it("requires reconciliation after verified settlement before the obligation is closed", () => {
    const withoutReconciliation = validateSyntheticRecoverySettlementV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        state: "RECONCILED",
        assessedValueMinor: 5000,
        rewardAmountMinor: 1000,
        assessmentRef: "ASSESSMENT-001",
        authorityState: "ALLOWED",
        authorityRef: "WARDEN-AUTH-SETTLEMENT-001",
        silkSubmissionRef: "SILK-SUBMISSION-001",
        silkReceiptRef: "SILK-RECEIPT-001",
        settlementEffectRef: "SILK-EFFECT-001",
        riverVerification: {
          receiptRef: "RIVER:SILK-EFFECT-001",
          correlationId: "QEL-FIXTURE-005-CORR-001",
          effectRef: "SILK-EFFECT-001",
          verifiedAt: "2026-08-23T06:59:50.000Z",
          verificationState: "VERIFIED",
        },
      }),
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
    });
    expect(withoutReconciliation.issues).toEqual(["reconciliation_ref_missing"]);
  });

  it("projects settlement demand and governed SILK submission through Pod Pulse", () => {
    const pulse = buildSyntheticRecoverySettlementPodPulseV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        state: "AUTHORIZED",
        assessedValueMinor: 5000,
        rewardAmountMinor: 1000,
        assessmentRef: "ASSESSMENT-001",
        authorityState: "ALLOWED",
        authorityRef: "WARDEN-AUTH-SETTLEMENT-001",
      }),
      recovery: assessedRecovery(),
      passport: recoveredPassport(),
      podRef: "POD-CIRCULAR-BLR-001",
    });

    expect(pulse.needs[0]).toMatchObject({
      type: "SETTLEMENT",
      priority: "HIGH",
      target: "submit_silk_settlement",
    });
    expect(pulse.moves.find((move) => move.action === "SUBMIT_SETTLEMENT")).toMatchObject({
      authority: "APPROVAL_REQUIRED",
      capabilityRef: QEL_SILK_SETTLEMENT_CAPABILITY_REF,
    });
    expect(pulse.proof.verifiedOutcomes).toBe(0);
  });
});
