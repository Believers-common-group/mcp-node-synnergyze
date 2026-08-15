import { describe, expect, it } from "vitest";

import { AlphaRc1Harness, RC1_IDENTITIES } from "../rc1/runtime.ts";
import type { ActionEnvelopeV1, EffectReceiptV1 } from "./river/contracts.ts";
import {
  adaptRc1CausalTrace,
  adaptRc1EvidenceReservation,
  adaptRc1EvidenceSeal,
} from "./river/rc1-adapter.ts";
import type { WardenDecisionRequestV1 } from "./warden/contracts.ts";
import { adaptRc1WardenDecision, toRc1ActionIntent } from "./warden/rc1-adapter.ts";

function decisionRequest(
  capabilityRef: "service_request.create" | "contract.execute",
  correlationId: string,
): WardenDecisionRequestV1 {
  return {
    requestRef: `REQUEST:${correlationId}`,
    actorRef: RC1_IDENTITIES.actorRef,
    representedPrincipalRef: RC1_IDENTITIES.entityRef,
    actingCapacityRef: "LAB-COMPANY-OPERATOR-001",
    contextRef: RC1_IDENTITIES.programRef,
    programRef: RC1_IDENTITIES.programRef,
    eventRef: `RC1-EVENT:${correlationId}`,
    action: capabilityRef,
    capabilityRef,
    targetRef:
      capabilityRef === "service_request.create" ? "LAB-SERVICE-DESK-001" : "LAB-CONTRACT-001",
    authorityRefs: [RC1_IDENTITIES.wardenRef],
    policyRefs: ["RC1-SYNTHETIC-POLICY"],
    representationSourceRefs: ["RC1-SYNTHETIC-REPRESENTATION"],
    requestedAt: "2026-08-14T05:30:00.000Z",
    correlationId,
  };
}

function rc1ActionEnvelope(
  correlationId: string,
  decisionRef: string,
  actionToken: string,
  requestedAt: string,
): ActionEnvelopeV1 {
  const request = decisionRequest("service_request.create", correlationId);
  return {
    actionRef: `ACTION:${correlationId}`,
    requestRef: request.requestRef,
    actorRef: request.actorRef,
    representedPrincipalRef: request.representedPrincipalRef,
    actingCapacityRef: request.actingCapacityRef,
    contextRef: request.contextRef,
    programRef: request.programRef,
    eventRef: request.eventRef,
    action: request.action,
    capabilityRef: request.capabilityRef,
    targetRef: request.targetRef,
    wardenDecisionRef: decisionRef,
    actionToken,
    requestedAt,
    correlationId,
  };
}

describe("RC1 Warden compatibility adapter", () => {
  it("maps the existing allow decision without changing its action token", () => {
    const harness = new AlphaRc1Harness();
    const request = decisionRequest("service_request.create", "ADAPTER-ALLOW-001");
    const intent = toRc1ActionIntent(request);
    const result = harness.attempt(intent.capability, intent.correlationId);

    expect(result.status).toBe("VERIFIED");
    expect(result.decision).toBeDefined();
    const typed = adaptRc1WardenDecision(request, result.decision!);

    expect(typed.decision).toBe("ALLOW");
    if (typed.decision !== "ALLOW") throw new Error("expected_allow");
    expect(typed.actionToken).toBe("RC1-ACTION-TOKEN:ADAPTER-ALLOW-001");
    expect(typed.reasonCodes).toEqual(["synthetic_rc1_policy_allow"]);
  });

  it("maps capability denial and post-revocation denial without an action token", () => {
    const harness = new AlphaRc1Harness();
    const deniedRequest = decisionRequest("contract.execute", "ADAPTER-DENY-001");
    const denied = harness.attempt("contract.execute", deniedRequest.correlationId);
    expect(denied.decision).toBeDefined();
    const typedDenied = adaptRc1WardenDecision(deniedRequest, denied.decision!);

    expect(typedDenied.decision).toBe("DENY");
    expect("actionToken" in typedDenied).toBe(false);
    expect(typedDenied.reasonCodes).toEqual(["capability_not_permitted"]);

    harness.revoke();
    const revokedRequest = decisionRequest("service_request.create", "ADAPTER-REVOKED-001");
    const revoked = harness.attempt("service_request.create", revokedRequest.correlationId);
    expect(revoked.decision).toBeDefined();
    const typedRevoked = adaptRc1WardenDecision(revokedRequest, revoked.decision!);

    expect(typedRevoked.decision).toBe("DENY");
    expect("actionToken" in typedRevoked).toBe(false);
    expect(typedRevoked.reasonCodes).toEqual(["authority_revoked"]);
  });

  it("rejects capabilities outside the bounded RC1 capability surface", () => {
    const request = {
      ...decisionRequest("service_request.create", "ADAPTER-UNSUPPORTED-001"),
      capabilityRef: "bank.transfer",
    };
    expect(() => toRc1ActionIntent(request)).toThrow("unsupported_rc1_capability:bank.transfer");
  });
});

describe("RC1 River compatibility adapter", () => {
  it("maps the existing reserve/seal lineage into typed evidence contracts", () => {
    const harness = new AlphaRc1Harness();
    const correlationId = "ADAPTER-RIVER-001";
    const result = harness.attempt("service_request.create", correlationId);

    expect(result.status).toBe("VERIFIED");
    expect(result.decision).toBeDefined();
    expect(result.decision!.actionToken).toBeDefined();
    expect(result.effectRef).toBeDefined();

    const action = rc1ActionEnvelope(
      correlationId,
      result.decision!.decisionRef,
      result.decision!.actionToken!,
      "2026-08-14T05:31:00.000Z",
    );
    const entries = harness.riverEntries();
    const reservation = adaptRc1EvidenceReservation(action, entries);
    const effect: EffectReceiptV1 = {
      effectRef: result.effectRef!,
      correlationId,
      targetRef: action.targetRef,
      observedStateRef: result.receipt!.serviceRequestRef,
      verifiedAt: "2026-08-14T05:31:01.000Z",
      verificationRef: `VERIFY:${correlationId}`,
    };
    const seal = adaptRc1EvidenceSeal(reservation, effect, entries);
    const trace = adaptRc1CausalTrace(correlationId, entries);

    expect(reservation.reservationRef).toBe(`RC1-EVIDENCE-RESERVATION:${correlationId}`);
    expect(reservation.wardenDecisionRef).toBe(result.decision!.decisionRef);
    expect(reservation.authorizationDigest).toMatch(/^sha256:/);
    expect(seal.sealRef).toBe(`RC1-EVIDENCE-SEALED:${correlationId}`);
    expect(seal.state).toBe("SEALED");
    expect(trace.reservationRef).toBe(reservation.reservationRef);
    expect(trace.effectRef).toBe(effect.effectRef);
    expect(trace.sealRef).toBe(seal.sealRef);
    expect(trace.sealed).toBe(true);
  });

  it("does not manufacture a reservation when the existing River fixture failed", () => {
    const harness = new AlphaRc1Harness();
    const correlationId = "ADAPTER-RIVER-FAIL-001";
    harness.failNextEvidenceReservation();
    const result = harness.attempt("service_request.create", correlationId);

    expect(result.status).toBe("BLOCKED_REQUIREMENT");
    expect(result.decision).toBeDefined();
    expect(result.decision!.actionToken).toBeDefined();
    const action = rc1ActionEnvelope(
      correlationId,
      result.decision!.decisionRef,
      result.decision!.actionToken!,
      "2026-08-14T05:32:00.000Z",
    );

    expect(() => adaptRc1EvidenceReservation(action, harness.riverEntries())).toThrow(
      "rc1_evidence_reservation_not_found",
    );
  });
});
