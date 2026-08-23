import { createHash } from "node:crypto";

import type {
  CompositeEffectAssessmentV1,
  ScopedRemedyProposalV1,
} from "./composite-effect-reconciliation.ts";
import type {
  RemedyExecutionJournalV1,
  RemedyJournalBeginResultV1,
  RemedyJournalStartV1,
} from "./remedy-execution.ts";
import type { ScopedRemedyAuthorizationGrantV1 } from "./scoped-remedy-authorization.ts";

export interface ScopedRemedyExecutionReceiptV1 {
  version: "SCOPED-REMEDY-EXECUTION-001";
  receiptRef: string;
  authorizationRef: string;
  assessmentRef: string;
  effectSetRef: string;
  proposalRef: string;
  proposalKind: ScopedRemedyProposalV1["kind"];
  componentRefs: readonly string[];
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

export interface ScopedRemedyExecutionAdapterV1 {
  readonly adapterRef: string;
  readonly capabilityRef: string;
  execute(input: {
    grant: ScopedRemedyAuthorizationGrantV1;
    assessment: CompositeEffectAssessmentV1;
    proposal: ScopedRemedyProposalV1;
    componentRefs: readonly string[];
    idempotencyKey: string;
    executedAt: string;
  }): Promise<{ adapterResultRef: string }>;
}

export interface ScopedRemedyExecutionJournalV1 {
  begin(input: RemedyJournalStartV1): Promise<RemedyJournalBeginResultV1 | { state: "COMPLETED_SCOPED"; receipt: ScopedRemedyExecutionReceiptV1 }>;
  completeScoped(input: {
    authorizationRef: string;
    executionFingerprint: string;
    receipt: ScopedRemedyExecutionReceiptV1;
    completedAtMs: number;
  }): Promise<void>;
  fail: RemedyExecutionJournalV1["fail"];
}

export type ScopedRemedyExecutionResultV1 =
  | { state: "EXECUTED_UNVERIFIED_REMEDY"; receipt: ScopedRemedyExecutionReceiptV1 }
  | {
      state: "RECOVERY_REQUIRED";
      authorizationRef: string;
      assessmentRef: string;
      proposalRef: string;
      componentRefs: readonly string[];
      reasonCode: "REMEDY_EXECUTION_IN_PROGRESS" | "REMEDY_PRIOR_ATTEMPT_FAILED";
      automaticRetryPermitted: false;
    }
  | {
      state: "REJECTED_INPUT";
      reasonCode:
        | "SCOPED_EXECUTION_GRANT_SCOPE_MISMATCH"
        | "SCOPED_EXECUTION_PROPOSAL_NOT_BOUND"
        | "SCOPED_EXECUTION_ADAPTER_NOT_REGISTERED"
        | "SCOPED_EXECUTION_INVALID_TIME"
        | "SCOPED_EXECUTION_BEFORE_AUTHORIZATION"
        | "SCOPED_EXECUTION_AUTHORIZATION_EXPIRED"
        | "SCOPED_EXECUTION_JOURNAL_CONFLICT";
    };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function cloneReceipt(
  receipt: ScopedRemedyExecutionReceiptV1,
  idempotentReplay = receipt.idempotentReplay,
): ScopedRemedyExecutionReceiptV1 {
  return {
    ...receipt,
    componentRefs: [...receipt.componentRefs],
    idempotentReplay,
  };
}

export class ScopedRemedyExecutionGateV1 {
  private readonly adapters: ReadonlyMap<string, ScopedRemedyExecutionAdapterV1>;

  constructor(adapters: readonly ScopedRemedyExecutionAdapterV1[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.capabilityRef, adapter]));
  }

  async execute(input: {
    assessment: CompositeEffectAssessmentV1;
    proposal: ScopedRemedyProposalV1;
    grant: ScopedRemedyAuthorizationGrantV1;
    journal: ScopedRemedyExecutionJournalV1;
    executedAt: string;
  }): Promise<ScopedRemedyExecutionResultV1> {
    const { assessment, proposal, grant } = input;
    const proposalComponents = stableUnique(proposal.componentRefs);
    const grantComponents = stableUnique(grant.componentRefs);
    if (
      grant.assessmentRef !== assessment.assessmentRef ||
      grant.reconciliationRef !== assessment.assessmentRef ||
      grant.effectSetRef !== assessment.effectSetRef ||
      grant.proposalRef !== proposal.proposalRef ||
      grant.proposalKind !== proposal.kind ||
      grant.capabilityRef !== proposal.capabilityRef ||
      grant.targetRef !== assessment.targetRef ||
      grant.parentCorrelationId !== assessment.correlationId ||
      grant.originalWardenDecisionRef !== assessment.originalWardenDecisionRef ||
      JSON.stringify(grantComponents) !== JSON.stringify(proposalComponents)
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_GRANT_SCOPE_MISMATCH" };
    }

    const boundProposal = assessment.candidateRemedies.find(
      (candidate) => candidate.proposalRef === proposal.proposalRef,
    );
    if (
      !boundProposal ||
      boundProposal.kind !== proposal.kind ||
      boundProposal.capabilityRef !== proposal.capabilityRef ||
      boundProposal.effectSetRef !== proposal.effectSetRef ||
      JSON.stringify(stableUnique(boundProposal.componentRefs)) !== JSON.stringify(proposalComponents)
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_PROPOSAL_NOT_BOUND" };
    }

    const authorizedAtMs = parseInstant(grant.authorizedAt);
    const validUntilMs = parseInstant(grant.validUntil);
    const executedAtMs = parseInstant(input.executedAt);
    if (
      authorizedAtMs === null ||
      validUntilMs === null ||
      executedAtMs === null ||
      validUntilMs < authorizedAtMs
    ) {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_INVALID_TIME" };
    }
    if (executedAtMs < authorizedAtMs) {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_BEFORE_AUTHORIZATION" };
    }
    if (executedAtMs > validUntilMs) {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_AUTHORIZATION_EXPIRED" };
    }

    const adapter = this.adapters.get(grant.capabilityRef);
    if (!adapter) {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_ADAPTER_NOT_REGISTERED" };
    }

    const fingerprint = `sha256:${digest(
      JSON.stringify({
        authorizationRef: grant.authorizationRef,
        assessmentRef: assessment.assessmentRef,
        effectSetRef: grant.effectSetRef,
        proposalRef: proposal.proposalRef,
        proposalKind: proposal.kind,
        componentRefs: grantComponents,
        parentCorrelationId: grant.parentCorrelationId,
        remedyCorrelationId: grant.remedyCorrelationId,
        originalWardenDecisionRef: grant.originalWardenDecisionRef,
        remedyWardenDecisionRef: grant.remedyWardenDecisionRef,
        capabilityRef: grant.capabilityRef,
        targetRef: grant.targetRef,
        actionTokenDigest: grant.actionTokenDigest,
        adapterRef: adapter.adapterRef,
      }),
    )}`;

    const begin = await input.journal.begin({
      authorizationRef: grant.authorizationRef,
      executionFingerprint: fingerprint,
      expiresAtMs: validUntilMs,
      startedAtMs: executedAtMs,
    });
    if (begin.state === "COMPLETED_SCOPED") {
      return {
        state: "EXECUTED_UNVERIFIED_REMEDY",
        receipt: cloneReceipt(begin.receipt, true),
      };
    }
    if (begin.state === "COMPLETED") {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_JOURNAL_CONFLICT" };
    }
    if (begin.state === "IN_PROGRESS") {
      return {
        state: "RECOVERY_REQUIRED",
        authorizationRef: grant.authorizationRef,
        assessmentRef: assessment.assessmentRef,
        proposalRef: proposal.proposalRef,
        componentRefs: grantComponents,
        reasonCode: "REMEDY_EXECUTION_IN_PROGRESS",
        automaticRetryPermitted: false,
      };
    }
    if (begin.state === "FAILED") {
      return {
        state: "RECOVERY_REQUIRED",
        authorizationRef: grant.authorizationRef,
        assessmentRef: assessment.assessmentRef,
        proposalRef: proposal.proposalRef,
        componentRefs: grantComponents,
        reasonCode: "REMEDY_PRIOR_ATTEMPT_FAILED",
        automaticRetryPermitted: false,
      };
    }
    if (begin.state === "CONFLICT") {
      return { state: "REJECTED_INPUT", reasonCode: "SCOPED_EXECUTION_JOURNAL_CONFLICT" };
    }

    let result: { adapterResultRef: string };
    try {
      result = await adapter.execute({
        grant,
        assessment,
        proposal,
        componentRefs: grantComponents,
        idempotencyKey: grant.authorizationRef,
        executedAt: input.executedAt,
      });
    } catch (error) {
      await input.journal.fail({
        authorizationRef: grant.authorizationRef,
        executionFingerprint: fingerprint,
        reason: error instanceof Error ? error.message : "scoped_remedy_adapter_failed",
        failedAtMs: executedAtMs,
      });
      throw error;
    }
    if (!result.adapterResultRef.trim()) {
      await input.journal.fail({
        authorizationRef: grant.authorizationRef,
        executionFingerprint: fingerprint,
        reason: "scoped_remedy_adapter_result_missing",
        failedAtMs: executedAtMs,
      });
      throw new Error("scoped_remedy_adapter_result_missing");
    }

    const receipt: ScopedRemedyExecutionReceiptV1 = {
      version: "SCOPED-REMEDY-EXECUTION-001",
      receiptRef: `SCOPED-REMEDY-EXECUTION-RECEIPT:${digest(
        `${grant.authorizationRef}|${fingerprint}|${adapter.adapterRef}|${result.adapterResultRef}`,
      ).slice(0, 24)}`,
      authorizationRef: grant.authorizationRef,
      assessmentRef: assessment.assessmentRef,
      effectSetRef: assessment.effectSetRef,
      proposalRef: proposal.proposalRef,
      proposalKind: proposal.kind,
      componentRefs: grantComponents,
      parentCorrelationId: grant.parentCorrelationId,
      remedyCorrelationId: grant.remedyCorrelationId,
      originalWardenDecisionRef: grant.originalWardenDecisionRef,
      remedyWardenDecisionRef: grant.remedyWardenDecisionRef,
      capabilityRef: grant.capabilityRef,
      targetRef: grant.targetRef,
      adapterRef: adapter.adapterRef,
      adapterResultRef: result.adapterResultRef,
      executedAt: input.executedAt,
      state: "EXECUTED_UNVERIFIED_REMEDY",
      synthetic: true,
      idempotentReplay: false,
    };

    await input.journal.completeScoped({
      authorizationRef: grant.authorizationRef,
      executionFingerprint: fingerprint,
      receipt,
      completedAtMs: executedAtMs,
    });
    return { state: "EXECUTED_UNVERIFIED_REMEDY", receipt: cloneReceipt(receipt) };
  }
}

interface ScopedJournalRowV1 {
  executionFingerprint: string;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  receipt?: ScopedRemedyExecutionReceiptV1;
}

export class InMemoryScopedRemedyExecutionJournalV1 implements ScopedRemedyExecutionJournalV1 {
  private readonly rows = new Map<string, ScopedJournalRowV1>();

  async begin(input: RemedyJournalStartV1) {
    const existing = this.rows.get(input.authorizationRef);
    if (!existing) {
      this.rows.set(input.authorizationRef, {
        executionFingerprint: input.executionFingerprint,
        state: "IN_PROGRESS",
      });
      return { state: "STARTED" as const };
    }
    if (existing.executionFingerprint !== input.executionFingerprint) {
      return { state: "CONFLICT" as const };
    }
    if (existing.state === "COMPLETED" && existing.receipt) {
      return { state: "COMPLETED_SCOPED" as const, receipt: cloneReceipt(existing.receipt) };
    }
    if (existing.state === "IN_PROGRESS") return { state: "IN_PROGRESS" as const };
    return { state: "FAILED" as const };
  }

  async completeScoped(input: {
    authorizationRef: string;
    executionFingerprint: string;
    receipt: ScopedRemedyExecutionReceiptV1;
    completedAtMs: number;
  }): Promise<void> {
    const row = this.rows.get(input.authorizationRef);
    if (
      !row ||
      row.executionFingerprint !== input.executionFingerprint ||
      row.state !== "IN_PROGRESS"
    ) {
      throw new Error("scoped_remedy_journal_complete_conflict");
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
      throw new Error("scoped_remedy_journal_fail_conflict");
    }
    row.state = "FAILED";
  }
}
