import { describe, expect, it } from "vitest";
import type { ChannelClassification, HeaderBoardDraftV1 } from "./contracts.ts";
import { prepareHeaderBoardV1 } from "./projection.ts";
import { SyntheticChannelRegistryV1 } from "./registry.ts";

function register(
  registry: SyntheticChannelRegistryV1,
  channelRef: string,
  allowedClassifications: ChannelClassification[],
) {
  return registry.register({
    channelRef,
    ownerContextRef: "BRAND:VOI",
    subjectScopeRef: "PROGRAM:VOI-LAUNCH",
    status: "ACTIVE",
    allowedClassifications,
    routeRefs: [`ROUTE:${channelRef}`],
    version: 1,
    createdAt: "2026-09-01T00:00:00Z",
  });
}

function draft(channelRef: string): HeaderBoardDraftV1 {
  return {
    headerBoardRef: `HEADER:${channelRef}:001`,
    channelRef,
    publicationType: "STATUS",
    subjectRef: "STYLE:VJ-428",
    sourceEventRefs: ["EVENT:INVENTORY:428"],
    publisherPrincipalRef: "DIGITALME:VOI:OPS",
    publisherCapacityRef: "CAPACITY:VOI:OPS",
    audiencePolicyRef: "POLICY:CHANNEL",
    classification: "PUBLIC",
    effectiveFrom: "2026-09-01T00:00:00Z",
    actionCapabilities: ["SUBSCRIBE"],
    fields: {
      headline: { value: "VJ-428 is now available", classification: "PUBLIC" },
      customerOffer: { value: "Customer-only benefit", classification: "CUSTOMER" },
      partnerMarginBand: { value: "Partner-only range", classification: "PARTNER" },
      managementUnits: { value: 18240, classification: "MANAGEMENT" },
      supplierCost: { value: 725, classification: "CONFIDENTIAL" },
    },
    correlationId: `CORR:${channelRef}:001`,
  };
}

describe("Channel projection isolation", () => {
  it("keeps only explicitly allowed classes and preserves field classifications", () => {
    const registry = new SyntheticChannelRegistryV1();
    const partner = register(registry, "VSR-CHANNEL:PARTNER", ["PUBLIC", "PARTNER"]);
    const board = prepareHeaderBoardV1(draft(partner.channelRef), partner);
    expect(board.payload).toEqual({
      headline: "VJ-428 is now available",
      partnerMarginBand: "Partner-only range",
    });
    expect(board.fieldClassifications).toEqual({
      headline: "PUBLIC",
      partnerMarginBand: "PARTNER",
    });
    expect(board.payload).not.toHaveProperty("customerOffer");
    expect(board.payload).not.toHaveProperty("managementUnits");
  });

  it("rejects a board classification not admitted by the Channel", () => {
    const registry = new SyntheticChannelRegistryV1();
    const publicChannel = register(registry, "VSR-CHANNEL:PUBLIC", ["PUBLIC"]);
    expect(() =>
      prepareHeaderBoardV1(
        { ...draft(publicChannel.channelRef), classification: "MANAGEMENT" },
        publicChannel,
      ),
    ).toThrow("channel_classification_violation");
  });

  it("rejects secret-bearing field names before Warden admission", () => {
    const registry = new SyntheticChannelRegistryV1();
    const publicChannel = register(registry, "VSR-CHANNEL:PUBLIC", ["PUBLIC"]);
    const base = draft(publicChannel.channelRef);
    const unsafe: HeaderBoardDraftV1 = {
      ...base,
      fields: {
        ...base.fields,
        accessToken: { value: "do-not-publish", classification: "PUBLIC" },
      },
    };
    expect(() => prepareHeaderBoardV1(unsafe, publicChannel)).toThrow(
      "projection_secret_field_forbidden:accessToken",
    );
  });

  it("rejects inactive channels", () => {
    const registry = new SyntheticChannelRegistryV1();
    const active = register(registry, "VSR-CHANNEL:ACTIVE", ["PUBLIC"]);
    const inactive = { ...active, channelRef: "VSR-CHANNEL:INACTIVE", status: "INACTIVE" as const };
    expect(() => prepareHeaderBoardV1(draft(inactive.channelRef), inactive)).toThrow("channel_inactive");
  });
});
