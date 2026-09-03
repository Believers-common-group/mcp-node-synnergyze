import { describe, expect, it } from "vitest";

import {
  QEL_RECOVERY_CUSTODY_CAPABILITY_REF,
  buildSyntheticRecoveryNodePodPulseV01,
  makeSyntheticRecoveryNodeSnapshotV01,
  mapSyntheticRecoveryNodeToQelFrameV01,
  validateSyntheticRecoveryNodeSnapshotV01,
} from "./recovery-node-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";

describe("QEL-FIXTURE-004 recovery node", () => {
  it("maps a ready recovery node into the shared QEL operational contract", () => {
    const frame = mapSyntheticRecoveryNodeToQelFrameV01(makeSyntheticRecoveryNodeSnapshotV01());

    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object).toMatchObject({
      id: "RECOVERY-NODE-BLR-001",
      type: "RECOVERY_NODE",
      class: "CIRCULAR_RECOVERY_NODE",
    });
    expect(frame.state.value).toBe("READY");
    expect(frame.health.value).toBe("GOOD");
    expect(frame.outcome.state).toBe("OBSERVED");
  });

  it("requires asset and cycle identity before accepting custody", () => {
    const snapshot = makeSyntheticRecoveryNodeSnapshotV01({ nodeState: "ACCEPTED" });
    const validation = validateSyntheticRecoveryNodeSnapshotV01(snapshot);
    const frame = mapSyntheticRecoveryNodeToQelFrameV01(snapshot);

    expect(validation.issues).toEqual([
      "asset_required",
      "passport_cycle_required",
      "custody_ref_required",
    ]);
    expect(frame.health.value).toBe("ACT");
    expect(frame.risk).toMatchObject({ type: "RECOVERY_CUSTODY_INVALID", severity: "HIGH" });
  });

  it("binds accepted custody to the existing governed inventory.transfer capability", () => {
    const frame = mapSyntheticRecoveryNodeToQelFrameV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "CUSTODY_HELD",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY:RECOVERY-NODE-BLR-001:GARMENT-98F1",
        priorCustodianRef: "CUSTODIAN:CONSUMER-ANON-001",
      }),
    );

    expect(frame.state.value).toBe("ACTIVE");
    expect(frame.flow.state).toBe("FLOWING");
    expect(frame.moves.find((move) => move.action === "ACCEPT_CUSTODY")).toMatchObject({
      authority: "APPROVAL_REQUIRED",
      capabilityRef: QEL_RECOVERY_CUSTODY_CAPABILITY_REF,
      targetRef: "GARMENT-98F1",
    });
  });

  it("surfaces assessment and routing as governed next work", () => {
    const assessment = mapSyntheticRecoveryNodeToQelFrameV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "ASSESSMENT_PENDING",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
      }),
    );
    expect(assessment.state.value).toBe("WAITING");
    expect(assessment.demand).toEqual({
      type: "SERVICE",
      priority: "HIGH",
      target: "assess_recovered_asset",
    });

    const routing = mapSyntheticRecoveryNodeToQelFrameV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "ROUTING_PENDING",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
      }),
    );
    expect(routing.demand).toEqual({
      type: "APPROVAL",
      priority: "HIGH",
      target: "select_recovery_route",
    });
    expect(routing.moves.find((move) => move.action === "ROUTE")?.authority).toBe(
      "APPROVAL_REQUIRED",
    );
  });

  it("requires destination binding before a routed/released asset can leave custody", () => {
    const invalid = validateSyntheticRecoveryNodeSnapshotV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "RELEASED",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
        route: "REPAIR",
      }),
    );
    expect(invalid.issues).toContain("route_destination_required");

    const valid = mapSyntheticRecoveryNodeToQelFrameV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "RELEASED",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
        route: "REPAIR",
        routeDestinationRef: "REPAIR-NODE-BLR-001",
      }),
    );
    expect(valid.flow.state).toBe("COMPLETE");
    expect(valid.moves.find((move) => move.action === "RELEASE_CUSTODY")).toMatchObject({
      authority: "APPROVAL_REQUIRED",
      capabilityRef: QEL_RECOVERY_CUSTODY_CAPABILITY_REF,
      targetRef: "REPAIR-NODE-BLR-001",
    });
  });

  it("keeps custody effects evidence-bound until River verifies them", () => {
    const withoutRiver = mapSyntheticRecoveryNodeToQelFrameV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "CUSTODY_HELD",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
        effectRef: "RECOVERY-CUSTODY-EFFECT-001",
      }),
    );
    expect(withoutRiver.outcome.state).toBe("EVIDENCE_BOUND");

    const withRiver = mapSyntheticRecoveryNodeToQelFrameV01(
      makeSyntheticRecoveryNodeSnapshotV01({
        nodeState: "CUSTODY_HELD",
        assetRef: "GARMENT-98F1",
        passportCycleRef: "GARMENT-98F1:CYCLE-01",
        custodyRef: "CUSTODY-001",
        effectRef: "RECOVERY-CUSTODY-EFFECT-001",
        riverVerification: {
          receiptRef: "RIVER:RECOVERY-CUSTODY-EFFECT-001",
          correlationId: "QEL-FIXTURE-004-CORR-001",
          effectRef: "RECOVERY-CUSTODY-EFFECT-001",
          verifiedAt: "2026-08-23T06:44:50.000Z",
          verificationState: "VERIFIED",
        },
      }),
    );
    expect(withRiver.outcome).toEqual({
      state: "VERIFIED",
      effectRef: "RECOVERY-CUSTODY-EFFECT-001",
      riverReceiptRef: "RIVER:RECOVERY-CUSTODY-EFFECT-001",
    });
  });

  it("surfaces queue saturation as recovery capacity risk", () => {
    const pulse = buildSyntheticRecoveryNodePodPulseV01({
      ...makeSyntheticRecoveryNodeSnapshotV01({
        queueDepth: 100,
        capacityUnits: 100,
      }),
      podRef: "POD-CIRCULAR-BLR-001",
    });

    expect(pulse.now.health).toBe("WATCH");
    expect(pulse.needs[0]).toMatchObject({ type: "CAPACITY", priority: "MODERATE" });
    expect(pulse.risks[0]).toMatchObject({
      type: "RECOVERY_CAPACITY_EXCEEDED",
      severity: "HIGH",
    });
  });
});
