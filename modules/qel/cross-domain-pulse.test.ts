import { describe, expect, it } from "vitest";

import { SyntheticCpuComputeRunner } from "../../compute/runtime.ts";
import { mapAlphaComputeRunnerToQelFrameV01 } from "./alpha-compute-adapter.ts";
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

describe("QEL cross-domain Pod Pulse", () => {
  it("reduces compute, factory, passport, recovery, evidence, condition, value, and settlement objects through one shared operating grammar", () => {
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
    const captureSnapshot = makeSyntheticConditionEvidenceCaptureV01({
      observedAt,
      correlationId: "QEL-CROSS-DOMAIN-EVIDENCE-001",
      recoveryNodeRef: recoverySnapshot.nodeRef,
      assetRef: passportSnapshot.assetRef,
      passportCycleRef: passportSnapshot.cycleRef,
      facts: makeSyntheticConditionEvidenceCaptureV01({ observedAt }).facts.map((fact) =>
        fact.semanticId === "MAX_TEAR_LENGTH_MM" ? { ...fact, value: 10 } : fact,
      ),
    });
    const evidenceCapture = mapConditionEvidenceCaptureToQelFrameV01({
      capture: captureSnapshot,
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });
    const conditionObservation = buildConditionObservationFromEvidenceV01({
      capture: captureSnapshot,
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
        evidenceCapture,
        condition,
        valueQuote,
        settlement,
      ],
    });

    expect(compute.object.type).toBe("COMPUTE_SERVICE");
    expect(factory.object.type).toBe("PRODUCTION_LINE");
    expect(passport.object.type).toBe("PRODUCT_PASSPORT");
    expect(recovery.object.type).toBe("RECOVERY_NODE");
    expect(evidenceCapture.object.type).toBe("CONDITION_EVIDENCE_CAPTURE");
    expect(condition.object.type).toBe("CONDITION_ASSESSMENT");
    expect(valueQuote.object.type).toBe("RECOVERY_VALUE_QUOTE");
    expect(settlement.object.type).toBe("RECOVERY_SETTLEMENT");
    expect(pulse.now.objectCount).toBe(8);
    expect(pulse.now.health).toBe("WATCH");
    expect(pulse.needs).toEqual([
      {
        objectRef: "FACTORY-LINE-03",
        type: "MATERIAL",
        priority: "HIGH",
        target: "restore_material_flow",
      },
      {
        objectRef: "RECOVERY-VALUE:GARMENT-98F1:CYCLE-01",
        type: "APPROVAL",
        priority: "HIGH",
        target: "create_recovery_settlement_obligation",
      },
      {
        objectRef: "SILK-RECOVERY-SETTLEMENT-001",
        type: "SETTLEMENT",
        priority: "HIGH",
        target: "submit_silk_settlement",
      },
      {
        objectRef: "GARMENT-98F1",
        type: "APPROVAL",
        priority: "MODERATE",
        target: "select_next_lifecycle_route",
      },
      {
        objectRef: "CAPTURE:GARMENT-98F1:CYCLE-01",
        type: "APPROVAL",
        priority: "MODERATE",
        target: "create_condition_assessment",
      },
      {
        objectRef: "ASSESSMENT:GARMENT-98F1:CYCLE-01",
        type: "APPROVAL",
        priority: "MODERATE",
        target: "create_recovery_value_quote",
      },
    ]);
    expect(pulse.risks[0]).toMatchObject({
      objectRef: "FACTORY-LINE-03",
      type: "MATERIAL_STARVATION",
      severity: "HIGH",
    });
    expect(
      pulse.moves.some((move) => move.objectRef === compute.object.id && move.action === "RUN_COMPUTE"),
    ).toBe(true);
    expect(
      pulse.moves.some((move) => move.objectRef === factory.object.id && move.action === "REROUTE"),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => move.objectRef === passport.object.id && move.action === "ROUTE_NEXT_CYCLE",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some((move) => move.objectRef === recovery.object.id && move.action === "ROUTE"),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) =>
          move.objectRef === evidenceCapture.object.id && move.action === "CREATE_CONDITION_ASSESSMENT",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => move.objectRef === condition.object.id && move.action === "CREATE_VALUE_QUOTE",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => valueQuote.object.id === move.objectRef && move.action === "CREATE_SETTLEMENT_OBLIGATION",
      ),
    ).toBe(true);
    expect(
      pulse.moves.some(
        (move) => move.objectRef === settlement.object.id && move.action === "SUBMIT_SETTLEMENT",
      ),
    ).toBe(true);
    expect(pulse.proof.verifiedOutcomes).toBe(0);
    expect(pulse.proof.unresolvedOutcomes).toBe(8);
  });
});
