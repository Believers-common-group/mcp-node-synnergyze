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

describe("QEL cross-domain Pod Pulse", () => {
  it("reduces compute, factory, and product-passport objects through one shared operating grammar", () => {
    const observedAt = "2026-08-23T05:45:00.000Z";
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
    const passport = mapSyntheticCircularPassportToQelFrameV01(
      makeSyntheticCircularPassportSnapshotV01({
        observedAt,
        correlationId: "QEL-CROSS-DOMAIN-PASSPORT-001",
        lifecycleState: "RETURN_PENDING",
      }),
    );

    const pulse = buildQelPodPulseV01({
      podRef: "POD-QEL-CROSS-DOMAIN-001",
      observedAt,
      frames: [compute, factory, passport],
    });

    expect(compute.object.type).toBe("COMPUTE_SERVICE");
    expect(factory.object.type).toBe("PRODUCTION_LINE");
    expect(passport.object.type).toBe("PRODUCT_PASSPORT");
    expect(pulse.now.objectCount).toBe(3);
    expect(pulse.now.health).toBe("WATCH");
    expect(pulse.needs).toEqual([
      {
        objectRef: "FACTORY-LINE-03",
        type: "MATERIAL",
        priority: "HIGH",
        target: "restore_material_flow",
      },
      {
        objectRef: "GARMENT-98F1",
        type: "TRANSPORT",
        priority: "HIGH",
        target: "return_asset_to_network",
      },
    ]);
    expect(pulse.risks[0]).toMatchObject({
      objectRef: "FACTORY-LINE-03",
      type: "MATERIAL_STARVATION",
      severity: "HIGH",
    });
    expect(pulse.risks[1]).toMatchObject({
      objectRef: "GARMENT-98F1",
      type: "RECOVERY_DELAY",
      severity: "MODERATE",
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
    expect(pulse.proof.verifiedOutcomes).toBe(0);
    expect(pulse.proof.unresolvedOutcomes).toBe(3);
  });
});
