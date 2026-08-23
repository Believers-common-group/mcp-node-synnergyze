import type { ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";

export type ModernJourneyProjectionStateV1 =
  | "OPEN"
  | "RECOVERY_REQUIRED"
  | "EXECUTED_UNVERIFIED"
  | "EFFECT_VERIFIED"
  | "CLOSED";

export interface ModernJourneyTransactionProjectionV1 {
  transactionRef: string;
  journeyRef: string;
  state: ModernJourneyProjectionStateV1;
  sequence: number;
  lastEventRef: string;
  failedProviderCount: number;
  currentProviderRef?: string;
  activeResourceRefs: readonly string[];
  consumedResourceRefs: readonly string[];
  economicEventRecorded: boolean;
  obligationCount: number;
  effectVerified: boolean;
}

function stringPayload(event: ModernJourneyEventRecordV1, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function assertStreamLineage(events: readonly ModernJourneyEventRecordV1[]): void {
  if (!events.length) throw new Error("modern_projection_event_stream_required");
  const transactionRef = events[0]?.transactionRef;
  const journeyRef = events[0]?.journeyRef;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) throw new Error("modern_projection_event_missing");
    if (event.sequence !== index + 1) throw new Error("modern_projection_sequence_gap");
    if (event.transactionRef !== transactionRef || event.correlationId !== transactionRef) {
      throw new Error("modern_projection_transaction_lineage_mismatch");
    }
    if (event.journeyRef !== journeyRef) throw new Error("modern_projection_journey_lineage_mismatch");
    const previous = events[index - 1];
    if (index === 0) {
      if (event.predecessorEventRef) throw new Error("modern_projection_root_predecessor_forbidden");
    } else if (event.predecessorEventRef !== previous?.eventRef) {
      throw new Error("modern_projection_predecessor_mismatch");
    }
  }
}

export function projectModernJourneyTransactionV1(
  events: readonly ModernJourneyEventRecordV1[],
): ModernJourneyTransactionProjectionV1 {
  assertStreamLineage(events);
  const first = events[0];
  if (!first || first.eventType !== "TRANSACTION_OPENED") {
    throw new Error("modern_projection_transaction_open_required");
  }

  let state: ModernJourneyProjectionStateV1 = "OPEN";
  let failedProviderCount = 0;
  let currentProviderRef: string | undefined;
  const activeResources = new Set<string>();
  const consumedResources = new Set<string>();
  let economicEventRecorded = false;
  let obligationCount = 0;
  let effectVerified = false;

  for (const event of events.slice(1)) {
    switch (event.eventType) {
      case "TRANSACTION_OPENED":
        throw new Error("modern_projection_duplicate_open");
      case "RESOURCE_RESERVED":
      case "FALLBACK_RESOURCE_RESERVED": {
        if (state === "CLOSED") throw new Error("modern_projection_event_after_close");
        const resourceRef = stringPayload(event, "resourceRef");
        if (!resourceRef) throw new Error("modern_projection_resource_ref_required");
        if (activeResources.has(resourceRef) || consumedResources.has(resourceRef)) {
          throw new Error("modern_projection_resource_duplicate_reservation");
        }
        activeResources.add(resourceRef);
        break;
      }
      case "PROVIDER_EXECUTION_FAILED":
        if (state !== "OPEN" && state !== "RECOVERY_REQUIRED") {
          throw new Error("modern_projection_provider_failure_state_conflict");
        }
        failedProviderCount += 1;
        currentProviderRef = undefined;
        state = "RECOVERY_REQUIRED";
        break;
      case "RESOURCE_RELEASED": {
        if (state !== "RECOVERY_REQUIRED") {
          throw new Error("modern_projection_release_state_conflict");
        }
        const resourceRef = stringPayload(event, "resourceRef");
        if (!resourceRef || !activeResources.has(resourceRef)) {
          throw new Error("modern_projection_release_resource_mismatch");
        }
        activeResources.delete(resourceRef);
        break;
      }
      case "FALLBACK_AUTHORIZED":
        if (state !== "RECOVERY_REQUIRED") {
          throw new Error("modern_projection_fallback_authority_state_conflict");
        }
        break;
      case "PROVIDER_EXECUTED_UNVERIFIED": {
        if (state !== "OPEN" && state !== "RECOVERY_REQUIRED") {
          throw new Error("modern_projection_execution_state_conflict");
        }
        const providerRef = stringPayload(event, "providerRef");
        if (!providerRef) throw new Error("modern_projection_provider_ref_required");
        currentProviderRef = providerRef;
        state = "EXECUTED_UNVERIFIED";
        break;
      }
      case "RESOURCE_CONSUMED": {
        if (state !== "EXECUTED_UNVERIFIED") {
          throw new Error("modern_projection_consumption_state_conflict");
        }
        const resourceRef = stringPayload(event, "resourceRef");
        if (!resourceRef || !activeResources.has(resourceRef)) {
          throw new Error("modern_projection_consumption_resource_mismatch");
        }
        activeResources.delete(resourceRef);
        consumedResources.add(resourceRef);
        break;
      }
      case "ECONOMIC_EVENT_RECORDED":
        if (state !== "EXECUTED_UNVERIFIED") {
          throw new Error("modern_projection_economic_event_state_conflict");
        }
        economicEventRecorded = true;
        break;
      case "OBLIGATION_CREATED":
        if (state !== "EXECUTED_UNVERIFIED") {
          throw new Error("modern_projection_obligation_state_conflict");
        }
        obligationCount += 1;
        break;
      case "EFFECT_VERIFIED":
        if (state !== "EXECUTED_UNVERIFIED") {
          throw new Error("modern_projection_effect_state_conflict");
        }
        effectVerified = true;
        state = "EFFECT_VERIFIED";
        break;
      case "TRANSACTION_CLOSED":
        if (state !== "EFFECT_VERIFIED" || !effectVerified) {
          throw new Error("modern_projection_close_requires_verified_effect");
        }
        if (activeResources.size > 0) {
          throw new Error("modern_projection_close_with_active_resource");
        }
        state = "CLOSED";
        break;
    }
  }

  const latest = events.at(-1);
  if (!latest) throw new Error("modern_projection_latest_event_required");
  return {
    transactionRef: first.transactionRef,
    journeyRef: first.journeyRef,
    state,
    sequence: latest.sequence,
    lastEventRef: latest.eventRef,
    failedProviderCount,
    currentProviderRef,
    activeResourceRefs: [...activeResources].sort(),
    consumedResourceRefs: [...consumedResources].sort(),
    economicEventRecorded,
    obligationCount,
    effectVerified,
  };
}
