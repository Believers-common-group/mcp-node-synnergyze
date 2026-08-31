import { describe, expect, it } from "vitest";
import type { PublicationAdmissionRequestV1 } from "./contracts.ts";
import { buildPublicationWardenRequestV1 } from "./publication-admission.ts";

const input: PublicationAdmissionRequestV1 = {
  requestRef: "REQUEST:HEADER:001",
  headerBoardRef: "HEADER:001",
  channelRef: "VSR-CHANNEL:VOI:PUBLIC",
  publisherPrincipalRef: "DIGITALME:VOI:OPS",
  representedPrincipalRef: "BRAND:VOI",
  publisherCapacityRef: "CAPACITY:VOI:OPS",
  contextRef: "ALPHA-NODE-001",
  programRef: "PROGRAM:VOI-LAUNCH",
  sourceEventRefs: ["EVENT:INVENTORY:428", "EVENT:CATALOGUE:428"],
  classification: "PUBLIC",
  routeRefs: ["ROUTE:VOI:PUBLIC"],
  actionCapabilities: ["SUBSCRIBE"],
  authorityRefs: ["AUTHORITY:VOI:OPS"],
  policyRefs: ["POLICY:PUBLIC"],
  representationSourceRefs: ["REGISTRY:REL:001"],
  evidenceReadinessRef: "RIVER-EVIDENCE-READINESS:001",
  requestedAt: "2026-09-01T00:01:00Z",
  correlationId: "CORR:HEADER:001",
};

describe("publication admission bridge", () => {
  it("builds a Warden request without authority material", () => {
    const request = buildPublicationWardenRequestV1(input);
    expect(request.action).toBe("header_board.publish");
    expect(request.capabilityRef).toBe("VSR-CAPABILITY-HEADER-BOARD-PUBLISH");
    expect(request.targetRef).toBe(input.headerBoardRef);
    expect(request.requestedEffect).toBe("publish_channel_projection");
    expect(request.eventRef).toBe("PUBLICATION-EVENT:HEADER:001");
    expect(request.evidenceReadinessRef).toBe(input.evidenceReadinessRef);
    expect(request).not.toHaveProperty("actionToken");
  });

  it("requires source events and at least one route", () => {
    expect(() => buildPublicationWardenRequestV1({ ...input, sourceEventRefs: [] })).toThrow(
      "publication_source_event_required",
    );
    expect(() => buildPublicationWardenRequestV1({ ...input, routeRefs: [] })).toThrow(
      "publication_route_required",
    );
  });
});
