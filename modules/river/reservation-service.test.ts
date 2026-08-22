import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import type { ActionEnvelopeV1 } from "./contracts.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "./reservation-service.ts";

const DECIDED_AT = "2026-08-14T07:00:30.000Z";
const RESERVED_AT = "2026-08-14T07:00:31.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RIVER-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:RIVER-001",
    eventRef: "SYNNERGYZE-EVENT:RIVER-001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-14T07:00:00.000Z",
    correlationId: "CORR-RIVER-001",
    ...overrides,
  };
}

function policy(
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:RIVER-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-14T06:55:00.000Z",
    validUntil: "2026-08-14T07:10:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:RIVER-001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
    ...overrides,
  };
}

function decide(
  requestValue = request(),
  policyValue = policy(),
  decidedAt = DECIDED_AT,
): WardenDecisionV1 {
  return evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: policyValue,
    decidedAt,
  });
}

function allowPair(
  requestValue = request(),
  policyValue = policy(),
): { request: WardenDecisionRequestV1; decision: WardenDecisionV1; action: ActionEnvelopeV1 } {
  const decision = decide(requestValue, policyValue);
  expect(decision.decision).toBe("ALLOW");
  const action = buildAuthorizedActionEnvelopeV1(requestValue, decision);
  return { request: requestValue, decision, action };
}

describe("VSR-NETWORK-RIVER-RESERVATION-BRIDGE-001", () => {
  it("binds one exact Warden ALLOW including its intended effect into an action envelope and River reservation", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const pair = allowPair();
    const reservation = service.reserve({ ...pair, reservedAt: RESERVED_AT });

    expect(pair.action.actionToken).toMatch(/^WARDEN-ACTION-TOKEN:/);
    expect(pair.action.requestRef).toBe(pair.request.requestRef);
    expect(pair.action.programRef).toBe(pair.request.programRef);
    expect(pair.action.eventRef).toBe(pair.request.eventRef);
    expect(pair.action.requestedEffect).toBe(pair.request.requestedEffect);
    expect(reservation.state).toBe("RESERVED");
    expect(reservation.wardenDecisionRef).toBe(pair.decision.decisionRef);
    expect(reservation.authorizationDigest).toMatch(/^sha256:/);
    expect(reservation.authorizationDigest).not.toContain(pair.action.actionToken);
    expect(JSON.stringify(reservation)).not.toContain(pair.action.actionToken);
    expect(service.reservationCount()).toBe(1);
  });

  it("stops ESCALATE before an action envelope or River mutation exists", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const requestValue = request({
      action: "contract.execute",
      capabilityRef: "contract.execute",
      targetRef: "LAB-CONTRACT-001",
    });
    const decision = decide(requestValue);

    expect(decision.decision).toBe("ESCALATE");
    expect(() => buildAuthorizedActionEnvelopeV1(requestValue, decision)).toThrow(
      "river_warden_allow_required",
    );
    expect(service.reservationCount()).toBe(0);
  });

  it("stops DENY before an action envelope or River mutation exists", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const requestValue = request({ action: "bank.transfer", capabilityRef: "bank.transfer" });
    const decision = decide(requestValue);

    expect(decision.decision).toBe("DENY");
    expect(() => buildAuthorizedActionEnvelopeV1(requestValue, decision)).toThrow(
      "river_warden_allow_required",
    );
    expect(service.reservationCount()).toBe(0);
  });

  it("rejects request, action, target and correlation decision drift before reservation", () => {
    const baseRequest = request();
    const baseDecision = decide(baseRequest);
    expect(baseDecision.decision).toBe("ALLOW");

    const drifts: Array<Partial<WardenDecisionV1>> = [
      { requestRef: "WARDEN-REQUEST:OTHER" },
      { action: "other.action" },
      { targetRef: "OTHER-TARGET" },
      { correlationId: "CORR-OTHER" },
    ];

    for (const drift of drifts) {
      const service = new SyntheticRiverReservationServiceV1();
      const decision = { ...baseDecision, ...drift } as WardenDecisionV1;
      expect(() => buildAuthorizedActionEnvelopeV1(baseRequest, decision)).toThrow();
      expect(service.reservationCount()).toBe(0);
    }
  });

  it("rejects token drift before mutating River state", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const pair = allowPair();
    const driftedAction = { ...pair.action, actionToken: "WARDEN-ACTION-TOKEN:DRIFT" };

    expect(() =>
      service.reserve({ ...pair, action: driftedAction, reservedAt: RESERVED_AT }),
    ).toThrow("river_action_envelope_mismatch:actionToken");
    expect(service.reservationCount()).toBe(0);
  });

  it("rejects actor, program, event, capability and intended-effect drift before mutating River state", () => {
    const pair = allowPair();
    const drifts: Array<Partial<ActionEnvelopeV1>> = [
      { actorRef: "DIGITALME-OTHER-001" },
      { programRef: "SYNNERGYZE-PROGRAM:OTHER" },
      { eventRef: "SYNNERGYZE-EVENT:OTHER" },
      { capabilityRef: "other.capability" },
      { requestedEffect: "service_request.deleted" },
    ];

    for (const drift of drifts) {
      const service = new SyntheticRiverReservationServiceV1();
      expect(() =>
        service.reserve({ ...pair, action: { ...pair.action, ...drift }, reservedAt: RESERVED_AT }),
      ).toThrow(/river_action_envelope_mismatch:/);
      expect(service.reservationCount()).toBe(0);
    }
  });

  it("rejects expired, missing and malformed Warden decision validity", () => {
    const pair = allowPair();

    const expiredService = new SyntheticRiverReservationServiceV1();
    expect(() =>
      expiredService.reserve({ ...pair, reservedAt: "2026-08-14T07:11:00.000Z" }),
    ).toThrow("river_warden_decision_expired");
    expect(expiredService.reservationCount()).toBe(0);

    const noValidityService = new SyntheticRiverReservationServiceV1();
    const noValidity = { ...pair.decision, validUntil: undefined } as WardenDecisionV1;
    expect(() =>
      noValidityService.reserve({ ...pair, decision: noValidity, reservedAt: RESERVED_AT }),
    ).toThrow("river_warden_validity_required");
    expect(noValidityService.reservationCount()).toBe(0);

    const malformedService = new SyntheticRiverReservationServiceV1();
    const malformed = { ...pair.decision, validUntil: "not-a-time" } as WardenDecisionV1;
    expect(() =>
      malformedService.reserve({ ...pair, decision: malformed, reservedAt: RESERVED_AT }),
    ).toThrow("river_invalid_decision_validity");
    expect(malformedService.reservationCount()).toBe(0);
  });

  it("rejects a reservation timestamp before the Warden decision", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const pair = allowPair();

    expect(() =>
      service.reserve({ ...pair, reservedAt: "2026-08-14T07:00:29.000Z" }),
    ).toThrow("river_reservation_before_decision");
    expect(service.reservationCount()).toBe(0);
  });

  it("replays the identical reservation idempotently without duplicating River state", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const pair = allowPair();

    const first = service.reserve({ ...pair, reservedAt: RESERVED_AT });
    const second = service.reserve({ ...pair, reservedAt: RESERVED_AT });

    expect(second).toEqual(first);
    expect(service.reservationCount()).toBe(1);
    expect(service.reservations()).toEqual([first]);
  });

  it("rejects a second action identity reusing the same correlation lineage", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const first = allowPair();
    service.reserve({ ...first, reservedAt: RESERVED_AT });

    const secondRequest = request({
      requestRef: "WARDEN-REQUEST:RIVER-002",
      actorRef: "DIGITALME-OTHER-001",
      representedPrincipalRef: "OTHER-COMPANY-001",
      actingCapacityRef: "CAPACITY:OTHER-001",
    });
    const secondPolicy = policy({
      actorRef: secondRequest.actorRef,
      representedPrincipalRef: secondRequest.representedPrincipalRef,
      actingCapacityRef: secondRequest.actingCapacityRef,
    });
    const second = allowPair(secondRequest, secondPolicy);

    expect(second.action.actionRef).not.toBe(first.action.actionRef);
    expect(second.action.correlationId).toBe(first.action.correlationId);
    expect(() => service.reserve({ ...second, reservedAt: RESERVED_AT })).toThrow(
      "river_reservation_correlation_conflict",
    );
    expect(service.reservationCount()).toBe(1);
  });

  it("does not accept malformed reservation time", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const pair = allowPair();

    expect(() => service.reserve({ ...pair, reservedAt: "not-a-time" })).toThrow(
      "river_invalid_reservation_time",
    );
    expect(service.reservationCount()).toBe(0);
  });
});
