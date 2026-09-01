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

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export function bindAcceptedInventoryProofToHeaderBoardDraftV1(
  input: InventoryHeaderBoardBindingInputV1,
): HeaderBoardDraftV1 {
  const { proof, classification } = input;
  if (proof.acceptance.result !== "PASS") throw new Error("inventory_publication_acceptance_required");
  if (proof.closedObjective.status !== "CLOSED") throw new Error("inventory_publication_closed_objective_required");
  if (!proof.riverSealRef) throw new Error("inventory_publication_river_seal_required");

  const objectiveRef = proof.objective.objectiveRef;
  if (
    proof.closedObjective.objectiveRef !== objectiveRef ||
    proof.acceptance.objectiveRef !== objectiveRef ||
    proof.bundle.program.objectiveRef !== objectiveRef ||
    proof.frontProjection.objectiveRef !== objectiveRef ||
    proof.backProjection.objectiveRef !== objectiveRef
  ) {
    throw new Error("inventory_publication_objective_lineage_mismatch");
  }
  if (
    proof.frontProjection.programRef !== proof.bundle.program.programRef ||
    proof.backProjection.programRef !== proof.bundle.program.programRef
  ) {
    throw new Error("inventory_publication_program_lineage_mismatch");
  }
  if (
    !proof.frontProjection.evidenceRefs.includes(proof.riverSealRef) ||
    !proof.backProjection.evidenceRefs.includes(proof.riverSealRef)
  ) {
    throw new Error("inventory_publication_projection_evidence_mismatch");
  }
  if (!proof.acceptance.checkedEvidenceRefs.includes(proof.riverSealRef)) {
    throw new Error("inventory_publication_acceptance_evidence_mismatch");
  }
  if (proof.effects.length === 0 || proof.effects.some((effect) => effect.evidenceRef !== proof.riverSealRef)) {
    throw new Error("inventory_publication_effect_evidence_mismatch");
  }
  const effectRefs = proof.effects.map((effect) => effect.effectRef);
  if (!sameRefs(proof.frontProjection.effectRefs, effectRefs) || !sameRefs(proof.backProjection.effectRefs, effectRefs)) {
    throw new Error("inventory_publication_projection_effect_mismatch");
  }
  if (!sameRefs(proof.acceptance.checkedEffectRefs, effectRefs)) {
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
