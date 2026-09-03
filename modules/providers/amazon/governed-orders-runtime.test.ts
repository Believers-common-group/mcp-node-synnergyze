import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../../river/reservation-service.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../../warden/decision-service.ts";
import {
  AmazonOrdersGovernedRuntimeV1,
  InMemoryAmazonRegistryProjectionWriterV1,
  type AmazonSpApiConfigV1,
} from "./governed-orders-runtime.ts";

const REQUESTED_AT = "2026-08-23T04:35:00.000Z";
const DECIDED_AT = "2026-08-23T04:35:01.000Z";
const RESERVED_AT = "2026-08-23T04:35:02.000Z";
const CHECKED_AT = "2026-08-23T04:35:03.000Z";
const EXECUTED_AT = "2026-08-23T04:35:04.000Z";
const OBSERVED_AT = "2026-08-23T04:35:05.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:AMAZON-ORDERS-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "ORG:VOI-JEANS-TEST-001",
    actingCapacityRef: "CAPACITY:AMAZON-SELLER-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:AMAZON-ORDER-SYNC-001",
    eventRef: "SYNNERGYZE-EVENT:AMAZON-ORDER-SYNC-001:001",
    action: "amazon.orders.search",
    capabilityRef: "amazon.orders.search",
    targetRef: "AMAZON-SPAPI:SELLER-ACCOUNT-TEST-001",
    requestedEffect: "amazon.orders.observed",
    authorityRefs: ["AUTHORITY:AMAZON-SELLER-READ-001"],
    policyRefs: ["POLICY:AMAZON-ORDER-SYNC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-AMAZON-SELLER-001"],
    evidenceReadinessRef: "RIVER:EVIDENCE-READY:AMAZON-001",
    requestedAt: REQUESTED_AT,
    correlationId: "CORR-AMAZON-ORDER-SYNC-001",
    ...overrides,
  };
}

function policy(
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:AMAZON-ORDERS-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T04:30:00.000Z",
    validUntil: "2026-08-23T04:40:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "ORG:VOI-JEANS-TEST-001",
    actingCapacityRef: "CAPACITY:AMAZON-SELLER-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:AMAZON-ORDER-SYNC-001",
    requiredAuthorityRefs: ["AUTHORITY:AMAZON-SELLER-READ-001"],
    requiredPolicyRefs: ["POLICY:AMAZON-ORDER-SYNC-001"],
    allowedCapabilityRefs: ["amazon.orders.search"],
    manualReviewCapabilityRefs: ["amazon.listings.put"],
    constraints: ["READ_ONLY_PROVIDER_EFFECT", "NO_SETTLEMENT_FINALITY"],
    ...overrides,
  };
}

function allowedChain() {
  const requestValue = request();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: policy(),
    decidedAt: DECIDED_AT,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_chain");

  const action = buildAuthorizedActionEnvelopeV1(requestValue, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({
    request: requestValue,
    decision,
    action,
    reservedAt: RESERVED_AT,
  });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${decision.decisionRef}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["decision_active_for_execution"],
  };
  return { request: requestValue, decision, action, reservation, checkpoint };
}

function deniedChain() {
  const requestValue = request();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: policy({ allowedCapabilityRefs: [] }),
    decidedAt: DECIDED_AT,
  });
  if (decision.decision === "ALLOW") throw new Error("expected_denied_chain");
  return { request: requestValue, decision };
}

function config(): AmazonSpApiConfigV1 {
  return {
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
    lwaTokenEndpoint: "https://api.amazon.com/auth/o2/token",
    lwaClientId: "amzn1.application-oa2-client.test",
    lwaClientSecret: "test-secret-never-log",
    refreshToken: "Atzr|test-refresh-token-never-log",
    marketplaceIds: ["A21TJRUUN4KGV"],
    userAgent: "VSR-Amazon-Orders-R0.1/0.1 (Language=TypeScript)",
  };
}

function successFetch(calls: Array<{ url: string; init?: RequestInit }>) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (url === "https://api.amazon.com/auth/o2/token") {
      return new Response(
        JSON.stringify({ access_token: "Atza|test-access-token-never-persist", expires_in: 3600, token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.startsWith("https://sellingpartnerapi-eu.amazon.com/orders/2026-01-01/orders?")) {
      return new Response(
        JSON.stringify({
          orders: [
            {
              orderId: "171-1234567-1234567",
              createdTime: "2026-08-23T04:31:00Z",
              lastUpdatedTime: "2026-08-23T04:32:00Z",
              salesChannel: {
                channelName: "AMAZON",
                marketplaceId: "A21TJRUUN4KGV",
                marketplaceName: "Amazon.in",
              },
              proceeds: {
                proceedsTotal: { amount: "1499.00", currencyCode: "INR" },
              },
              fulfillment: { quantityFulfilled: 1, quantityUnfulfilled: 0 },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-amzn-requestid": "AMAZON-REQUEST-TEST-001",
          },
        },
      );
    }

    return new Response(JSON.stringify({ errors: [{ code: "UnexpectedRequest" }] }), { status: 500 });
  };
}

describe("PROVIDER-AMAZON-ORDERS-E2E-001", () => {
  it("carries an authorized Amazon order observation through provider evidence, Registry, SILK non-final economics, and equivalent VSR/Empire projections", async () => {
    const chain = allowedChain();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const registry = new InMemoryAmazonRegistryProjectionWriterV1();
    const runtime = new AmazonOrdersGovernedRuntimeV1({
      config: config(),
      fetchImpl: successFetch(calls),
      registryWriter: registry,
    });

    const result = await runtime.sync({
      action: chain.action,
      reservation: chain.reservation,
      decision: chain.decision,
      checkpoint: chain.checkpoint,
      query: {
        createdAfter: "2026-08-23T04:30:00Z",
        includedData: ["PROCEEDS", "FULFILLMENT"],
      },
      executedAt: EXECUTED_AT,
      observedAt: OBSERVED_AT,
    });

    expect(result.state).toBe("SYNCED");
    expect(result.provider.providerRequestRef).toBe("AMAZON-REQUEST-TEST-001");
    expect(result.provider.operation).toBe("searchOrders");
    expect(result.provider.responseDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.provider.accessTokenPersisted).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Atza|test-access-token-never-persist");
    expect(JSON.stringify(result)).not.toContain("test-secret-never-log");
    expect(JSON.stringify(result)).not.toContain("Atzr|test-refresh-token-never-log");

    expect(result.river.reservationRef).toBe(chain.reservation.reservationRef);
    expect(result.river.observationEvidenceRef).toMatch(/^AMAZON-PROVIDER-EVIDENCE:/);
    expect(result.registry.orderRefs).toEqual(["AMAZON-ORDER:171-1234567-1234567"]);
    expect(registry.projectionCount()).toBe(1);

    expect(result.silk.state).toBe("OBSERVED_NONFINAL");
    expect(result.silk.settlementFinality).toBe(false);
    expect(result.silk.moneyMoved).toBe(false);
    expect(result.silk.observedProceeds).toEqual([
      { orderRef: "AMAZON-ORDER:171-1234567-1234567", amount: "1499.00", currency: "INR" },
    ]);

    expect(result.vsr.registryRevisionRef).toBe(result.empire.registryRevisionRef);
    expect(result.vsr.orderRefs).toEqual(result.empire.orderRefs);
    expect(result.realWorldWriteEffectOccurred).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init?.headers).toMatchObject({
      "x-amz-access-token": "Atza|test-access-token-never-persist",
    });
  });

  it("fails closed before Amazon when Warden does not allow the capability", async () => {
    const chain = deniedChain();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const registry = new InMemoryAmazonRegistryProjectionWriterV1();
    const runtime = new AmazonOrdersGovernedRuntimeV1({
      config: config(),
      fetchImpl: successFetch(calls),
      registryWriter: registry,
    });

    const result = await runtime.syncDenied({
      request: chain.request,
      decision: chain.decision,
      observedAt: OBSERVED_AT,
    });

    expect(result.state).toBe("DENIED");
    expect(result.providerInvoked).toBe(false);
    expect(result.realWorldWriteEffectOccurred).toBe(false);
    expect(calls).toHaveLength(0);
    expect(registry.projectionCount()).toBe(0);
  });

  it("records an exception and leaves Registry unchanged when Amazon fails", async () => {
    const chain = allowedChain();
    const registry = new InMemoryAmazonRegistryProjectionWriterV1();
    const runtime = new AmazonOrdersGovernedRuntimeV1({
      config: config(),
      fetchImpl: async (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "https://api.amazon.com/auth/o2/token") {
          return new Response(JSON.stringify({ access_token: "Atza|ephemeral", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ errors: [{ code: "ServiceUnavailable" }] }), {
          status: 503,
          headers: { "content-type": "application/json", "x-amzn-requestid": "AMAZON-FAIL-001" },
        });
      },
      registryWriter: registry,
    });

    const result = await runtime.sync({
      action: chain.action,
      reservation: chain.reservation,
      decision: chain.decision,
      checkpoint: chain.checkpoint,
      query: { createdAfter: "2026-08-23T04:30:00Z" },
      executedAt: EXECUTED_AT,
      observedAt: OBSERVED_AT,
    });

    expect(result.state).toBe("EXCEPTION");
    expect(result.exception?.code).toBe("AMAZON_PROVIDER_ERROR");
    expect(result.river.state).toBe("EXCEPTION");
    expect(registry.projectionCount()).toBe(0);
    expect(result.realWorldWriteEffectOccurred).toBe(false);
  });
});
