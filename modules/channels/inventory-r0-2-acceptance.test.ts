import { describe, expect, it } from "vitest";

import type {
  InventoryTransferProofV1,
  InventoryTransferSpecV1,
  ObjectiveAuthorityEnvelopeV1,
  ObjectiveRefV1,
} from "../objective/contracts.ts";
import {
  runSyntheticInventoryTransferProof,
  type SyntheticInventoryTransferTimelineV1,
} from "../objective/inventory-transfer.ts";
import { SyntheticRiverPublicationServiceV1 } from "../river/publication-service.ts";
import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import { SyntheticInMemoryRouteAdapterV1 } from "./in-memory-route-adapter.ts";
import { bindAcceptedInventoryProofToHeaderBoardDraftV1 } from "./inventory-binding.ts";
import { buildPublicationWardenRequestV1 } from "./publication-admission.ts";
import { SyntheticChannelPublicationServiceV1 } from "./publication-service.ts";
import { prepareHeaderBoardV1 } from "./projection.ts";
import { SyntheticChannelRegistryV1 } from "./registry.ts";

const transfer: InventoryTransferSpecV1 = {
  sourceLocationRef: "LOC-ALPHA-SRC-001",
  destinationLocationRef: "LOC-ALPHA-DST-001",
  skuRef: "SKU-ALPHA-001",
  quantity: 10,
};

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

function inventoryProof(): InventoryTransferProofV1 {
  const objective: ObjectiveRefV1 = {
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
  const authority: ObjectiveAuthorityEnvelopeV1 = {
    authorityRef: "OBJECTIVE-AUTHORITY:OBJ-ALPHA-STOCK-001",
    objectiveRef: objective.objectiveRef,
    principalRef: objective.principalRef,
    actorRef: "DIGITALME-ALPHA-TEST-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    wardenRef: "WARDEN-ALPHA-RC1-001",
    wardenDecisionRef: "WARDEN-OBJECTIVE-DECISION:OBJ-ALPHA-STOCK-001",
    decision: "ALLOW",
    state: "ACTIVE",
    allowedCapabilityRefs: ["inventory.transfer"],
    resourceRefs: [transfer.sourceLocationRef, transfer.destinationLocationRef, transfer.skuRef],
    evidenceRequirementRefs: ["EVIDENCE:DISPATCH", "EVIDENCE:RECEIPT"],
    validFrom: objective.validFrom,
    validUntil: objective.validUntil,
    constraintRefs: ["SYNTHETIC_ONLY", "NO_FINANCIAL_EFFECT"],
  };
  return runSyntheticInventoryTransferProof({
    objective,
    authority,
    transfer,
    sourceInitial: 50,
    destinationInitial: 5,
    timeline,
  });
}

function setupChannel() {
  const registry = new SyntheticChannelRegistryV1();
  const channel = registry.register({
    channelRef: "VSR-CHANNEL:INVENTORY:MANAGEMENT",
    ownerContextRef: "LAB-COMPANY-001",
    subjectScopeRef: "OBJECTIVE:INVENTORY-TRANSFER",
    status: "ACTIVE",
    allowedClassifications: ["MANAGEMENT"],
    routeRefs: ["ROUTE:INVENTORY:MANAGEMENT"],
    version: 1,
    createdAt: "2026-08-15T05:10:09.500Z",
  });
  const route = {
    routeRef: "ROUTE:INVENTORY:MANAGEMENT",
    channelRef: channel.channelRef,
    serviceRef: "SERVICE:MEMORY:INVENTORY",
    transport: "IN_MEMORY" as const,
    endpoint: "memory://inventory/management",
    status: "ACTIVE" as const,
    allowedClassifications: ["MANAGEMENT" as const],
  };
  return { channel, route };
}

function admission(board: ReturnType<typeof prepareHeaderBoardV1>, routeRef: string) {
  return {
    requestRef: `REQUEST:${board.headerBoardRef}`,
    headerBoardRef: board.headerBoardRef,
    channelRef: board.channelRef,
    publisherPrincipalRef: board.publisherPrincipalRef,
    representedPrincipalRef: "LAB-COMPANY-001",
    publisherCapacityRef: board.publisherCapacityRef,
    contextRef: "ALPHA-NODE-001",
    programRef: "PROGRAM:INVENTORY-CHANNEL-R0-2",
    sourceEventRefs: board.sourceEventRefs,
    classification: board.classification,
    routeRefs: [routeRef],
    actionCapabilities: board.actionCapabilities,
    authorityRefs: ["AUTHORITY:INVENTORY-PUBLICATION"],
    policyRefs: [board.audiencePolicyRef],
    representationSourceRefs: ["REGISTRY:REL:LAB-OPERATOR"],
    evidenceReadinessRef: "RIVER-EVIDENCE-READINESS:INVENTORY",
    requestedAt: "2026-08-15T05:10:11.000Z",
    correlationId: board.correlationId,
  } as const;
}

function allow(request: ReturnType<typeof buildPublicationWardenRequestV1>): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:INVENTORY-PUBLISH:ALLOW",
    requestRef: request.requestRef,
    wardenRef: "WARDEN-ALPHA-RC1-001",
    decision: "ALLOW",
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: ["POLICY_MATCH"],
    constraints: ["SYNTHETIC_ONLY"],
    decidedAt: "2026-08-15T05:10:12.000Z",
    validUntil: "2026-08-15T05:20:00.000Z",
    correlationId: request.correlationId,
    actionToken: "ACTION-TOKEN:INVENTORY-PUBLISH",
  };
}

function bindingInput(proof: InventoryTransferProofV1) {
  return {
    proof,
    channelRef: "VSR-CHANNEL:INVENTORY:MANAGEMENT",
    headerBoardRef: "HEADER:INVENTORY:R0-2:001",
    publisherPrincipalRef: "DIGITALME-ALPHA-TEST-001",
    publisherCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    audiencePolicyRef: "POLICY:INVENTORY:MANAGEMENT",
    classification: "MANAGEMENT" as const,
    effectiveFrom: "2026-08-15T05:10:10.000Z",
    correlationId: "CORR:INVENTORY:R0-2:001",
  };
}

describe("VSR inventory Channel R0.2 acceptance", () => {
  it("reuses accepted inventory evidence through the canonical Header Board publication rail", async () => {
    const proof = inventoryProof();
    const { channel, route } = setupChannel();
    const draft = bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(proof));
    const board = prepareHeaderBoardV1(draft, channel);
    const request = buildPublicationWardenRequestV1(admission(board, route.routeRef));
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const riverPublications = new SyntheticRiverPublicationServiceV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      riverPublications,
      adapter,
    );

    const outcome = await service.publish({
      board,
      route,
      wardenRequest: request,
      wardenDecision: allow(request),
      reservedAt: "2026-08-15T05:10:13.000Z",
      observedAt: "2026-08-15T05:10:14.000Z",
    });

    expect(outcome.state).toBe("PUBLISHED");
    expect(adapter.deliveryCount()).toBe(1);
    expect(adapter.deliveries()[0].payload).toMatchObject({
      skuRef: transfer.skuRef,
      transferQuantity: 10,
      sourceQuantity: 40,
      destinationQuantity: 15,
      acceptanceResult: "PASS",
      objectiveStatus: "CLOSED",
    });
    expect(adapter.deliveries()[0]).not.toHaveProperty("sourceEventRefs");
    expect(adapter.deliveries()[0].payload).not.toHaveProperty("riverSealRef");
    if (outcome.state !== "PUBLISHED") throw new Error("expected_inventory_publication");
    expect(outcome.receipt.wardenDecisionRef).toBe("WARDEN-DECISION:INVENTORY-PUBLISH:ALLOW");
    expect(outcome.receipt.sourceEventRefs).toEqual(board.sourceEventRefs);
    expect(riverPublications.all()).toHaveLength(1);
  });

  it("produces zero publication effects when the inventory proof is not accepted", () => {
    const accepted = inventoryProof();
    const failed: InventoryTransferProofV1 = {
      ...accepted,
      acceptance: { ...accepted.acceptance, result: "FAIL", reasonCodes: ["SYNTHETIC_FAILURE"] },
    };
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const riverPublications = new SyntheticRiverPublicationServiceV1();

    expect(() => bindAcceptedInventoryProofToHeaderBoardDraftV1(bindingInput(failed))).toThrow(
      "inventory_publication_acceptance_required",
    );
    expect(adapter.deliveryCount()).toBe(0);
    expect(riverPublications.all()).toHaveLength(0);
  });
});
