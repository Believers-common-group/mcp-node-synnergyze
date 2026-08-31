import { createHash } from "node:crypto";
import type { SyntheticRiverPublicationServiceV1 } from "../river/publication-service.ts";
import { buildAuthorizedActionEnvelopeV1 } from "../river/reservation-service.ts";
import type { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import { classificationAllowed } from "./classification.ts";
import type {
  ChannelDeliveryEnvelopeV1,
  HeaderBoardV1,
  PublicationReceiptV1,
  ServiceRouteV1,
} from "./contracts.ts";
import type { ChannelRouteAdapterV1 } from "./route-adapter.ts";

export type ChannelPublicationOutcomeV1 =
  | { state: "DENIED" | "ESCALATED"; receipt?: never }
  | { state: "PUBLISHED" | "DELIVERY_FAILED" | "DELIVERY_UNCERTAIN"; receipt: PublicationReceiptV1 };

export interface ChannelPublicationInputV1 {
  board: HeaderBoardV1;
  route: ServiceRouteV1;
  wardenRequest: WardenDecisionRequestV1;
  wardenDecision: WardenDecisionV1;
  reservedAt: string;
  observedAt: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertRouteAdmitsBoard(board: HeaderBoardV1, route: ServiceRouteV1): void {
  if (!classificationAllowed(board.classification, route.allowedClassifications)) {
    throw new Error(`route_board_classification_violation:${board.classification}`);
  }
  for (const classification of Object.values(board.fieldClassifications)) {
    if (!classificationAllowed(classification, route.allowedClassifications)) {
      throw new Error(`route_payload_classification_violation:${classification}`);
    }
  }
}

export class SyntheticChannelPublicationServiceV1 {
  constructor(
    private readonly riverReservations: SyntheticRiverReservationServiceV1,
    private readonly riverPublications: SyntheticRiverPublicationServiceV1,
    private readonly routeAdapter: ChannelRouteAdapterV1,
  ) {}

  async publish(input: ChannelPublicationInputV1): Promise<ChannelPublicationOutcomeV1> {
    if (input.route.status !== "ACTIVE") throw new Error("route_inactive");
    if (input.route.channelRef !== input.board.channelRef) throw new Error("route_channel_mismatch");
    assertRouteAdmitsBoard(input.board, input.route);
    if (input.wardenRequest.targetRef !== input.board.headerBoardRef) {
      throw new Error("publication_warden_target_mismatch");
    }
    if (input.wardenRequest.correlationId !== input.board.correlationId) {
      throw new Error("publication_warden_correlation_mismatch");
    }
    if (input.wardenDecision.decision !== "ALLOW") {
      return { state: input.wardenDecision.decision === "DENY" ? "DENIED" : "ESCALATED" };
    }

    const action = buildAuthorizedActionEnvelopeV1(input.wardenRequest, input.wardenDecision);
    const reservation = this.riverReservations.reserve({
      request: input.wardenRequest,
      decision: input.wardenDecision,
      action,
      reservedAt: input.reservedAt,
    });

    const payloadDigest = `sha256:${digest(JSON.stringify(input.board.payload))}`;
    const deliveryRef = `DELIVERY:${digest(
      `${input.board.headerBoardRef}|${input.route.routeRef}|${input.board.correlationId}`,
    ).slice(0, 24)}`;
    const envelope: ChannelDeliveryEnvelopeV1 = {
      deliveryRef,
      headerBoardRef: input.board.headerBoardRef,
      channelRef: input.board.channelRef,
      routeRef: input.route.routeRef,
      subjectRef: input.board.subjectRef,
      classification: input.board.classification,
      publicationType: input.board.publicationType,
      effectiveFrom: input.board.effectiveFrom,
      effectiveUntil: input.board.effectiveUntil,
      actionCapabilities: [...input.board.actionCapabilities],
      payload: structuredClone(input.board.payload),
      correlationId: input.board.correlationId,
    };

    const delivery = await this.routeAdapter.publish(envelope);
    const receipt = this.riverPublications.record({
      headerBoardRef: input.board.headerBoardRef,
      channelRef: input.board.channelRef,
      routeRef: input.route.routeRef,
      sourceEventRefs: input.board.sourceEventRefs,
      reservation,
      state: delivery.state,
      providerReceiptRef: delivery.providerReceiptRef,
      payloadDigest,
      observedAt: input.observedAt,
      correlationId: input.board.correlationId,
    });

    if (delivery.state === "DELIVERED") return { state: "PUBLISHED", receipt };
    return { state: delivery.state, receipt };
  }
}
