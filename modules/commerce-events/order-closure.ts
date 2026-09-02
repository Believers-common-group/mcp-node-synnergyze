import { createHash } from "node:crypto";
import type {
  CommerceEventObservationV1,
  OrderClosureProfileV1,
} from "./contracts.ts";

export const COURIER_DELIVERY_CLOSURE_PROFILE_V1: OrderClosureProfileV1 = Object.freeze({
  profileRef: "ORDER-CLOSURE:COURIER:V1",
  kind: "COURIER_DELIVERY",
  requiredEventTypes: ["order_created", "shipment_delivered", "invoice_created"] as const,
  version: 1,
  status: "ACTIVE",
});

export const STORE_PICKUP_CLOSURE_PROFILE_V1: OrderClosureProfileV1 = Object.freeze({
  profileRef: "ORDER-CLOSURE:PICKUP:V1",
  kind: "STORE_PICKUP",
  requiredEventTypes: ["order_created", "customer_collected", "invoice_created"] as const,
  version: 1,
  status: "ACTIVE",
});

function closureEventRef(
  profile: OrderClosureProfileV1,
  orderRef: string,
  predecessorEventRefs: readonly string[],
): string {
  const material = [profile.profileRef, orderRef, ...[...predecessorEventRefs].sort()].join("|");
  return `COMMERCE-EVENT:${createHash("sha256").update(material, "utf8").digest("hex").slice(0, 24)}`;
}

export function buildOrderClosedObservationV1(input: {
  orderRef: string;
  profile: OrderClosureProfileV1;
  observations: readonly CommerceEventObservationV1[];
  sourceSystemRef: string;
  evidenceRefs: readonly string[];
  unresolvedBlockerRefs: readonly string[];
  occurredAt: string;
  observedAt: string;
}): CommerceEventObservationV1 {
  if (input.profile.status !== "ACTIVE") throw new Error("ORDER_CLOSURE_PROFILE_INACTIVE");

  const correlated = input.observations.filter(
    (observation) => observation.correlationId === input.orderRef,
  );
  const selected: CommerceEventObservationV1[] = [];
  for (const eventType of input.profile.requiredEventTypes) {
    const observation = correlated.find((candidate) => candidate.eventType === eventType);
    if (!observation) throw new Error(`ORDER_CLOSURE_REQUIREMENTS_UNMET:${eventType}`);
    selected.push(observation);
  }

  if (input.unresolvedBlockerRefs.length > 0) {
    throw new Error(`ORDER_CLOSURE_BLOCKED:${input.unresolvedBlockerRefs[0]}`);
  }
  if (input.evidenceRefs.length === 0) throw new Error("ORDER_CLOSURE_EVIDENCE_REQUIRED");

  const predecessorEventRefs = selected.map((observation) => observation.eventRef);
  return {
    eventRef: closureEventRef(input.profile, input.orderRef, predecessorEventRefs),
    eventType: "order_closed",
    sourceOwner: "SYNNERGYZE",
    sourceRole: "DERIVED_RECONCILIATION",
    sourceSystemRef: input.sourceSystemRef,
    sourceEventName: "order_closed",
    sourceRecordRef: `SYNNERGYZE:ORDER-CLOSURE:${input.orderRef}`,
    sourceRecordVersionRef: `PROFILE:${input.profile.profileRef}:V${input.profile.version}`,
    evidenceRefs: [...input.evidenceRefs],
    evidenceClasses: ["RECONCILIATION_PROOF"],
    subjectRef: input.orderRef,
    occurredAt: input.occurredAt,
    observedAt: input.observedAt,
    correlationId: input.orderRef,
    predecessorEventRefs,
    admittedFields: {
      orderRef: input.orderRef,
      closureKind: input.profile.kind,
      closureStatus: "CLOSED",
    },
    fieldClassifications: {
      orderRef: "MANAGEMENT",
      closureKind: "GOVERNED_INTERNAL",
      closureStatus: "MANAGEMENT",
    },
    schemaVersion: "1.0.0",
  };
}
