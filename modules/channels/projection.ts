import { assertProjectionFieldNameSafe, classificationAllowed } from "./classification.ts";
import type {
  ChannelClassification,
  ChannelV1,
  HeaderBoardDraftV1,
  HeaderBoardV1,
  JsonValue,
} from "./contracts.ts";

export function prepareHeaderBoardV1(draft: HeaderBoardDraftV1, channel: ChannelV1): HeaderBoardV1 {
  if (channel.channelRef !== draft.channelRef) throw new Error("channel_reference_mismatch");
  if (channel.status !== "ACTIVE") throw new Error("channel_inactive");
  if (!classificationAllowed(draft.classification, channel.allowedClassifications)) {
    throw new Error("channel_classification_violation");
  }
  if (draft.sourceEventRefs.length === 0) throw new Error("source_event_required");

  const payload: Record<string, JsonValue> = {};
  const fieldClassifications: Record<string, ChannelClassification> = {};
  for (const [fieldName, projected] of Object.entries(draft.fields)) {
    assertProjectionFieldNameSafe(fieldName);
    if (classificationAllowed(projected.classification, channel.allowedClassifications)) {
      payload[fieldName] = structuredClone(projected.value);
      fieldClassifications[fieldName] = projected.classification;
    }
  }

  return {
    headerBoardRef: draft.headerBoardRef,
    channelRef: draft.channelRef,
    publicationType: draft.publicationType,
    subjectRef: draft.subjectRef,
    sourceEventRefs: [...draft.sourceEventRefs],
    publisherPrincipalRef: draft.publisherPrincipalRef,
    publisherCapacityRef: draft.publisherCapacityRef,
    audiencePolicyRef: draft.audiencePolicyRef,
    classification: draft.classification,
    effectiveFrom: draft.effectiveFrom,
    effectiveUntil: draft.effectiveUntil,
    status: "PREPARED",
    actionCapabilities: [...draft.actionCapabilities],
    payload,
    fieldClassifications,
    supersedesRef: draft.supersedesRef,
    correlationId: draft.correlationId,
  };
}
