import { describe, expect, it } from "vitest";

import { SyntheticCpuComputeRunner } from "../../compute/runtime.ts";
import { mapAlphaComputeRunnerToQelFrameV01 } from "./alpha-compute-adapter.ts";
import {
  makeSyntheticCircularPassportSnapshotV01,
  mapSyntheticCircularPassportToQelFrameV01,
} from "./circular-passport-fixture.ts";
import {
  makeSyntheticFactoryLineSnapshotV01,
  mapSyntheticFactoryLineToQelFrameV01,
} from "./factory-line-fixture.ts";
import { buildQelPodPulseV01 } from "./pulse.ts";
import {
  makeSyntheticRecoveryNodeSnapshotV01,
  mapSyntheticRecoveryNodeToQelFrameV01,
} from "./recovery-node-fixture.ts";
import {
  makeSyntheticRecoverySettlementSnapshotV01,
  mapSyntheticRecoverySettlementToQelFrameV01,
} from "./recovery-settlement-fixture.ts";

describe("QEL cross-domain Pod Pulse", () => {
  it("reduces compute, factory, passport, recovery-node, and settlement objects through one shared operating grammar", () => {
    const observedAt = "2026-08-23T07:00:00.000Z";
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
    });
    const recovery = mapSyntheticRecoveryNodeToQelFrameV01(recoverySnapshot);
    const settlement = mapSyntheticRecoverySettlementToQelFrameV01({
      settlement: makeSyntheticRecoverySettlementSnapshotV01({
        observedAt,
        correlationId: "QEL-CROSS-DOMAIN-SETTLEMENT-001",
        state: "AUTHORIZED",
        recoveryNodeRef: recoverySnapshot.nodeRef,
        assetRef: passportSnapshot.assetRef,
        passportCycleRef: passportSnapshot.cycleRef,
        assessedValueMinor: 5000,
        rewardAmountMinor: 1000,
        assessmentRef: "ASSESSMENT-CROSS-DOMAIN-001",
        authorityState: "ALLOWED",
        authorityRef: "WARDEN-AUTH-CROSS-DOMAIN-001",
      }),
      recovery: recoverySnapshot,
      passport: passportSnapshot,
    });

    const pulse = buildQelPodPulseV01({
      podRef: "POD-QEL-CROSS-DOMAIN-001",
      observedAt,
      frames: [compute, factory, passport, recovery, settlement],
    });

    expect(compute.object.type).toBe("COMPUTE_SERVICE");
    expect(factory.object.type).toBe("PRODUCTION_LINE");
    expect(passport.object.type).toBe("PRODUCT_PASSPORT");
    expect(recovery.object.type).toBe("RECOVERY_NODE");
    expect(settlement.object.type).toBe("RECOVERY_SETTLEMENT");
    expect(pulse.now.objectCount).toBe(5);
    expect(pulse.now.health).toBe("WATCH");
    expect(pulse.needs).toEqual([
      {
        objectRef: "FACTORY-LINE-03",
        type: "MATERIAL",
        priority: "HIGH",
        target: "restore_material_flow",
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
        (move) => move.objectRef === settlement.object.id && move.action === "SUBMIT_SETTLEMENT",
      ),
    ).toBe(true);
    expect(pulse.proof.verifiedOutcomes).toBe(0);
    expect(pulse.proof.unresolvedOutcomes).toBe(5);
  });
});
