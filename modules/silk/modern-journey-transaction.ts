import { createHash } from "node:crypto";

import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type {
  EffectVerificationSuccessV1,
  PostExecutionObservationV1,
} from "../synnergyze/effect-verification.ts";
import {
  deriveReimbursementObligationV1,
  type NormalizedConfluenceProviderFailureV1,
  type SilkEconomicEventV1,
  type SilkReimbursementObligationV1,
} from "./confluence-reference.ts";

export type ModernJourneyTransactionStateV1 =
  | "OPEN"
  | "RECOVERY_REQUIRED"
  | "BLOCKED"
  | "EXECUTED_UNVERIFIED"
  | "CLOSED";

export interface ModernJourneyTransactionAttemptV1 {
  attemptRef: string;
  providerRef: string;
  capabilityRef: string;
  status: "FAILED" | "EXECUTED_UNVERIFIED";
  executionReceiptRef?: string;
  failureClass?: string;
  recoverable?: boolean;
}

export interface ModernJourneyTransactionV1 {
  transactionRef: string;
  journeyRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  amount: number;
  currency: string;
  state: ModernJourneyTransactionStateV1;
  attempts: readonly ModernJourneyTransactionAttemptV1[];
  successfulExecutionReceiptRef?: string;
  economicEvent?: SilkEconomicEventV1;
  reimbursementObligation?: SilkReimbursementObligationV1;
  verifiedEffectRef?: string;
}

export interface CreateModernJourneyTransactionInputV1 {
  transactionRef: string;
  journeyRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  amount: number;
  currency: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertFinitePositive(value: number, code: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
}

function cloneAttempt(attempt: ModernJourneyTransactionAttemptV1): ModernJourneyTransactionAttemptV1 {
  return { ...attempt };
}

function cloneTransaction(transaction: ModernJourneyTransactionV1): ModernJourneyTransactionV1 {
  return {
    ...transaction,
    attempts: transaction.attempts.map(cloneAttempt),
    economicEvent: transaction.economicEvent ? { ...transaction.economicEvent } : undefined,
    reimbursementObligation: transaction.reimbursementObligation
      ? { ...transaction.reimbursementObligation }
      : undefined,
  };
}

function assertAttemptRefAvailable(
  transaction: ModernJourneyTransactionV1,
  attemptRef: string,
): void {
  if (transaction.attempts.some((attempt) => attempt.attemptRef === attemptRef)) {
    throw new Error("modern_transaction_attempt_ref_conflict");
  }
}

export function createModernJourneyTransactionV1(
  input: CreateModernJourneyTransactionInputV1,
): ModernJourneyTransactionV1 {
  assertFinitePositive(input.amount, "modern_transaction_amount_positive_required");
  if (!input.transactionRef.trim()) throw new Error("modern_transaction_ref_required");
  if (!input.journeyRef.trim()) throw new Error("modern_journey_ref_required");
  if (!input.silkAccountRef.trim()) throw new Error("modern_silk_account_ref_required");
  if (!input.economicOwnerRef.trim()) throw new Error("modern_economic_owner_ref_required");
  if (!input.currency.trim()) throw new Error("modern_transaction_currency_required");

  return {
    ...input,
    state: "OPEN",
    attempts: [],
  };
}

export function recordModernProviderFailureV1(
  transaction: ModernJourneyTransactionV1,
  input: {
    attemptRef: string;
    providerRef: string;
    capabilityRef: string;
    failure: NormalizedConfluenceProviderFailureV1;
  },
): ModernJourneyTransactionV1 {
  if (transaction.state !== "OPEN" && transaction.state !== "RECOVERY_REQUIRED") {
    throw new Error("modern_transaction_failure_state_conflict");
  }
  assertAttemptRefAvailable(transaction, input.attemptRef);

  const nextState: ModernJourneyTransactionStateV1 = input.failure.recoverable
    ? "RECOVERY_REQUIRED"
    : "BLOCKED";
  return {
    ...cloneTransaction(transaction),
    state: nextState,
    attempts: [
      ...transaction.attempts.map(cloneAttempt),
      {
        attemptRef: input.attemptRef,
        providerRef: input.providerRef,
        capabilityRef: input.capabilityRef,
        status: "FAILED",
        failureClass: input.failure.failureClass,
        recoverable: input.failure.recoverable,
      },
    ],
  };
}

export function recordModernProviderExecutionV1(
  transaction: ModernJourneyTransactionV1,
  input: {
    attemptRef: string;
    providerRef: string;
    receipt: SynnergyzeExecutionReceiptV1;
    economicEvent: SilkEconomicEventV1;
  },
): ModernJourneyTransactionV1 {
  if (transaction.state !== "OPEN" && transaction.state !== "RECOVERY_REQUIRED") {
    throw new Error("modern_transaction_execution_state_conflict");
  }
  assertAttemptRefAvailable(transaction, input.attemptRef);
  if (input.receipt.state !== "EXECUTED_UNVERIFIED") {
    throw new Error("modern_transaction_unverified_receipt_required");
  }
  if (input.receipt.programRef !== transaction.journeyRef) {
    throw new Error("modern_transaction_journey_lineage_mismatch");
  }
  if (input.economicEvent.transactionRef !== transaction.transactionRef) {
    throw new Error("modern_transaction_economic_transaction_mismatch");
  }
  if (input.economicEvent.journeyRef !== transaction.journeyRef) {
    throw new Error("modern_transaction_economic_journey_mismatch");
  }
  if (input.economicEvent.silkAccountRef !== transaction.silkAccountRef) {
    throw new Error("modern_transaction_economic_account_mismatch");
  }
  if (input.economicEvent.economicOwnerRef !== transaction.economicOwnerRef) {
    throw new Error("modern_transaction_economic_owner_mismatch");
  }
  if (
    input.economicEvent.amount !== transaction.amount ||
    input.economicEvent.currency !== transaction.currency
  ) {
    throw new Error("modern_transaction_economic_value_mismatch");
  }
  if (input.economicEvent.providerRef !== input.providerRef) {
    throw new Error("modern_transaction_provider_mismatch");
  }

  const reimbursementObligation = deriveReimbursementObligationV1(input.economicEvent);
  return {
    ...cloneTransaction(transaction),
    state: "EXECUTED_UNVERIFIED",
    attempts: [
      ...transaction.attempts.map(cloneAttempt),
      {
        attemptRef: input.attemptRef,
        providerRef: input.providerRef,
        capabilityRef: input.receipt.capabilityRef,
        status: "EXECUTED_UNVERIFIED",
        executionReceiptRef: input.receipt.receiptRef,
      },
    ],
    successfulExecutionReceiptRef: input.receipt.receiptRef,
    economicEvent: { ...input.economicEvent },
    reimbursementObligation: reimbursementObligation
      ? { ...reimbursementObligation }
      : undefined,
  };
}

export function buildSyntheticConfluenceObservationV1(
  receipt: SynnergyzeExecutionReceiptV1,
  input: {
    observerRef: string;
    observedStateRef: string;
    observedAt: string;
  },
): PostExecutionObservationV1 {
  if (receipt.state !== "EXECUTED_UNVERIFIED") {
    throw new Error("modern_observation_unverified_receipt_required");
  }
  if (!input.observerRef.trim()) throw new Error("modern_observer_ref_required");
  if (!input.observedStateRef.trim()) throw new Error("modern_observed_state_required");
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    throw new Error("modern_observation_time_invalid");
  }

  const sourceEvidenceRef = `SYNTHETIC-CONFLUENCE-EVIDENCE:${digest(
    `${receipt.receiptRef}|${receipt.adapterResultRef}|${input.observedStateRef}|${input.observedAt}`,
  ).slice(0, 24)}`;
  const observationRef = `POST-EXECUTION-OBSERVATION:${digest(
    `${receipt.receiptRef}|${input.observerRef}|${sourceEvidenceRef}`,
  ).slice(0, 24)}`;

  return {
    observationRef,
    executionReceiptRef: receipt.receiptRef,
    actionRef: receipt.actionRef,
    programRef: receipt.programRef,
    eventRef: receipt.eventRef,
    targetRef: receipt.targetRef,
    correlationId: receipt.correlationId,
    observerRef: input.observerRef,
    observedStateRef: input.observedStateRef,
    observedAt: input.observedAt,
    sourceEvidenceRef,
    synthetic: true,
  };
}

export function closeModernJourneyTransactionV1(
  transaction: ModernJourneyTransactionV1,
  verification: EffectVerificationSuccessV1,
): ModernJourneyTransactionV1 {
  if (transaction.state !== "EXECUTED_UNVERIFIED") {
    throw new Error("modern_transaction_effect_state_conflict");
  }
  if (!transaction.successfulExecutionReceiptRef) {
    throw new Error("modern_transaction_success_receipt_required");
  }
  if (verification.effect.executionReceiptRef !== transaction.successfulExecutionReceiptRef) {
    throw new Error("modern_transaction_effect_execution_mismatch");
  }
  if (verification.effect.programRef !== transaction.journeyRef) {
    throw new Error("modern_transaction_effect_journey_mismatch");
  }

  return {
    ...cloneTransaction(transaction),
    state: "CLOSED",
    verifiedEffectRef: verification.effect.effectRef,
  };
}
