import type { SilkEconomicEventV1, SilkReimbursementObligationV1 } from "./confluence-reference.ts";
import type { ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import { projectModernJourneyTransactionV1 } from "./modern-journey-projection.ts";
import type {
  ModernJourneyTransactionAttemptV1,
  ModernJourneyTransactionStateV1,
  ModernJourneyTransactionV1,
} from "./modern-journey-transaction.ts";

function stringPayload(event: ModernJourneyEventRecordV1, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberPayload(event: ModernJourneyEventRecordV1, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanPayload(event: ModernJourneyEventRecordV1, key: string): boolean | undefined {
  const value = event.payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function requiredString(event: ModernJourneyEventRecordV1, key: string, code: string): string {
  const value = stringPayload(event, key);
  if (!value) throw new Error(code);
  return value;
}

function requiredNumber(event: ModernJourneyEventRecordV1, key: string, code: string): number {
  const value = numberPayload(event, key);
  if (value === undefined) throw new Error(code);
  return value;
}

function transactionStateFor(
  projectionState: ReturnType<typeof projectModernJourneyTransactionV1>["state"],
): ModernJourneyTransactionStateV1 {
  switch (projectionState) {
    case "OPEN":
      return "OPEN";
    case "RECOVERY_REQUIRED":
      return "RECOVERY_REQUIRED";
    case "BLOCKED":
      return "BLOCKED";
    case "EXECUTED_UNVERIFIED":
    case "EFFECT_VERIFIED":
      return "EXECUTED_UNVERIFIED";
    case "CLOSED":
      return "CLOSED";
  }
}

export function rehydrateModernJourneyTransactionV1(
  events: readonly ModernJourneyEventRecordV1[],
): ModernJourneyTransactionV1 {
  const projection = projectModernJourneyTransactionV1(events);
  const opened = events[0];
  if (!opened || opened.eventType !== "TRANSACTION_OPENED") {
    throw new Error("modern_rehydration_transaction_open_required");
  }

  const silkAccountRef = requiredString(
    opened,
    "silkAccountRef",
    "modern_rehydration_silk_account_required",
  );
  const economicOwnerRef = requiredString(
    opened,
    "economicOwnerRef",
    "modern_rehydration_economic_owner_required",
  );
  const amount = requiredNumber(opened, "amount", "modern_rehydration_amount_required");
  const currency = requiredString(opened, "currency", "modern_rehydration_currency_required");
  if (amount <= 0) throw new Error("modern_rehydration_amount_positive_required");

  const attempts: ModernJourneyTransactionAttemptV1[] = [];
  let successfulExecutionReceiptRef: string | undefined;
  let economicEvent: SilkEconomicEventV1 | undefined;
  let reimbursementObligation: SilkReimbursementObligationV1 | undefined;
  let personalFundingConsentRef: string | undefined;
  let verifiedEffectRef: string | undefined;

  for (const event of events.slice(1)) {
    switch (event.eventType) {
      case "PROVIDER_EXECUTION_FAILED": {
        const recoverable = booleanPayload(event, "recoverable");
        if (recoverable === undefined) throw new Error("modern_rehydration_failure_recoverable_required");
        attempts.push({
          attemptRef: requiredString(event, "attemptRef", "modern_rehydration_attempt_ref_required"),
          providerRef: requiredString(event, "providerRef", "modern_rehydration_provider_ref_required"),
          capabilityRef: requiredString(
            event,
            "capabilityRef",
            "modern_rehydration_capability_ref_required",
          ),
          status: "FAILED",
          failureClass: requiredString(
            event,
            "failureClass",
            "modern_rehydration_failure_class_required",
          ),
          recoverable,
        });
        break;
      }
      case "PROVIDER_EXECUTED_UNVERIFIED": {
        const executionReceiptRef = requiredString(
          event,
          "executionReceiptRef",
          "modern_rehydration_execution_receipt_required",
        );
        attempts.push({
          attemptRef: requiredString(event, "attemptRef", "modern_rehydration_attempt_ref_required"),
          providerRef: requiredString(event, "providerRef", "modern_rehydration_provider_ref_required"),
          capabilityRef: requiredString(
            event,
            "capabilityRef",
            "modern_rehydration_capability_ref_required",
          ),
          status: "EXECUTED_UNVERIFIED",
          executionReceiptRef,
        });
        successfulExecutionReceiptRef = executionReceiptRef;
        break;
      }
      case "ECONOMIC_EVENT_RECORDED": {
        if (economicEvent) throw new Error("modern_rehydration_duplicate_economic_event");
        economicEvent = {
          economicEventRef: requiredString(
            event,
            "economicEventRef",
            "modern_rehydration_economic_event_ref_required",
          ),
          journeyRef: projection.journeyRef,
          transactionRef: projection.transactionRef,
          silkAccountRef,
          economicOwnerRef: requiredString(
            event,
            "economicOwnerRef",
            "modern_rehydration_event_owner_required",
          ),
          actualPayerRef: requiredString(
            event,
            "actualPayerRef",
            "modern_rehydration_actual_payer_required",
          ),
          amount: requiredNumber(event, "amount", "modern_rehydration_event_amount_required"),
          currency: requiredString(
            event,
            "currency",
            "modern_rehydration_event_currency_required",
          ),
          instrumentRef: requiredString(
            event,
            "instrumentRef",
            "modern_rehydration_instrument_ref_required",
          ),
          providerRef: requiredString(
            event,
            "providerRef",
            "modern_rehydration_event_provider_required",
          ),
          occurredAt: event.occurredAt,
        };
        if (
          economicEvent.economicOwnerRef !== economicOwnerRef ||
          economicEvent.amount !== amount ||
          economicEvent.currency !== currency
        ) {
          throw new Error("modern_rehydration_economic_lineage_mismatch");
        }
        break;
      }
      case "OBLIGATION_CREATED": {
        if (reimbursementObligation) throw new Error("modern_rehydration_duplicate_obligation");
        if (!economicEvent) throw new Error("modern_rehydration_obligation_requires_economic_event");
        const type = requiredString(event, "type", "modern_rehydration_obligation_type_required");
        if (type !== "REIMBURSEMENT") throw new Error("modern_rehydration_obligation_type_unsupported");
        reimbursementObligation = {
          obligationRef: requiredString(
            event,
            "obligationRef",
            "modern_rehydration_obligation_ref_required",
          ),
          sourceEconomicEventRef: economicEvent.economicEventRef,
          journeyRef: projection.journeyRef,
          obligorRef: requiredString(
            event,
            "obligorRef",
            "modern_rehydration_obligor_required",
          ),
          beneficiaryRef: requiredString(
            event,
            "beneficiaryRef",
            "modern_rehydration_beneficiary_required",
          ),
          amount: requiredNumber(
            event,
            "amount",
            "modern_rehydration_obligation_amount_required",
          ),
          currency: requiredString(
            event,
            "currency",
            "modern_rehydration_obligation_currency_required",
          ),
          type: "REIMBURSEMENT",
          state: "OPEN",
        };
        if (
          reimbursementObligation.obligorRef !== economicOwnerRef ||
          reimbursementObligation.beneficiaryRef !== economicEvent.actualPayerRef ||
          reimbursementObligation.amount !== amount ||
          reimbursementObligation.currency !== currency
        ) {
          throw new Error("modern_rehydration_obligation_lineage_mismatch");
        }
        personalFundingConsentRef = stringPayload(event, "consentRef");
        if (!personalFundingConsentRef) {
          throw new Error("modern_rehydration_reimbursement_consent_required");
        }
        break;
      }
      case "EFFECT_VERIFIED":
        verifiedEffectRef = requiredString(
          event,
          "effectRef",
          "modern_rehydration_effect_ref_required",
        );
        break;
      default:
        break;
    }
  }

  if (projection.economicEventRecorded && !economicEvent) {
    throw new Error("modern_rehydration_economic_event_missing");
  }
  if (projection.obligationCount > 0 && !reimbursementObligation) {
    throw new Error("modern_rehydration_obligation_missing");
  }
  if (projection.obligationCount > 1) throw new Error("modern_rehydration_multiple_obligations_unsupported");
  if (projection.effectVerified && !verifiedEffectRef) {
    throw new Error("modern_rehydration_effect_missing");
  }

  return {
    transactionRef: projection.transactionRef,
    journeyRef: projection.journeyRef,
    silkAccountRef,
    economicOwnerRef,
    amount,
    currency,
    state: transactionStateFor(projection.state),
    attempts,
    successfulExecutionReceiptRef,
    personalFundingConsentRef,
    economicEvent,
    reimbursementObligation,
    verifiedEffectRef,
  };
}

export function rebuildModernJourneyRuntimeSnapshotV1(
  events: readonly ModernJourneyEventRecordV1[],
) {
  const transaction = rehydrateModernJourneyTransactionV1(events);
  const projection = projectModernJourneyTransactionV1(events);
  return {
    transaction,
    projection,
    events: events.map((event) => ({ ...event, payload: { ...event.payload } })),
  };
}