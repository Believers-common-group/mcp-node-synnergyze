import { describe, expect, it } from "vitest";

import {
  EffectExpectationServiceV1,
  SyntheticGarmentWaistbandExpectationCompilerV1,
  validateExpectedEffectContractV1,
} from "../synnergyze/effect-expectation.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import { evaluateSyntheticWardenDecisionV1 } from "../warden/decision-service.ts";
import {
  runVerifiedWaistbandFixtureV1,
  validWaistbandFixtureV1,
} from "./fixtures/garment.ts";
import { SyntheticWorkCapabilityEvidenceFinalizerV1 } from "./reconciliation-bridge.ts";

function compileWaistbandExpectationV1() {
  const fixture = validWaistbandFixtureV1();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: fixture.request,
    policy: fixture.policy,
    decidedAt: fixture.decidedAt,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow");

  const action = buildAuthorizedActionEnvelopeV1(fixture.request, decision);
  const reservation = new SyntheticRiverReservationServiceV1().reserve({
    request: fixture.request,
    decision,
    action,
    reservedAt: fixture.reservedAt,
  });
  const service = new EffectExpectationServiceV1([
    new SyntheticGarmentWaistbandExpectationCompilerV1(),
  ]);
  return service.compile({
    action,
    reservation,
    compiledAt: "2026-08-24T00:30:22.000Z",
  });
}

describe("WORK-CAPABILITY-RECONCILIATION-BRIDGE-001", () => {
  it("compiles and validates the bounded garment waistband expected-effect contract", () => {
    const expectation = compileWaistbandExpectationV1();

    expect(expectation.capabilityRef).toBe("garment.waistband.attach");
    expect(expectation.requestedEffect).toBe("GARMENT-STATE:waistband_attached");
    expect(expectation.matcher).toEqual({
      kind: "PREFIX",
      value: "GARMENT-WAISTBAND-OBSERVED:",
    });
    expect(validateExpectedEffectContractV1(expectation)).toBe(true);
  });

  it("rejects an unsupported requested effect for the trusted garment compiler", () => {
    const compiler = new SyntheticGarmentWaistbandExpectationCompilerV1();
    expect(() => compiler.compile("GARMENT-STATE:anything-else")).toThrow(
      "effect_expectation_unsupported_requested_effect",
    );
  });

  it("finalizes the verified Work effect into the existing River seal and causal-trace contracts", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const finalizer = new SyntheticWorkCapabilityEvidenceFinalizerV1();
    const finalized = finalizer.finalize({
      reservationRef: result.execution.reservationRef,
      correlationId: result.execution.correlationId,
      effect: result.verification.effect,
      sealedAt: "2026-08-24T00:31:00.000Z",
    });

    expect(finalized.seal.state).toBe("SEALED");
    expect(finalized.seal.reservationRef).toBe(result.execution.reservationRef);
    expect(finalized.seal.traceDigest).toBe([
      "RC1-TRACE-V1",
      result.execution.reservationRef,
      finalized.seal.sealRef,
      result.verification.effect.effectRef,
      result.verification.effect.verificationRef,
    ].join("|"));
    expect(finalized.causalTrace.effectRef).toBe(result.verification.effect.effectRef);
    expect(finalized.causalTrace.sealRef).toBe(finalized.seal.sealRef);
    expect(finalized.causalTrace.sealed).toBe(true);
  });

  it("replays evidence finalization exactly and rejects changed sealing material", () => {
    const result = runVerifiedWaistbandFixtureV1({
      inputQuantity: 500,
      acceptedQuantity: 487,
      reworkQuantity: 6,
    });
    const finalizer = new SyntheticWorkCapabilityEvidenceFinalizerV1();
    const input = {
      reservationRef: result.execution.reservationRef,
      correlationId: result.execution.correlationId,
      effect: result.verification.effect,
      sealedAt: "2026-08-24T00:31:00.000Z",
    };

    const first = finalizer.finalize(input);
    const replay = finalizer.finalize(input);
    expect(replay.seal.sealRef).toBe(first.seal.sealRef);
    expect(replay.idempotentReplay).toBe(true);

    expect(() => finalizer.finalize({
      ...input,
      sealedAt: "2026-08-24T00:31:01.000Z",
    })).toThrow("work_capability_finalizer_idempotency_conflict");
  });
});
