import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type { EffectVerificationSuccessV1 } from "../synnergyze/effect-verification.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  NormalizedConfluenceProviderFailureV1,
  SilkEconomicEventV1,
  SilkResourceReservationV1,
} from "./confluence-reference.ts";
import { ModernJourneyEventLogV1, type ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import {
  projectModernJourneyTransactionV1,
  type ModernJourneyTransactionProjectionV1,
} from "./modern-journey-projection.ts";
import {
  closeModernJourneyTransactionV1,
  createModernJourneyTransactionV1,
  recordModernProviderExecutionV1,
  recordModernProviderFailureV1,
  type CreateModernJourneyTransactionInputV1,
  type ModernJourneyTransactionV1,
  type PersonalFundingFallbackConsentV1,
} from "./modern-journey-transaction.ts";

export interface ModernJourneyRuntimeSnapshotV1 {
  transaction: ModernJourneyTransactionV1;
  projection: ModernJourneyTransactionProjectionV1;
  events: readonly ModernJourneyEventRecordV1[];
}

function cloneTransaction(transaction: ModernJourneyTransactionV1): ModernJourneyTransactionV1 {
  return {
    ...transaction,
    attempts: transaction.attempts.map((attempt) => ({ ...attempt })),
    economicEvent: transaction.economicEvent ? { ...transaction.economicEvent } : undefined,
    reimbursementObligation: transaction.reimbursementObligation
      ? { ...transaction.reimbursementObligation }
      : undefined,
  };
}

function assertInstant(value: string, code: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(code);
}

export class SyntheticModernJourneyTransactionRuntimeV1 {
  private readonly transactions = new Map<string, ModernJourneyTransactionV1>();
  private readonly eventLog = new ModernJourneyEventLogV1();

  open(input: CreateModernJourneyTransactionInputV1 & { actorRef: string; openedAt: string }): ModernJourneyRuntimeSnapshotV1 {
    if (this.transactions.has(input.transactionRef)) throw new Error("modern_runtime_transaction_exists");
    if (!input.actorRef.trim()) throw new Error("modern_runtime_actor_ref_required");
    assertInstant(input.openedAt, "modern_runtime_invalid_open_time");
    const transaction = createModernJourneyTransactionV1(input);
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:TRANSACTION_OPENED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "TRANSACTION_OPENED",
      occurredAt: input.openedAt,
      payload: {
        silkAccountRef: transaction.silkAccountRef,
        economicOwnerRef: transaction.economicOwnerRef,
        amount: transaction.amount,
        currency: transaction.currency,
      },
    });
    this.transactions.set(transaction.transactionRef, transaction);
    return this.snapshot(transaction.transactionRef);
  }

  recordReservation(input: {
    transactionRef: string;
    reservation: SilkResourceReservationV1;
    actorRef: string;
    occurredAt: string;
    fallback: boolean;
  }): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(input.transactionRef);
    if (input.reservation.state !== "RESERVED") throw new Error("modern_runtime_reserved_resource_required");
    this.assertReservationLineage(transaction, input.reservation);
    if (!input.fallback && transaction.state !== "OPEN") {
      throw new Error("modern_runtime_primary_reservation_state_conflict");
    }
    if (input.fallback && transaction.state !== "RECOVERY_REQUIRED") {
      throw new Error("modern_runtime_fallback_reservation_state_conflict");
    }
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.reservation.reservationRef}:RESERVED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: input.fallback ? "FALLBACK_RESOURCE_RESERVED" : "RESOURCE_RESERVED",
      occurredAt: input.occurredAt,
      payload: {
        reservationRef: input.reservation.reservationRef,
        resourceRef: input.reservation.resourceRef,
        resourceType: input.reservation.resourceType,
        quantity: input.reservation.quantity,
        unit: input.reservation.unit,
        wardenDecisionRef: input.reservation.wardenDecisionRef,
      },
    });
    return this.snapshot(transaction.transactionRef);
  }

  recordProviderFailure(input: {
    transactionRef: string;
    attemptRef: string;
    providerRef: string;
    capabilityRef: string;
    failure: NormalizedConfluenceProviderFailureV1;
    actorRef: string;
    occurredAt: string;
  }): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(input.transactionRef);
    const updated = recordModernProviderFailureV1(transaction, {
      attemptRef: input.attemptRef,
      providerRef: input.providerRef,
      capabilityRef: input.capabilityRef,
      failure: input.failure,
    });
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.attemptRef}:FAILED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "PROVIDER_EXECUTION_FAILED",
      occurredAt: input.occurredAt,
      payload: {
        attemptRef: input.attemptRef,
        providerRef: input.providerRef,
        capabilityRef: input.capabilityRef,
        failureClass: input.failure.failureClass,
        recoverable: input.failure.recoverable,
      },
    });
    this.transactions.set(transaction.transactionRef, updated);
    return this.snapshot(transaction.transactionRef);
  }

  recordRelease(input: {
    transactionRef: string;
    reservation: SilkResourceReservationV1;
    actorRef: string;
    occurredAt: string;
  }): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(input.transactionRef);
    if (transaction.state !== "RECOVERY_REQUIRED") throw new Error("modern_runtime_release_state_conflict");
    if (input.reservation.state !== "RELEASED") throw new Error("modern_runtime_released_resource_required");
    this.assertReservationLineage(transaction, input.reservation);
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.reservation.reservationRef}:RELEASED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "RESOURCE_RELEASED",
      occurredAt: input.occurredAt,
      payload: {
        reservationRef: input.reservation.reservationRef,
        resourceRef: input.reservation.resourceRef,
      },
    });
    return this.snapshot(transaction.transactionRef);
  }

  authorizeFallback(input: {
    transactionRef: string;
    decision: WardenDecisionV1;
    providerRef: string;
    capabilityRef: string;
    actorRef: string;
    authorizedAt: string;
    personalFundingConsent?: PersonalFundingFallbackConsentV1;
  }): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(input.transactionRef);
    if (transaction.state !== "RECOVERY_REQUIRED") {
      throw new Error("modern_runtime_fallback_authorization_state_conflict");
    }
    if (input.decision.decision !== "ALLOW") throw new Error("modern_runtime_fallback_warden_allow_required");
    if (input.decision.action !== input.capabilityRef) {
      throw new Error("modern_runtime_fallback_capability_mismatch");
    }
    if (input.personalFundingConsent) {
      if (input.personalFundingConsent.transactionRef !== transaction.transactionRef) {
        throw new Error("modern_runtime_fallback_consent_transaction_mismatch");
      }
      if (input.personalFundingConsent.wardenDecisionRef !== input.decision.decisionRef) {
        throw new Error("modern_runtime_fallback_consent_decision_mismatch");
      }
    }
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.decision.decisionRef}:FALLBACK_AUTHORIZED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "FALLBACK_AUTHORIZED",
      occurredAt: input.authorizedAt,
      payload: {
        wardenDecisionRef: input.decision.decisionRef,
        providerRef: input.providerRef,
        capabilityRef: input.capabilityRef,
        consentRef: input.personalFundingConsent?.consentRef ?? null,
      },
    });
    return this.snapshot(transaction.transactionRef);
  }

  recordProviderExecution(input: {
    transactionRef: string;
    attemptRef: string;
    providerRef: string;
    receipt: SynnergyzeExecutionReceiptV1;
    consumedReservation: SilkResourceReservationV1;
    economicEvent: SilkEconomicEventV1;
    personalFundingConsent?: PersonalFundingFallbackConsentV1;
    actorRef: string;
    occurredAt: string;
  }): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(input.transactionRef);
    if (input.consumedReservation.state !== "CONSUMED") {
      throw new Error("modern_runtime_consumed_resource_required");
    }
    this.assertReservationLineage(transaction, input.consumedReservation);
    if (input.consumedReservation.wardenDecisionRef !== input.receipt.wardenDecisionRef) {
      throw new Error("modern_runtime_consumed_resource_decision_mismatch");
    }
    const updated = recordModernProviderExecutionV1(transaction, {
      attemptRef: input.attemptRef,
      providerRef: input.providerRef,
      receipt: input.receipt,
      economicEvent: input.economicEvent,
      personalFundingConsent: input.personalFundingConsent,
    });

    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.attemptRef}:EXECUTED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "PROVIDER_EXECUTED_UNVERIFIED",
      occurredAt: input.occurredAt,
      payload: {
        attemptRef: input.attemptRef,
        providerRef: input.providerRef,
        capabilityRef: input.receipt.capabilityRef,
        executionReceiptRef: input.receipt.receiptRef,
        wardenDecisionRef: input.receipt.wardenDecisionRef,
      },
    });
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.consumedReservation.reservationRef}:CONSUMED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "RESOURCE_CONSUMED",
      occurredAt: input.occurredAt,
      payload: {
        reservationRef: input.consumedReservation.reservationRef,
        resourceRef: input.consumedReservation.resourceRef,
      },
    });
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.economicEvent.economicEventRef}:ECONOMIC_EVENT`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "ECONOMIC_EVENT_RECORDED",
      occurredAt: input.occurredAt,
      payload: {
        economicEventRef: input.economicEvent.economicEventRef,
        economicOwnerRef: input.economicEvent.economicOwnerRef,
        actualPayerRef: input.economicEvent.actualPayerRef,
        amount: input.economicEvent.amount,
        currency: input.economicEvent.currency,
      },
    });
    if (updated.reimbursementObligation) {
      this.eventLog.append({
        idempotencyKey: `${transaction.transactionRef}:${updated.reimbursementObligation.obligationRef}:OBLIGATION`,
        transactionRef: transaction.transactionRef,
        journeyRef: transaction.journeyRef,
        actorRef: input.actorRef,
        eventType: "OBLIGATION_CREATED",
        occurredAt: input.occurredAt,
        payload: {
          obligationRef: updated.reimbursementObligation.obligationRef,
          type: updated.reimbursementObligation.type,
          obligorRef: updated.reimbursementObligation.obligorRef,
          beneficiaryRef: updated.reimbursementObligation.beneficiaryRef,
          amount: updated.reimbursementObligation.amount,
          currency: updated.reimbursementObligation.currency,
          consentRef: updated.personalFundingConsentRef ?? null,
        },
      });
    }
    this.transactions.set(transaction.transactionRef, updated);
    return this.snapshot(transaction.transactionRef);
  }

  verifyAndClose(input: {
    transactionRef: string;
    verification: EffectVerificationSuccessV1;
    actorRef: string;
    verifiedAt: string;
    closedAt: string;
  }): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(input.transactionRef);
    const before = this.snapshot(transaction.transactionRef).projection;
    if (before.activeResourceRefs.length > 0) {
      throw new Error("modern_runtime_close_with_active_resource");
    }
    const closed = closeModernJourneyTransactionV1(transaction, input.verification);
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:${input.verification.effect.effectRef}:VERIFIED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "EFFECT_VERIFIED",
      occurredAt: input.verifiedAt,
      payload: {
        effectRef: input.verification.effect.effectRef,
        executionReceiptRef: input.verification.effect.executionReceiptRef,
        observedStateRef: input.verification.effect.observedStateRef,
      },
    });
    this.eventLog.append({
      idempotencyKey: `${transaction.transactionRef}:TRANSACTION_CLOSED`,
      transactionRef: transaction.transactionRef,
      journeyRef: transaction.journeyRef,
      actorRef: input.actorRef,
      eventType: "TRANSACTION_CLOSED",
      occurredAt: input.closedAt,
      payload: {
        state: "CLOSED",
        effectRef: input.verification.effect.effectRef,
      },
    });
    this.transactions.set(transaction.transactionRef, closed);
    return this.snapshot(transaction.transactionRef);
  }

  snapshot(transactionRef: string): ModernJourneyRuntimeSnapshotV1 {
    const transaction = this.requireTransaction(transactionRef);
    const events = this.eventLog.stream(transactionRef);
    return {
      transaction: cloneTransaction(transaction),
      projection: projectModernJourneyTransactionV1(events),
      events,
    };
  }

  private requireTransaction(transactionRef: string): ModernJourneyTransactionV1 {
    const transaction = this.transactions.get(transactionRef);
    if (!transaction) throw new Error("modern_runtime_transaction_not_found");
    return transaction;
  }

  private assertReservationLineage(
    transaction: ModernJourneyTransactionV1,
    reservation: SilkResourceReservationV1,
  ): void {
    if (reservation.journeyRef !== transaction.journeyRef) {
      throw new Error("modern_runtime_reservation_journey_mismatch");
    }
    if (reservation.silkAccountRef !== transaction.silkAccountRef) {
      throw new Error("modern_runtime_reservation_account_mismatch");
    }
    if (reservation.quantity !== transaction.amount || reservation.unit !== transaction.currency) {
      throw new Error("modern_runtime_reservation_value_mismatch");
    }
  }
}
