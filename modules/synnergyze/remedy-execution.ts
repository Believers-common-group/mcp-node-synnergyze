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
  proposalKind: ReconciliationRemedyProposalV1["kind"];
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

export interface RemedyExecutionAdapterInputV1 {
  grant: RemedyAuthorizationGrantV1;
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  idempotencyKey: string;
  executedAt: string;
}

export interface RemedyExecutionAdapterResultV1 {
  adapterResultRef: string;
}

export interface RemedyExecutionAdapterV1 {
  readonly adapterRef: string;
  readonly capabilityRef: string;
  execute(input: RemedyExecutionAdapterInputV1): Promise<RemedyExecutionAdapterResultV1>;
}

export type RemedyExecutionRejectCodeV1 =
  | "REMEDY_EXECUTION_GRANT_NOT_ACTIVE"
  | "REMEDY_EXECUTION_NON_SYNTHETIC_GRANT"
  | "REMEDY_EXECUTION_RECONCILIATION_MISMATCH"
  | "REMEDY_EXECUTION_PROPOSAL_MISMATCH"
  | "REMEDY_EXECUTION_KIND_MISMATCH"
  | "REMEDY_EXECUTION_CAPABILITY_MISMATCH"
  | "REMEDY_EXECUTION_TARGET_MISMATCH"
  | "REMEDY_EXECUTION_PARENT_CORRELATION_MISMATCH"
  | "REMEDY_EXECUTION_ORIGINAL_DECISION_MISMATCH"
  | "REMEDY_EXECUTION_PROPOSAL_NOT_BOUND"
  | "REMEDY_EXECUTION_UNSUPPORTED_KIND"
  | "REMEDY_EXECUTION_INVALID_TIME"
  | "REMEDY_EXECUTION_BEFORE_AUTHORIZATION"
  | "REMEDY_EXECUTION_AUTHORIZATION_EXPIRED"
  | "REMEDY_EXECUTION_ADAPTER_NOT_REGISTERED"
  | "REMEDY_EXECUTION_JOURNAL_CONFLICT";

export interface RemedyExecutionSuccessV1 {
  state: "EXECUTED_UNVERIFIED_REMEDY";
  receipt: RemedyExecutionReceiptV1;
}

export interface RemedyExecutionRecoveryRequiredV1 {
  state: "RECOVERY_REQUIRED";
  authorizationRef: string;
  reconciliationRef: string;
  proposalRef: string;
  reasonCode: "REMEDY_EXECUTION_IN_PROGRESS" | "REMEDY_PRIOR_ATTEMPT_FAILED";
  automaticRetryPermitted: false;
}

export interface RemedyExecutionRejectedV1 {
  state: "REJECTED_INPUT";
  reasonCode: RemedyExecutionRejectCodeV1;
}

export type RemedyExecutionResultV1 =
  | RemedyExecutionSuccessV1
  | RemedyExecutionRecoveryRequiredV1
  | RemedyExecutionRejectedV1;

interface InMemoryRemedyJournalRowV1 {
  executionFingerprint: string;
  expiresAtMs: number;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  receipt?: RemedyExecutionReceiptV1;
  failureReason?: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneReceipt(receipt: RemedyExecutionReceiptV1, idempotentReplay = receipt.idempotentReplay) {
  return { ...receipt, idempotentReplay };
}

function reject(reasonCode: RemedyExecutionRejectCodeV1): RemedyExecutionRejectedV1 {
  return { state: "REJECTED_INPUT", reasonCode };
}

function validateBoundGrant(input: {
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  grant: RemedyAuthorizationGrantV1;
  executedAt: string;
}): RemedyExecutionRejectedV1 | undefined {
  const { determination, proposal, grant, executedAt } = input;

  if (grant.state !== "AUTHORIZED_REMEDY") return reject("REMEDY_EXECUTION_GRANT_NOT_ACTIVE");
  if (grant.synthetic !== true) return reject("REMEDY_EXECUTION_NON_SYNTHETIC_GRANT");
  if (grant.reconciliationRef !== determination.reconciliationRef) {
    return reject("REMEDY_EXECUTION_RECONCILIATION_MISMATCH");
  }
  if (grant.proposalRef !== proposal.proposalRef) return reject("REMEDY_EXECUTION_PROPOSAL_MISMATCH");
  if (grant.proposalKind !== proposal.kind) return reject("REMEDY_EXECUTION_KIND_MISMATCH");
  if (grant.capabilityRef !== proposal.capabilityRef) {
    return reject("REMEDY_EXECUTION_CAPABILITY_MISMATCH");
  }
  if (grant.targetRef !== determination.targetRef) return reject("REMEDY_EXECUTION_TARGET_MISMATCH");
  if (grant.parentCorrelationId !== determination.correlationId) {
    return reject("REMEDY_EXECUTION_PARENT_CORRELATION_MISMATCH");
  }
  if (grant.originalWardenDecisionRef !== determination.originalWardenDecisionRef) {
    return reject("REMEDY_EXECUTION_ORIGINAL_DECISION_MISMATCH");
  }

  const boundProposal = determination.candidateRemedies.find(
    (candidate) => candidate.proposalRef === proposal.proposalRef,
  );
  if (
    !boundProposal ||
    boundProposal.kind !== proposal.kind ||
    boundProposal.capabilityRef !== proposal.capabilityRef ||
    boundProposal.reasonCode !== proposal.reasonCode ||
    boundProposal.requiresFreshWardenDecision !== true ||
    boundProposal.authorized !== false
  ) {
    return reject("REMEDY_EXECUTION_PROPOSAL_NOT_BOUND");
  }

  const authorized = parseInstant(grant.authorizedAt);
  const validUntil = parseInstant(grant.validUntil);
  const executed = parseInstant(executedAt);
  if (authorized === null || validUntil === null || executed === null || validUntil < authorized) {
    return reject("REMEDY_EXECUTION_INVALID_TIME");
  }
  if (executed < authorized) return reject("REMEDY_EXECUTION_BEFORE_AUTHORIZATION");
  if (executed > validUntil) return reject("REMEDY_EXECUTION_AUTHORIZATION_EXPIRED");
  return undefined;
}

function executionFingerprint(input: {
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  grant: RemedyAuthorizationGrantV1;
  adapterRef: string;
}): string {
  const { determination, proposal, grant, adapterRef } = input;
  return `sha256:${digest(
    JSON.stringify({
      authorizationRef: grant.authorizationRef,
      reconciliationRef: grant.reconciliationRef,
      proposalRef: grant.proposalRef,
      proposalKind: grant.proposalKind,
      parentCorrelationId: grant.parentCorrelationId,
      remedyCorrelationId: grant.remedyCorrelationId,
      originalWardenDecisionRef: grant.originalWardenDecisionRef,
      remedyWardenDecisionRef: grant.remedyWardenDecisionRef,
      remedyWardenRequestRef: grant.remedyWardenRequestRef,
      capabilityRef: grant.capabilityRef,
      targetRef: grant.targetRef,
      actionTokenDigest: grant.actionTokenDigest,
      determinationSourceDigest: determination.sourceDigest,
      proposalReasonCode: proposal.reasonCode,
      adapterRef,
    }),
  )}`;
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
    const validation = validateBoundGrant(input);
    if (validation) return validation;
    // Recovery and compensation are effect-mutating actions. They must pass through
    // RemedyRuntimeV1, which rechecks the fresh Warden decision, River reservation,
    // execution checkpoint, action-token digest and child correlation.
    if (input.proposal.kind !== "RETRY_OBSERVATION") {
      return reject("REMEDY_EXECUTION_UNSUPPORTED_KIND");
    }

    const adapter = this.adapters.get(input.grant.capabilityRef);
    if (!adapter) return reject("REMEDY_EXECUTION_ADAPTER_NOT_REGISTERED");

    const fingerprint = executionFingerprint({
      determination: input.determination,
      proposal: input.proposal,
      grant: input.grant,
      adapterRef: adapter.adapterRef,
    });
    const executedMs = parseInstant(input.executedAt);
    const expiresAtMs = parseInstant(input.grant.validUntil);
    if (executedMs === null || expiresAtMs === null) return reject("REMEDY_EXECUTION_INVALID_TIME");

    const begin = await input.journal.begin({
      authorizationRef: input.grant.authorizationRef,
      executionFingerprint: fingerprint,
      expiresAtMs,
      startedAtMs: executedMs,
    });
    if (begin.state === "COMPLETED") {
      return {
        state: "EXECUTED_UNVERIFIED_REMEDY",
        receipt: cloneReceipt(begin.receipt, true),
      };
    }
    if (begin.state === "IN_PROGRESS") {
      return {
        state: "RECOVERY_REQUIRED",
        authorizationRef: input.grant.authorizationRef,
        reconciliationRef: input.determination.reconciliationRef,
        proposalRef: input.proposal.proposalRef,
        reasonCode: "REMEDY_EXECUTION_IN_PROGRESS",
        automaticRetryPermitted: false,
      };
    }
    if (begin.state === "FAILED") {
      return {
        state: "RECOVERY_REQUIRED",
        authorizationRef: input.grant.authorizationRef,
        reconciliationRef: input.determination.reconciliationRef,
        proposalRef: input.proposal.proposalRef,
        reasonCode: "REMEDY_PRIOR_ATTEMPT_FAILED",
        automaticRetryPermitted: false,
      };
    }
    if (begin.state === "CONFLICT") return reject("REMEDY_EXECUTION_JOURNAL_CONFLICT");

    let adapterResult: RemedyExecutionAdapterResultV1;
    try {
      adapterResult = await adapter.execute({
        grant: input.grant,
        determination: input.determination,
        proposal: input.proposal,
        idempotencyKey: input.grant.authorizationRef,
        executedAt: input.executedAt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "remedy_adapter_failed";
      await input.journal.fail({
        authorizationRef: input.grant.authorizationRef,
        executionFingerprint: fingerprint,
        reason,
        failedAtMs: executedMs,
      });
      throw error;
    }

    if (!adapterResult.adapterResultRef.trim()) {
      await input.journal.fail({
        authorizationRef: input.grant.authorizationRef,
        executionFingerprint: fingerprint,
        reason: "remedy_adapter_result_missing",
        failedAtMs: executedMs,
      });
      throw new Error("remedy_adapter_result_missing");
    }

    const receiptRef = `REMEDY-EXECUTION-RECEIPT:${digest(
      `${input.grant.authorizationRef}|${fingerprint}|${adapter.adapterRef}|${adapterResult.adapterResultRef}`,
    ).slice(0, 24)}`;
    const receipt: RemedyExecutionReceiptV1 = {
      version: "REMEDY-EXECUTION-001",
      receiptRef,
      authorizationRef: input.grant.authorizationRef,
      reconciliationRef: input.determination.reconciliationRef,
      proposalRef: input.proposal.proposalRef,
      proposalKind: input.proposal.kind,
      parentCorrelationId: input.grant.parentCorrelationId,
      remedyCorrelationId: input.grant.remedyCorrelationId,
      originalWardenDecisionRef: input.grant.originalWardenDecisionRef,
      remedyWardenDecisionRef: input.grant.remedyWardenDecisionRef,
      capabilityRef: input.grant.capabilityRef,
      targetRef: input.grant.targetRef,
      adapterRef: adapter.adapterRef,
      adapterResultRef: adapterResult.adapterResultRef,
      executedAt: input.executedAt,
      state: "EXECUTED_UNVERIFIED_REMEDY",
      synthetic: true,
      idempotentReplay: false,
    };

    // Important: if this durable completion write fails after the provider call returned,
    // the row remains IN_PROGRESS. A restart must stop at RECOVERY_REQUIRED and reconcile
    // provider reality; it must not invoke the remedy adapter again automatically.
    await input.journal.complete({
      authorizationRef: input.grant.authorizationRef,
      executionFingerprint: fingerprint,
      receipt,
      completedAtMs: executedMs,
    });
    return { state: "EXECUTED_UNVERIFIED_REMEDY", receipt: cloneReceipt(receipt) };
  }
}

export class InMemoryRemedyExecutionJournalV1 implements RemedyExecutionJournalV1 {
  private readonly rows = new Map<string, InMemoryRemedyJournalRowV1>();

  async begin(input: RemedyJournalStartV1): Promise<RemedyJournalBeginResultV1> {
    const current = this.rows.get(input.authorizationRef);
    if (!current) {
      this.rows.set(input.authorizationRef, {
        executionFingerprint: input.executionFingerprint,
        expiresAtMs: input.expiresAtMs,
        state: "IN_PROGRESS",
      });
      return { state: "STARTED" };
    }
    if (current.executionFingerprint !== input.executionFingerprint) return { state: "CONFLICT" };
    if (current.state === "COMPLETED" && current.receipt) {
      return { state: "COMPLETED", receipt: cloneReceipt(current.receipt) };
    }
    if (current.state === "IN_PROGRESS") return { state: "IN_PROGRESS" };
    return { state: "FAILED" };
  }

  async complete(input: {
    authorizationRef: string;
    executionFingerprint: string;
    receipt: RemedyExecutionReceiptV1;
    completedAtMs: number;
  }): Promise<void> {
    const row = this.rows.get(input.authorizationRef);
    if (
      !row ||
      row.executionFingerprint !== input.executionFingerprint ||
      row.state !== "IN_PROGRESS"
    ) {
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
    if (
      !row ||
      row.executionFingerprint !== input.executionFingerprint ||
      row.state !== "IN_PROGRESS"
    ) {
      throw new Error("remedy_journal_fail_conflict");
    }
    row.state = "FAILED";
    row.failureReason = input.reason;
  }

  size(): number {
    return this.rows.size;
  }
}
