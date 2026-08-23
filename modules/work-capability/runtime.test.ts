import { describe, expect, it } from "vitest";

import type { CandidateCompositionV1 } from "./contracts.ts";
import {
  invalidWardenWaistbandFixtureV1,
  runVerifiedWaistbandFixtureV1,
  validWaistbandFixtureV1,
} from "./fixtures/garment.ts";
import {
  compileSyntheticGarmentWorkflowV1,
  executeAssignedWorkUnitV1,
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

describe("WORK-CAPABILITY-RUNTIME-001 governed execution", () => {
  it("executes P17 + M04 + A2 only through the existing controlled execution gate", () => {
    const proof = executeAssignedWorkUnitV1(validWaistbandFixtureV1());

    expect(proof.assignment.actorRefs).toEqual([
      "HUMAN:OPERATOR-P17",
      "AGENT:WORK-INSTRUCTION-A2",
      "MACHINE:LOCKSTITCH-M04",
    ]);
    expect(proof.execution.state).toBe("EXECUTED_UNVERIFIED");
    expect(proof.execution.capabilityRef).toBe("garment.waistband.attach");
    expect(proof.adapterInvocationCount).toBe(1);
  });

  it.each(["DENY", "ESCALATE"] as const)(
    "does not assign or execute when Warden returns %s",
    (decision) => {
      expect(() => executeAssignedWorkUnitV1(invalidWardenWaistbandFixtureV1(decision))).toThrow(
        `work_capability_warden_${decision.toLowerCase()}`,
      );
    },
  );
});

describe("WORK-CAPABILITY-RUNTIME-001 effect and capability evidence", () => {
  it("projects actor and composite capability evidence only from verified effect lineage", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });

    expect(result.verification.state).toBe("VERIFIED_EFFECT");
    expect(
      result.capabilityEvidence.some(
        (item) => item.actorOrCompositionRef === "HUMAN:OPERATOR-P17",
      ),
    ).toBe(true);
    expect(
      result.capabilityEvidence.some(
        (item) => item.actorOrCompositionRef === "COMPOSITION:P17-M04-A2",
      ),
    ).toBe(true);
    expect(
      result.capabilityEvidence.every(
        (item) => item.executionReceiptRef === result.execution.receiptRef,
      ),
    ).toBe(true);
  });

  it("keeps a quantity shortfall open and proposes the exact remaining quantity", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });

    expect(result.outcome.state).toBe("PARTIAL_EFFECT");
    expect(result.outcome.firstPassQuality).toBeGreaterThanOrEqual(0.97);
    expect(result.remainingWork?.remainingQuantity).toBe(7);
    expect(result.remainingWork?.automaticExecutionAllowed).toBe(false);
  });
});
