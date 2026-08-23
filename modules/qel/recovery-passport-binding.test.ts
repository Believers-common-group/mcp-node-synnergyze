import { describe, expect, it } from "vitest";

import { makeSyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { bindRecoveryNodeToPassportV01 } from "./recovery-passport-binding.ts";
import { makeSyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

describe("VSR-QEL-RECOVERY-PASSPORT-BINDING-001", () => {
  it("matches the same asset and cycle before custody acceptance", () => {
    const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "RETURN_PENDING" });
    const recovery = makeSyntheticRecoveryNodeSnapshotV01({
      nodeState: "IDENTIFIED",
      assetRef: passport.assetRef,
      passportCycleRef: passport.cycleRef,
    });

    expect(bindRecoveryNodeToPassportV01({ recovery, passport })).toMatchObject({
      state: "MATCHED",
      assetRef: "GARMENT-98F1",
      cycleRef: "GARMENT-98F1:CYCLE-01",
      issues: [],
    });
  });

  it("blocks a presented asset when the passport identity does not match", () => {
    const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "RETURN_PENDING" });
    const recovery = makeSyntheticRecoveryNodeSnapshotV01({
      nodeState: "IDENTIFIED",
      assetRef: "GARMENT-WRONG",
      passportCycleRef: passport.cycleRef,
    });

    expect(bindRecoveryNodeToPassportV01({ recovery, passport })).toMatchObject({
      state: "BLOCKED",
      issues: ["asset_mismatch"],
    });
  });

  it("blocks a stale or wrong lifecycle cycle even if the persistent asset matches", () => {
    const passport = makeSyntheticCircularPassportSnapshotV01({
      cycleRef: "GARMENT-98F1:CYCLE-02",
      cycleSequence: 2,
      lifecycleState: "RETURN_PENDING",
    });
    const recovery = makeSyntheticRecoveryNodeSnapshotV01({
      nodeState: "IDENTIFIED",
      assetRef: passport.assetRef,
      passportCycleRef: "GARMENT-98F1:CYCLE-01",
    });

    expect(bindRecoveryNodeToPassportV01({ recovery, passport })).toMatchObject({
      state: "BLOCKED",
      issues: ["cycle_mismatch"],
    });
  });

  it("does not recover a passport that is already terminally disposed", () => {
    const passport = makeSyntheticCircularPassportSnapshotV01({
      lifecycleState: "DISPOSED",
      terminalDispositionRef: "DISPOSITION-001",
    });
    const recovery = makeSyntheticRecoveryNodeSnapshotV01({
      nodeState: "IDENTIFIED",
      assetRef: passport.assetRef,
      passportCycleRef: passport.cycleRef,
    });

    expect(bindRecoveryNodeToPassportV01({ recovery, passport })).toMatchObject({
      state: "BLOCKED",
      issues: ["passport_not_returnable"],
    });
  });

  it("requires a custody reference once the node claims physical custody", () => {
    const passport = makeSyntheticCircularPassportSnapshotV01({ lifecycleState: "RECOVERED" });
    const recovery = makeSyntheticRecoveryNodeSnapshotV01({
      nodeState: "CUSTODY_HELD",
      assetRef: passport.assetRef,
      passportCycleRef: passport.cycleRef,
    });

    expect(bindRecoveryNodeToPassportV01({ recovery, passport })).toMatchObject({
      state: "BLOCKED",
      issues: ["custody_not_bound"],
    });
  });
});
