import { describe, expect, it } from "vitest";

import {
  makeSyntheticFactoryLineSnapshotV01,
  mapSyntheticFactoryLineToQelFrameV01,
  buildSyntheticFactoryLinePodPulseV01,
} from "./factory-line-fixture.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";

describe("QEL-FIXTURE-002 factory line", () => {
  it("maps a healthy running line into the same QEL operational contract", () => {
    const frame = mapSyntheticFactoryLineToQelFrameV01(makeSyntheticFactoryLineSnapshotV01());

    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
    expect(frame.object).toMatchObject({
      id: "FACTORY-LINE-03",
      type: "PRODUCTION_LINE",
      class: "SYNTHETIC_FACTORY_LINE",
    });
    expect(frame.state.value).toBe("ACTIVE");
    expect(frame.health.value).toBe("GOOD");
    expect(frame.flow).toMatchObject({ state: "FLOWING", value: 100, unit: "PCS_PER_HOUR" });
    expect(frame.outcome.state).toBe("OBSERVED");
    expect(frame.moves.find((move) => move.action === "REROUTE")?.authority).toBe(
      "APPROVAL_REQUIRED",
    );
  });

  it("surfaces starvation as material demand and high risk", () => {
    const frame = mapSyntheticFactoryLineToQelFrameV01(
      makeSyntheticFactoryLineSnapshotV01({
        nativeState: "STARVED",
        outputRatePerHour: 0,
        materialCoverMinutes: 0,
      }),
    );

    expect(frame.state.value).toBe("WAITING");
    expect(frame.health.value).toBe("WATCH");
    expect(frame.flow.state).toBe("QUEUED");
    expect(frame.demand).toEqual({
      type: "MATERIAL",
      priority: "HIGH",
      target: "restore_material_flow",
    });
    expect(frame.risk).toMatchObject({ type: "MATERIAL_STARVATION", severity: "HIGH" });
  });

  it("surfaces low throughput without inventing a machine fault", () => {
    const frame = mapSyntheticFactoryLineToQelFrameV01(
      makeSyntheticFactoryLineSnapshotV01({
        nativeState: "RUNNING",
        outputRatePerHour: 68,
        targetRatePerHour: 100,
      }),
    );

    expect(frame.state.value).toBe("ACTIVE");
    expect(frame.health.value).toBe("ACT");
    expect(frame.flow.state).toBe("SLOWING");
    expect(frame.risk).toMatchObject({ type: "THROUGHPUT_LOSS", severity: "HIGH" });
    expect(frame.demand.type).toBe("NONE");
  });

  it("fails evidence confidence closed when no synthetic sources are present", () => {
    const frame = mapSyntheticFactoryLineToQelFrameV01(
      makeSyntheticFactoryLineSnapshotV01({ evidenceSourceRefs: [] }),
    );

    expect(frame.evidence.status).toBe("MISSING");
    expect(frame.evidence.confidence).toBe(0);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
  });

  it("keeps an effect evidence-bound until a matching River verification receipt exists", () => {
    const withoutRiver = mapSyntheticFactoryLineToQelFrameV01(
      makeSyntheticFactoryLineSnapshotV01({ effectRef: "FACTORY-EFFECT-001" }),
    );
    expect(withoutRiver.outcome.state).toBe("EVIDENCE_BOUND");

    const withRiver = mapSyntheticFactoryLineToQelFrameV01(
      makeSyntheticFactoryLineSnapshotV01({
        effectRef: "FACTORY-EFFECT-001",
        riverVerification: {
          receiptRef: "RIVER:FACTORY-EFFECT-001",
          correlationId: "QEL-FIXTURE-002-CORR-001",
          effectRef: "FACTORY-EFFECT-001",
          verifiedAt: "2026-08-21T09:29:50.000Z",
          verificationState: "VERIFIED",
        },
      }),
    );

    expect(withRiver.outcome).toEqual({
      state: "VERIFIED",
      effectRef: "FACTORY-EFFECT-001",
      riverReceiptRef: "RIVER:FACTORY-EFFECT-001",
    });
  });

  it("projects the factory fixture through NOW / NEEDS / RISKS / MOVES / PROOF", () => {
    const pulse = buildSyntheticFactoryLinePodPulseV01({
      ...makeSyntheticFactoryLineSnapshotV01({
        nativeState: "FAULT",
        outputRatePerHour: 0,
        serviceRequired: true,
      }),
      podRef: "POD-FACTORY-BLR-01",
    });

    expect(pulse.now).toMatchObject({ objectCount: 1, blockedCount: 1, health: "ACT" });
    expect(pulse.needs[0]).toMatchObject({ type: "SERVICE", priority: "HIGH" });
    expect(pulse.risks[0]).toMatchObject({ type: "PRODUCTION_INTERRUPTION", severity: "HIGH" });
    expect(pulse.moves.map((move) => move.action)).toEqual(["VIEW", "INSPECT", "REROUTE", "STOP"]);
    expect(pulse.proof.unresolvedOutcomes).toBe(1);
  });
});
