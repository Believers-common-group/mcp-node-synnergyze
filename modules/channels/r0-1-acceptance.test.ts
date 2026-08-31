import { describe, expect, it } from "vitest";
import { SyntheticRiverPublicationServiceV1 } from "../river/publication-service.ts";
import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import { SyntheticInMemoryRouteAdapterV1 } from "./in-memory-route-adapter.ts";
import { buildPublicationWardenRequestV1 } from "./publication-admission.ts";
import { SyntheticChannelPublicationServiceV1 } from "./publication-service.ts";
import { prepareHeaderBoardV1 } from "./projection.ts";
import { SyntheticChannelRegistryV1 } from "./registry.ts";

function setup() {
  const registry = new SyntheticChannelRegistryV1();
  const channel = registry.register({
    channelRef: "VSR-CHANNEL:VOI:PUBLIC",
    ownerContextRef: "BRAND:VOI",
    subjectScopeRef: "PROGRAM:VOI-LAUNCH",
    status: "ACTIVE",
    allowedClassifications: ["PUBLIC"],
    routeRefs: ["ROUTE:VOI:PUBLIC"],
    version: 1,
    createdAt: "2026-09-01T00:00:00Z",
  });
  const route = {
    routeRef: "ROUTE:VOI:PUBLIC",
    channelRef: channel.channelRef,
    serviceRef: "SERVICE:MEMORY:PUBLIC",
    transport: "IN_MEMORY" as const,
    endpoint: "memory://voi/public",
    status: "ACTIVE" as const,
    allowedClassifications: ["PUBLIC" as const],
  };
  return { channel, route };
}

function draft(channelRef: string, headerBoardRef: string, supersedesRef?: string) {
  return {
    headerBoardRef,
    channelRef,
    publicationType: "STATUS" as const,
    subjectRef: "STYLE:VJ-428",
    sourceEventRefs: ["EVENT:INVENTORY:428"],
    publisherPrincipalRef: "DIGITALME:VOI:OPS",
    publisherCapacityRef: "CAPACITY:VOI:OPS",
    audiencePolicyRef: "POLICY:PUBLIC",
    classification: "PUBLIC" as const,
    effectiveFrom: "2026-09-01T00:00:00Z",
    actionCapabilities: ["SUBSCRIBE" as const],
    fields: {
      headline: { value: "VJ-428 available", classification: "PUBLIC" as const },
      managementOnly: { value: 18240, classification: "MANAGEMENT" as const },
    },
    supersedesRef,
    correlationId: `CORR:${headerBoardRef}`,
  };
}

function admission(board: ReturnType<typeof prepareHeaderBoardV1>, routeRef: string) {
  return {
    requestRef: `REQUEST:${board.headerBoardRef}`,
    headerBoardRef: board.headerBoardRef,
    channelRef: board.channelRef,
    publisherPrincipalRef: board.publisherPrincipalRef,
    representedPrincipalRef: "BRAND:VOI",
    publisherCapacityRef: board.publisherCapacityRef,
    contextRef: "ALPHA-NODE-001",
    programRef: "PROGRAM:VOI-LAUNCH",
    sourceEventRefs: board.sourceEventRefs,
    classification: board.classification,
    routeRefs: [routeRef],
    actionCapabilities: board.actionCapabilities,
    authorityRefs: ["AUTHORITY:VOI:OPS"],
    policyRefs: [board.audiencePolicyRef],
    representationSourceRefs: ["REGISTRY:REL:001"],
    evidenceReadinessRef: "RIVER-EVIDENCE-READINESS:001",
    requestedAt: "2026-09-01T00:01:00Z",
    correlationId: board.correlationId,
  } as const;
}

function allow(
  request: ReturnType<typeof buildPublicationWardenRequestV1>,
  decisionRef: string,
): WardenDecisionV1 {
  return {
    decisionRef,
    requestRef: request.requestRef,
    wardenRef: "WARDEN-ALPHA-RC1-001",
    decision: "ALLOW",
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: ["POLICY_MATCH"],
    constraints: ["SYNTHETIC_ONLY"],
    decidedAt: "2026-09-01T00:01:10Z",
    validUntil: "2026-09-01T00:10:00Z",
    correlationId: request.correlationId,
    actionToken: `TOKEN:${decisionRef}`,
  };
}

function deny(request: ReturnType<typeof buildPublicationWardenRequestV1>): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:ACCEPTANCE:DENY",
    requestRef: request.requestRef,
    wardenRef: "WARDEN-ALPHA-RC1-001",
    decision: "DENY",
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: ["AUTHORITY_MISSING"],
    constraints: [],
    decidedAt: "2026-09-01T00:01:10Z",
    correlationId: request.correlationId,
  };
}

describe("VSR Channel/Header Board R0.1 acceptance", () => {
  it("proves projection → Warden → River → route → River publication evidence", async () => {
    const { channel, route } = setup();
    const board = prepareHeaderBoardV1(draft(channel.channelRef, "HEADER:ACCEPTANCE:001"), channel);
    expect(board.payload).toEqual({ headline: "VJ-428 available" });
    expect(board.fieldClassifications).toEqual({ headline: "PUBLIC" });
    expect(board.payload).not.toHaveProperty("managementOnly");

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
      wardenDecision: allow(request, "WARDEN-DECISION:ACCEPTANCE:ALLOW"),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    });

    expect(adapter.deliveryCount()).toBe(1);
    expect(outcome.state).toBe("PUBLISHED");
    if (outcome.state !== "PUBLISHED") throw new Error("expected_published_outcome");
    expect(outcome.receipt.riverReservationRef).toMatch(/^RIVER-RESERVATION:/);
    expect(outcome.receipt.wardenDecisionRef).toBe("WARDEN-DECISION:ACCEPTANCE:ALLOW");
    expect(outcome.receipt.sourceEventRefs).toEqual(["EVENT:INVENTORY:428"]);
    expect(riverPublications.all()).toHaveLength(1);
  });

  it("proves DENY → zero route effect → zero publication receipt", async () => {
    const { channel, route } = setup();
    const board = prepareHeaderBoardV1(draft(channel.channelRef, "HEADER:ACCEPTANCE:DENIED"), channel);
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
      wardenDecision: deny(request),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    });
    expect(outcome.state).toBe("DENIED");
    expect(adapter.deliveryCount()).toBe(0);
    expect(riverPublications.all()).toHaveLength(0);
  });

  it("preserves both receipts when a Header Board supersedes another", async () => {
    const { channel, route } = setup();
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    const riverPublications = new SyntheticRiverPublicationServiceV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      riverPublications,
      adapter,
    );

    const first = prepareHeaderBoardV1(draft(channel.channelRef, "HEADER:ACCEPTANCE:V1"), channel);
    const firstRequest = buildPublicationWardenRequestV1(admission(first, route.routeRef));
    await service.publish({
      board: first,
      route,
      wardenRequest: firstRequest,
      wardenDecision: allow(firstRequest, "WARDEN-DECISION:SUPERSESSION:1"),
      reservedAt: "2026-09-01T00:01:20Z",
      observedAt: "2026-09-01T00:01:30Z",
    });

    const second = prepareHeaderBoardV1(
      draft(channel.channelRef, "HEADER:ACCEPTANCE:V2", first.headerBoardRef),
      channel,
    );
    const secondRequest = buildPublicationWardenRequestV1(admission(second, route.routeRef));
    await service.publish({
      board: second,
      route,
      wardenRequest: secondRequest,
      wardenDecision: allow(secondRequest, "WARDEN-DECISION:SUPERSESSION:2"),
      reservedAt: "2026-09-01T00:02:20Z",
      observedAt: "2026-09-01T00:02:30Z",
    });

    expect(second.supersedesRef).toBe(first.headerBoardRef);
    expect(adapter.deliveryCount()).toBe(2);
    expect(riverPublications.all().map((receipt) => receipt.headerBoardRef)).toEqual([
      "HEADER:ACCEPTANCE:V1",
      "HEADER:ACCEPTANCE:V2",
    ]);
  });
});
