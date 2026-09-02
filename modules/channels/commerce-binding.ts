import type {
  CommerceEventObservationV1,
  CommerceTransitionResultV1,
} from "../commerce-events/contracts.ts";
import {
  assertProjectionFieldNameSafe,
  assertProjectionValueSafe,
} from "./classification.ts";
import type { ClassifiedProjectionFieldV1, HeaderBoardDraftV1, JsonValue } from "./contracts.ts";
import type { CommerceProjectionProfileV1 } from "./commerce-profiles.ts";

export interface CommerceHeaderBoardBindingInputV1 {
  observation: CommerceEventObservationV1;
  transition: CommerceTransitionResultV1;
  profile: CommerceProjectionProfileV1;
  headerBoardRef: string;
  publisherPrincipalRef: string;
  publisherCapacityRef: string;
  effectiveFrom: string;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function scopeEqual(left: JsonValue | undefined, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function bindCommerceObservationToHeaderBoardDraftV1(
  input: CommerceHeaderBoardBindingInputV1,
): HeaderBoardDraftV1 {
  const { observation, transition, profile } = input;

  if (transition.observationRef !== observation.eventRef) {
    throw new Error("COMMERCE_TRANSITION_REFERENCE_MISMATCH");
  }
  if (transition.state !== "ADMITTED") throw new Error("COMMERCE_TRANSITION_NOT_ADMITTED");
  if (profile.status !== "ACTIVE") throw new Error("PROFILE_INACTIVE");
  if (profile.canonicalEventType !== observation.eventType) {
    throw new Error("CHANNEL_EVENT_PROFILE_MISMATCH");
  }

  for (const fieldName of profile.requiredSourceFields) {
    if (
      !hasOwn(observation.admittedFields, fieldName) ||
      !hasOwn(observation.fieldClassifications, fieldName)
    ) {
      throw new Error(`REQUIRED_SOURCE_FIELD_MISSING:${fieldName}`);
    }
  }

  for (const evidenceClass of profile.requiredEvidenceClasses) {
    if (!observation.evidenceClasses.includes(evidenceClass)) {
      throw new Error(`REQUIRED_EVIDENCE_CLASS_MISSING:${evidenceClass}`);
    }
  }

  if (profile.correlationField) {
    const correlated = observation.admittedFields[profile.correlationField];
    if (correlated !== observation.correlationId) throw new Error("CROSS_ORDER_LEAKAGE");
  }

  for (const scope of profile.requiredScope) {
    const actual = observation.admittedFields[scope.fieldName];
    if (!scopeEqual(actual, scope.equals)) {
      if (scope.errorCode === "CROSS_MARKETPLACE_LEAKAGE") {
        throw new Error("CROSS_MARKETPLACE_LEAKAGE");
      }
      throw new Error(`PROFILE_SCOPE_MISMATCH:${scope.fieldName}`);
    }
  }

  const fields: Record<string, ClassifiedProjectionFieldV1> = {};
  for (const rule of profile.fieldRules) {
    if (!hasOwn(observation.admittedFields, rule.sourceField)) {
      throw new Error(`REQUIRED_SOURCE_FIELD_MISSING:${rule.sourceField}`);
    }
    const value = observation.admittedFields[rule.sourceField] as JsonValue;
    assertProjectionFieldNameSafe(rule.targetField);
    assertProjectionValueSafe(value, rule.targetField);
    fields[rule.targetField] = {
      value: structuredClone(value),
      classification: rule.classification,
    };
  }

  return {
    headerBoardRef: input.headerBoardRef,
    channelRef: profile.targetChannelRef,
    publicationType: "STATUS",
    subjectRef: observation.subjectRef,
    sourceEventRefs: [observation.eventRef],
    publisherPrincipalRef: input.publisherPrincipalRef,
    publisherCapacityRef: input.publisherCapacityRef,
    audiencePolicyRef: profile.audiencePolicyRef,
    classification: profile.classification,
    effectiveFrom: input.effectiveFrom,
    actionCapabilities: [...profile.allowedActionCapabilities],
    fields,
    correlationId: observation.correlationId,
  };
}
