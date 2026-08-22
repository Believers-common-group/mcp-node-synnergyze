import { describe, expect, it } from "vitest";

import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import type { RemedyAuthorizationGrantV1 } from "./remedy-authorization.ts";
import {
  InMemoryRemedyExecutionJournalV1,
  RemedyExecutionGateV1,
  type RemedyExecutionAdapterInputV1,
  type RemedyExecutionAdapterResultV1,
  type RemedyExecutionAdapterV1,
  type RemedyExecutionJournalV1,
  type RemedyJournalBeginResultV1,
  type RemedyJournalStartV1,
} from "./remedy-execution.ts";

const proposal: ReconciliationRemedyProposalV1 = {
  proposalRef: "REMEDY-PROPOSAL:RESTART-001",
  kind: "RETRY_OBSERVATION",
  capabilityRef: "effect.observe.retry",
  reasonCode: "fresh_observation_required",
  requiresFreshWardenDecision: true,
  authorized: false,
};

const determination: ReconciliationDeterminationV1 = {
  version: "RECONCILIATION-FABRIC-001",
  reconciliationRef: "RECONCILIATION:RESTART-001",
  exceptionRef: "EXCEPTION:RESTART-001",
  classification: "EVIDENCE_INSUFFICIENT",
  executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:RESTART-001",
  reservationRef: "RIVER-RESERVATION:RESTART-001",
  originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-RESTART-001",
  programRef: "SYNNERGYZE-PROGRAM:RESTART-001",
  eventRef: "SYNNERGYZE-EVENT:RESTART-001:001",
  targetRef: "LAB-SERVICE-DESK-001",
  requestedEffect: "service_request.created",
  correlationId: "CORR:PARENT:RESTART-001",
  sourceEvidenceRefs: ["RIVER-EVIDENCE:RESTART-001"],
  candidateRemedies: [proposal],
  sourceDigest: "sha256:reconciliation-source",
  reconciledAt: "2026-08-22T20:00:00.000Z",
  state: "DETERMINED_UNAUTHORIZED",
  authorized: false,
  synthetic: true,
};

function grant(overrides: Partial<RemedyAuthorizationGrantV1> = {}): RemedyAuthorizationGrantV1 {
  return {
    version: "WARDEN-REMEDY-AUTH-001",
    authorizationRef: "REMEDY-AUTHORIZATION:RESTART-001",
    reconciliationRef: determination.reconciliationRef,
    proposalRef: proposal.proposalRef,
    proposalKind: proposal.kind,
    parentCorrelationId: determination.correlationId,
    remedyCorrelationId: "CORR:REMEDY:RESTART-001",
    originalWardenDecisionRef: determination.originalWardenDecisionRef,
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY-RESTART-001",
    remedyWardenRequestRef: "WARDEN-REQUEST:REMEDY-RESTART-001",
    capabilityRef: proposal.capabilityRef,
    targetRef: determination.targetRef,
    actionTokenDigest: "sha256:remedy-token",
    authorizedAt: "2026-08-22T20:00:01.000Z",
    validUntil: "2026-08-22T20:05:00.000Z",
    state: "AUTHORIZED_REMEDY",
    synthetic: true,
    ...overrides,
  };
}

class CountingAdapter implements RemedyExecutionAdapterV1 {
  readonly adapterRef = "SYNTHETIC-REMEDY-ADAPTER-001";
  readonly capabilityRef = "effect.observe.retry";
  invocations = 0;

  async execute(input: RemedyExecutionAdapterInputV1): Promise<RemedyExecutionAdapterResultV1> {
    this.invocations += 1;
    expect(input.idempotencyKey).toBe(input.grant.authorizationRef);
    return { adapterResultRef: `REMEDY-ADAPTER-RESULT:${this.invocations}` };
  }
}

class CrashAfterEffectJournal implements RemedyExecutionJournalV1 {
  private started = false;
  private fingerprint?: string;

  async begin(input: RemedyJournalStartV1): Promise<RemedyJournalBeginResultV1> {
    if (!this.started) {
      this.started = true;
      this.fingerprint = input.executionFingerprint;
      return { state: "STARTED" };
    }
    if (this.fingerprint !== input.executionFingerprint) return { state: "CONFLICT" };
    return { state: "IN_PROGRESS" };
  }

  async complete(): Promise<void> {
    throw new Error("simulated_process_crash_after_provider_effect");
  }

  async fail(): Promise<void> {
    throw new Error("unexpected_fail_path");
  }
}

describe("REMEDY-EXECUTION-001 restart safety", () => {
  it("executes a fresh authorized remedy exactly once and replays the durable receipt without adapter reinvocation", async () => {
    const adapter = new CountingAdapter();
    const journal = new InMemoryRemedyExecutionJournalV1();
    const gate = new RemedyExecutionGateV1([adapter]);

    const first = await gate.execute({
      determination,
      proposal,
      grant: grant(),
      journal,
      executedAt: "2026-08-22T20:00:02.000Z",
    });
    const replay = await gate.execute({
      determination,
      proposal,
      grant: grant(),
      journal,
      executedAt: "2026-08-22T20:00:03.000Z",
    });

    expect(first.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    expect(replay.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    if (first.state !== "EXECUTED_UNVERIFIED_REMEDY" || replay.state !== "EXECUTED_UNVERIFIED_REMEDY") {
      throw new Error("expected_remedy_execution");
    }
    expect(first.receipt.idempotentReplay).toBe(false);
    expect(replay.receipt.receiptRef).toBe(first.receipt.receiptRef);
    expect(replay.receipt.idempotentReplay).toBe(true);
    expect(adapter.invocations).toBe(1);
    expect(journal.size()).toBe(1);
  });

  it("fails stop after a crash following provider effect and never automatically invokes the remedy a second time", async () => {
    const adapter = new CountingAdapter();
    const journal = new CrashAfterEffectJournal();
    const gate = new RemedyExecutionGateV1([adapter]);

    await expect(
      gate.execute({
        determination,
        proposal,
        grant: grant(),
        journal,
        executedAt: "2026-08-22T20:00:02.000Z",
      }),
    ).rejects.toThrow("simulated_process_crash_after_provider_effect");
    expect(adapter.invocations).toBe(1);

    const restarted = await gate.execute({
      determination,
      proposal,
      grant: grant(),
      journal,
      executedAt: "2026-08-22T20:00:03.000Z",
    });
    expect(restarted).toEqual({
      state: "RECOVERY_REQUIRED",
      authorizationRef: "REMEDY-AUTHORIZATION:RESTART-001",
      reconciliationRef: determination.reconciliationRef,
      proposalRef: proposal.proposalRef,
      reasonCode: "REMEDY_EXECUTION_IN_PROGRESS",
      automaticRetryPermitted: false,
    });
    expect(adapter.invocations).toBe(1);
  });

  it("fails stop after a recorded adapter failure and requires reconciliation rather than automatic retry", async () => {
    const journal = new InMemoryRemedyExecutionJournalV1();
    let attempts = 0;
    const adapter: RemedyExecutionAdapterV1 = {
      adapterRef: "FAILING-REMEDY-ADAPTER-001",
      capabilityRef: proposal.capabilityRef,
      async execute() {
        attempts += 1;
        throw new Error("provider_failed");
      },
    };
    const gate = new RemedyExecutionGateV1([adapter]);

    await expect(
      gate.execute({
        determination,
        proposal,
        grant: grant(),
        journal,
        executedAt: "2026-08-22T20:00:02.000Z",
      }),
    ).rejects.toThrow("provider_failed");

    const retry = await gate.execute({
      determination,
      proposal,
      grant: grant(),
      journal,
      executedAt: "2026-08-22T20:00:03.000Z",
    });
    expect(retry.state).toBe("RECOVERY_REQUIRED");
    if (retry.state !== "RECOVERY_REQUIRED") throw new Error("expected_recovery_required");
    expect(retry.reasonCode).toBe("REMEDY_PRIOR_ATTEMPT_FAILED");
    expect(retry.automaticRetryPermitted).toBe(false);
    expect(attempts).toBe(1);
  });

  it("rejects grant lineage or time drift before journal mutation or adapter invocation", async () => {
    const cases: Array<[RemedyAuthorizationGrantV1, string]> = [
      [grant({ reconciliationRef: "RECONCILIATION:OTHER" }), "REMEDY_EXECUTION_RECONCILIATION_MISMATCH"],
      [grant({ proposalRef: "REMEDY-PROPOSAL:OTHER" }), "REMEDY_EXECUTION_PROPOSAL_MISMATCH"],
      [grant({ parentCorrelationId: "CORR:OTHER" }), "REMEDY_EXECUTION_PARENT_CORRELATION_MISMATCH"],
      [grant({ validUntil: "2026-08-22T20:00:01.500Z" }), "REMEDY_EXECUTION_AUTHORIZATION_EXPIRED"],
    ];

    for (const [candidate, reasonCode] of cases) {
      const adapter = new CountingAdapter();
      const journal = new InMemoryRemedyExecutionJournalV1();
      const gate = new RemedyExecutionGateV1([adapter]);
      const result = await gate.execute({
        determination,
        proposal,
        grant: candidate,
        journal,
        executedAt: "2026-08-22T20:00:02.000Z",
      });
      expect(result).toEqual({ state: "REJECTED_INPUT", reasonCode });
      expect(adapter.invocations).toBe(0);
      expect(journal.size()).toBe(0);
    }
  });

  it("detects a replay identity conflict under one authorization reference", async () => {
    const adapter = new CountingAdapter();
    const journal = new InMemoryRemedyExecutionJournalV1();
    const gate = new RemedyExecutionGateV1([adapter]);
    const firstGrant = grant();

    const first = await gate.execute({
      determination,
      proposal,
      grant: firstGrant,
      journal,
      executedAt: "2026-08-22T20:00:02.000Z",
    });
    expect(first.state).toBe("EXECUTED_UNVERIFIED_REMEDY");

    const conflicting = await gate.execute({
      determination,
      proposal,
      grant: grant({ remedyWardenDecisionRef: "WARDEN-DECISION:TAMPERED" }),
      journal,
      executedAt: "2026-08-22T20:00:03.000Z",
    });
    expect(conflicting).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_EXECUTION_JOURNAL_CONFLICT",
    });
    expect(adapter.invocations).toBe(1);
  });
});
