import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import {
  EffectExpectationServiceV1,
  SyntheticServiceRequestExpectationCompilerV1,
  matchesExpectedEffectV1,
} from "./effect-expectation.ts";

function action(overrides: Partial<ActionEnvelopeV1> = {}): ActionEnvelopeV1 {
  return {
    actionRef: "ACTION:EXPECT-001",
    requestRef: "WARDEN-REQUEST:EXPECT-001",
    actorRef: "ACTOR:001",
    representedPrincipalRef: "PRINCIPAL:001",
    actingCapacityRef: "CAPACITY:001",
    contextRef: "CONTEXT:001",
    programRef: "PROGRAM:001",
    eventRef: "EVENT:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "TARGET:001",
    requestedEffect: "service_request.created",
    wardenDecisionRef: "WARDEN-DECISION:EXPECT-001",
    actionToken: "WARDEN-ACTION-TOKEN:EXPECT-001",
    requestedAt: "2026-08-22T12:00:00.000Z",
    correlationId: "CORR:EXPECT-001",
    ...overrides,
  };
}

function reservation(overrides: Partial<EvidenceReservationV1> = {}): EvidenceReservationV1 {
  return {
    reservationRef: "RIVER-RESERVATION:EXPECT-001",
    actionRef: "ACTION:EXPECT-001",
    wardenDecisionRef: "WARDEN-DECISION:EXPECT-001",
    correlationId: "CORR:EXPECT-001",
    authorizationDigest: "sha256:auth",
    state: "RESERVED",
    reservedAt: "2026-08-22T12:00:01.000Z",
    ...overrides,
  };
}

describe("EXPECTED-EFFECT-CONTRACT-001", () => {
  it("compiles authorized intent into a pre-execution machine matcher", () => {
    const service = new EffectExpectationServiceV1([
      new SyntheticServiceRequestExpectationCompilerV1(),
    ]);
    const result = service.compile({
      action: action(),
      reservation: reservation(),
      compiledAt: "2026-08-22T12:00:02.000Z",
    });

    expect(result.state).toBe("BOUND_PRE_EXECUTION");
    expect(result.requestedEffect).toBe("service_request.created");
    expect(result.matcher).toEqual({
      kind: "PREFIX",
      value: "SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:",
    });
    expect(matchesExpectedEffectV1(result, "SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:ABC")).toBe(true);
    expect(matchesExpectedEffectV1(result, "STATE:OTHER")).toBe(false);
  });

  it("fails closed on reservation lineage drift and unsupported intent", () => {
    const service = new EffectExpectationServiceV1([
      new SyntheticServiceRequestExpectationCompilerV1(),
    ]);

    expect(() =>
      service.compile({
        action: action(),
        reservation: reservation({ actionRef: "ACTION:OTHER" }),
        compiledAt: "2026-08-22T12:00:02.000Z",
      }),
    ).toThrow("effect_expectation_action_mismatch");
    expect(() =>
      service.compile({
        action: action({ requestedEffect: "service_request.deleted" }),
        reservation: reservation(),
        compiledAt: "2026-08-22T12:00:02.000Z",
      }),
    ).toThrow("effect_expectation_unsupported_requested_effect");
  });

  it("replays the same expectation idempotently and rejects mutation under one action identity", () => {
    const service = new EffectExpectationServiceV1([
      new SyntheticServiceRequestExpectationCompilerV1(),
    ]);
    const first = service.compile({
      action: action(),
      reservation: reservation(),
      compiledAt: "2026-08-22T12:00:02.000Z",
    });
    const replay = service.compile({
      action: action(),
      reservation: reservation(),
      compiledAt: "2026-08-22T12:00:09.000Z",
    });

    expect(replay.expectationRef).toBe(first.expectationRef);
    expect(replay.compiledAt).toBe(first.compiledAt);
    expect(service.count()).toBe(1);
    expect(() =>
      service.compile({
        action: action({ targetRef: "TARGET:MUTATED" }),
        reservation: reservation(),
        compiledAt: "2026-08-22T12:00:10.000Z",
      }),
    ).toThrow("effect_expectation_idempotency_conflict");
  });

  it("cannot be compiled before River reservation", () => {
    const service = new EffectExpectationServiceV1([
      new SyntheticServiceRequestExpectationCompilerV1(),
    ]);
    expect(() =>
      service.compile({
        action: action(),
        reservation: reservation(),
        compiledAt: "2026-08-22T12:00:00.500Z",
      }),
    ).toThrow("effect_expectation_before_reservation");
  });
});
