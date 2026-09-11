import { describe, expect, it } from "vitest";

import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type { ResolvedGenesisDeviceContextV1 } from "./genesis-device-bridge.ts";
import { buildSynnergyzeWardenDecisionRequestV1 } from "./warden-fit.ts";
import { reserveSynnergyzeEvidenceV1 } from "./warden-river-fit.ts";

const device: ResolvedGenesisDeviceContextV1 = {
  genesisResolutionRef: "GENESIS-DEVICE-RESOLUTION:001",
  deviceRef: "GENESIS-DEVICE:LG-GRAM-001",
  estateRef: "GENESIS-ESTATE-001",
  locationRef: "GENESIS-LOCATION-001",
  runtimeInstanceRef: "GENESIS-RUNTIME-001",
  state: "ACTIVE",
  assuranceLevel: "L1",
  sourceEvidenceRefs: ["RIVER-EVIDENCE:DEVICE-001"],
  attestationRef: "GENESIS-DEVICE-ATTESTATION:001",
  resolvedAt: "2026-09-11T03:30:00.000Z",
  validUntil: "2026-09-11T04:30:00.000Z",
};

function request() {
  return buildSynnergyzeWardenDecisionRequestV1({
    requestRef: "WARDEN-REQUEST:001",
    actorRef: "DIGITALME:FAIZ",
    representedPrincipalRef: "DIGITALME:FAIZ",
    actingCapacityRef: "CAPACITY:ESTATE-OPERATOR",
    contextRef: "GENESIS-ESTATE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:001",
    action: "artifact.write",
    capabilityRef: "CAPABILITY:ARTIFACT-WRITE",
    targetRef: "ESTATE-TEST-ARTIFACT:001",
    requestedEffect: "sha256:requested-effect",
    authorityRefs: ["AUTHORITY:ESTATE-OPERATOR"],
    policyRefs: ["POLICY:ESTATE-GOLD-PROOF"],
    representationSourceRefs: ["GENESIS:REPRESENTATION:001"],
    requestedAt: "2026-09-11T03:35:00.000Z",
    correlationId: "CORR:EGP-001",
    device,
  });
}

function allowDecision(overrides: Partial<WardenDecisionV1> = {}): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:001",
    requestRef: "WARDEN-REQUEST:001",
    wardenRef: "WARDEN:ESTATE-001",
    action: "artifact.write",
    targetRef: "ESTATE-TEST-ARTIFACT:001",
    reasonCodes: ["bounded_policy_allow"],
    constraints: [],
    decidedAt: "2026-09-11T03:36:00.000Z",
    validUntil: "2026-09-11T04:00:00.000Z",
    correlationId: "CORR:EGP-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:test",
    ...overrides,
  } as WardenDecisionV1;
}

describe("SYNNERGYZE-WARDEN-RIVER-FIT-R0.1", () => {
  it("creates a River reservation from the exact authorized Synnergyze request without executing it", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const result = reserveSynnergyzeEvidenceV1({
      request: request(),
      decision: allowDecision(),
      reservedAt: "2026-09-11T03:37:00.000Z",
      service,
    });

    expect(result.action.requestRef).toBe("WARDEN-REQUEST:001");
    expect(result.action.executionDeviceRef).toBe(device.deviceRef);
    expect(result.action.wardenDecisionRef).toBe("WARDEN-DECISION:001");
    expect(result.reservation.actionRef).toBe(result.action.actionRef);
    expect(result.reservation.wardenDecisionRef).toBe("WARDEN-DECISION:001");
    expect(result.reservation.state).toBe("RESERVED");
    expect(service.reservationCount()).toBe(1);
    expect("executionReceipt" in result).toBe(false);
  });

  it("does not reserve evidence for DENY or ESCALATE", () => {
    for (const decision of ["DENY", "ESCALATE"] as const) {
      const service = new SyntheticRiverReservationServiceV1();
      const base = allowDecision();
      const nonAllow = {
        ...base,
        decision,
        reasonCodes: [decision === "DENY" ? "policy_denied" : "manual_review_required"],
        actionToken: undefined as never,
      } as WardenDecisionV1;

      expect(() =>
        reserveSynnergyzeEvidenceV1({
          request: request(),
          decision: nonAllow,
          reservedAt: "2026-09-11T03:37:00.000Z",
          service,
        }),
      ).toThrow("river_warden_allow_required");
      expect(service.reservationCount()).toBe(0);
    }
  });

  it("does not reserve when Warden decision lineage differs from the Synnergyze request", () => {
    const service = new SyntheticRiverReservationServiceV1();

    expect(() =>
      reserveSynnergyzeEvidenceV1({
        request: request(),
        decision: allowDecision({ requestRef: "WARDEN-REQUEST:OTHER" }),
        reservedAt: "2026-09-11T03:37:00.000Z",
        service,
      }),
    ).toThrow("river_warden_request_mismatch");
    expect(service.reservationCount()).toBe(0);
  });

  it("does not reserve after the Warden decision expires", () => {
    const service = new SyntheticRiverReservationServiceV1();

    expect(() =>
      reserveSynnergyzeEvidenceV1({
        request: request(),
        decision: allowDecision(),
        reservedAt: "2026-09-11T04:00:01.000Z",
        service,
      }),
    ).toThrow("river_warden_decision_expired");
    expect(service.reservationCount()).toBe(0);
  });

  it("replays the exact reservation idempotently without creating another reservation", () => {
    const service = new SyntheticRiverReservationServiceV1();
    const input = {
      request: request(),
      decision: allowDecision(),
      reservedAt: "2026-09-11T03:37:00.000Z",
      service,
    };

    const first = reserveSynnergyzeEvidenceV1(input);
    const replay = reserveSynnergyzeEvidenceV1(input);

    expect(replay.reservation).toEqual(first.reservation);
    expect(replay.action).toEqual(first.action);
    expect(service.reservationCount()).toBe(1);
  });
});
