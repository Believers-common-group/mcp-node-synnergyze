import { describe, expect, it } from "vitest";

import {
  buildSyntheticCircularPassportPodPulseV01,
  makeSyntheticCircularPassportSnapshotV01,
  mapSyntheticCircularPassportToQelFrameV01,
  validateSyntheticCircularPassportSnapshotV01,
} from "./circular-passport-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";

describe("QEL-FIXTURE-003 circular product passport", () => {
  it("maps an active-use product passport through the common QEL contract", () => {
    const snapshot = makeSyntheticCircularPassportSnapshotV01();
    const frame = mapSyntheticCircularPassportToQelFrameV01(snapshot);

    expect(validateSyntheticCircularPassportSnapshotV01(snapshot)).toEqual({ ok: true, issues: [] });
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object).toMatchObject({
      id: "GARMENT-98F1",
      type: "PRODUCT_PASSPORT",
      class: "CIRCULAR_PRODUCT_PASSPORT",
    });
    expect(frame.state.value).toBe("ACTIVE");
    expect(frame.health.value).toBe("GOOD");
    expect(frame.flow).toMatchObject({ state: "FLOWING", value: 1, unit: "LIFECYCLE_CYCLE" });
    expect(frame.outcome.state).toBe("OBSERVED");
    expect(frame.moves.find((move) => move.action === "ROUTE_NEXT_CYCLE")?.authority).toBe(
      "APPROVAL_REQUIRED",
    );
  });

  it("surfaces return-pending assets as recovery work without treating them as disposed", () => {
    const frame = mapSyntheticCircularPassportToQelFrameV01(
      makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "RETURN_PENDING" }),
    );

    expect(frame.state.value).toBe("WAITING");
    expect(frame.health.value).toBe("WATCH");
    expect(frame.flow.state).toBe("QUEUED");
    expect(frame.demand).toEqual({
      type: "TRANSPORT",
      priority: "HIGH",
      target: "return_asset_to_network",
    });
    expect(frame.risk).toMatchObject({ type: "RECOVERY_DELAY", severity: "MODERATE" });
    expect(frame.state.value).not.toBe("RETIRED");
  });

  it("requires an explicit successor cycle when an asset re-enters", () => {
    const invalid = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "REENTERED" });
    expect(validateSyntheticCircularPassportSnapshotV01(invalid)).toEqual({
      ok: false,
      issues: ["reentered_successor_cycle_missing"],
    });

    const valid = makeSyntheticCircularPassportSnapshotV01({
      lifecycleState: "REENTERED",
      successorCycleRef: "GARMENT-98F1:CYCLE-02",
      effectRef: "PASSPORT-EFFECT-REENTER-001",
    });
    const frame = mapSyntheticCircularPassportToQelFrameV01(valid);

    expect(validateSyntheticCircularPassportSnapshotV01(valid)).toEqual({ ok: true, issues: [] });
    expect(frame.state.value).toBe("READY");
    expect(frame.flow.state).toBe("COMPLETE");
    expect(frame.outcome.state).toBe("EVIDENCE_BOUND");
    expect(frame.native?.rawValue).toMatchObject({
      cycleRef: "GARMENT-98F1:CYCLE-01",
      successorCycleRef: "GARMENT-98F1:CYCLE-02",
    });
  });

  it("requires successor asset lineage when the original asset is transformed", () => {
    const invalid = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "TRANSFORMED" });
    expect(validateSyntheticCircularPassportSnapshotV01(invalid)).toEqual({
      ok: false,
      issues: ["transformed_successor_asset_missing"],
    });

    const valid = makeSyntheticCircularPassportSnapshotV01({
      lifecycleState: "TRANSFORMED",
      successorAssetRefs: ["FIBRE-BATCH-443", "FIBRE-BATCH-444"],
      lineageRefs: ["MATERIAL-BATCH-DENIM-001", "RECOVERY-LOT-2026-001"],
    });
    const frame = mapSyntheticCircularPassportToQelFrameV01(valid);

    expect(validateSyntheticCircularPassportSnapshotV01(valid)).toEqual({ ok: true, issues: [] });
    expect(frame.state.value).toBe("RETIRED");
    expect(frame.flow.state).toBe("COMPLETE");
    expect(frame.native?.rawValue).toMatchObject({
      successorAssetRefs: ["FIBRE-BATCH-443", "FIBRE-BATCH-444"],
    });
  });

  it("requires verified terminal disposition for a disposed asset and preserves River verification", () => {
    const invalid = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "DISPOSED" });
    expect(validateSyntheticCircularPassportSnapshotV01(invalid)).toEqual({
      ok: false,
      issues: ["disposed_terminal_disposition_missing"],
    });

    const valid = makeSyntheticCircularPassportSnapshotV01({
      lifecycleState: "DISPOSED",
      terminalDispositionRef: "DISPOSAL-VERIFIED-001",
      effectRef: "PASSPORT-EFFECT-DISPOSAL-001",
      riverVerification: {
        receiptRef: "RIVER:PASSPORT-EFFECT-DISPOSAL-001",
        correlationId: "QEL-FIXTURE-003-CORR-001",
        effectRef: "PASSPORT-EFFECT-DISPOSAL-001",
        verifiedAt: "2026-08-23T05:44:50.000Z",
        verificationState: "VERIFIED",
      },
    });
    const frame = mapSyntheticCircularPassportToQelFrameV01(valid);

    expect(frame.state.value).toBe("RETIRED");
    expect(frame.outcome).toEqual({
      state: "VERIFIED",
      effectRef: "PASSPORT-EFFECT-DISPOSAL-001",
      riverReceiptRef: "RIVER:PASSPORT-EFFECT-DISPOSAL-001",
    });
  });

  it("keeps an unknown/lost lifecycle unresolved rather than silently closing it", () => {
    const frame = mapSyntheticCircularPassportToQelFrameV01(
      makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "UNRESOLVED" }),
    );

    expect(frame.state.value).toBe("BLOCKED");
    expect(frame.health.value).toBe("ACT");
    expect(frame.risk).toEqual({ type: "LIFECYCLE_LOSS", severity: "HIGH", confidence: 1 });
    expect(frame.demand).toEqual({
      type: "INFORMATION",
      priority: "HIGH",
      target: "resolve_lifecycle_state",
    });
    expect(frame.outcome.state).toBe("OBSERVED");
  });

  it("projects circular recovery into NOW / NEEDS / RISKS / MOVES / PROOF", () => {
    const pulse = buildSyntheticCircularPassportPodPulseV01({
      ...makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "RETURN_PENDING" }),
      podRef: "POD-CIRCULAR-001",
    });

    expect(pulse.now).toMatchObject({ objectCount: 1, health: "WATCH" });
    expect(pulse.needs[0]).toMatchObject({ type: "TRANSPORT", priority: "HIGH" });
    expect(pulse.risks[0]).toMatchObject({ type: "RECOVERY_DELAY", severity: "MODERATE" });
    expect(pulse.moves.map((move) => move.action)).toEqual([
      "VIEW",
      "TRANSFER",
      "RETURN",
      "ASSESS",
      "ROUTE_NEXT_CYCLE",
    ]);
    expect(pulse.proof.unresolvedOutcomes).toBe(1);
  });
});
