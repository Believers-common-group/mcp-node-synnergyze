import { createHash } from "node:crypto";
import type {
  CommerceEventObservationV1,
  CommerceSourceEventV1,
  CommerceSourcePolicyV1,
} from "./contracts.ts";
import { resolveCommerceEventTypeV1 } from "./event-grammar.ts";
import { assertCommerceSourcePermittedV1 } from "./source-ownership.ts";

function sameKeys(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  const a = Object.keys(left).sort();
  const b = Object.keys(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function eventIdentity(source: CommerceSourceEventV1): string {
  const material = [
    source.sourceSystemRef,
    source.sourceRecordRef,
    source.sourceRecordVersionRef ?? "",
    source.sourceEventName,
    source.correlationId,
  ].join("|");
  return `COMMERCE-EVENT:${createHash("sha256").update(material, "utf8").digest("hex").slice(0, 24)}`;
}

export function normalizeCommerceEventV1(input: {
  source: CommerceSourceEventV1;
  policy: CommerceSourcePolicyV1;
}): CommerceEventObservationV1 {
  const { source, policy } = input;

  if (source.schemaVersion !== "1.0.0") throw new Error("SOURCE_SCHEMA_VERSION_UNSUPPORTED");
  if (!source.sourceSystemRef) throw new Error("SOURCE_SYSTEM_REF_MISSING");
  if (!source.sourceRecordRef) throw new Error("SOURCE_RECORD_REF_MISSING");
  if (!source.subjectRef) throw new Error("SUBJECT_RESOLUTION_FAILED");
  if (!source.correlationId) throw new Error("CORRELATION_MISMATCH");
  if (source.evidenceRefs.length === 0) throw new Error("SOURCE_EVIDENCE_MISSING");
  if (source.evidenceClasses.length === 0) throw new Error("SOURCE_EVIDENCE_CLASS_MISSING");

  const eventType = resolveCommerceEventTypeV1(source.sourceEventName);
  assertCommerceSourcePermittedV1(source, eventType, policy);

  if (!sameKeys(source.admittedFields, source.fieldClassifications)) {
    throw new Error("COMMERCE_FIELD_CLASSIFICATION_MISMATCH");
  }

  const orderRef = source.admittedFields.orderRef;
  if (orderRef !== undefined && orderRef !== source.correlationId) {
    throw new Error("CORRELATION_MISMATCH");
  }

  const occurredAt = Date.parse(source.occurredAt);
  const observedAt = Date.parse(source.observedAt);
  if (!Number.isFinite(occurredAt) || !Number.isFinite(observedAt)) {
    throw new Error("COMMERCE_TIME_INVALID");
  }
  if (observedAt < occurredAt) throw new Error("COMMERCE_OBSERVED_BEFORE_OCCURRED");

  return {
    ...source,
    eventRef: eventIdentity(source),
    eventType,
    evidenceRefs: [...source.evidenceRefs],
    evidenceClasses: [...source.evidenceClasses],
    predecessorEventRefs: [...source.predecessorEventRefs],
    admittedFields: structuredClone(source.admittedFields),
    fieldClassifications: structuredClone(source.fieldClassifications),
  };
}
