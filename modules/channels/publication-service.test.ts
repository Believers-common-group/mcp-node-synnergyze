import { describe, expect, it } from "vitest";
import { SyntheticRiverPublicationServiceV1 } from "../river/publication-service.ts";
import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type { HeaderBoardV1, ServiceRouteV1 } from "./contracts.ts";
import { SyntheticInMemoryRouteAdapterV1 } from "./in-memory-route-adapter.ts";
import { buildPublicationWardenRequestV1 } from "./publication-admission.ts";
import { SyntheticChannelPublicationServiceV1 } from "./publication-service.ts";

const board: HeaderBoardV1 = {
  headerBoardRef: "HEADER:001",
  channelRef: "VSR-CHANNEL:PARTNER",
  publicationType: "STATUS",
  subjectRef: "STYLE:VJ-428",
  sourceEventRefs: ["EVENT:INVENTORY:428"],
  publisherPrincipalRef: "DIGITALME:VOI:OPS",
  publisherCapacityRef: "CAPACITY:VOI:OPS",
  audiencePolicyRef: "POLICY:PARTNER",
  classification: "PARTNER",
  effectiveFrom: "2026-09-01T00:00:00Z",
  status: "PREPARED",
  actionCapabilities: ["SUBSCRIBE"],
  payload: { headline: "VJ-428 available", marginBand: "partner-range" },
  fieldClassifications: { headline: "PUBLIC", marginBand: "PARTNER" },
  correlationId: "CORR:HEADER:001",
};

const route: ServiceRouteV1 = {
  routeRef: "ROUTE:PARTNER:001",
  channelRef: board.channelRef,
  serviceRef: "SERVICE:MEMORY:001",
  transport: "IN_MEMORY",
  endpoint: "memory://partner/001",
  status: "ACTIVE",
  allowedClassifications: ["PUBLIC", "PARTNER"],
};

const admissionInput = {
  requestRef: "REQUEST:HEADER:001",
  headerBoardRef: board.headerBoardRef,
  channelRef: board.channelRef,
  publisherPrincipalRef: board.publisherPrincipalRef,
  representedPrincipalRef: "BRAND:VOI",
  publisherCapacityRef: board.publisherCapacityRef,
  contextRef: "ALPHA-NODE-001",
  programRef: "PROGRAM:VOI-LAUNCH",
  sourceEventRefs: board.sourceEventRefs,
  classification: board.classification,
  routeRefs: [route.routeRef],
  actionCapabilities: board.actionCapabilities,
  authorityRefs: ["AUTHORITY:VOI:OPS"],
  policyRefs: [board.audiencePolicyRef],
  representationSourceRefs: ["REGISTRY:REL:001"],
  evidenceReadinessRef: "RIVER-EVIDENCE-READINESS:001",
  requestedAt: "2026-09-01T00:01:00Z",
  correlationId: board.correlationId,
} as const;

const wardenRequest = buildPublicationWardenRequestV1(admissionInput);

function allowDecision(): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:ALLOW:001",
    requestRef: wardenRequest.requestRef,
    wardenRef: "WARDEN-ALPHA-RC1-001",
    decision: "ALLOW",
    action: wardenRequest.action,
    targetRef: wardenRequest.targetRef,
    reasonCodes: ["POLICY_MATCH"],
    constraints: ["SYNTHETIC_ONLY"],
    decidedAt: "2026-09-01T00:01:10Z",
    validUntil: "2026-09-01T00:10:00Z",
    correlationId: wardenRequest.correlationId,
    actionToken: "ACTION-TOKEN:HEADER:001",
  };
}

function nonAllow(decision: "DENY" | "ESCALATE"): WardenDecisionV1 {
  return {
    decisionRef: `WARDEN-DECISION:${decision}:001`,
    requestRef: wardenRequest.requestRef,
    wardenRef: "WARDEN-ALPHA-RC1-001",
    decision,
    action: wardenRequest.action,
    targetRef: wardenRequest.targetRef,
    reasonCodes: [decision === "DENY" ? "AUTHORITY_MISSING" : "REQUIRES_REVIEW"],
    constraints: [],
    decidedAt: "2026-09-01T00:01:10Z",
    correlationId: wardenRequest.correlationId,
  };
}

describe("Channel publication service", () => {
  it("publishes after Warden ALLOW and River reservation", async () => {
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
      wardenRequest,
      wardenDecision: allowDecision(),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    });
    expect(outcome.state).toBe("PUBLISHED");
    expect(adapter.deliveryCount()).toBe(1);
    if (outcome.state !== "PUBLISHED") throw new Error("expected_published_outcome");
    expect(outcome.receipt.state).toBe("DELIVERED");
    expect(riverPublications.all()).toHaveLength(1);
  });

  it.each(["DENY", "ESCALATE"] as const)("produces zero route effects for %s", async (decision) => {
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
      wardenRequest,
      wardenDecision: nonAllow(decision),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    });
    expect(outcome.state).toBe(decision === "DENY" ? "DENIED" : "ESCALATED");
    expect(adapter.deliveryCount()).toBe(0);
    expect(riverPublications.all()).toHaveLength(0);
  });

  it("fails before route delivery when River reservation is expired", async () => {
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      new SyntheticRiverPublicationServiceV1(),
      adapter,
    );
    await expect(service.publish({
      board,
      route,
      wardenRequest,
      wardenDecision: allowDecision(),
      reservedAt: "2026-09-01T00:20:00Z",
      observedAt: "2026-09-01T00:20:01Z",
    })).rejects.toThrow("river_warden_decision_expired");
    expect(adapter.deliveryCount()).toBe(0);
  });

  it("rejects a route missing any field classification carried by the Header Board", async () => {
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      new SyntheticRiverPublicationServiceV1(),
      adapter,
    );
    const partnerOnlyRoute: ServiceRouteV1 = { ...route, allowedClassifications: ["PARTNER"] };
    await expect(service.publish({
      board,
      route: partnerOnlyRoute,
      wardenRequest,
      wardenDecision: allowDecision(),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    })).rejects.toThrow("route_payload_classification_violation:PUBLIC");
    expect(adapter.deliveryCount()).toBe(0);
  });

  it("sends only the transport envelope, not source/event/authority metadata", async () => {
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      new SyntheticRiverPublicationServiceV1(),
      adapter,
    );
    await service.publish({
      board,
      route,
      wardenRequest,
      wardenDecision: allowDecision(),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    });
    const delivered = adapter.deliveries()[0];
    expect(delivered.payload).toEqual(board.payload);
    expect(delivered).not.toHaveProperty("sourceEventRefs");
    expect(delivered).not.toHaveProperty("fieldClassifications");
    expect(delivered).not.toHaveProperty("actionToken");
    expect(delivered).not.toHaveProperty("sourcePayload");
  });

  it("is idempotent across duplicate publication attempts", async () => {
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const riverPublications = new SyntheticRiverPublicationServiceV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      riverPublications,
      adapter,
    );
    const input = {
      board,
      route,
      wardenRequest,
      wardenDecision: allowDecision(),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    } as const;
    const first = await service.publish(input);
    const second = await service.publish(input);
    expect(adapter.deliveryCount()).toBe(1);
    expect(riverPublications.all()).toHaveLength(1);
    if (first.state !== "PUBLISHED" || second.state !== "PUBLISHED") {
      throw new Error("expected_published_outcomes");
    }
    expect(second.receipt.receiptRef).toBe(first.receipt.receiptRef);
  });
});
