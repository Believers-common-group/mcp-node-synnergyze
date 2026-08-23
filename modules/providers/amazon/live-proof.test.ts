import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import {
  assertAmazonLiveProofPrerequisitesV1,
  type AmazonLiveAuthorityBundleV1,
} from "./live-proof.ts";

function bundle(): AmazonLiveAuthorityBundleV1 {
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:AMAZON-LIVE-001",
    requestRef: "REQUEST:AMAZON-LIVE-001",
    actorRef: "DIGITALME:ALPHA-OPERATOR-001",
    representedPrincipalRef: "ORG:SELLER-PRINCIPAL-001",
    actingCapacityRef: "CAPACITY:AMAZON-SELLER-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "PROGRAM:AMAZON-ORDER-SYNC-001",
    eventRef: "EVENT:AMAZON-ORDER-SYNC-001",
    action: "amazon.orders.search",
    capabilityRef: "amazon.orders.search",
    targetRef: "AMAZON-SPAPI:SELLER-ACCOUNT-001",
    wardenDecisionRef: "WARDEN-DECISION:AMAZON-LIVE-001",
    actionToken: "WARDEN-ACTION-TOKEN:AMAZON-LIVE-001",
    requestedAt: "2026-08-23T04:35:00.000Z",
    correlationId: "CORR:AMAZON-LIVE-001",
  };
  const decision: WardenAllowDecisionV1 = {
    decisionRef: action.wardenDecisionRef,
    requestRef: action.requestRef,
    wardenRef: "WARDEN:ALPHA-001",
    action: action.action,
    targetRef: action.targetRef,
    decision: "ALLOW",
    actionToken: action.actionToken,
    reasonCodes: ["authorized_seller_order_observation"],
    constraints: ["READ_ONLY_PROVIDER_EFFECT", "NO_RESTRICTED_DATA", "NO_SETTLEMENT_FINALITY"],
    decidedAt: "2026-08-23T04:35:01.000Z",
    validUntil: "2026-08-23T05:35:01.000Z",
    correlationId: action.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:AMAZON-LIVE-001",
    actionRef: action.actionRef,
    wardenDecisionRef: decision.decisionRef,
    correlationId: action.correlationId,
    authorizationDigest: `sha256:${"a".repeat(64)}`,
    state: "RESERVED",
    reservedAt: "2026-08-23T04:35:02.000Z",
  };
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: "WARDEN-CHECKPOINT:AMAZON-LIVE-001",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: "2026-08-23T04:35:03.000Z",
    reasonCodes: ["decision_active_for_execution"],
  };
  return { action, decision, reservation, checkpoint };
}

describe("PROVIDER-AMAZON-LIVE-PROOF-PREFLIGHT-001", () => {
  it("accepts a bounded externally issued read-only authority bundle", () => {
    expect(() =>
      assertAmazonLiveProofPrerequisitesV1({
        activationAck: "READ_ONLY_PROVIDER_EFFECT",
        authority: bundle(),
        includedData: ["PROCEEDS", "FULFILLMENT"],
      }),
    ).not.toThrow();
  });

  it("rejects missing explicit live acknowledgement", () => {
    expect(() =>
      assertAmazonLiveProofPrerequisitesV1({
        activationAck: undefined,
        authority: bundle(),
        includedData: ["PROCEEDS"],
      }),
    ).toThrow("amazon_live_read_only_ack_required");
  });

  it("rejects synthetic or test authority refs for a live run", () => {
    const synthetic = bundle();
    synthetic.action.actorRef = "DIGITALME-ALPHA-TEST-001";
    expect(() =>
      assertAmazonLiveProofPrerequisitesV1({
        activationAck: "READ_ONLY_PROVIDER_EFFECT",
        authority: synthetic,
        includedData: ["PROCEEDS"],
      }),
    ).toThrow("amazon_live_synthetic_authority_forbidden");
  });

  it("rejects restricted-data requests from the ordinary order-observation capability", () => {
    expect(() =>
      assertAmazonLiveProofPrerequisitesV1({
        activationAck: "READ_ONLY_PROVIDER_EFFECT",
        authority: bundle(),
        includedData: ["BUYER"],
      }),
    ).toThrow("amazon_live_restricted_data_requires_separate_capability");
  });
});
