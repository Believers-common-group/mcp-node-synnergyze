import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import type { PublicationAdmissionRequestV1 } from "./contracts.ts";

export function buildPublicationWardenRequestV1(
  input: PublicationAdmissionRequestV1,
): WardenDecisionRequestV1 {
  if (input.sourceEventRefs.length === 0) throw new Error("publication_source_event_required");
  if (input.routeRefs.length === 0) throw new Error("publication_route_required");

  return {
    requestRef: input.requestRef,
    actorRef: input.publisherPrincipalRef,
    representedPrincipalRef: input.representedPrincipalRef,
    actingCapacityRef: input.publisherCapacityRef,
    contextRef: input.contextRef,
    programRef: input.programRef,
    eventRef: `PUBLICATION-EVENT:${input.headerBoardRef}`,
    action: "header_board.publish",
    capabilityRef: "VSR-CAPABILITY-HEADER-BOARD-PUBLISH",
    targetRef: input.headerBoardRef,
    requestedEffect: "publish_channel_projection",
    authorityRefs: [...input.authorityRefs],
    policyRefs: [...input.policyRefs],
    representationSourceRefs: [...input.representationSourceRefs],
    evidenceReadinessRef: input.evidenceReadinessRef,
    requestedAt: input.requestedAt,
    correlationId: input.correlationId,
  };
}
