import { describe, expect, it } from "vitest";

import {
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelOperationalFrameV01,
} from "./operational-contracts.ts";
import { buildQelPodPulseV01, VSR_QEL_PULSE_CONTRACT_VERSION } from "./pulse.ts";

function frame(
  id: string,
  overrides: Partial<QelOperationalFrameV01> = {},
): QelOperationalFrameV01 {
  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `QEL-FRAME:${id}`,
    correlationId: `QEL-CORR:${id}`,
    observedAt: "2026-08-21T08:35:00.000Z",
    object: { id, type: "MACHINE", registryRef: `GENESIS:${id}` },
    state: { value: "ACTIVE", kind: "FACT", confidence: 1 },
    health: { value: "GOOD", kind: "DERIVED", confidence: 0.99 },
    flow: { state: "FLOWING", value: 100, unit: "PCS_PER_HOUR", direction: "OUTPUT" },
    demand: { type: "NONE", priority: "NONE" },
    risk: { type: "NONE", severity: "NONE", confidence: 1 },
    moves: [],
    evidence: {
      status: "FRESH",
      confidence: 1,
      freshness: {
        observedAt: "2026-08-21T08:34:59.000Z",
        ageMs: 1000,
        status: "FRESH",
        maximumValidAgeMs: 30000,
      },
      sources: [{ sourceRef: `SOURCE:${id}`, kind: "SYSTEM" }],
    },
    outcome: { state: "OBSERVED" },
    ...overrides,
  };
}

describe("VSR-QEL-PULSE-001", () => {
  it("reduces multiple QEL frames into NOW / NEEDS / RISKS / MOVES / PROOF", () => {
    const pulse = buildQelPodPulseV01({
      podRef: "POD-FACTORY-BLR-01",
      observedAt: "2026-08-21T08:35:05.000Z",
      frames: [
        frame("LINE-01", {
          outcome: {
            state: "VERIFIED",
            effectRef: "EFFECT-001",
            riverReceiptRef: "RIVER:EFFECT-001",
          },
        }),
        frame("LINE-03", {
          health: { value: "ACT", kind: "DERIVED", confidence: 0.96 },
          demand: { type: "SERVICE", priority: "HIGH", target: "BEARING_INSPECTION" },
          risk: { type: "PRODUCTION_INTERRUPTION", severity: "HIGH", confidence: 0.91 },
          moves: [
            { action: "INSPECT", authority: "ALLOWED", targetRef: "LINE-03" },
            { action: "REROUTE", authority: "APPROVAL_REQUIRED", targetRef: "LINE-05" },
          ],
          evidence: {
            status: "AGING",
            confidence: 0.92,
            freshness: {
              observedAt: "2026-08-21T08:34:20.000Z",
              ageMs: 45000,
              status: "AGING",
              maximumValidAgeMs: 60000,
            },
            sources: [{ sourceRef: "PLC-03", kind: "CONTROLLER" }],
          },
        }),
      ],
    });

    expect(pulse.contractVersion).toBe(VSR_QEL_PULSE_CONTRACT_VERSION);
    expect(pulse.now).toEqual({
      objectCount: 2,
      activeCount: 2,
      blockedCount: 0,
      criticalCount: 0,
      health: "ACT",
    });
    expect(pulse.needs).toEqual([
      {
        objectRef: "LINE-03",
        type: "SERVICE",
        priority: "HIGH",
        target: "BEARING_INSPECTION",
      },
    ]);
    expect(pulse.risks[0]).toMatchObject({
      objectRef: "LINE-03",
      severity: "HIGH",
    });
    expect(pulse.moves).toHaveLength(2);
    expect(pulse.proof).toMatchObject({
      evidence: { FRESH: 1, AGING: 1, STALE: 0, MISSING: 0, CONFLICTING: 0 },
      verifiedOutcomes: 1,
      unresolvedOutcomes: 1,
      riverBoundOutcomes: 1,
    });
  });

  it("surfaces the worst health and prioritizes critical needs and risks", () => {
    const pulse = buildQelPodPulseV01({
      podRef: "POD-001",
      observedAt: "2026-08-21T08:35:05.000Z",
      frames: [
        frame("A", {
          health: { value: "WATCH", kind: "DERIVED", confidence: 0.9 },
          demand: { type: "MATERIAL", priority: "LOW" },
          risk: { type: "DELAY", severity: "LOW", confidence: 0.8 },
        }),
        frame("B", {
          health: { value: "CRITICAL", kind: "DERIVED", confidence: 0.98 },
          demand: { type: "SERVICE", priority: "CRITICAL" },
          risk: { type: "FAILURE", severity: "CRITICAL", confidence: 0.97 },
        }),
      ],
    });

    expect(pulse.now.health).toBe("CRITICAL");
    expect(pulse.now.criticalCount).toBe(1);
    expect(pulse.needs.map((need) => need.objectRef)).toEqual(["B", "A"]);
    expect(pulse.risks.map((risk) => risk.objectRef)).toEqual(["B", "A"]);
  });

  it("keeps claimed or observed effects unresolved until verification", () => {
    const pulse = buildQelPodPulseV01({
      podRef: "POD-001",
      observedAt: "2026-08-21T08:35:05.000Z",
      frames: [frame("A", { outcome: { state: "CLAIMED" } }), frame("B")],
    });

    expect(pulse.proof.verifiedOutcomes).toBe(0);
    expect(pulse.proof.unresolvedOutcomes).toBe(2);
  });
});
