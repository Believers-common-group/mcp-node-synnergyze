import { describe, expect, it } from "vitest";

import type {
  ActionEnvelopeV1,
  CausalTraceV1,
  EvidenceReservationV1,
  EvidenceSealV1,
} from "../river/contracts.ts";
import {
  EffectExpectationServiceV1,
  SyntheticGarmentWaistbandExpectationCompilerV1,
} from "../synnergyze/effect-expectation.ts";
import type { ExpectedEffectContractV1 } from "../synnergyze/effect-expectation.ts";
import {
  runVerifiedWaistbandFixtureV1,
  type VerifiedWaistbandFixtureResultV1,
} from "./fixtures/garment.ts";
import {
  WorkCapabilityReconciliationBridgeV1,
  type WorkCapabilityReconciliationInputV1,
} from "./reconciliation.ts";

const COMPILED_AT = "2026-08-24T00:30:20.000Z";
const RECONCILED_AT = "2026-08-24T00:31:00.000Z";

function expectationFor(
  fixture: VerifiedWaistbandFixtureResultV1,
): ExpectedEffectContractV1 {
  const action: ActionEnvelopeV1 = {
    actionRef: fixture.execution.actionRef,
    requestRef: "SYNTHETIC-WORK-RECONCILIATION-REQUEST-001",
    actorRef: fixture.assignment.actorRefs[0] ?? "HUMAN:OPERATOR-P17",
    representedPrincipalRef: "ORG:DDB-01",
    actingCapacityRef: fixture.assignment.compositionRef,
    contextRef: "LOCATION:DDB-SYNTHETIC-01",
    programRef: fixture.execution.programRef,
    eventRef: fixture.execution.eventRef,
    action: "attach_waistband",
    capabilityRef: fixture.execution.capabilityRef,
    targetRef: fixture.execution.targetRef,
    requestedEffect: fixture.workUnit.requiredOutputStateRef,
    wardenDecisionRef: fixture.execution.wardenDecisionRef,
    actionToken: "SYNTHETIC-WORK-RECONCILIATION-TOKEN-001",
    requestedAt: "2026-08-24T00:30:10.000Z",
    correlationId: fixture.execution.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: fixture.execution.reservationRef,
    actionRef: fixture.execution.actionRef,
    wardenDecisionRef: fixture.execution.wardenDecisionRef,
    correlationId: fixture.execution.correlationId,
    authorizationDigest: "sha256:synthetic-work-reconciliation-fixture",
    state: "RESERVED",
    reservedAt: COMPILED_AT,
  };
  return new EffectExpectationServiceV1([
    new SyntheticGarmentWaistbandExpectationCompilerV1(),
  ]).compile({ action, reservation, compiledAt: COMPILED_AT });
}

function sealFor(
  fixture: VerifiedWaistbandFixtureResultV1,
): { seal: EvidenceSealV1; causalTrace: CausalTraceV1 } {
  const sealRef = `RIVER-EVIDENCE-SEALED:WORK-CAPABILITY:${fixture.verification.effect.effectRef}`;
  const seal: EvidenceSealV1 = {
    sealRef,
    reservationRef: fixture.execution.reservationRef,
    correlationId: fixture.execution.correlationId,
    state: "SEALED",
    traceDigest: [
      "RC1-TRACE-V1",
      fixture.execution.reservationRef,
      sealRef,
      fixture.verification.effect.effectRef,
      fixture.verification.effect.verificationRef,
    ].join("|"),
    sealedAt: fixture.verification.effect.verifiedAt,
  };
  return {
    seal,
    causalTrace: {
      correlationId: fixture.execution.correlationId,
      reservationRef: fixture.execution.reservationRef,
      eventReceiptRefs: [],
      effectRef: fixture.verification.effect.effectRef,
      sealRef,
      sealed: true,
    },
  };
}

function inputFor(
  fixture: VerifiedWaistbandFixtureResultV1,
): WorkCapabilityReconciliationInputV1 {
  const sealed = sealFor(fixture);
  return {
    workUnit: fixture.workUnit,
    assignment: fixture.assignment,
    execution: fixture.execution,
    observation: fixture.observation,
    verification: fixture.verification,
    capabilityEvidence: fixture.capabilityEvidence,
    outcome: fixture.outcome,
    remainingWork: fixture.remainingWork,
    expectation: expectationFor(fixture),
    seal: sealed.seal,
    causalTrace: sealed.causalTrace,
    reconciledAt: RECONCILED_AT,
  };
}

describe("WorkCapabilityReconciliationBridgeV1", () => {
  it("closes only a sealed full quantified effect", () => {
    const fixture = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 500,
      reworkQuantity: 0,
    });
    const result = new WorkCapabilityReconciliationBridgeV1().reconcile(inputFor(fixture));

    expect(result.state).toBe("RECONCILED_WORK");
    if (result.state !== "RECONCILED_WORK") return;
    expect(result.reconciliation.determination.classification).toBe("MATCH");
    expect(result.reconciliation.determination.closureEligible).toBe(true);
    expect(result.guard.state).toBe("WORK_CLOSED");
    expect(result.guard.closureEligible).toBe(true);
    expect(result.guard.candidateRemedies).toEqual([]);
    expect(result.guard.capabilityEvidenceRefs).toHaveLength(4);
  });

  it("keeps partial quantity open even when the semantic state matches", () => {
    const fixture = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 493,
      reworkQuantity: 0,
    });
    const result = new WorkCapabilityReconciliationBridgeV1().reconcile(inputFor(fixture));

    expect(result.state).toBe("RECONCILED_WORK");
    if (result.state !== "RECONCILED_WORK") return;
    expect(result.reconciliation.determination.classification).toBe("MATCH");
    expect(result.reconciliation.determination.closureEligible).toBe(true);
    expect(result.guard.state).toBe("EXCEPTION_OPEN");
    expect(result.guard.closureEligible).toBe(false);
    expect(result.guard.candidateRemedies).toHaveLength(1);
    expect(result.guard.candidateRemedies[0]).toMatchObject({
      kind: "RECOVER",
      capabilityRef: "work_capability.recover",
      reasonCode: "remaining_work_required",
      remainingWorkProposalRef: fixture.remainingWork?.proposalRef,
      requiresFreshWardenDecision: true,
      authorized: false,
    });
    expect(fixture.remainingWork?.remainingQuantity).toBe(7);
  });

  it("keeps a wrong semantic state open and requires manual review", () => {
    const fixture = runVerifiedWaistbandFixtureV1(
      { inputQuantity: 500, acceptedQuantity: 500, reworkQuantity: 0 },
      "GARMENT-STATE:back_assembled",
    );
    const result = new WorkCapabilityReconciliationBridgeV1().reconcile(inputFor(fixture));

    expect(result.state).toBe("RECONCILED_WORK");
    if (result.state !== "RECONCILED_WORK") return;
    expect(result.reconciliation.determination.classification).toBe("UNEXPECTED_EFFECT");
    expect(result.reconciliation.determination.closureEligible).toBe(false);
    expect(result.guard.state).toBe("EXCEPTION_OPEN");
    expect(result.guard.closureEligible).toBe(false);
    expect(result.guard.candidateRemedies[0]).toMatchObject({
      kind: "MANUAL_REVIEW",
      capabilityRef: "work_capability.manual_review",
      reasonCode: "work_effect_failed",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
  });

  it("rejects incomplete capability-evidence coverage", () => {
    const fixture = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 500,
      reworkQuantity: 0,
    });
    const input = inputFor(fixture);
    expect(() =>
      new WorkCapabilityReconciliationBridgeV1().reconcile({
        ...input,
        capabilityEvidence: input.capabilityEvidence.slice(1),
      }),
    ).toThrow("work_capability_reconciliation_capability_evidence_coverage_mismatch");
  });

  it("replays the same reconciliation deterministically", () => {
    const fixture = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 500,
      reworkQuantity: 0,
    });
    const input = inputFor(fixture);
    const bridge = new WorkCapabilityReconciliationBridgeV1();
    const first = bridge.reconcile(input);
    const second = bridge.reconcile(input);

    expect(first.state).toBe("RECONCILED_WORK");
    expect(second.state).toBe("RECONCILED_WORK");
    if (first.state !== "RECONCILED_WORK" || second.state !== "RECONCILED_WORK") return;
    expect(first.guard.guardRef).toBe(second.guard.guardRef);
    expect(second.reconciliation.idempotentReplay).toBe(true);
  });
});
