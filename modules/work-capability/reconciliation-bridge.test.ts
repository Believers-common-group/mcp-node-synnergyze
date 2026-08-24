import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import {
  EffectExpectationServiceV1,
  SyntheticGarmentWaistbandExpectationCompilerV1,
  validateExpectedEffectContractV1,
} from "../synnergyze/effect-expectation.ts";
import { ReconciliationFabricV1 } from "../synnergyze/reconciliation-fabric.ts";
import { evaluateSyntheticWardenDecisionV1 } from "../warden/decision-service.ts";
import {
  runVerifiedWaistbandFixtureV1,
  validWaistbandFixtureV1,
  type SyntheticGarmentPerformanceInputV1,
} from "./fixtures/garment.ts";
import {
  compileWorkReconciliationExpectationV1,
  SyntheticWorkCapabilityEvidenceFinalizerV1,
  validateWorkReconciliationExpectationV1,
  WorkCapabilityReconciliationBridgeV1,
} from "./reconciliation-bridge.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function waistbandPreflightV1() {
  const fixture = validWaistbandFixtureV1();
  const assignmentDigest = `sha256:${digest(JSON.stringify({
    workUnitRef: fixture.workUnit.workUnitRef,
    compositionRef: fixture.composition.compositionRef,
    actorRefs: [...fixture.composition.actorRefs].sort(),
  }))}`;
  const assignmentRef = `WORK-ASSIGNMENT:${assignmentDigest.slice(
    "sha256:".length,
    "sha256:".length + 24,
  )}`;
  const assignmentBindingRef = `WORK-ASSIGNMENT-BINDING:${assignmentDigest}`;
  const boundRequest = {
    ...fixture.request,
    representationSourceRefs: [...new Set([
      ...fixture.request.representationSourceRefs,
      assignmentBindingRef,
    ])].sort(),
  };
  const decision = evaluateSyntheticWardenDecisionV1({
    request: boundRequest,
    policy: fixture.policy,
    decidedAt: fixture.decidedAt,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow");

  const action = buildAuthorizedActionEnvelopeV1(boundRequest, decision);
  const reservation = new SyntheticRiverReservationServiceV1().reserve({
    request: boundRequest,
    decision,
    action,
    reservedAt: fixture.reservedAt,
  });
  return { fixture, assignmentRef, assignmentBindingRef, decision, action, reservation };
}

function compileWaistbandExpectationV1() {
  const preflight = waistbandPreflightV1();
  const service = new EffectExpectationServiceV1([
    new SyntheticGarmentWaistbandExpectationCompilerV1(),
  ]);
  return service.compile({
    action: preflight.action,
    reservation: preflight.reservation,
    compiledAt: "2026-08-24T00:30:22.000Z",
  });
}

function reconciliationSetupV1(performance: SyntheticGarmentPerformanceInputV1) {
  const expectedEffect = compileWaistbandExpectationV1();
  const verified = runVerifiedWaistbandFixtureV1(performance);
  const workExpectation = compileWorkReconciliationExpectationV1({
    workUnit: verified.workUnit,
    expectedEffectContract: expectedEffect,
    requiredQuantity: performance.inputQuantity,
    compiledAt: "2026-08-24T00:30:23.000Z",
  });
  const finalized = new SyntheticWorkCapabilityEvidenceFinalizerV1().finalize({
    reservationRef: verified.execution.reservationRef,
    correlationId: verified.execution.correlationId,
    effect: verified.verification.effect,
    sealedAt: "2026-08-24T00:31:00.000Z",
  });
  return { verified, expectedEffect, workExpectation, finalized };
}

function bridgeInputV1(performance: SyntheticGarmentPerformanceInputV1) {
  const setup = reconciliationSetupV1(performance);
  return {
    setup,
    input: {
      workExpectation: setup.workExpectation,
      expectedEffectContract: setup.expectedEffect,
      workUnit: setup.verified.workUnit,
      assignment: setup.verified.assignment,
      execution: setup.verified.execution,
      observation: setup.verified.observation,
      verification: setup.verified.verification,
      seal: setup.finalized.seal,
      causalTrace: setup.finalized.causalTrace,
      outcome: setup.verified.outcome,
      remainingWork: setup.verified.remainingWork,
      determinedAt: "2026-08-24T00:31:10.000Z",
    },
  };
}

describe("WORK-CAPABILITY-RECONCILIATION-BRIDGE-001", () => {
  it("compiles and validates the bounded garment waistband expected-effect contract", () => {
    const expectation = compileWaistbandExpectationV1();

    expect(expectation.capabilityRef).toBe("garment.waistband.attach");
    expect(expectation.requestedEffect).toBe("GARMENT-STATE:waistband_attached");
    expect(expectation.matcher).toEqual({
      kind: "EXACT",
      value: "GARMENT-STATE:waistband_attached",
    });
    expect(validateExpectedEffectContractV1(expectation)).toBe(true);
  });

  it("uses the same assignment-bound preflight lineage as eventual execution", () => {
    const preflight = waistbandPreflightV1();
    const verified = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });

    expect(preflight.action.actionRef).toBe(verified.execution.actionRef);
    expect(preflight.reservation.reservationRef).toBe(verified.execution.reservationRef);
    expect(preflight.decision.decisionRef).toBe(verified.execution.wardenDecisionRef);
    expect(preflight.assignmentRef).toBe(verified.assignment.assignmentRef);
    expect(verified.assignment.assignmentBindingRef).toBe(preflight.assignmentBindingRef);
  });

  it("rejects an unsupported requested effect for the trusted garment compiler", () => {
    const compiler = new SyntheticGarmentWaistbandExpectationCompilerV1();
    expect(() => compiler.compile("GARMENT-STATE:anything-else")).toThrow(
      "effect_expectation_unsupported_requested_effect",
    );
  });

  it("finalizes the verified Work effect into the existing River seal and causal-trace contracts", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const finalizer = new SyntheticWorkCapabilityEvidenceFinalizerV1();
    const finalized = finalizer.finalize({
      reservationRef: result.execution.reservationRef,
      correlationId: result.execution.correlationId,
      effect: result.verification.effect,
      sealedAt: "2026-08-24T00:31:00.000Z",
    });

    expect(finalized.seal.state).toBe("SEALED");
    expect(finalized.seal.reservationRef).toBe(result.execution.reservationRef);
    expect(finalized.seal.traceDigest).toBe([
      "RC1-TRACE-V1",
      result.execution.reservationRef,
      finalized.seal.sealRef,
      result.verification.effect.effectRef,
      result.verification.effect.verificationRef,
    ].join("|"));
    expect(finalized.causalTrace.effectRef).toBe(result.verification.effect.effectRef);
    expect(finalized.causalTrace.sealRef).toBe(finalized.seal.sealRef);
    expect(finalized.causalTrace.sealed).toBe(true);
  });

  it("replays evidence finalization exactly and rejects changed sealing material", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const finalizer = new SyntheticWorkCapabilityEvidenceFinalizerV1();
    const input = {
      reservationRef: result.execution.reservationRef,
      correlationId: result.execution.correlationId,
      effect: result.verification.effect,
      sealedAt: "2026-08-24T00:31:00.000Z",
    };

    const first = finalizer.finalize(input);
    const replay = finalizer.finalize(input);
    expect(replay.seal.sealRef).toBe(first.seal.sealRef);
    expect(replay.idempotentReplay).toBe(true);

    expect(() => finalizer.finalize({
      ...input,
      sealedAt: "2026-08-24T00:31:01.000Z",
    })).toThrow("work_capability_finalizer_idempotency_conflict");
  });

  it("binds Work quantity and quality semantics to the generic expectation before execution", () => {
    const fixture = validWaistbandFixtureV1();
    const expectedEffect = compileWaistbandExpectationV1();
    const workExpectation = compileWorkReconciliationExpectationV1({
      workUnit: fixture.workUnit,
      expectedEffectContract: expectedEffect,
      requiredQuantity: 500,
      compiledAt: "2026-08-24T00:30:23.000Z",
    });

    expect(workExpectation.state).toBe("BOUND_PRE_EXECUTION");
    expect(workExpectation.workUnitRef).toBe(fixture.workUnit.workUnitRef);
    expect(workExpectation.expectedEffectContractRef).toBe(expectedEffect.expectationRef);
    expect(workExpectation.requiredQuantity).toBe(500);
    expect(workExpectation.requiredFirstPassQuality).toBe(0.97);
    expect(validateWorkReconciliationExpectationV1(workExpectation)).toBe(true);
  });

  it("fails validation when Work expectation material is mutated", () => {
    const fixture = validWaistbandFixtureV1();
    const expectedEffect = compileWaistbandExpectationV1();
    const compiled = compileWorkReconciliationExpectationV1({
      workUnit: fixture.workUnit,
      expectedEffectContract: expectedEffect,
      requiredQuantity: 500,
      compiledAt: "2026-08-24T00:30:23.000Z",
    });

    expect(validateWorkReconciliationExpectationV1({
      ...compiled,
      requiredQuantity: 499,
    })).toBe(false);
  });

  it("turns generic MATCH into a Work PARTIAL_EFFECT exception with an exact unauthorized 7-unit recovery request", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile(input);

    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.genericClassification).toBe("MATCH");
    expect(result.determination.state).toBe("EXCEPTION");
    expect(result.determination.classification).toBe("PARTIAL_EFFECT");
    expect(result.recoveryRequest?.remainingQuantity).toBe(7);
    expect(result.recoveryRequest?.requiresFreshWardenDecision).toBe(true);
    expect(result.recoveryRequest?.authorized).toBe(false);
    expect(result.recoveryRequest && "actionToken" in result.recoveryRequest).toBe(false);
    expect(result.recoveryRequest && "executionReceiptRef" in result.recoveryRequest).toBe(false);
    expect(result.recoveryRequest && "assignmentRef" in result.recoveryRequest).toBe(false);
  });

  it("closes Work when generic reconciliation matches and the Work outcome is FULL_EFFECT", () => {
    const { setup, input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 490,
      reworkQuantity: 10,
    });
    expect(setup.verified.outcome.state).toBe("FULL_EFFECT");

    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile(input);
    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.state).toBe("CLOSED");
    expect(result.determination.classification).toBe("FULL_EFFECT");
    expect(result.recoveryRequest).toBeUndefined();
  });

  it("rejects PARTIAL_EFFECT without remaining work", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({ ...input, remainingWork: undefined });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "work_reconciliation_remaining_work_required",
    });
  });

  it("rejects remaining-work quantity that differs from the exact shortfall", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    if (!input.remainingWork) throw new Error("expected_remaining_work");
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({
      ...input,
      remainingWork: { ...input.remainingWork, remainingQuantity: 8 },
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "work_reconciliation_remaining_work_invalid",
    });
  });

  it("rejects a Work expectation compiled after execution", () => {
    const { setup, input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const lateExpectation = compileWorkReconciliationExpectationV1({
      workUnit: setup.verified.workUnit,
      expectedEffectContract: setup.expectedEffect,
      requiredQuantity: 500,
      compiledAt: "2026-08-24T00:30:31.000Z",
    });
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({ ...input, workExpectation: lateExpectation });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "work_reconciliation_expectation_after_execution",
    });
  });

  it("propagates missing seal as a generic reconciliation rejection", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({ ...input, seal: undefined });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "generic_reconciliation:RECONCILIATION_SEAL_REQUIRED",
    });
  });

  it("propagates invalid seal trace digest as a generic reconciliation rejection", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    if (!input.seal) throw new Error("expected_seal");
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({ ...input, seal: { ...input.seal, traceDigest: "INVALID" } });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "generic_reconciliation:RECONCILIATION_SEAL_LINEAGE_MISMATCH",
    });
  });

  it("propagates causal-trace mismatch as a generic reconciliation rejection", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    if (!input.causalTrace) throw new Error("expected_causal_trace");
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({
      ...input,
      causalTrace: { ...input.causalTrace, effectRef: "EFFECT:OTHER" },
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "generic_reconciliation:RECONCILIATION_CAUSAL_TRACE_MISMATCH",
    });
  });

  it("preserves a generic reconciliation exception without minting recovery Work", () => {
    const { input } = bridgeInputV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const result = new WorkCapabilityReconciliationBridgeV1(
      new ReconciliationFabricV1(),
    ).reconcile({
      ...input,
      verification: {
        state: "EXCEPTION",
        executionReceiptRef: input.execution.receiptRef,
        observationRef: input.observation.observationRef,
        reasonCode: "MISSING_SOURCE_EVIDENCE",
        reason: "synthetic evidence unavailable",
      },
      seal: undefined,
      causalTrace: undefined,
    });
    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.state).toBe("EXCEPTION");
    expect(result.determination.classification).toBe("GENERIC_RECONCILIATION_EXCEPTION");
    expect(result.recoveryRequest).toBeUndefined();
  });
});
