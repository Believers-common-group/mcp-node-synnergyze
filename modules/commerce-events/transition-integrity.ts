import type {
  CommerceEventObservationV1,
  CommerceEventTypeV1,
  CommerceTransitionResultV1,
} from "./contracts.ts";

export const COMMERCE_REQUIRED_PREDECESSORS_V1: Partial<
  Record<CommerceEventTypeV1, readonly CommerceEventTypeV1[]>
> = Object.freeze({
  inventory_reserved: ["order_created"],
  pick_task_created: ["inventory_reserved"],
  picked: ["pick_task_created"],
  item_packed: ["pick_task_created"],
  dispatch_bin_scanned: ["item_packed"],
  awb_created: ["item_packed"],
  shipment_dispatched: ["item_packed"],
  shipment_in_transit: ["shipment_dispatched"],
  shipment_delivered: ["shipment_dispatched"],
  customer_collection_ready: ["pick_task_created"],
  customer_collected: ["customer_collection_ready"],
  return_qc_done: ["return_created"],
  refund_created: ["return_qc_done"],
  credit_note_created: ["return_created"],
  tax_adjustment_posted: ["credit_note_created"],
});

function result(
  observation: CommerceEventObservationV1,
  state: CommerceTransitionResultV1["state"],
  reasonCodes: readonly string[],
  satisfiedPredecessorEventRefs: readonly string[],
): CommerceTransitionResultV1 {
  return {
    state,
    observationRef: observation.eventRef,
    reasonCodes: [...reasonCodes],
    satisfiedPredecessorEventRefs: [...satisfiedPredecessorEventRefs],
  };
}

export function evaluateCommerceTransitionV1(
  observation: CommerceEventObservationV1,
  prior: readonly CommerceEventObservationV1[],
): CommerceTransitionResultV1 {
  if (observation.predecessorEventRefs.includes(observation.eventRef)) {
    return result(observation, "REJECTED", ["SELF_PREDECESSOR_FORBIDDEN"], []);
  }
  if (prior.some((candidate) => candidate.eventRef === observation.eventRef)) {
    return result(observation, "REJECTED", ["DUPLICATE_EVENT_REF_CONFLICT"], []);
  }

  const currentOrderRef = observation.admittedFields.orderRef;
  if (currentOrderRef !== undefined && currentOrderRef !== observation.correlationId) {
    return result(observation, "REJECTED", ["CORRELATION_MISMATCH"], []);
  }

  const required = COMMERCE_REQUIRED_PREDECESSORS_V1[observation.eventType] ?? [];
  if (required.length === 0) return result(observation, "ADMITTED", [], []);

  const satisfied: string[] = [];
  const reasons: string[] = [];

  for (const requiredType of required) {
    const candidate = prior.find((entry) => {
      if (entry.eventType !== requiredType) return false;
      if (entry.correlationId !== observation.correlationId) return false;
      const candidateOrderRef = entry.admittedFields.orderRef;
      return candidateOrderRef === undefined || candidateOrderRef === observation.correlationId;
    });

    if (!candidate) {
      reasons.push(`PREDECESSOR_REQUIRED:${requiredType}`);
      continue;
    }

    if (
      observation.predecessorEventRefs.length > 0 &&
      !observation.predecessorEventRefs.includes(candidate.eventRef)
    ) {
      reasons.push(`PREDECESSOR_MISMATCH:${requiredType}`);
      continue;
    }

    satisfied.push(candidate.eventRef);
  }

  if (reasons.length > 0) {
    return result(observation, "RECONCILIATION_REQUIRED", reasons, satisfied);
  }
  return result(observation, "ADMITTED", [], satisfied);
}
