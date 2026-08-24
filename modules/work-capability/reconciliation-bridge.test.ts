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
import { validWaistbandFixtureV1 } from "./fixtures/garment.ts";

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
});
