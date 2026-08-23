import { describe, expect, it } from "vitest";

import type { CandidateCompositionV1 } from "./contracts.ts";
import {
  invalidWardenWaistbandFixtureV1,
  mutatedWaistbandFixtureV1,
  revokedCheckpointWaistbandFixtureV1,
  runVerifiedWaistbandFixtureV1,
  validWaistbandFixtureV1,
  wrongInputStateWaistbandFixtureV1,
} from "./fixtures/garment.ts";
import {
  compileSyntheticGarmentWorkflowV1,
  createWorkCapabilityRuntimeV1,
  executeAssignedWorkUnitV1,
  projectCapabilityEvidenceV1,
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
    expect(result.workUnits.every((unit) => unit.requiredContext.materialFamily === "denim")).toBe(true);
  });
});

describe("WORK-CAPABILITY-RUNTIME-001 capability resolution", () => {
  it("returns MISSING capability debt without fabricating a candidate", () => {
    const result = resolveCapabilityDemandV1({
      workUnit: waistbandWorkUnit(),
      capabilities: [],
      candidates: [],
      actorProfiles: [],
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
    expect(selectCandidateCompositionV1([candidateA, ineligible, candidateB])?.compositionRef).toBe(
      candidateB.compositionRef,
    );
  });

  it("does not report contextual capability coverage for an incompatible material", () => {
    const result = resolveCapabilityDemandV1({
      workUnit: waistbandWorkUnit(),
      capabilities: [
        {
          capabilityRef: "garment.waistband.attach",
          domain: "garment",
          operation: "attach_waistband",
          context: { materialFamily: "cotton" },
          verificationRequired: true,
        },
      ],
      candidates: [candidate("COMPOSITION:COTTON")],
      actorProfiles: [],
    });
    expect(result.state).toBe("MISSING");
    expect(result.missingCapabilityRefs).toEqual(["garment.waistband.attach"]);
  });

  it("does not report COVERED when candidate actors have an incompatible capability context", () => {
    const result = resolveCapabilityDemandV1({
      workUnit: waistbandWorkUnit(),
      capabilities: [
        {
          capabilityRef: "garment.waistband.attach",
          domain: "garment",
          operation: "attach_waistband",
          context: { materialFamily: "denim" },
          verificationRequired: true,
        },
      ],
      candidates: [candidate("COMPOSITION:COTTON-ACTORS")],
      actorProfiles: [
        {
          actorRef: "HUMAN:OPERATOR-P17",
          actorClass: "HUMAN",
          capabilityRefs: ["garment.waistband.attach"],
          context: { materialFamily: "cotton" },
          evidenceRefs: ["CAPABILITY-EVIDENCE:P17:COTTON"],
          evidenceState: "CURRENT",
          evidenceValidUntil: "2026-08-30T18:00:00+05:30",
          available: true,
        },
        {
          actorRef: "MACHINE:LOCKSTITCH-M04",
          actorClass: "MACHINE",
          capabilityRefs: ["garment.waistband.attach"],
          context: { materialFamily: "cotton" },
          evidenceRefs: ["CAPABILITY-EVIDENCE:M04:COTTON"],
          evidenceState: "CURRENT",
          evidenceValidUntil: "2026-08-30T18:00:00+05:30",
          available: true,
          assetRef: "GENESIS-ASSET:LOCKSTITCH-M04",
        },
      ],
    });
    expect(result.state).toBe("CONSTRAINED");
    expect(result.candidateCompositionRefs).toEqual([]);
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
    (decision: "DENY" | "ESCALATE") => {
      expect(() => executeAssignedWorkUnitV1(invalidWardenWaistbandFixtureV1(decision))).toThrow(
        `work_capability_warden_${decision.toLowerCase()}`,
      );
    },
  );

  it.each(["missing", "expired"] as const)(
    "fails closed when required capability evidence is %s",
    (mode: "missing" | "expired") => {
      const input = validWaistbandFixtureV1();
      input.actorProfiles = input.actorProfiles.map((profile) =>
        profile.actorRef === "HUMAN:OPERATOR-P17"
          ? mode === "missing"
            ? { ...profile, evidenceRefs: [] }
            : { ...profile, evidenceValidUntil: "2026-08-24T00:30:29.000Z" }
          : profile,
      );
      expect(() => executeAssignedWorkUnitV1(input)).toThrow(
        mode === "missing"
          ? "work_capability_actor_evidence_missing:HUMAN:OPERATOR-P17"
          : "work_capability_actor_evidence_expired:HUMAN:OPERATOR-P17",
      );
      expect(input.adapter.invocationCount()).toBe(0);
    },
  );

  it("binds the exact actor assignment into Warden/action/receipt identity before execution", () => {
    const first = validWaistbandFixtureV1();
    const alternate = validWaistbandFixtureV1();
    alternate.composition = {
      ...alternate.composition,
      actorRefs: [
        "HUMAN:OPERATOR-P17",
        "AGENT:WORK-INSTRUCTION-A3",
        "MACHINE:LOCKSTITCH-M04",
      ],
    };
    alternate.actorProfiles = alternate.actorProfiles.map((profile) =>
      profile.actorRef === "AGENT:WORK-INSTRUCTION-A2"
        ? {
            ...profile,
            actorRef: "AGENT:WORK-INSTRUCTION-A3",
            evidenceRefs: ["CAPABILITY-EVIDENCE:A3:WORK-INSTRUCTION:CURRENT"],
            implementationRef: "WORK-INSTRUCTION-AGENT-A3",
            versionRef: "A3-R1",
          }
        : profile,
    );
    const firstProof = executeAssignedWorkUnitV1(first);
    const alternateProof = executeAssignedWorkUnitV1(alternate);
    expect(alternateProof.assignment.assignmentRef).not.toBe(firstProof.assignment.assignmentRef);
    expect(alternateProof.decision.decisionRef).not.toBe(firstProof.decision.decisionRef);
    expect(alternateProof.execution.actionRef).not.toBe(firstProof.execution.actionRef);
    expect(alternateProof.execution.receiptRef).not.toBe(firstProof.execution.receiptRef);
  });

  it("rejects capability-evidence attribution to a mutated actor assignment", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });
    const mutatedAssignment = {
      ...result.assignment,
      actorRefs: [
        "HUMAN:OPERATOR-P17",
        "AGENT:WORK-INSTRUCTION-A3",
        "MACHINE:LOCKSTITCH-M04",
      ],
    };
    expect(() =>
      projectCapabilityEvidenceV1({
        workUnit: result.workUnit,
        assignment: mutatedAssignment,
        capabilityRef: "garment.waistband.attach",
        execution: result.execution,
        verifiedEffect: result.verification.effect,
        observedPerformance: {
          inputQuantity: 500,
          outputQuantity: 500,
          acceptedQuantity: 490,
          reworkQuantity: 10,
          firstPassQuality: 0.98,
          cycleSeconds: 41.7,
        },
        evidenceRefs: [result.observation.sourceEvidenceRef, result.verification.effect.verificationRef],
        observedAt: result.observation.observedAt,
      }),
    ).toThrow("work_capability_assignment_integrity_mismatch");
  });

  it("rejects execution after the Work Unit deadline", () => {
    const input = validWaistbandFixtureV1();
    input.workUnit = { ...input.workUnit, deadline: "2026-08-24T00:30:29.000Z" };
    expect(() => executeAssignedWorkUnitV1(input)).toThrow("work_capability_work_unit_expired");
    expect(input.adapter.invocationCount()).toBe(0);
  });

  it("rejects execution when the target is not in the required input state", () => {
    const input = wrongInputStateWaistbandFixtureV1();
    expect(() => executeAssignedWorkUnitV1(input)).toThrow("work_capability_input_state_mismatch");
    expect(input.adapter.invocationCount()).toBe(0);
  });

  it("consumes a Warden checkpoint source and fails when authority was revoked after ALLOW", () => {
    const input = revokedCheckpointWaistbandFixtureV1();
    expect(() => executeAssignedWorkUnitV1(input)).toThrow("execution_warden_checkpoint_revoked");
    expect(input.adapter.invocationCount()).toBe(0);
  });

  it("binds the selected machine asset to resolved device security before execution", () => {
    const valid = executeAssignedWorkUnitV1(validWaistbandFixtureV1());
    expect(valid.execution.executionDeviceRef).toBe("GENESIS-ASSET:LOCKSTITCH-M04");
    expect(valid.execution.deviceSecurityResolutionRef).toBe("DEVICE-SECURITY-RESOLUTION:M04:CURRENT");
    expect(valid.execution.deviceSecurityEvidenceRef).toBe("DEVICE-SECURITY-EVIDENCE:M04:CURRENT");

    const missingBinding = validWaistbandFixtureV1();
    missingBinding.request = { ...missingBinding.request, executionDeviceRef: undefined };
    expect(() => executeAssignedWorkUnitV1(missingBinding)).toThrow(
      "work_capability_machine_execution_device_required",
    );
    expect(missingBinding.adapter.invocationCount()).toBe(0);
  });
});

describe("WORK-CAPABILITY-RUNTIME-001 effect and capability evidence", () => {
  it("projects actor and composite capability evidence only from verified effect lineage", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });
    expect(result.verification.state).toBe("VERIFIED_EFFECT");
    expect(result.capabilityEvidence.some((item) => item.actorOrCompositionRef === "HUMAN:OPERATOR-P17")).toBe(true);
    expect(result.capabilityEvidence.some((item) => item.actorOrCompositionRef === "COMPOSITION:P17-M04-A2")).toBe(true);
    expect(result.capabilityEvidence.every((item) => item.executionReceiptRef === result.execution.receiptRef)).toBe(true);
  });

  it("does not inflate an assist agent into the composite production capability", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });
    expect(result.capabilityEvidence.some(
      (item) => item.actorOrCompositionRef === "AGENT:WORK-INSTRUCTION-A2" && item.capabilityRef === "garment.waistband.attach",
    )).toBe(false);
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

  it("does not declare FULL_EFFECT when the verified observed state is not the required state", () => {
    const result = runVerifiedWaistbandFixtureV1(
      { inputQuantity: 500, acceptedQuantity: 490, reworkQuantity: 10 },
      "GARMENT-STATE:back_assembled",
    );
    expect(result.verification.state).toBe("VERIFIED_EFFECT");
    expect(result.outcome.stateMet).toBe(false);
    expect(result.outcome.state).toBe("FAILED_EFFECT");
  });

  it("rejects impossible observed performance before capability evidence is issued", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });
    expect(() => projectCapabilityEvidenceV1({
      workUnit: result.workUnit,
      assignment: result.assignment,
      capabilityRef: "garment.waistband.attach",
      execution: result.execution,
      verifiedEffect: result.verification.effect,
      observedPerformance: {
        inputQuantity: 500,
        outputQuantity: 500,
        acceptedQuantity: 490,
        reworkQuantity: 10,
        firstPassQuality: 1.2,
        cycleSeconds: 41.7,
      },
      evidenceRefs: [result.observation.sourceEvidenceRef, result.verification.effect.verificationRef],
      observedAt: result.observation.observedAt,
    })).toThrow("work_capability_observed_performance_quality_invalid");
  });

  it("rejects capability evidence with impossible execution/observation/verification chronology", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });
    expect(() => projectCapabilityEvidenceV1({
      workUnit: result.workUnit,
      assignment: result.assignment,
      capabilityRef: "garment.waistband.attach",
      execution: result.execution,
      verifiedEffect: result.verification.effect,
      observedPerformance: {
        inputQuantity: 500,
        outputQuantity: 500,
        acceptedQuantity: 490,
        reworkQuantity: 10,
        firstPassQuality: 0.98,
        cycleSeconds: 41.7,
      },
      evidenceRefs: [result.observation.sourceEvidenceRef, result.verification.effect.verificationRef],
      observedAt: "2026-08-24T00:30:29.000Z",
    })).toThrow("work_capability_observation_before_execution");
  });
});

describe("WORK-CAPABILITY-RUNTIME-001 replay safety", () => {
  it("returns stable exact replay without second execution", () => {
    const runtime = createWorkCapabilityRuntimeV1();
    const firstInput = validWaistbandFixtureV1();
    const replayInput = validWaistbandFixtureV1();
    const first = runtime.run(firstInput);
    const second = runtime.run(replayInput);
    expect(second.execution.receiptRef).toBe(first.execution.receiptRef);
    expect(second.execution.idempotentReplay).toBe(true);
    expect(firstInput.adapter.invocationCount()).toBe(1);
    expect(replayInput.adapter.invocationCount()).toBe(0);
  });

  it("fails closed when an existing work/composition identity is reused with changed material input", () => {
    const runtime = createWorkCapabilityRuntimeV1();
    const firstInput = validWaistbandFixtureV1();
    const changedInput = mutatedWaistbandFixtureV1();
    runtime.run(firstInput);
    expect(() => runtime.run(changedInput)).toThrow("work_capability_idempotency_conflict");
    expect(firstInput.adapter.invocationCount()).toBe(1);
    expect(changedInput.adapter.invocationCount()).toBe(0);
  });
});
