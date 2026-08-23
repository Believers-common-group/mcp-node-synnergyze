import { createHash } from "node:crypto";

import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import type { RemedyAuthorizationGrantV1 } from "./remedy-authorization.ts";

export interface RemedyExecutionReceiptV1 {
  version: "REMEDY-EXECUTION-001";
  receiptRef: string;
  authorizationRef: string;
  reconciliationRef: string;
  proposalRef: string;
  proposalKind: "RECOVER" | "COMPENSATE";
  parentCorrelationId: string;
  remedyCorrelationId: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  capabilityRef: string;
  targetRef: string;
  adapterRef: string;
  adapterResultRef: string;
  executedAt: string;
  state: "EXECUTED_UNVERIFIED_REMEDY";
  synthetic: true;
  idempotentReplay: boolean;
}

export interface RemedyJournalStartV1 {
  authorizationRef: string;
  executionFingerprint: string;
  expiresAtMs: number;
  startedAtMs: number;
}

export type RemedyJournalBeginResultV1 =
  | { state: "STARTED" }
  | { state: "COMPLETED"; receipt: RemedyExecutionReceiptV1 }
  | { state: "IN_PROGRESS" }
  | { state: "FAILED" }
  | { state: "CONFLICT" };

export interface RemedyExecutionJournalV1 {
  begin(input: RemedyJournalStartV1): Promise<RemedyJournalBeginResultV1>;
  complete(input: {
    authorizationRef: string;
    executionFingerprint: string;
    receipt: RemedyExecutionReceiptV1;
    completedAtMs: number;
  }): Promise<void>;
  fail(input: {
    authorizationRef: string;
    executionFingerprint: string;
    reason: string;
    failedAtMs: number;
  }): Promise<void>;
}

export interface RemedyExecutionAdapterV1 {
  readonly adapterRef: string;
  readonly capabilityRef: string;
  execute(input: {
    grant: RemedyAuthorizationGrantV1;
    determination: ReconciliationDeterminationV1;
    proposal: ReconciliationRemedyProposalV1;
    idempotencyKey: string;
    executedAt: string;
  }): Promise<{ adapterResultRef: string }>;
}

export type RemedyExecutionResultV1 =
  | { state: "EXECUTED_UNVERIFIED_REMEDY"; receipt: RemedyExecutionReceiptV1 }
  | {
      state: "RECOVERY_REQUIRED";
      authorizationRef: string;
      reconciliationRef: string;
      proposalRef: string;
      reasonCode:
        | "REMEDY_EXECUTION_IN_PROGRESS"
        | "REMEDY_PRIOR_ATTEMPT_FAILED"
        | "REMEDY_PROVIDER_OUTCOME_UNCERTAIN"
        | "REMEDY_JOURNAL_COMMIT_UNCERTAIN";
      automaticRetryPermitted: false;
    }
  | {
      state: "REJECTED_INPUT";
      reasonCode:
        | "REMEDY_EXECUTION_DETERMINATION_NOT_EXCEPTION"
        | "REMEDY_EXECUTION_PROPOSAL_NOT_BOUND"
        | "REMEDY_EXECUTION_MANUAL_REVIEW_NOT_EXECUTABLE"
        | "REMEDY_EXECUTION_GRANT_SCOPE_MISMATCH"
        | "REMEDY_EXECUTION_INVALID_TIME"
        | "REMEDY_EXECUTION_BEFORE_AUTHORIZATION"
        | "REMEDY_EXECUTION_AUTHORIZATION_EXPIRED"
        | "REMEDY_EXECUTION_ADAPTER_NOT_REGISTERED"
        | "REMEDY_EXECUTION_JOURNAL_CONFLICT";
    };

interface InMemoryJournalRowV1 {
  executionFingerprint: string;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  receipt?: RemedyExecutionReceiptV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneReceipt(
  receipt: RemedyExecutionReceiptV1,
  idempotentReplay = receipt.idempotentReplay,
): RemedyExecutionReceiptV1 {
  return { ...receipt, idempotentReplay };
}

function boundProposal(
  determination: ReconciliationDeterminationV1,
  proposal: ReconciliationRemedyProposalV1,
): boolean {
  const candidate = determination.candidateRemedies.find(
    (value) => value.proposalRef === proposal.proposalRef,
  );
  return Boolean(
    candidate &&
    candidate.kind === proposal.kind &&
    candidate.capabilityRef === proposal.capabilityRef &&
    candidate.reasonCode === proposal.reasonCode &&
    candidate.requiresFreshWardenDecision === true &&
    candidate.authorized === false,
  );
}

function recovery(
  grant: RemedyAuthorizationGrantV1,
  reasonCode: Extract<RemedyExecutionResultV1, { state: "RECOVERY_REQUIRED" }>["reasonCode"],
): RemedyExecutionResultV1 {
  return {
    state: "RECOVERY_REQUIRED",
    authorizationRef: grant.authorizationRef,
    reconciliationRef: grant.reconciliationRef,
    proposalRef: grant.proposalRef,
    reasonCode,
    automaticRetryPermitted: false,
  };
}

export class RemedyExecutionGateV1 {
  private readonly adapters: ReadonlyMap<string, RemedyExecutionAdapterV1>;

  constructor(adapters: readonly RemedyExecutionAdapterV1[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.capabilityRef, adapter]));
  }

  async execute(input: {
    determination: ReconciliationDeterminationV1;
    proposal: ReconciliationRemedyProposalV1;
    grant: RemedyAuthorizationGrantV1;
    journal: RemedyExecutionJournalV1;
    executedAt: string;
  }): Promise<RemedyExecutionResultV1> {
    const { determination, proposal, grant } = input;

    if (
      determination.state !== "EXCEPTION" ||
      determination.closureEligible ||
      determination.synthetic !== true
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_DETERMINATION_NOT_EXCEPTION" };
    }
    if (!boundProposal(determination, proposal)) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_PROPOSAL_NOT_BOUND" };
    }
    if (proposal.kind === "MANUAL_REVIEW") {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_MANUAL_REVIEW_NOT_EXECUTABLE" };
    }

    if (
      grant.state !== "AUTHORIZED_REMEDY" ||
      grant.synthetic !== true ||
      grant.reconciliationRef !== determination.reconciliationRef ||
      grant.proposalRef !== proposal.proposalRef ||
      grant.proposalKind !== proposal.kind ||
      grant.capabilityRef !== proposal.capabilityRef ||
      grant.targetRef !== determination.targetRef ||
      grant.parentCorrelationId !== determination.correlationId ||
      grant.remedyCorrelationId === determination.correlationId ||
      grant.originalWardenDecisionRef !== determination.originalWardenDecisionRef ||
      grant.remedyWardenDecisionRef === determination.originalWardenDecisionRef
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_GRANT_SCOPE_MISMATCH" };
    }

    const reconciledAtMs = parseInstant(determination.reconciledAt);
    const authorizedAtMs = parseInstant(grant.authorizedAt);
    const validUntilMs = parseInstant(grant.validUntil);
    const executedAtMs = parseInstant(input.executedAt);
    if (
      reconciledAtMs === null ||
      authorizedAtMs === null ||
      validUntilMs === null ||
      executedAtMs === null ||
      validUntilMs < authorizedAtMs
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_INVALID_TIME" };
    }
    if (authorizedAtMs < reconciledAtMs || executedAtMs < authorizedAtMs) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_BEFORE_AUTHORIZATION" };
    }
    if (executedAtMs > validUntilMs) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_AUTHORIZATION_EXPIRED" };
    }

    const adapter = this.adapters.get(grant.capabilityRef);
    if (!adapter) {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_ADAPTER_NOT_REGISTERED" };
    }

    const fingerprint = `sha256:${digest(JSON.stringify({
      authorizationRef: grant.authorizationRef,
      reconciliationRef: determination.reconciliationRef,
      determinationSourceDigest: determination.sourceDigest,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      parentCorrelationId: grant.parentCorrelationId,
      remedyCorrelationId: grant.remedyCorrelationId,
      originalWardenDecisionRef: grant.originalWardenDecisionRef,
      remedyWardenDecisionRef: grant.remedyWardenDecisionRef,
      capabilityRef: grant.capabilityRef,
      targetRef: grant.targetRef,
      actionTokenDigest: grant.actionTokenDigest,
      adapterRef: adapter.adapterRef,
    }))}`;

    const begin = await input.journal.begin({
      authorizationRef: grant.authorizationRef,
      executionFingerprint: fingerprint,
      expiresAtMs: validUntilMs,
      startedAtMs: executedAtMs,
    });
    if (begin.state === "COMPLETED") {
      return {
        state: "EXECUTED_UNVERIFIED_REMEDY",
        receipt: cloneReceipt(begin.receipt, true),
      };
    }
    if (begin.state === "IN_PROGRESS") return recovery(grant, "REMEDY_EXECUTION_IN_PROGRESS");
    if (begin.state === "FAILED") return recovery(grant, "REMEDY_PRIOR_ATTEMPT_FAILED");
    if (begin.state === "CONFLICT") {
      return { state: "REJECTED_INPUT", reasonCode: "REMEDY_EXECUTION_JOURNAL_CONFLICT" };
    }

    let adapterResultRef: string;
    try {
      const result = await adapter.execute({
        grant,
        determination,
        proposal,
        idempotencyKey: grant.authorizationRef,
        executedAt: input.executedAt,
      });
      adapterResultRef = result.adapterResultRef;
      if (!adapterResultRef.trim()) throw new Error("remedy_adapter_result_missing");
    } catch (error) {
      await input.journal.fail({
        authorizationRef: grant.authorizationRef,
        executionFingerprint: fingerprint,
        reason: error instanceof Error ? error.message : "remedy_provider_outcome_uncertain",
        failedAtMs: executedAtMs,
      });
      return recovery(grant, "REMEDY_PROVIDER_OUTCOME_UNCERTAIN");
    }

    const receipt: RemedyExecutionReceiptV1 = {
      version: "REMEDY-EXECUTION-001",
      receiptRef: `REMEDY-EXECUTION-RECEIPT:${digest(
        `${grant.authorizationRef}|${fingerprint}|${adapter.adapterRef}|${adapterResultRef}`,
      ).slice(0, 24)}`,
      authorizationRef: grant.authorizationRef,
      reconciliationRef: determination.reconciliationRef,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      parentCorrelationId: grant.parentCorrelationId,
      remedyCorrelationId: grant.remedyCorrelationId,
      originalWardenDecisionRef: grant.originalWardenDecisionRef,
      remedyWardenDecisionRef: grant.remedyWardenDecisionRef,
      capabilityRef: grant.capabilityRef,
      targetRef: grant.targetRef,
      adapterRef: adapter.adapterRef,
      adapterResultRef,
      executedAt: input.executedAt,
      state: "EXECUTED_UNVERIFIED_REMEDY",
      synthetic: true,
      idempotentReplay: false,
    };

    try {
      await input.journal.complete({
        authorizationRef: grant.authorizationRef,
        executionFingerprint: fingerprint,
        receipt,
        completedAtMs: executedAtMs,
      });
    } catch {
      // The provider may have completed while durable completion is uncertain.
      // Never invoke the provider automatically again from this authorization.
      return recovery(grant, "REMEDY_JOURNAL_COMMIT_UNCERTAIN");
    }

    return { state: "EXECUTED_UNVERIFIED_REMEDY", receipt: cloneReceipt(receipt) };
  }
}

export class InMemoryRemedyExecutionJournalV1 implements RemedyExecutionJournalV1 {
  private readonly rows = new Map<string, InMemoryJournalRowV1>();

  async begin(input: RemedyJournalStartV1): Promise<RemedyJournalBeginResultV1> {
    const row = this.rows.get(input.authorizationRef);
    if (!row) {
      this.rows.set(input.authorizationRef, {
        executionFingerprint: input.executionFingerprint,
        state: "IN_PROGRESS",
      });
      return { state: "STARTED" };
    }
    if (row.executionFingerprint !== input.executionFingerprint) return { state: "CONFLICT" };
    if (row.state === "COMPLETED" && row.receipt) {
      return { state: "COMPLETED", receipt: cloneReceipt(row.receipt) };
    }
    if (row.state === "IN_PROGRESS") return { state: "IN_PROGRESS" };
    return { state: "FAILED" };
  }

  async complete(input: {
    authorizationRef: string;
    executionFingerprint: string;
    receipt: RemedyExecutionReceiptV1;
    completedAtMs: number;
  }): Promise<void> {
    const row = this.rows.get(input.authorizationRef);
    if (!row || row.executionFingerprint !== input.executionFingerprint || row.state !== "IN_PROGRESS") {
      throw new Error("remedy_journal_complete_conflict");
    }
    row.state = "COMPLETED";
    row.receipt = cloneReceipt(input.receipt);
  }

  async fail(input: {
    authorizationRef: string;
    executionFingerprint: string;
    reason: string;
    failedAtMs: number;
  }): Promise<void> {
    const row = this.rows.get(input.authorizationRef);
    if (!row || row.executionFingerprint !== input.executionFingerprint || row.state !== "IN_PROGRESS") {
      throw new Error("remedy_journal_fail_conflict");
    }
    row.state = "FAILED";
  }
}

export class SyntheticRecoveryRemedyAdapterV1 implements RemedyExecutionAdapterV1 {
  readonly adapterRef = "SYNTHETIC-RECOVERY-REMEDY-ADAPTER-001";
  readonly capabilityRef = "reconciliation.recover";
  private invocations = 0;

  async execute(input: Parameters<RemedyExecutionAdapterV1["execute"]>[0]) {
    this.invocations += 1;
    return {
      adapterResultRef: `SYNTHETIC-RECOVERY-RESULT:${digest(
        `${input.grant.authorizationRef}|${input.idempotencyKey}|${input.determination.targetRef}`,
      ).slice(0, 24)}`,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export class SyntheticCompensationRemedyAdapterV1 implements RemedyExecutionAdapterV1 {
  readonly adapterRef = "SYNTHETIC-COMPENSATION-REMEDY-ADAPTER-001";
  readonly capabilityRef = "reconciliation.compensate";
  private invocations = 0;

  async execute(input: Parameters<RemedyExecutionAdapterV1["execute"]>[0]) {
    this.invocations += 1;
    return {
      adapterResultRef: `SYNTHETIC-COMPENSATION-RESULT:${digest(
        `${input.grant.authorizationRef}|${input.idempotencyKey}|${input.determination.targetRef}`,
      ).slice(0, 24)}`,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }
}
