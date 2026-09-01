import { describe, expect, it } from "vitest";

import type {
  InventoryTransferSpecV1,
  InventoryTransferProofV1,
  ObjectiveAuthorityEnvelopeV1,
  ObjectiveRefV1,
} from "../objective/contracts.ts";
import {
  runSyntheticInventoryTransferProof,
  type SyntheticInventoryTransferTimelineV1,
} from "../objective/inventory-transfer.ts";
import { bindAcceptedInventoryProofToHeaderBoardDraftV1 } from "./inventory-binding.ts";

const transfer: InventoryTransferSpecV1 = {
  sourceLocationRef: "LOC-ALPHA-SRC-001",
  destinationLocationRef: "LOC-ALPHA-DST-001",
  skuRef: "SKU-ALPHA-001",
  quantity: 10,
};

function objective(): ObjectiveRefV1 {
  return {
    objectiveRef: "OBJ-ALPHA-STOCK-001",
    principalRef: "LAB-COMPANY-001",
    statementRef: "STATEMENT:PREVENT-AVAILABILITY-FAILURE",
    desiredStateRef: "DESIRED:SKU-ALPHA-001-AVAILABLE-AT-DST",
    successConditionRefs: ["SUCCESS:SOURCE-MINUS-10", "SUCCESS:DESTINATION-PLUS-10"],
    constraintRefs: ["SYNTHETIC_ONLY", "NO_EXTERNAL_PROVIDER"],
    authorityRequirementRefs: ["POLICY:ALPHA-OBJECTIVE-001"],
    acceptanceProfileRef: "ACCEPTANCE:ALPHA-STOCK-TRANSFER-001",
    validFrom: "2026-08-15T05:00:00.000Z",
    validUntil: "2026-08-15T06:00:00.000Z",
    version: "1.0.0",
    status: "AUTHORIZED",
  };
}

function authority(): ObjectiveAuthorityEnvelopeV1 {
  return {
    authorityRef: "OBJECTIVE-AUTHORITY:OBJ-ALPHA-STOCK-001",
    objectiveRef: "OBJ-ALPHA-STOCK-001",
    principalRef: "LAB-COMPANY-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    wardenRef: "WARDEN-ALPHA-RC1-001",
    wardenDecisionRef: "WARDEN-OBJECTIVE-DECISION:OBJ-ALPHA-STOCK-001",
    decision: "ALLOW",
    state: "ACTIVE",
    allowedCapabilityRefs: ["inventory.transfer"],
    resourceRefs: ["LOC-ALPHA-SRC-001", "LOC-ALPHA-DST-001", "SKU-ALPHA-001"],
    evidenceRequirementRefs: ["EVIDENCE:DISPATCH", "EVIDENCE:RECEIPT"],
    validFrom: "2026-08-15T05:00:00.000Z",
    validUntil: "2026-08-15T06:00:00.000Z",
    constraintRefs: ["SYNTHETIC_ONLY", "NO_FINANCIAL_EFFECT"],
  };
}

const timeline: SyntheticInventoryTransferTimelineV1 = {
  compiledAt: "2026-08-15T05:10:00.000Z",
  actionRequestedAt: "2026-08-15T05:10:01.000Z",
  decidedAt: "2026-08-15T05:10:02.000Z",
  reservedAt: "2026-08-15T05:10:03.000Z",
  checkpointAt: "2026-08-15T05:10:04.000Z",
  executedAt: "2026-08-15T05:10:05.000Z",
  observedAt: "2026-08-15T05:10:06.000Z",
  verifiedAt: "2026-08-15T05:10:07.000Z",
  sealedAt: "2026-08-15T05:10:08.000Z",
  acceptedAt: "2026-08-15T05:10:09.000Z",
};

function proof(): InventoryTransferProofV1 {
  return runSyntheticInventoryTransferProof({
    objective: objective(),
    authority: authority(),
    transfer,
    sourceInitial: 50,
    destinationInitial: 5,
    timeline,
  });
}

function bindingInput(transferProof: InventoryTransferProofV1) {
  return {
    proof: transferProof,
    channelRef: "VSR-CHANNEL:INVENTORY:MANAGEMENT",
    headerBoardRef: "HEADER:INVENTORY:001",
    publisherPrincipalRef: "DIGITALME-ALPHA-TEST-001",
    publisherCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    audiencePolicyRef: "POLICY:INVENTORY:MANAGEMENT",
    classification: "MANAGEMENT" as const,
    effectiveFrom: "2026-08-15T05:10:10.000Z",
    correlationId: "CORR:INVENTORY:001",
  };
}

describe("Inventory proof → Header Board binding", () => {
  it("projects only an accepted sealed inventory proof into a canonical Header Board draft", () => {
    const accepted = proof();
    const draft = bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(accepted));

    const acceptanceEvent = accepted.bundle.events.find((event) => event.eventType === "ACCEPTANCE_CHECK");
    expect(acceptanceEvent).toBeDefined();
    expect(draft.publicationType).toBe("STATUS");
    expect(draft.subjectRef).toBe(transfer.skuRef);
    expect(draft.sourceEventRefs).toContain(acceptanceEvent!.eventRef);
    expect(draft.sourceEventRefs).toEqual(expect.arrayContaining(accepted.effects.map((effect) => effect.eventRef)));
    expect(draft.fields.transferQuantity).toEqual({ value: 10, classification: "MANAGEMENT" });
    expect(draft.fields.sourceQuantity).toEqual({ value: 40, classification: "MANAGEMENT" });
    expect(draft.fields.destinationQuantity).toEqual({ value: 15, classification: "MANAGEMENT" });
    expect(draft.fields.acceptanceResult).toEqual({ value: "PASS", classification: "MANAGEMENT" });
    expect(draft.fields.objectiveStatus).toEqual({ value: "CLOSED", classification: "MANAGEMENT" });
    expect(draft.fields).not.toHaveProperty("riverSealRef");
    expect(draft.fields).not.toHaveProperty("wardenDecisionRef");
    expect(draft.fields).not.toHaveProperty("actionToken");
  });

  it("fails closed when inventory acceptance did not pass", () => {
    const accepted = proof();
    const failed: InventoryTransferProofV1 = {
      ...accepted,
      acceptance: { ...accepted.acceptance, result: "FAIL", reasonCodes: ["SYNTHETIC_FAILURE"] },
    };
    expect(() => bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(failed))).toThrow(
      "inventory_publication_acceptance_required",
    );
  });

  it("fails closed when the acceptance record does not include the River seal", () => {
    const accepted = proof();
    const mismatched: InventoryTransferProofV1 = {
      ...accepted,
      acceptance: { ...accepted.acceptance, checkedEvidenceRefs: ["OTHER-SEAL"] },
    };
    expect(() => bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(mismatched))).toThrow(
      "inventory_publication_acceptance_evidence_mismatch",
    );
  });

  it("fails closed when the accepted projection is not bound to the River seal", () => {
    const accepted = proof();
    const forged: InventoryTransferProofV1 = {
      ...accepted,
      frontProjection: { ...accepted.frontProjection, evidenceRefs: ["OTHER-SEAL"] },
      backProjection: { ...accepted.backProjection, evidenceRefs: ["OTHER-SEAL"] },
    };
    expect(() => bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(forged))).toThrow(
      "inventory_publication_projection_evidence_mismatch",
    );
  });

  it("fails closed when the projection objective lineage is forged", () => {
    const accepted = proof();
    const forged: InventoryTransferProofV1 = {
      ...accepted,
      frontProjection: { ...accepted.frontProjection, objectiveRef: "OBJ-OTHER" },
      backProjection: { ...accepted.backProjection, objectiveRef: "OBJ-OTHER" },
    };
    expect(() => bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(forged))).toThrow(
      "inventory_publication_objective_lineage_mismatch",
    );
  });
});
