import type { InventoryTransferProofV1 } from "../objective/contracts.ts";
import type {
  ChannelClassification,
  HeaderBoardDraftV1,
} from "./contracts.ts";

export interface InventoryHeaderBoardBindingInputV1 {
  proof: InventoryTransferProofV1;
  channelRef: string;
  headerBoardRef: string;
  publisherPrincipalRef: string;
  publisherCapacityRef: string;
  audiencePolicyRef: string;
  classification: ChannelClassification;
  effectiveFrom: string;
  correlationId: string;
}

export function bindAcceptedInventoryProofToHeaderBoardDraftV1(
  input: InventoryHeaderBoardBindingInputV1,
): HeaderBoardDraftV1 {
  const { proof, classification } = input;
  if (proof.acceptance.result !== "PASS") throw new Error("inventory_publication_acceptance_required");
  if (proof.closedObjective.status !== "CLOSED") throw new Error("inventory_publication_closed_objective_required");
  if (!proof.riverSealRef) throw new Error("inventory_publication_river_seal_required");
  if (!proof.acceptance.checkedEvidenceRefs.includes(proof.riverSealRef)) {
    throw new Error("inventory_publication_acceptance_evidence_mismatch");
  }
  if (proof.effects.length === 0 || proof.effects.some((effect) => effect.evidenceRef !== proof.riverSealRef)) {
    throw new Error("inventory_publication_effect_evidence_mismatch");
  }
  const checkedEffects = new Set(proof.acceptance.checkedEffectRefs);
  if (proof.effects.some((effect) => !checkedEffects.has(effect.effectRef))) {
    throw new Error("inventory_publication_acceptance_effect_mismatch");
  }
  if (JSON.stringify(proof.frontProjection) !== JSON.stringify(proof.backProjection)) {
    throw new Error("inventory_publication_projection_divergence");
  }

  const acceptanceEvent = proof.bundle.events.find((event) => event.eventType === "ACCEPTANCE_CHECK");
  if (!acceptanceEvent) throw new Error("inventory_publication_acceptance_event_missing");
  const sourceEventRefs = [
    ...new Set([...proof.effects.map((effect) => effect.eventRef), acceptanceEvent.eventRef]),
  ];
  const transfer = proof.bundle.program.transfer;

  return {
    headerBoardRef: input.headerBoardRef,
    channelRef: input.channelRef,
    publicationType: "STATUS",
    subjectRef: transfer.skuRef,
    sourceEventRefs,
    publisherPrincipalRef: input.publisherPrincipalRef,
    publisherCapacityRef: input.publisherCapacityRef,
    audiencePolicyRef: input.audiencePolicyRef,
    classification,
    effectiveFrom: input.effectiveFrom,
    actionCapabilities: ["ACKNOWLEDGE", "SUBSCRIBE"],
    fields: {
      headline: {
        value: `${transfer.skuRef} inventory transfer accepted`,
        classification,
      },
      skuRef: { value: transfer.skuRef, classification },
      sourceLocationRef: { value: transfer.sourceLocationRef, classification },
      destinationLocationRef: { value: transfer.destinationLocationRef, classification },
      transferQuantity: { value: transfer.quantity, classification },
      sourceQuantity: { value: proof.frontProjection.sourceQuantity, classification },
      destinationQuantity: { value: proof.frontProjection.destinationQuantity, classification },
      acceptanceResult: { value: proof.acceptance.result, classification },
      objectiveStatus: { value: proof.closedObjective.status, classification },
    },
    correlationId: input.correlationId,
  };
}
