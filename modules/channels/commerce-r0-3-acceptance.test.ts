import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type {
  CommerceEventObservationV1,
  CommerceSourceEventV1,
  CommerceSourceOwnerV1,
  CommerceSourcePolicyV1,
  CommerceSourceRoleV1,
  CommerceTransitionResultV1,
} from "../commerce-events/contracts.ts";
import { normalizeCommerceEventV1 } from "../commerce-events/normalizer.ts";
import {
  buildOrderClosedObservationV1,
  COURIER_DELIVERY_CLOSURE_PROFILE_V1,
} from "../commerce-events/order-closure.ts";
import { evaluateCommerceTransitionV1 } from "../commerce-events/transition-integrity.ts";
import { SyntheticRiverPublicationServiceV1 } from "../river/publication-service.ts";
import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import { bindCommerceObservationToHeaderBoardDraftV1 } from "./commerce-binding.ts";
import { getCommerceProjectionProfileV1 } from "./commerce-profiles.ts";
import type {
  ChannelClassification,
  ChannelV1,
  HeaderBoardV1,
  PublicationAdmissionRequestV1,
  ServiceRouteV1,
} from "./contracts.ts";
import { SyntheticInMemoryRouteAdapterV1 } from "./in-memory-route-adapter.ts";
import { buildPublicationWardenRequestV1 } from "./publication-admission.ts";
import { SyntheticChannelPublicationServiceV1 } from "./publication-service.ts";
import { prepareHeaderBoardV1 } from "./projection.ts";

const sourcePolicy: CommerceSourcePolicyV1 = {
  policyRef: "COMMERCE-SOURCE-POLICY:VOI:R0-3",
  version: 1,
  status: "ACTIVE",
  rules: [
    { eventType: "order_created", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "inventory_reserved", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "pick_task_created", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "item_packed", sourceOwner: "WOOQER", sourceRole: "EXECUTION_PROOF", sourceSystemRefs: ["SYSTEM:VOI:WOOQER"] },
    { eventType: "shipment_dispatched", sourceOwner: "CARRIER_FEED", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:CARRIER"] },
    { eventType: "shipment_delivered", sourceOwner: "CARRIER_FEED", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:CARRIER"] },
    { eventType: "shipment_delivered", sourceOwner: "EASYCOM_OMS", sourceRole: "INTEGRATION_OBSERVER", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
    { eventType: "invoice_created", sourceOwner: "LOGIC_ERP", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:LOGIC"] },
    { eventType: "return_created", sourceOwner: "EASYCOM_OMS", sourceRole: "AUTHORITATIVE_ORIGIN", sourceSystemRefs: ["SYSTEM:VOI:EASYCOM"] },
  ],
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function expectedEventRef(source: CommerceSourceEventV1): string {
  const material = [
    source.sourceSystemRef,
    source.sourceRecordRef,
    source.sourceRecordVersionRef ?? "",
    source.sourceEventName,
    source.correlationId,
  ].join("|");
  return `COMMERCE-EVENT:${createHash("sha256").update(material, "utf8").digest("hex").slice(0, 24)}`;
}

function sourceEvent(input: {
  sourceOwner: CommerceSourceOwnerV1;
  sourceRole: CommerceSourceRoleV1;
  sourceSystemRef: string;
  sourceEventName: string;
  sourceRecordRef: string;
  evidenceClass: string;
  occurredAt: string;
  predecessorEventRefs?: readonly string[];
  admittedFields: CommerceSourceEventV1["admittedFields"];
  fieldClassifications: CommerceSourceEventV1["fieldClassifications"];
}): CommerceSourceEventV1 {
  return {
    sourceOwner: input.sourceOwner,
    sourceRole: input.sourceRole,
    sourceSystemRef: input.sourceSystemRef,
    sourceEventName: input.sourceEventName,
    sourceRecordRef: input.sourceRecordRef,
    sourceRecordVersionRef: "VERSION:1",
    evidenceRefs: [`EVIDENCE:${input.sourceRecordRef}`],
    evidenceClasses: [input.evidenceClass],
    subjectRef: "ORDER:1001",
    placeRef: "NODE:VOI:COMMERCE",
    occurredAt: input.occurredAt,
    observedAt: new Date(Date.parse(input.occurredAt) + 1000).toISOString(),
    correlationId: "ORDER:1001",
    predecessorEventRefs: input.predecessorEventRefs ?? [],
    admittedFields: input.admittedFields,
    fieldClassifications: input.fieldClassifications,
    schemaVersion: "1.0.0",
  };
}

function makeJourney() {
  const order = sourceEvent({
    sourceOwner: "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:EASYCOM",
    sourceEventName: "ecom_order_created",
    sourceRecordRef: "EASYCOM:ORDER:1001",
    evidenceClass: "ORDER_RECORD",
    occurredAt: "2026-09-02T00:00:00Z",
    admittedFields: {
      orderRef: "ORDER:1001",
      marketplaceRef: "MARKETPLACE:MYNTRA",
      orderStatus: "CREATED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      marketplaceRef: "PARTNER",
      orderStatus: "MANAGEMENT",
    },
  });
  const reserved = sourceEvent({
    sourceOwner: "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:EASYCOM",
    sourceEventName: "inventory_reserved",
    sourceRecordRef: "EASYCOM:RESERVATION:1001",
    evidenceClass: "INVENTORY_RESERVATION",
    occurredAt: "2026-09-02T00:01:00Z",
    predecessorEventRefs: [expectedEventRef(order)],
    admittedFields: { orderRef: "ORDER:1001", reservationStatus: "RESERVED" },
    fieldClassifications: { orderRef: "GOVERNED_INTERNAL", reservationStatus: "MANAGEMENT" },
  });
  const pick = sourceEvent({
    sourceOwner: "EASYCOM_OMS",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:EASYCOM",
    sourceEventName: "pick_task_created",
    sourceRecordRef: "EASYCOM:PICK:1001",
    evidenceClass: "PICK_TASK",
    occurredAt: "2026-09-02T00:02:00Z",
    predecessorEventRefs: [expectedEventRef(reserved)],
    admittedFields: {
      orderRef: "ORDER:1001",
      taskRef: "TASK:PICK:1001",
      dueTime: "2026-09-02T00:03:00Z",
      customerPhone: "+91-0000000000",
      customerEmail: "customer@example.invalid",
      paymentMode: "CARD",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      taskRef: "WORKFORCE",
      dueTime: "WORKFORCE",
      customerPhone: "RESTRICTED",
      customerEmail: "RESTRICTED",
      paymentMode: "CONFIDENTIAL",
    },
  });
  const packed = sourceEvent({
    sourceOwner: "WOOQER",
    sourceRole: "EXECUTION_PROOF",
    sourceSystemRef: "SYSTEM:VOI:WOOQER",
    sourceEventName: "item_packed",
    sourceRecordRef: "WOOQER:PACK:1001",
    evidenceClass: "PACKING_PROOF",
    occurredAt: "2026-09-02T00:03:00Z",
    predecessorEventRefs: [expectedEventRef(pick)],
    admittedFields: {
      orderRef: "ORDER:1001",
      packageRef: "PACKAGE:1001",
      packingStatus: "PACKED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      packageRef: "WORKFORCE",
      packingStatus: "WORKFORCE",
    },
  });
  const dispatched = sourceEvent({
    sourceOwner: "CARRIER_FEED",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:CARRIER",
    sourceEventName: "shipment_dispatched",
    sourceRecordRef: "CARRIER:DISPATCH:1001",
    evidenceClass: "HANDOVER_PROOF",
    occurredAt: "2026-09-02T00:04:00Z",
    predecessorEventRefs: [expectedEventRef(packed)],
    admittedFields: {
      orderRef: "ORDER:1001",
      marketplaceRef: "MARKETPLACE:MYNTRA",
      shipmentStatus: "DISPATCHED",
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      marketplaceRef: "PARTNER",
      shipmentStatus: "GOVERNED_INTERNAL",
    },
  });
  const delivered = sourceEvent({
    sourceOwner: "CARRIER_FEED",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:CARRIER",
    sourceEventName: "shipment_delivered",
    sourceRecordRef: "CARRIER:DELIVERED:1001",
    evidenceClass: "DELIVERY_PROOF",
    occurredAt: "2026-09-02T00:05:00Z",
    predecessorEventRefs: [expectedEventRef(dispatched)],
    admittedFields: {
      orderRef: "ORDER:1001",
      deliveryStatus: "DELIVERED",
      customerPhone: "+91-0000000000",
      customerAddress: "RESTRICTED ADDRESS",
      warehouseBin: "BIN:A1",
      operatorRef: "OPERATOR:1",
      carrierRawPayload: { raw: "opaque" },
    },
    fieldClassifications: {
      orderRef: "GOVERNED_INTERNAL",
      deliveryStatus: "CUSTOMER",
      customerPhone: "RESTRICTED",
      customerAddress: "RESTRICTED",
      warehouseBin: "WORKFORCE",
      operatorRef: "WORKFORCE",
      carrierRawPayload: "RESTRICTED",
    },
  });
  const invoice = sourceEvent({
    sourceOwner: "LOGIC_ERP",
    sourceRole: "AUTHORITATIVE_ORIGIN",
    sourceSystemRef: "SYSTEM:VOI:LOGIC",
    sourceEventName: "invoice_created",
    sourceRecordRef: "LOGIC:INVOICE:1001",
    evidenceClass: "INVOICE_RECORD",
    occurredAt: "2026-09-02T00:06:00Z",
    admittedFields: { orderRef: "ORDER:1001", invoiceRef: "INVOICE:1001" },
    fieldClassifications: { orderRef: "GOVERNED_INTERNAL", invoiceRef: "CONFIDENTIAL" },
  });

  const sourceFixtures = deepFreeze([order, reserved, pick, packed, dispatched, delivered, invoice]);
  const sourceSnapshots = structuredClone(sourceFixtures);
  const observations: CommerceEventObservationV1[] = [];
  const transitions = new Map<string, CommerceTransitionResultV1>();
  for (const source of sourceFixtures) {
    const observation = normalizeCommerceEventV1({ source, policy: sourcePolicy });
    const transition = evaluateCommerceTransitionV1(observation, observations);
    expect(transition.state).toBe("ADMITTED");
    observations.push(observation);
    transitions.set(observation.eventRef, transition);
  }

  const byType = Object.fromEntries(observations.map((observation) => [observation.eventType, observation])) as Record<string, CommerceEventObservationV1>;
  const closed = buildOrderClosedObservationV1({
    orderRef: "ORDER:1001",
    profile: COURIER_DELIVERY_CLOSURE_PROFILE_V1,
    observations,
    sourceSystemRef: "SYSTEM:SYNNERGYZE",
    evidenceRefs: ["EVIDENCE:RECONCILIATION:ORDER:1001"],
    unresolvedBlockerRefs: [],
    occurredAt: "2026-09-02T00:07:00Z",
    observedAt: "2026-09-02T00:07:01Z",
  });
  transitions.set(closed.eventRef, evaluateCommerceTransitionV1(closed, observations));

  return { sourceFixtures, sourceSnapshots, observations, transitions, byType, closed };
}

function channelRoute(
  suffix: string,
  channelRef: string,
  allowedClassifications: readonly ChannelClassification[],
) {
  const routeRef = `ROUTE:COMMERCE:${suffix}`;
  const channel: ChannelV1 = {
    channelRef,
    ownerContextRef: "BRAND:VOI",
    subjectScopeRef: "PROGRAM:VOI:R0-3",
    status: "ACTIVE",
    allowedClassifications,
    routeRefs: [routeRef],
    version: 1,
    createdAt: "2026-09-02T00:08:00Z",
  };
  const route: ServiceRouteV1 = {
    routeRef,
    channelRef,
    serviceRef: `SERVICE:MEMORY:${suffix}`,
    transport: "IN_MEMORY",
    endpoint: `memory://commerce/${suffix.toLowerCase()}`,
    status: "ACTIVE",
    allowedClassifications,
  };
  return { channel, route, adapter: new SyntheticInMemoryRouteAdapterV1() };
}

function admission(board: HeaderBoardV1, routeRef: string): PublicationAdmissionRequestV1 {
  return {
    requestRef: `REQUEST:${board.headerBoardRef}`,
    headerBoardRef: board.headerBoardRef,
    channelRef: board.channelRef,
    publisherPrincipalRef: board.publisherPrincipalRef,
    representedPrincipalRef: "BRAND:VOI",
    publisherCapacityRef: board.publisherCapacityRef,
    contextRef: "ALPHA-NODE-001",
    programRef: "PROGRAM:VOI:R0-3",
    sourceEventRefs: board.sourceEventRefs,
    classification: board.classification,
    routeRefs: [routeRef],
    actionCapabilities: board.actionCapabilities,
    authorityRefs: ["AUTHORITY:VOI:OPS"],
    policyRefs: [board.audiencePolicyRef],
    representationSourceRefs: ["REGISTRY:REL:VOI:OPS"],
    evidenceReadinessRef: "RIVER-EVIDENCE-READINESS:R0-3",
    requestedAt: "2026-09-02T00:10:00Z",
    correlationId: board.correlationId,
  };
}

function allow(
  request: ReturnType<typeof buildPublicationWardenRequestV1>,
  decisionRef: string,
  validUntil = "2026-09-02T00:20:00Z",
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
    decidedAt: "2026-09-02T00:10:01Z",
    validUntil,
    correlationId: request.correlationId,
    actionToken: `TOKEN:${decisionRef}`,
  };
}

function deny(request: ReturnType<typeof buildPublicationWardenRequestV1>): WardenDecisionV1 {
  return {
    decisionRef: `WARDEN-DENY:${request.targetRef}`,
    requestRef: request.requestRef,
    wardenRef: "WARDEN-ALPHA-RC1-001",
    decision: "DENY",
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: ["AUTHORITY_MISSING"],
    constraints: [],
    decidedAt: "2026-09-02T00:10:01Z",
    correlationId: request.correlationId,
  };
}

function preparedBoard(input: {
  observation: CommerceEventObservationV1;
  transition: CommerceTransitionResultV1;
  profileRef: string;
  channel: ChannelV1;
  headerBoardRef: string;
}): HeaderBoardV1 {
  const draft = bindCommerceObservationToHeaderBoardDraftV1({
    observation: input.observation,
    transition: input.transition,
    profile: getCommerceProjectionProfileV1(input.profileRef),
    headerBoardRef: input.headerBoardRef,
    publisherPrincipalRef: "DIGITALME:VOI:OPS",
    publisherCapacityRef: "CAPACITY:VOI:OPS",
    effectiveFrom: "2026-09-02T00:09:00Z",
  });
  return prepareHeaderBoardV1(draft, input.channel);
}

async function publishAllowed(input: {
  board: HeaderBoardV1;
  route: ServiceRouteV1;
  adapter: SyntheticInMemoryRouteAdapterV1;
  riverPublications: SyntheticRiverPublicationServiceV1;
}) {
  const request = buildPublicationWardenRequestV1(admission(input.board, input.route.routeRef));
  const service = new SyntheticChannelPublicationServiceV1(
    new SyntheticRiverReservationServiceV1(),
    input.riverPublications,
    input.adapter,
  );
  return service.publish({
    board: input.board,
    route: input.route,
    wardenRequest: request,
    wardenDecision: allow(request, `WARDEN-ALLOW:${input.board.headerBoardRef}`),
    reservedAt: "2026-09-02T00:10:02Z",
    observedAt: "2026-09-02T00:10:03Z",
  });
}

describe("VSR Commerce Event Binding R0.3 acceptance", () => {
  it("publishes a multi-source order journey through the existing R0.1 rail without mutating sources", async () => {
    const journey = makeJourney();
    const riverPublications = new SyntheticRiverPublicationServiceV1();
    const orders = channelRoute("ORDERS", "VSR-CHANNEL:COMMERCE:ORDERS", ["GOVERNED_INTERNAL", "PARTNER", "MANAGEMENT", "CUSTOMER"]);
    const warehouse = channelRoute("WAREHOUSE", "VSR-CHANNEL:COMMERCE:WAREHOUSE", ["GOVERNED_INTERNAL", "WORKFORCE"]);
    const marketplace = channelRoute("MARKETPLACE", "VSR-CHANNEL:COMMERCE:MARKETPLACE", ["PARTNER"]);
    const logistics = channelRoute("LOGISTICS", "VSR-CHANNEL:COMMERCE:LOGISTICS", ["GOVERNED_INTERNAL"]);
    const management = channelRoute("MANAGEMENT", "VSR-CHANNEL:COMMERCE:MANAGEMENT", ["MANAGEMENT"]);

    const milestones = [
      { observation: journey.byType.order_created, profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED", surface: orders, ref: "HEADER:R0-3:ORDER" },
      { observation: journey.byType.pick_task_created, profileRef: "PROFILE:COMMERCE:WAREHOUSE:PICK-TASK", surface: warehouse, ref: "HEADER:R0-3:PICK" },
      { observation: journey.byType.item_packed, profileRef: "PROFILE:COMMERCE:WAREHOUSE:PACKED", surface: warehouse, ref: "HEADER:R0-3:PACKED" },
      { observation: journey.byType.shipment_dispatched, profileRef: "PROFILE:COMMERCE:MARKETPLACE:MYNTRA:SHIPMENT", surface: marketplace, ref: "HEADER:R0-3:MARKETPLACE-DISPATCH" },
      { observation: journey.byType.shipment_dispatched, profileRef: "PROFILE:COMMERCE:LOGISTICS:DISPATCHED", surface: logistics, ref: "HEADER:R0-3:LOGISTICS-DISPATCH" },
      { observation: journey.byType.shipment_delivered, profileRef: "PROFILE:COMMERCE:LOGISTICS:DELIVERED", surface: logistics, ref: "HEADER:R0-3:DELIVERED" },
      { observation: journey.closed, profileRef: "PROFILE:COMMERCE:MANAGEMENT:ORDER-CLOSED", surface: management, ref: "HEADER:R0-3:CLOSED" },
    ] as const;

    const expectedLineage: Array<{ headerBoardRef: string; eventRef: string }> = [];
    for (const milestone of milestones) {
      const transition = journey.transitions.get(milestone.observation.eventRef);
      if (!transition) throw new Error("missing_transition_fixture");
      const board = preparedBoard({
        observation: milestone.observation,
        transition,
        profileRef: milestone.profileRef,
        channel: milestone.surface.channel,
        headerBoardRef: milestone.ref,
      });
      const outcome = await publishAllowed({
        board,
        route: milestone.surface.route,
        adapter: milestone.surface.adapter,
        riverPublications,
      });
      expect(outcome.state).toBe("PUBLISHED");
      if (outcome.state !== "PUBLISHED") throw new Error("expected_published");
      expect(outcome.receipt.sourceEventRefs).toEqual([milestone.observation.eventRef]);
      expectedLineage.push({ headerBoardRef: board.headerBoardRef, eventRef: milestone.observation.eventRef });
    }

    expect(orders.adapter.deliveryCount()).toBe(1);
    expect(warehouse.adapter.deliveryCount()).toBe(2);
    expect(marketplace.adapter.deliveryCount()).toBe(1);
    expect(logistics.adapter.deliveryCount()).toBe(2);
    expect(management.adapter.deliveryCount()).toBe(1);
    expect(riverPublications.all()).toHaveLength(expectedLineage.length);
    expect(riverPublications.all().map((receipt) => ({ headerBoardRef: receipt.headerBoardRef, eventRef: receipt.sourceEventRefs[0] }))).toEqual(expectedLineage);
    expect(journey.sourceFixtures).toEqual(journey.sourceSnapshots);
  });

  it("retains out-of-order delivery for reconciliation but creates zero publication effect", () => {
    const journey = makeJourney();
    const pick = journey.byType.pick_task_created;
    const deliveredSource = deepFreeze(sourceEvent({
      sourceOwner: "CARRIER_FEED",
      sourceRole: "AUTHORITATIVE_ORIGIN",
      sourceSystemRef: "SYSTEM:VOI:CARRIER",
      sourceEventName: "shipment_delivered",
      sourceRecordRef: "CARRIER:FORGED-DELIVERED:1001",
      evidenceClass: "DELIVERY_PROOF",
      occurredAt: "2026-09-02T00:05:30Z",
      predecessorEventRefs: [pick.eventRef],
      admittedFields: { orderRef: "ORDER:1001", deliveryStatus: "DELIVERED" },
      fieldClassifications: { orderRef: "GOVERNED_INTERNAL", deliveryStatus: "GOVERNED_INTERNAL" },
    }));
    const forged = normalizeCommerceEventV1({ source: deliveredSource, policy: sourcePolicy });
    const transition = evaluateCommerceTransitionV1(forged, [pick]);
    expect(transition.state).toBe("RECONCILIATION_REQUIRED");
    const profile = getCommerceProjectionProfileV1("PROFILE:COMMERCE:LOGISTICS:DELIVERED");
    expect(() => bindCommerceObservationToHeaderBoardDraftV1({
      observation: forged,
      transition,
      profile,
      headerBoardRef: "HEADER:R0-3:FORGED",
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      effectiveFrom: "2026-09-02T00:09:00Z",
    })).toThrow("COMMERCE_TRANSITION_NOT_ADMITTED");
    const adapter = new SyntheticInMemoryRouteAdapterV1();
    expect(adapter.deliveryCount()).toBe(0);
  });

  it("rejects source-role elevation before a Header Board exists", () => {
    const journey = makeJourney();
    const elevated = deepFreeze({
      ...journey.sourceFixtures[5],
      sourceOwner: "EASYCOM_OMS" as const,
      sourceRole: "AUTHORITATIVE_ORIGIN" as const,
      sourceSystemRef: "SYSTEM:VOI:EASYCOM",
      sourceRecordRef: "EASYCOM:DELIVERED-OBSERVER:1001",
    });
    expect(() => normalizeCommerceEventV1({ source: elevated, policy: sourcePolicy })).toThrow(
      "SOURCE_ROLE_NOT_PERMITTED",
    );
  });

  it("rejects cross-marketplace and cross-order leakage before routing", () => {
    const journey = makeJourney();
    const dispatched = journey.byType.shipment_dispatched;
    const transition = journey.transitions.get(dispatched.eventRef)!;
    const flipkart: CommerceEventObservationV1 = {
      ...dispatched,
      admittedFields: { ...dispatched.admittedFields, marketplaceRef: "MARKETPLACE:FLIPKART" },
    };
    expect(() => bindCommerceObservationToHeaderBoardDraftV1({
      observation: flipkart,
      transition: { ...transition, observationRef: flipkart.eventRef },
      profile: getCommerceProjectionProfileV1("PROFILE:COMMERCE:MARKETPLACE:MYNTRA:SHIPMENT"),
      headerBoardRef: "HEADER:R0-3:FLIPKART-WITH-MYNTRA",
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      effectiveFrom: "2026-09-02T00:09:00Z",
    })).toThrow("CROSS_MARKETPLACE_LEAKAGE");

    const wrongOrderSource = {
      ...journey.sourceFixtures[0],
      sourceRecordRef: "EASYCOM:ORDER:WRONG-CORRELATION",
      admittedFields: { ...journey.sourceFixtures[0].admittedFields, orderRef: "ORDER:9999" },
    };
    expect(() => normalizeCommerceEventV1({ source: wrongOrderSource, policy: sourcePolicy })).toThrow(
      "CORRELATION_MISMATCH",
    );

    const order = journey.byType.order_created;
    const manualWrongOrder: CommerceEventObservationV1 = {
      ...order,
      admittedFields: { ...order.admittedFields, orderRef: "ORDER:9999" },
    };
    expect(() => bindCommerceObservationToHeaderBoardDraftV1({
      observation: manualWrongOrder,
      transition: { ...journey.transitions.get(order.eventRef)!, observationRef: manualWrongOrder.eventRef },
      profile: getCommerceProjectionProfileV1("PROFILE:COMMERCE:ORDERS:ORDER-CREATED"),
      headerBoardRef: "HEADER:R0-3:CROSS-ORDER",
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      effectiveFrom: "2026-09-02T00:09:00Z",
    })).toThrow("CROSS_ORDER_LEAKAGE");
  });

  it("minimizes customer and workforce projections", () => {
    const journey = makeJourney();
    const delivered = journey.byType.shipment_delivered;
    const customerDraft = bindCommerceObservationToHeaderBoardDraftV1({
      observation: delivered,
      transition: journey.transitions.get(delivered.eventRef)!,
      profile: getCommerceProjectionProfileV1("PROFILE:COMMERCE:CUSTOMER:DELIVERED"),
      headerBoardRef: "HEADER:R0-3:CUSTOMER-DELIVERED",
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      effectiveFrom: "2026-09-02T00:09:00Z",
    });
    expect(Object.keys(customerDraft.fields)).toEqual(["orderRef", "deliveryStatus"]);
    expect(customerDraft.fields).not.toHaveProperty("customerPhone");
    expect(customerDraft.fields).not.toHaveProperty("customerAddress");
    expect(customerDraft.fields).not.toHaveProperty("carrierRawPayload");

    const pick = journey.byType.pick_task_created;
    const workforceDraft = bindCommerceObservationToHeaderBoardDraftV1({
      observation: pick,
      transition: journey.transitions.get(pick.eventRef)!,
      profile: getCommerceProjectionProfileV1("PROFILE:COMMERCE:WORKFORCE:PICK-TASK"),
      headerBoardRef: "HEADER:R0-3:WORKFORCE-PICK",
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      effectiveFrom: "2026-09-02T00:09:00Z",
    });
    expect(Object.keys(workforceDraft.fields)).toEqual(["orderRef", "taskRef", "dueTime"]);
    expect(workforceDraft.fields).not.toHaveProperty("customerPhone");
    expect(workforceDraft.fields).not.toHaveProperty("customerEmail");
    expect(workforceDraft.fields).not.toHaveProperty("paymentMode");
  });

  it("proves Warden DENY creates zero route and River publication effects", async () => {
    const journey = makeJourney();
    const order = journey.byType.order_created;
    const surface = channelRoute("DENY", "VSR-CHANNEL:COMMERCE:ORDERS", ["GOVERNED_INTERNAL", "PARTNER", "MANAGEMENT"]);
    const board = preparedBoard({
      observation: order,
      transition: journey.transitions.get(order.eventRef)!,
      profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
      channel: surface.channel,
      headerBoardRef: "HEADER:R0-3:DENIED",
    });
    const request = buildPublicationWardenRequestV1(admission(board, surface.route.routeRef));
    const riverPublications = new SyntheticRiverPublicationServiceV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      riverPublications,
      surface.adapter,
    );
    const outcome = await service.publish({
      board,
      route: surface.route,
      wardenRequest: request,
      wardenDecision: deny(request),
      reservedAt: "2026-09-02T00:10:02Z",
      observedAt: "2026-09-02T00:10:03Z",
    });
    expect(outcome.state).toBe("DENIED");
    expect(surface.adapter.deliveryCount()).toBe(0);
    expect(riverPublications.all()).toHaveLength(0);
  });

  it("proves expired Warden validity causes River reservation failure before routing", async () => {
    const journey = makeJourney();
    const order = journey.byType.order_created;
    const surface = channelRoute("EXPIRED", "VSR-CHANNEL:COMMERCE:ORDERS", ["GOVERNED_INTERNAL", "PARTNER", "MANAGEMENT"]);
    const board = preparedBoard({
      observation: order,
      transition: journey.transitions.get(order.eventRef)!,
      profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
      channel: surface.channel,
      headerBoardRef: "HEADER:R0-3:EXPIRED",
    });
    const request = buildPublicationWardenRequestV1(admission(board, surface.route.routeRef));
    const riverPublications = new SyntheticRiverPublicationServiceV1();
    const service = new SyntheticChannelPublicationServiceV1(
      new SyntheticRiverReservationServiceV1(),
      riverPublications,
      surface.adapter,
    );
    await expect(service.publish({
      board,
      route: surface.route,
      wardenRequest: request,
      wardenDecision: allow(request, "WARDEN-ALLOW:EXPIRED", "2026-09-02T00:10:01.500Z"),
      reservedAt: "2026-09-02T00:10:02Z",
      observedAt: "2026-09-02T00:10:03Z",
    })).rejects.toThrow("river_warden_decision_expired");
    expect(surface.adapter.deliveryCount()).toBe(0);
    expect(riverPublications.all()).toHaveLength(0);
  });
});
