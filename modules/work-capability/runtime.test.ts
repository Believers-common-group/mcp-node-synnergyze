import { describe, expect, it } from "vitest";

import type { CandidateCompositionV1 } from "./contracts.ts";
import {
  compileSyntheticGarmentWorkflowV1,
  resolveCapabilityDemandV1,
  selectCandidateCompositionV1,
} from "./runtime.ts";

function garmentWorkflow() {
  return compileSyntheticGarmentWorkflowV1({
    objectiveRef: "OBJECTIVE:B124",
    principalRef: "ORG:DDB-01",
    requiredEffectRef: "EFFECT:B124:500-ACCEPTED",
    deadline: "2026-08-30T18:00:00+05:30",
  });
}

function waistbandWorkUnit() {
  const unit = garmentWorkflow().workUnits.find((item) => item.action === "attach_waistband");
  if (!unit) throw new Error("test_waistband_work_unit_missing");
  return unit;
}

function candidate(
  compositionRef: string,
  overrides: Partial<CandidateCompositionV1> = {},
): CandidateCompositionV1 {
  const workUnit = waistbandWorkUnit();
  return {
    compositionRef,
    workUnitRef: workUnit.workUnitRef,
    actorRefs: ["HUMAN:OPERATOR-P17", "MACHINE:LOCKSTITCH-M04"],
    capabilityRefs: ["garment.waistband.attach"],
    eligible: true,
    evidenceConfidence: 0.95,
    expectedFirstPassQuality: 0.98,
    expectedCycleSeconds: 44,
    ...overrides,
  };
}

describe("WORK-CAPABILITY-RUNTIME-001 compiler", () => {
  it("compiles at least ten unassigned work units for the garment reference objective", () => {
    const result = garmentWorkflow();

    expect(result.workUnits.length).toBeGreaterThanOrEqual(10);
    expect(result.workUnits.every((unit) => !("assignmentRef" in unit))).toBe(true);
    expect(result.workUnits.some((unit) => unit.action === "attach_waistband")).toBe(true);
  });
});

describe("WORK-CAPABILITY-RUNTIME-001 capability resolution", () => {
  it("returns MISSING capability debt without fabricating a candidate", () => {
    const result = resolveCapabilityDemandV1({
      workUnit: waistbandWorkUnit(),
      capabilities: [],
      candidates: [],
    });

    expect(result.state).toBe("MISSING");
    expect(result.candidateCompositionRefs).toEqual([]);
    expect(result.missingCapabilityRefs).toEqual(["garment.waistband.attach"]);
  });

  it("selects only eligible compositions by evidence, quality, cycle time, then ref", () => {
    const candidateA = candidate("COMPOSITION:A", {
      evidenceConfidence: 0.95,
      expectedFirstPassQuality: 0.98,
      expectedCycleSeconds: 44,
    });
    const candidateB = candidate("COMPOSITION:B", {
      evidenceConfidence: 0.97,
      expectedFirstPassQuality: 0.98,
      expectedCycleSeconds: 45,
    });
    const ineligible = candidate("COMPOSITION:INELIGIBLE", {
      eligible: false,
      evidenceConfidence: 1,
      expectedFirstPassQuality: 1,
      expectedCycleSeconds: 1,
    });

    const selected = selectCandidateCompositionV1([candidateA, ineligible, candidateB]);

    expect(selected?.compositionRef).toBe(candidateB.compositionRef);
  });
});
