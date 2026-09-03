import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import {
  AmazonOrdersGovernedRuntimeV1,
  InMemoryAmazonRegistryProjectionWriterV1,
} from "./governed-orders-runtime.ts";

const action: ActionEnvelopeV1 = {
  actionRef: "ACTION:AMAZON-RESTRICTED-DATA-001",
  requestRef: "REQUEST:AMAZON-RESTRICTED-DATA-001",
  actorRef: "DIGITALME-ALPHA-TEST-001",
  representedPrincipalRef: "ORG:VOI-JEANS-TEST-001",
  actingCapacityRef: "CAPACITY:AMAZON-SELLER-OPERATOR-001",
  contextRef: "ALPHA-NODE-001",
  programRef: "SYNNERGYZE-PROGRAM:AMAZON-ORDER-SYNC-001",
  eventRef: "EVENT:AMAZON-RESTRICTED-DATA-001",
  action: "amazon.orders.search",
  capabilityRef: "amazon.orders.search",
  targetRef: "AMAZON-SPAPI:SELLER-ACCOUNT-TEST-001",
  wardenDecisionRef: "DECISION:AMAZON-RESTRICTED-DATA-001",
  actionToken: "ACTION-TOKEN:AMAZON-RESTRICTED-DATA-001",
  requestedAt: "2026-08-23T04:35:00.000Z",
  correlationId: "CORR:AMAZON-RESTRICTED-DATA-001",
};

const decision: WardenAllowDecisionV1 = {
  decisionRef: action.wardenDecisionRef,
  requestRef: action.requestRef,
  wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
  action: action.action,
  targetRef: action.targetRef,
  decision: "ALLOW",
  actionToken: action.actionToken,
  reasonCodes: ["bounded_non_restricted_order_observation"],
  constraints: ["READ_ONLY_PROVIDER_EFFECT", "NO_RESTRICTED_DATA"],
  decidedAt: "2026-08-23T04:35:01.000Z",
  validUntil: "2026-08-23T04:40:00.000Z",
  correlationId: action.correlationId,
};

const reservation: EvidenceReservationV1 = {
  reservationRef: "RIVER-RESERVATION:AMAZON-RESTRICTED-DATA-001",
  actionRef: action.actionRef,
  wardenDecisionRef: decision.decisionRef,
  correlationId: action.correlationId,
  authorizationDigest: "sha256:fixture",
  state: "RESERVED",
  reservedAt: "2026-08-23T04:35:02.000Z",
};

const checkpoint: WardenExecutionCheckpointV1 = {
  checkpointRef: "WARDEN-CHECKPOINT:AMAZON-RESTRICTED-DATA-001",
  decisionRef: decision.decisionRef,
  wardenRef: decision.wardenRef,
  correlationId: decision.correlationId,
  state: "VALID",
  checkedAt: "2026-08-23T04:35:03.000Z",
  reasonCodes: ["decision_active_for_execution"],
};

function runtime(calls: string[]) {
  return new AmazonOrdersGovernedRuntimeV1({
    config: {
      endpoint: "https://sellingpartnerapi-eu.amazon.com",
      lwaTokenEndpoint: "https://api.amazon.com/auth/o2/token",
      lwaClientId: "client-id",
      lwaClientSecret: "client-secret",
      refreshToken: "refresh-token",
      marketplaceIds: ["A21TJRUUN4KGV"],
      userAgent: "VSR-Amazon-Orders-R0.1/0.1 (Language=TypeScript)",
    },
    fetchImpl: async (input) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      return new Response(JSON.stringify({ access_token: "unexpected" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    registryWriter: new InMemoryAmazonRegistryProjectionWriterV1(),
  });
}

describe("PROVIDER-AMAZON-ORDERS-RESTRICTED-DATA-001", () => {
  for (const includedData of ["BUYER", "RECIPIENT", "TAX", "PAYMENT"] as const) {
    it(`blocks ${includedData} before requesting an Amazon access token`, async () => {
      const calls: string[] = [];
      const result = await runtime(calls).sync({
        action,
        reservation,
        decision,
        checkpoint,
        query: {
          createdAfter: "2026-08-23T04:30:00Z",
          includedData: [includedData],
        },
        executedAt: "2026-08-23T04:35:04.000Z",
        observedAt: "2026-08-23T04:35:05.000Z",
      });

      expect(result.state).toBe("EXCEPTION");
      expect(result.exception?.code).toBe("AMAZON_RESPONSE_INVALID");
      expect(result.exception?.reason).toBe(
        "amazon_orders_restricted_data_requires_separate_capability",
      );
      expect(calls).toHaveLength(0);
      expect(result.registry.orderRefs).toEqual([]);
      expect(result.silk.moneyMoved).toBe(false);
    });
  }
});
