import { describe, expect, it } from "vitest";
import type {
  ChannelV1,
  HeaderBoardV1,
  PublicationAdmissionRequestV1,
  ServiceDescriptorV1,
} from "./contracts.ts";

const channel: ChannelV1 = {
  channelRef: "VSR-CHANNEL:VOI:MANAGEMENT",
  ownerContextRef: "BRAND:VOI",
  subjectScopeRef: "PROGRAM:VOI-RETAIL",
  status: "ACTIVE",
  allowedClassifications: ["PUBLIC", "MANAGEMENT"],
  routeRefs: ["ROUTE:VSR-MANAGEMENT"],
  version: 1,
  createdAt: "2026-09-01T00:00:00Z",
};

const board: HeaderBoardV1 = {
  headerBoardRef: "HEADER:VOI:001",
  channelRef: channel.channelRef,
  publicationType: "STATUS",
  subjectRef: "STYLE:VJ-428",
  sourceEventRefs: ["EVENT:INVENTORY:428"],
  publisherPrincipalRef: "DIGITALME:PUBLISHER:001",
  publisherCapacityRef: "CAPACITY:BRAND-OPS",
  audiencePolicyRef: "POLICY:MANAGEMENT",
  classification: "MANAGEMENT",
  effectiveFrom: "2026-09-01T00:00:00Z",
  status: "PREPARED",
  actionCapabilities: ["ACKNOWLEDGE"],
  payload: { ready: true },
  fieldClassifications: { ready: "MANAGEMENT" },
  correlationId: "CORR:HEADER:001",
};

const admission: PublicationAdmissionRequestV1 = {
  requestRef: "REQUEST:HEADER:001",
  headerBoardRef: board.headerBoardRef,
  channelRef: board.channelRef,
  publisherPrincipalRef: board.publisherPrincipalRef,
  representedPrincipalRef: "BRAND:VOI",
  publisherCapacityRef: board.publisherCapacityRef,
  contextRef: "ALPHA-NODE-001",
  programRef: "PROGRAM:VOI-RETAIL",
  sourceEventRefs: board.sourceEventRefs,
  classification: board.classification,
  routeRefs: channel.routeRefs,
  actionCapabilities: board.actionCapabilities,
  authorityRefs: ["AUTHORITY:VOI:OPS"],
  policyRefs: [board.audiencePolicyRef],
  representationSourceRefs: ["REGISTRY:RELATIONSHIP:001"],
  evidenceReadinessRef: "RIVER-EVIDENCE-READINESS:001",
  requestedAt: "2026-09-01T00:00:01Z",
  correlationId: board.correlationId,
};

const descriptor: ServiceDescriptorV1 = {
  serviceRef: "SERVICE:VSR:ROUTE:001",
  handle: "@vsr.route.001",
  transport: "IN_MEMORY",
  endpoint: "memory://route/001",
  capabilityRefs: ["VSR-CAPABILITY-HEADER-BOARD-PUBLISH"],
  publicKeyFingerprint: `sha256:${"a".repeat(64)}`,
  signerRef: "GENESIS-SERVICE-REGISTRY",
  validFrom: "2026-09-01T00:00:00Z",
  validUntil: "2026-09-02T00:00:00Z",
  version: 1,
  signature: "base64:test",
};

// @ts-expect-error A Header Board never carries an executable Warden token.
board.actionToken = "FORBIDDEN";

// @ts-expect-error Service identity descriptors do not contain Warden decisions.
descriptor.wardenDecision = "ALLOW";

describe("Channel Fabric contracts", () => {
  it("keeps publication, field classification, service identity, and authority separate", () => {
    expect(channel.status).toBe("ACTIVE");
    expect(board.fieldClassifications.ready).toBe("MANAGEMENT");
    expect(admission.headerBoardRef).toBe(board.headerBoardRef);
    expect(descriptor.serviceRef).toBe("SERVICE:VSR:ROUTE:001");
  });
});
