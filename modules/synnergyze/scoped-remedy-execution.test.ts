import { describe, expect, it } from "vitest";

import type { CompositeEffectAssessmentV1, ScopedRemedyProposalV1 } from "./composite-effect-reconciliation.ts";
import type { ScopedRemedyAuthorizationGrantV1 } from "./scoped-remedy-authorization.ts";
import {
  InMemoryScopedRemedyExecutionJournalV1,
  ScopedRemedyExecutionGateV1,
  type ScopedRemedyExecutionAdapterV1,
  type ScopedRemedyExecutionJournalV1,
} from "./scoped-remedy-execution.ts";

const proposal: ScopedRemedyProposalV1 = {
  proposalRef: "REMEDY-PROPOSAL:EXEC-001",
  kind: "COMPENSATE",
  capabilityRef: "inventory.source_debit.compensate",
  effectSetRef: "EXPECTED-EFFECT-SET:001",
  componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
  reasonCode: "rollback_exact_realized_components",
  requiresFreshWardenDecision: true,
  authorized: false,
};

const assessment: CompositeEffectAssessmentV1 = {
  version: "PARTIAL-EFFECT-ASSESSMENT-001",
  assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:EXEC-001",
  effectSetRef: proposal.effectSetRef,
  executionReceiptRef: "EXECUTION:ORIGINAL-001",
  reservationRef: "RIVER-RESERVATION:ORIGINAL-001",
  originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
  programRef: "PROGRAM:001",
  eventRef: "EVENT:001",
  targetRef: "TRANSFER:001",
  correlationId: "CORR:PARENT:001",
  classification: "PARTIAL_EFFECT",
  matchedComponentRefs: ["EFFECT:SOURCE-DEBIT-10"],
  missingComponentRefs: ["EFFECT:DEST-CREDIT-10"],
  unexpectedComponentRefs: [],
  duplicateComponentRefs: [],
  conflictingComponentRefs: [],
  sourceEvidenceRefs: ["RIVER-EVIDENCE:SOURCE-DEBIT"],
  candidateRemedies: [proposal],
  assessedAt: "2026-08-22T15:00:03.000Z",
  state: "DETERMINED_UNAUTHORIZED",
  authorized: false,
  synthetic: true,
};

function grant(overrides: Partial<ScopedRemedyAuthorizationGrantV1> = {}): ScopedRemedyAuthorizationGrantV1 {
  return {
    version: "WARDEN-REMEDY-AUTH-001",
    authorizationRef: "REMEDY-AUTHORIZATION:EXEC-001",
    reconciliationRef: assessment.assessmentRef,
    assessmentRef: assessment.assessmentRef,
    effectSetRef: assessment.effectSetRef,
    proposalRef: proposal.proposalRef,
    proposalKind: proposal.kind,
    componentRefs: [...proposal.componentRefs],
    parentCorrelationId: assessment.correlationId,
    remedyCorrelationId: "CORR:REMEDY:001",
    originalWardenDecisionRef: assessment.originalWardenDecisionRef,
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY-001",
    remedyWardenRequestRef: "WARDEN-REQUEST:REMEDY-001",
    capabilityRef: proposal.capabilityRef,
    targetRef: assessment.targetRef,
    actionTokenDigest: "sha256:remedy-token",
    authorizedAt: "2026-08-22T15:00:04.000Z",
    validUntil: "2026-08-22T15:05:00.000Z",
    state: "AUTHORIZED_REMEDY",
    synthetic: true,
    ...overrides,
  };
}

class CaptureAdapter implements ScopedRemedyExecutionAdapterV1 {
  readonly adapterRef = "SYNTHETIC-SCOPED-COMPENSATION-ADAPTER-001";
  readonly capabilityRef = proposal.capabilityRef;
  invocations = 0;
  componentRefs: readonly string[] = [];

  async execute(input: Parameters<ScopedRemedyExecutionAdapterV1["execute"]>[0]) {
    this.invocations += 1;
    this.componentRefs = [...input.componentRefs];
    return { adapterResultRef: `COMPENSATION-RESULT:${input.componentRefs.join(",")}` };
  }
}

class CrashAfterEffectJournal implements ScopedRemedyExecutionJournalV1 {
  started = false;

  async begin() {
    if (this.started) return { state: "IN_PROGRESS" as const };
    this.started = true;
    return { state: "STARTED" as const };
  }

  async completeScoped(): Promise<void> {
    throw new Error("simulated_crash_after_effect");
  }

  async fail(): Promise<void> {
    throw new Error("unexpected_fail");
  }
}

describe("SCOPED-REMEDY-EXECUTION-001", () => {
  it("executes compensation only for the exact Warden-authorized realized component", async () => {
    const adapter = new CaptureAdapter();
    const gate = new ScopedRemedyExecutionGateV1([adapter]);
    const result = await gate.execute({
      assessment,
      proposal,
      grant: grant(),
      journal: new InMemoryScopedRemedyExecutionJournalV1(),
      executedAt: "2026-08-22T15:00:05.000Z",
    });

    expect(result.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    if (result.state !== "EXECUTED_UNVERIFIED_REMEDY") throw new Error("expected_execution");
    expect(result.receipt.proposalKind).toBe("COMPENSATE");
    expect(result.receipt.componentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
    expect(adapter.componentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
    expect(adapter.invocations).toBe(1);
  });

  it("replays a completed scoped remedy without invoking the adapter twice", async () => {
    const adapter = new CaptureAdapter();
    const gate = new ScopedRemedyExecutionGateV1([adapter]);
    const journal = new InMemoryScopedRemedyExecutionJournalV1();
    const input = {
      assessment,
      proposal,
      grant: grant(),
      journal,
      executedAt: "2026-08-22T15:00:05.000Z",
    };

    const first = await gate.execute(input);
    const second = await gate.execute(input);
    expect(first.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    expect(second.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    if (second.state !== "EXECUTED_UNVERIFIED_REMEDY") throw new Error("expected_replay");
    expect(second.receipt.idempotentReplay).toBe(true);
    expect(adapter.invocations).toBe(1);
  });

  it("fails closed if a grant is widened beyond the reconciled component scope", async () => {
    const adapter = new CaptureAdapter();
    const gate = new ScopedRemedyExecutionGateV1([adapter]);
    const result = await gate.execute({
      assessment,
      proposal,
      grant: grant({ componentRefs: ["EFFECT:SOURCE-DEBIT-10", "EFFECT:DEST-CREDIT-10"] }),
      journal: new InMemoryScopedRemedyExecutionJournalV1(),
      executedAt: "2026-08-22T15:00:05.000Z",
    });

    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "SCOPED_EXECUTION_GRANT_SCOPE_MISMATCH",
    });
    expect(adapter.invocations).toBe(0);
  });

  it("stops at recovery-required after a crash following provider effect instead of compensating twice", async () => {
    const adapter = new CaptureAdapter();
    const gate = new ScopedRemedyExecutionGateV1([adapter]);
    const journal = new CrashAfterEffectJournal();
    const input = {
      assessment,
      proposal,
      grant: grant(),
      journal,
      executedAt: "2026-08-22T15:00:05.000Z",
    };

    await expect(gate.execute(input)).rejects.toThrow("simulated_crash_after_effect");
    expect(adapter.invocations).toBe(1);

    const restarted = await gate.execute(input);
    expect(restarted).toEqual({
      state: "RECOVERY_REQUIRED",
      authorizationRef: "REMEDY-AUTHORIZATION:EXEC-001",
      assessmentRef: assessment.assessmentRef,
      proposalRef: proposal.proposalRef,
      componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
      reasonCode: "REMEDY_EXECUTION_IN_PROGRESS",
      automaticRetryPermitted: false,
    });
    expect(adapter.invocations).toBe(1);
  });
});
