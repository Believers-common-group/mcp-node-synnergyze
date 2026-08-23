import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import {
  evaluateAmazonLiveProofBnrReadinessV1,
  type AmazonLiveAuthorityBundleV1,
  type AmazonLiveBnrEvidenceStateV1,
} from "./live-proof.ts";

function authority(): AmazonLiveAuthorityBundleV1 {
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

function initialEvidence(overrides: Partial<AmazonLiveBnrEvidenceStateV1> = {}): AmazonLiveBnrEvidenceStateV1 {
  return {
    partnerLifecycle: "PROPOSED_PARTNER",
    runtimeReadiness: "READY",
    authorityState: "EXTERNAL_UNRESOLVED",
    evidenceState: "UNRESOLVED",
    commercialState: "UNRESOLVED",
    requiredServicesResolved: true,
    wardenPolicyActive: true,
    riverOperational: false,
    registryDurable: true,
    activationEvidenceValid: false,
    suspended: false,
    amazonCredentialsPresent: true,
    engagementContextPresent: true,
    readinessCheckedAt: "2026-08-23T06:05:00.000Z",
    ...overrides,
  };
}

describe("Amazon live proof BNR readiness", () => {
  it("keeps Amazon BNR-001 proposed and inactive even when credentials and engagement context exist", () => {
    const result = evaluateAmazonLiveProofBnrReadinessV1({
      activationAck: "READ_ONLY_PROVIDER_EFFECT",
      authority: authority(),
      includedData: ["PROCEEDS", "FULFILLMENT"],
      bnrEvidence: initialEvidence(),
    });

    expect(result.bnrNodeRef).toBe("BNR-001");
    expect(result.partnerLifecycle).toBe("PROPOSED_PARTNER");
    expect(result.activationState).toBe("INACTIVE");
    expect(result.blockers).toContain("BNR_AUTHORITY_UNRESOLVED");
    expect(result.blockers).toContain("BNR_COMMERCIAL_UNRESOLVED");
    expect(result.blockers).toContain("BNR_RIVER_UNREADY");
  });

  it("can become ELIGIBLE only from a fully evidenced technically-ready state", () => {
    const result = evaluateAmazonLiveProofBnrReadinessV1({
      activationAck: "READ_ONLY_PROVIDER_EFFECT",
      authority: authority(),
      includedData: ["PROCEEDS"],
      bnrEvidence: initialEvidence({
        partnerLifecycle: "TECHNICALLY_READY",
        authorityState: "EXTERNAL_EVIDENCED",
        evidenceState: "READY",
        commercialState: "EVIDENCED",
        riverOperational: true,
        activationEvidenceValid: false,
      }),
    });

    expect(result.activationState).toBe("ELIGIBLE");
  });

  it("requires explicit valid activation evidence in addition to full readiness for ACTIVE", () => {
    const result = evaluateAmazonLiveProofBnrReadinessV1({
      activationAck: "READ_ONLY_PROVIDER_EFFECT",
      authority: authority(),
      includedData: ["PROCEEDS"],
      bnrEvidence: initialEvidence({
        partnerLifecycle: "TECHNICALLY_READY",
        authorityState: "EXTERNAL_EVIDENCED",
        evidenceState: "READY",
        commercialState: "EVIDENCED",
        riverOperational: true,
        activationEvidenceValid: true,
      }),
    });

    expect(result.activationState).toBe("ACTIVE");
  });
});
