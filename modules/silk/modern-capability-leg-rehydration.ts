import type { SilkCapabilityTypeV1, SilkResourceTypeV1 } from "./confluence-reference.ts";
import {
  validateModernJourneyEventRecordV1,
  type ModernJourneyEventRecordV1,
} from "./modern-journey-event-log.ts";
import { projectModernJourneyTransactionV1 } from "./modern-journey-projection.ts";
import type {
  ModernCapabilityConsumptionV1,
  ModernCapabilityLegAttemptV1,
  ModernCapabilityLegSnapshotV1,
  ModernCapabilityLegStateV1,
  ModernCapabilityLegV1,
} from "./modern-capability-leg.ts";

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

function capabilityType(value: string): Exclude<SilkCapabilityTypeV1, "PAYMENT" | "WORKSPACE"> {
  if (value === "CONNECTIVITY" || value === "COMPUTE") return value;
  throw new Error("modern_capability_rehydration_capability_type_unsupported");
}

function resourceType(value: string): Extract<SilkResourceTypeV1, "NETWORK" | "COMPUTE"> {
  if (value === "NETWORK" || value === "COMPUTE") return value;
  throw new Error("modern_capability_rehydration_resource_type_unsupported");
}

function legStateFor(
  state: ReturnType<typeof projectModernJourneyTransactionV1>["state"],
): ModernCapabilityLegStateV1 {
  switch (state) {
    case "OPEN":
      return "OPEN";
    case "RECOVERY_REQUIRED":
      return "RECOVERY_REQUIRED";
    case "BLOCKED":
      return "BLOCKED";
    case "EXECUTED_UNVERIFIED":
      return "EXECUTED_UNVERIFIED";
    case "EFFECT_VERIFIED":
      return "EFFECT_VERIFIED";
    case "CLOSED":
      return "CLOSED";
  }
}

export function rehydrateModernCapabilityLegV1(
  events: readonly ModernJourneyEventRecordV1[],
): ModernCapabilityLegV1 {
  for (const event of events) validateModernJourneyEventRecordV1(event);
  const projection = projectModernJourneyTransactionV1(events);
  const opened = events[0];
  if (!opened || opened.eventType !== "TRANSACTION_OPENED") {
    throw new Error("modern_capability_rehydration_open_required");
  }
  if (stringPayload(opened, "kind") !== "CAPABILITY_LEG") {
    throw new Error("modern_capability_rehydration_kind_mismatch");
  }

  const resolvedCapabilityType = capabilityType(
    requiredString(
      opened,
      "capabilityType",
      "modern_capability_rehydration_capability_type_required",
    ),
  );
  const resolvedResourceType = resourceType(
    requiredString(
      opened,
      "resourceType",
      "modern_capability_rehydration_resource_type_required",
    ),
  );
  if (
    (resolvedCapabilityType === "CONNECTIVITY" && resolvedResourceType !== "NETWORK") ||
    (resolvedCapabilityType === "COMPUTE" && resolvedResourceType !== "COMPUTE")
  ) {
    throw new Error("modern_capability_rehydration_resource_type_mismatch");
  }

  const silkAccountRef = requiredString(
    opened,
    "silkAccountRef",
    "modern_capability_rehydration_account_required",
  );
  const economicOwnerRef = requiredString(
    opened,
    "economicOwnerRef",
    "modern_capability_rehydration_owner_required",
  );
  const quantity = requiredNumber(
    opened,
    "quantity",
    "modern_capability_rehydration_quantity_required",
  );
  if (quantity <= 0) throw new Error("modern_capability_rehydration_quantity_positive_required");
  const unit = requiredString(opened, "unit", "modern_capability_rehydration_unit_required");

  const attempts: ModernCapabilityLegAttemptV1[] = [];
  let successfulExecutionReceiptRef: string | undefined;
  let successfulProviderRef: string | undefined;
  let successfulCapabilityRef: string | undefined;
  let consumption: ModernCapabilityConsumptionV1 | undefined;
  let verifiedEffectRef: string | undefined;

  for (const event of events.slice(1)) {
    switch (event.eventType) {
      case "PROVIDER_EXECUTION_FAILED": {
        const recoverable = booleanPayload(event, "recoverable");
        if (recoverable === undefined) {
          throw new Error("modern_capability_rehydration_failure_recoverable_required");
        }
        attempts.push({
          attemptRef: requiredString(
            event,
            "attemptRef",
            "modern_capability_rehydration_attempt_ref_required",
          ),
          providerRef: requiredString(
            event,
            "providerRef",
            "modern_capability_rehydration_provider_ref_required",
          ),
          capabilityRef: requiredString(
            event,
            "capabilityRef",
            "modern_capability_rehydration_capability_ref_required",
          ),
          status: "FAILED",
          recoverable,
          failureClass: requiredString(
            event,
            "failureClass",
            "modern_capability_rehydration_failure_class_required",
          ),
        });
        break;
      }
      case "PROVIDER_EXECUTED_UNVERIFIED": {
        const executionReceiptRef = requiredString(
          event,
          "executionReceiptRef",
          "modern_capability_rehydration_execution_receipt_required",
        );
        successfulProviderRef = requiredString(
          event,
          "providerRef",
          "modern_capability_rehydration_provider_ref_required",
        );
        successfulCapabilityRef = requiredString(
          event,
          "capabilityRef",
          "modern_capability_rehydration_capability_ref_required",
        );
        attempts.push({
          attemptRef: requiredString(
            event,
            "attemptRef",
            "modern_capability_rehydration_attempt_ref_required",
          ),
          providerRef: successfulProviderRef,
          capabilityRef: successfulCapabilityRef,
          status: "EXECUTED_UNVERIFIED",
          executionReceiptRef,
        });
        successfulExecutionReceiptRef = executionReceiptRef;
        break;
      }
      case "RESOURCE_CONSUMED": {
        if (consumption) throw new Error("modern_capability_rehydration_duplicate_consumption");
        if (!successfulExecutionReceiptRef || !successfulProviderRef || !successfulCapabilityRef) {
          throw new Error("modern_capability_rehydration_consumption_requires_execution");
        }
        const consumptionQuantity = requiredNumber(
          event,
          "quantity",
          "modern_capability_rehydration_consumption_quantity_required",
        );
        const consumptionUnit = requiredString(
          event,
          "unit",
          "modern_capability_rehydration_consumption_unit_required",
        );
        const eventOwner = requiredString(
          event,
          "economicOwnerRef",
          "modern_capability_rehydration_consumption_owner_required",
        );
        if (
          consumptionQuantity !== quantity ||
          consumptionUnit !== unit ||
          eventOwner !== economicOwnerRef
        ) {
          throw new Error("modern_capability_rehydration_consumption_lineage_mismatch");
        }
        const monetaryValue = numberPayload(event, "monetaryValue");
        const rawMonetary = event.payload.monetaryValue;
        const rawCurrency = event.payload.currency;
        if (rawMonetary !== null && monetaryValue === undefined) {
          throw new Error("modern_capability_rehydration_invalid_monetary_value");
        }
        if (monetaryValue !== undefined && monetaryValue < 0) {
          throw new Error("modern_capability_rehydration_invalid_monetary_value");
        }
        const currency = typeof rawCurrency === "string" && rawCurrency.trim() ? rawCurrency : undefined;
        if (monetaryValue !== undefined && !currency) {
          throw new Error("modern_capability_rehydration_currency_required");
        }
        if (monetaryValue === undefined && rawCurrency !== null && rawCurrency !== undefined) {
          throw new Error("modern_capability_rehydration_unexpected_currency");
        }
        consumption = {
          consumptionRef: requiredString(
            event,
            "consumptionRef",
            "modern_capability_rehydration_consumption_ref_required",
          ),
          legRef: projection.transactionRef,
          journeyRef: projection.journeyRef,
          silkAccountRef,
          capabilityType: resolvedCapabilityType,
          providerRef: successfulProviderRef,
          capabilityRef: successfulCapabilityRef,
          resourceRef: requiredString(
            event,
            "resourceRef",
            "modern_capability_rehydration_resource_ref_required",
          ),
          resourceType: resolvedResourceType,
          resourceOwnerRef: requiredString(
            event,
            "resourceOwnerRef",
            "modern_capability_rehydration_resource_owner_required",
          ),
          economicOwnerRef,
          quantity,
          unit,
          monetaryValue,
          currency,
          occurredAt: event.occurredAt,
        };
        break;
      }
      case "EFFECT_VERIFIED":
        verifiedEffectRef = requiredString(
          event,
          "effectRef",
          "modern_capability_rehydration_effect_ref_required",
        );
        break;
      default:
        break;
    }
  }

  if (projection.consumedResourceRefs.length > 0 && !consumption) {
    throw new Error("modern_capability_rehydration_consumption_missing");
  }
  if (projection.consumedResourceRefs.length > 1) {
    throw new Error("modern_capability_rehydration_multiple_consumptions_unsupported");
  }
  if (projection.effectVerified && !verifiedEffectRef) {
    throw new Error("modern_capability_rehydration_effect_missing");
  }

  return {
    legRef: projection.transactionRef,
    journeyRef: projection.journeyRef,
    silkAccountRef,
    economicOwnerRef,
    capabilityType: resolvedCapabilityType,
    resourceType: resolvedResourceType,
    quantity,
    unit,
    state: legStateFor(projection.state),
    attempts,
    consumption,
    successfulExecutionReceiptRef,
    verifiedEffectRef,
  };
}

export function rebuildModernCapabilityLegSnapshotV1(
  events: readonly ModernJourneyEventRecordV1[],
): ModernCapabilityLegSnapshotV1 {
  const leg = rehydrateModernCapabilityLegV1(events);
  const projection = projectModernJourneyTransactionV1(events);
  return {
    leg,
    projection,
    events: events.map((event) => ({ ...event, payload: { ...event.payload } })),
  };
}