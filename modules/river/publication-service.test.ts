import { describe, expect, it } from "vitest";
import { SyntheticRiverPublicationServiceV1 } from "./publication-service.ts";

const reservation = {
  reservationRef: "RIVER-RESERVATION:001",
  actionRef: "ACTION:001",
  wardenDecisionRef: "WARDEN-DECISION:001",
  correlationId: "CORR:001",
  authorizationDigest: "sha256:auth",
  state: "RESERVED" as const,
  reservedAt: "2026-09-01T00:02:00Z",
};

const input = {
  headerBoardRef: "HEADER:001",
  channelRef: "VSR-CHANNEL:001",
  routeRef: "ROUTE:001",
  sourceEventRefs: ["EVENT:INVENTORY:428"],
  reservation,
  state: "DELIVERED" as const,
  providerReceiptRef: "PROVIDER:MEMORY:001",
  payloadDigest: `sha256:${"a".repeat(64)}`,
  observedAt: "2026-09-01T00:03:00Z",
  correlationId: "CORR:001",
};

describe("River publication evidence", () => {
  it("links publication evidence without storing route payload or action token", () => {
    const river = new SyntheticRiverPublicationServiceV1();
    const receipt = river.record(input);
    expect(receipt.sourceEventRefs).toEqual(["EVENT:INVENTORY:428"]);
    expect(receipt.riverReservationRef).toBe(reservation.reservationRef);
    expect(receipt.wardenDecisionRef).toBe(reservation.wardenDecisionRef);
    expect(receipt).not.toHaveProperty("payload");
    expect(receipt).not.toHaveProperty("actionToken");
  });

  it("rejects correlation mismatch", () => {
    const river = new SyntheticRiverPublicationServiceV1();
    expect(() => river.record({ ...input, correlationId: "CORR:OTHER" })).toThrow(
      "river_publication_correlation_mismatch",
    );
  });

  it("is idempotent for the same evidence identity", () => {
    const river = new SyntheticRiverPublicationServiceV1();
    const first = river.record(input);
    const second = river.record(input);
    expect(second.receiptRef).toBe(first.receiptRef);
    expect(river.all()).toHaveLength(1);
  });
});
