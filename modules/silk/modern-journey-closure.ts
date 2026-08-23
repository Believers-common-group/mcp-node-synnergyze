import { createHash } from "node:crypto";

import type { ModernJourneyDurableEventStoreV1 } from "./durable-modern-journey-runtime.ts";
import {
  ModernJourneyEventLogV1,
  validateModernJourneyEventRecordV1,
  type ModernJourneyEventRecordV1,
} from "./modern-journey-event-log.ts";
import type { ModernJourneyConfluenceV1, ModernWorkReceiptV1 } from "./modern-journey-confluence.ts";
import { validateModernWorkReceiptV1 } from "./modern-work-receipt.ts";

export interface ModernJourneyClosureV1 {
  closureRef: string;
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  finalEffectRef: string;
  workReceipt: ModernWorkReceiptV1;
  events: readonly ModernJourneyEventRecordV1[];
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function modernJourneyClosureRefV1(journeyRef: string): string {
  if (!journeyRef.trim()) throw new Error("modern_journey_closure_journey_ref_required");
  return `MODERN-JOURNEY-CLOSURE:${digest(journeyRef).slice(0, 24)}`;
}

function stringPayload(event: ModernJourneyEventRecordV1, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredString(event: ModernJourneyEventRecordV1, key: string, code: string): string {
  const value = stringPayload(event, key);
  if (!value) throw new Error(code);
  return value;
}

function workReceiptPayload(event: ModernJourneyEventRecordV1): ModernWorkReceiptV1 {
  const raw = event.payload.workReceipt;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("modern_journey_closure_work_receipt_required");
  }
  const receipt = raw as ModernWorkReceiptV1;
  validateModernWorkReceiptV1(receipt);
  return receipt;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("modern_journey_closure_non_serializable_value");
  return encoded;
}

function assertReceiptMatchesConfluence(confluence: ModernJourneyConfluenceV1): void {
  const receipt = confluence.workReceipt;
  if (!receipt) throw new Error("modern_journey_closure_work_receipt_required");
  const requiredLegTypes = [...confluence.requiredLegTypes].sort();
  if (canonicalJson([...receipt.requiredLegTypes].sort()) !== canonicalJson(requiredLegTypes)) {
    throw new Error("modern_journey_closure_receipt_required_legs_mismatch");
  }

  const legRefs = [...confluence.legs.map((leg) => leg.legRef)].sort();
  if (canonicalJson([...receipt.legRefs].sort()) !== canonicalJson(legRefs)) {
    throw new Error("modern_journey_closure_receipt_legs_mismatch");
  }

  const providerRefs = [...new Set(confluence.legs.flatMap((leg) => [...leg.providerRefs]))].sort();
  if (canonicalJson([...receipt.providerRefs].sort()) !== canonicalJson(providerRefs)) {
    throw new Error("modern_journey_closure_receipt_providers_mismatch");
  }

  const failureCount = confluence.legs.reduce((total, leg) => total + leg.failureCount, 0);
  if (receipt.failureCount !== failureCount) {
    throw new Error("modern_journey_closure_receipt_failure_count_mismatch");
  }

  const outstandingObligationCount = confluence.legs.reduce(
    (total, leg) => total + leg.outstandingObligationCount,
    0,
  );
  if (receipt.outstandingObligationCount !== outstandingObligationCount) {
    throw new Error("modern_journey_closure_receipt_obligation_count_mismatch");
  }

  const monetaryTotals = new Map<string, number>();
  for (const leg of confluence.legs) {
    if (leg.monetaryValue === undefined) {
      if (leg.currency !== undefined) throw new Error("modern_journey_closure_currency_without_value");
      continue;
    }
    if (!leg.currency?.trim()) throw new Error("modern_journey_closure_currency_required");
    monetaryTotals.set(leg.currency, (monetaryTotals.get(leg.currency) ?? 0) + leg.monetaryValue);
  }
  const expectedMonetaryTotals = [...monetaryTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amount }));
  const actualMonetaryTotals = [...receipt.monetaryTotals]
    .map((value) => ({ ...value }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  if (canonicalJson(actualMonetaryTotals) !== canonicalJson(expectedMonetaryTotals)) {
    throw new Error("modern_journey_closure_receipt_monetary_totals_mismatch");
  }

  const expectedNativeConsumptions = confluence.legs
    .map((leg) => leg.nativeConsumption)
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .map((value) => ({ ...value }))
    .sort((left, right) => left.legRef.localeCompare(right.legRef));
  const actualNativeConsumptions = [...receipt.nativeConsumptions]
    .map((value) => ({ ...value }))
    .sort((left, right) => left.legRef.localeCompare(right.legRef));
  if (canonicalJson(actualNativeConsumptions) !== canonicalJson(expectedNativeConsumptions)) {
    throw new Error("modern_journey_closure_receipt_native_consumptions_mismatch");
  }
}

function assertClosureStream(events: readonly ModernJourneyEventRecordV1[]): void {
  if (events.length !== 3) throw new Error("modern_journey_closure_three_events_required");
  const [opened, effect, closed] = events;
  if (!opened || opened.eventType !== "TRANSACTION_OPENED") {
    throw new Error("modern_journey_closure_open_event_required");
  }
  if (!effect || effect.eventType !== "EFFECT_VERIFIED") {
    throw new Error("modern_journey_closure_effect_event_required");
  }
  if (!closed || closed.eventType !== "TRANSACTION_CLOSED") {
    throw new Error("modern_journey_closure_close_event_required");
  }
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) throw new Error("modern_journey_closure_event_missing");
    validateModernJourneyEventRecordV1(event);
    if (event.sequence !== index + 1) throw new Error("modern_journey_closure_sequence_gap");
    if (event.transactionRef !== opened.transactionRef) {
      throw new Error("modern_journey_closure_transaction_lineage_mismatch");
    }
    if (event.journeyRef !== opened.journeyRef) {
      throw new Error("modern_journey_closure_journey_lineage_mismatch");
    }
    if (event.correlationId !== opened.transactionRef) {
      throw new Error("modern_journey_closure_correlation_mismatch");
    }
    if (index === 0) {
      if (event.predecessorEventRef) {
        throw new Error("modern_journey_closure_root_predecessor_forbidden");
      }
    } else if (event.predecessorEventRef !== events[index - 1]?.eventRef) {
      throw new Error("modern_journey_closure_predecessor_mismatch");
    }
  }
}

export function buildModernJourneyClosureEventsV1(input: {
  confluence: ModernJourneyConfluenceV1;
  actorRef: string;
}): readonly ModernJourneyEventRecordV1[] {
  const { confluence } = input;
  if (confluence.state !== "CLOSED") {
    throw new Error("modern_journey_closure_closed_confluence_required");
  }
  if (!confluence.finalEffectRef) throw new Error("modern_journey_closure_final_effect_required");
  if (!confluence.workReceipt) throw new Error("modern_journey_closure_work_receipt_required");
  if (!input.actorRef.trim()) throw new Error("modern_journey_closure_actor_ref_required");
  validateModernWorkReceiptV1(confluence.workReceipt);
  if (confluence.workReceipt.journeyRef !== confluence.journeyRef) {
    throw new Error("modern_journey_closure_receipt_journey_mismatch");
  }
  if (confluence.workReceipt.objectiveRef !== confluence.objectiveRef) {
    throw new Error("modern_journey_closure_receipt_objective_mismatch");
  }
  if (confluence.workReceipt.digitalMeRef !== confluence.digitalMeRef) {
    throw new Error("modern_journey_closure_receipt_digital_me_mismatch");
  }
  if (confluence.workReceipt.silkAccountRef !== confluence.silkAccountRef) {
    throw new Error("modern_journey_closure_receipt_silk_account_mismatch");
  }
  if (confluence.workReceipt.economicOwnerRef !== confluence.economicOwnerRef) {
    throw new Error("modern_journey_closure_receipt_owner_mismatch");
  }
  if (confluence.workReceipt.finalEffectRef !== confluence.finalEffectRef) {
    throw new Error("modern_journey_closure_receipt_effect_mismatch");
  }
  assertReceiptMatchesConfluence(confluence);

  const legRefs = [...confluence.legs.map((leg) => leg.legRef)].sort();
  const closureRef = modernJourneyClosureRefV1(confluence.journeyRef);
  const occurredAt = confluence.workReceipt.completedAt;
  const log = new ModernJourneyEventLogV1();
  log.append({
    idempotencyKey: `${closureRef}:OPEN`,
    transactionRef: closureRef,
    journeyRef: confluence.journeyRef,
    actorRef: input.actorRef,
    eventType: "TRANSACTION_OPENED",
    occurredAt,
    payload: {
      kind: "JOURNEY_CONFLUENCE_CLOSURE",
      objectiveRef: confluence.objectiveRef,
      digitalMeRef: confluence.digitalMeRef,
      silkAccountRef: confluence.silkAccountRef,
      economicOwnerRef: confluence.economicOwnerRef,
      requiredLegTypes: [...confluence.requiredLegTypes],
      legRefs,
    },
  });
  log.append({
    idempotencyKey: `${closureRef}:${confluence.finalEffectRef}:VERIFIED`,
    transactionRef: closureRef,
    journeyRef: confluence.journeyRef,
    actorRef: input.actorRef,
    eventType: "EFFECT_VERIFIED",
    occurredAt,
    payload: {
      effectRef: confluence.finalEffectRef,
      observedStateRef: confluence.workReceipt.finalEffectObservedStateRef,
    },
  });
  log.append({
    idempotencyKey: `${closureRef}:${confluence.workReceipt.receiptRef}:CLOSED`,
    transactionRef: closureRef,
    journeyRef: confluence.journeyRef,
    actorRef: input.actorRef,
    eventType: "TRANSACTION_CLOSED",
    occurredAt,
    payload: {
      kind: "JOURNEY_CONFLUENCE_CLOSURE",
      workReceiptRef: confluence.workReceipt.receiptRef,
      workReceipt: confluence.workReceipt,
    },
  });
  const events = log.stream(closureRef);
  assertClosureStream(events);
  return events;
}

export function rehydrateModernJourneyClosureV1(
  events: readonly ModernJourneyEventRecordV1[],
): ModernJourneyClosureV1 {
  assertClosureStream(events);
  const opened = events[0];
  const effectEvent = events[1];
  const closed = events[2];
  if (!opened || !effectEvent || !closed) {
    throw new Error("modern_journey_closure_event_missing");
  }
  if (stringPayload(opened, "kind") !== "JOURNEY_CONFLUENCE_CLOSURE") {
    throw new Error("modern_journey_closure_kind_mismatch");
  }
  if (stringPayload(closed, "kind") !== "JOURNEY_CONFLUENCE_CLOSURE") {
    throw new Error("modern_journey_closure_close_kind_mismatch");
  }
  const finalEffectRef = requiredString(
    effectEvent,
    "effectRef",
    "modern_journey_closure_effect_ref_required",
  );
  const workReceipt = workReceiptPayload(closed);
  if (
    requiredString(closed, "workReceiptRef", "modern_journey_closure_receipt_ref_required") !==
    workReceipt.receiptRef
  ) {
    throw new Error("modern_journey_closure_receipt_ref_mismatch");
  }
  if (workReceipt.journeyRef !== opened.journeyRef) {
    throw new Error("modern_journey_closure_receipt_journey_mismatch");
  }
  if (workReceipt.finalEffectRef !== finalEffectRef) {
    throw new Error("modern_journey_closure_receipt_effect_mismatch");
  }
  if (
    workReceipt.finalEffectObservedStateRef !== stringPayload(effectEvent, "observedStateRef")
  ) {
    throw new Error("modern_journey_closure_observed_state_mismatch");
  }

  return {
    closureRef: opened.transactionRef,
    journeyRef: opened.journeyRef,
    objectiveRef: requiredString(
      opened,
      "objectiveRef",
      "modern_journey_closure_objective_ref_required",
    ),
    digitalMeRef: requiredString(
      opened,
      "digitalMeRef",
      "modern_journey_closure_digital_me_ref_required",
    ),
    silkAccountRef: requiredString(
      opened,
      "silkAccountRef",
      "modern_journey_closure_silk_account_ref_required",
    ),
    economicOwnerRef: requiredString(
      opened,
      "economicOwnerRef",
      "modern_journey_closure_owner_ref_required",
    ),
    finalEffectRef,
    workReceipt,
    events: events.map((event) => ({ ...event, payload: { ...event.payload } })),
  };
}

export async function persistModernJourneyClosureV1(input: {
  store: ModernJourneyDurableEventStoreV1;
  confluence: ModernJourneyConfluenceV1;
  actorRef: string;
  recordedAt: string;
}): Promise<ModernJourneyClosureV1> {
  if (!Number.isFinite(Date.parse(input.recordedAt))) {
    throw new Error("modern_journey_closure_invalid_recorded_at");
  }
  const events = buildModernJourneyClosureEventsV1({
    confluence: input.confluence,
    actorRef: input.actorRef,
  });
  try {
    for (const event of events) {
      const result = await input.store.put(event, input.recordedAt);
      if (result.state === "CONFLICT") {
        throw new Error("modern_journey_closure_persistence_conflict");
      }
      if (!result.record || result.record.eventRef !== event.eventRef) {
        throw new Error("modern_journey_closure_persistence_receipt_mismatch");
      }
      validateModernJourneyEventRecordV1(result.record);
    }
  } catch (cause) {
    throw new Error("modern_journey_closure_reconstruction_required", { cause });
  }
  return rehydrateModernJourneyClosureV1(events);
}

export async function loadModernJourneyClosureV1(input: {
  store: ModernJourneyDurableEventStoreV1;
  journeyRef: string;
}): Promise<ModernJourneyClosureV1> {
  const closureRef = modernJourneyClosureRefV1(input.journeyRef);
  const events = await input.store.load(closureRef);
  if (events.length === 0) throw new Error("modern_journey_closure_not_found");
  return rehydrateModernJourneyClosureV1(events);
}