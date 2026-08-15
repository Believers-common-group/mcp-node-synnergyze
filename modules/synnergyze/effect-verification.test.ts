import { describe, expect, it } from "vitest";

import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import {
  EffectVerificationServiceV1,
  SyntheticServiceRequestObservationSourceV1,
  type PostExecutionObservationV1,
} from "./effect-verification.ts";

const EXECUTED_AT = "2026-08-14T09:00:30.000Z";
const OBSERVED_AT = "2026-08-14T09:00:31.000Z";
const VERIFIED_AT = "2026-08-14T09:00:32.000Z";

function receipt(overrides: Partial<SynnergyzeExecutionReceiptV1> = {}): SynnergyzeExecutionReceiptV1 {
  return {
    receiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:VERIFY-001",
    actionRef: "ACTION:VERIFY-001",
    reservationRef: "RIVER-RESERVATION:VERIFY-001",
    wardenDecisionRef: "WARDEN-DECISION:VERIFY-001",
    checkpointRef: "WARDEN-EXEC-CHECK:VERIFY-001",
    programRef: "SYNNERGYZE-PROGRAM:VERIFY-001",
    eventRef: "SYNNERGYZE-EVENT:VERIFY-001:001",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    correlationId: "CORR-VERIFY-001",
    adapterRef: "SYNTHETIC-SERVICE-REQUEST-ADAPTER-001",
    adapterResultRef: "SYNTHETIC-SERVICE-REQUEST:VERIFY-001",
    state: "EXECUTED_UNVERIFIED",
    executedAt: EXECUTED_AT,
    synthetic: true,
    idempotentReplay: false,
    ...overrides,
  };
}

function observation(
  receiptValue = receipt(),
  overrides: Partial<PostExecutionObservationV1> = {},
): PostExecutionObservationV1 {
  const source = new SyntheticServiceRequestObservationSourceV1();
  return { ...source.observe(receiptValue, OBSERVED_AT), ...overrides };
}

describe("ALPHA-EFFECT-VERIFY-001", () => {
  it("verifies one observed synthetic effect only after post-execution observation", () => {
    const execution = receipt();
    const observed = observation(execution);
    const verifier = new EffectVerificationServiceV1();
    const result = verifier.verify({ receipt: execution, observation: observed, verifiedAt: VERIFIED_AT });

    expect(result.state).toBe("VERIFIED_EFFECT");
    if (result.state !== "VERIFIED_EFFECT") throw new Error("expected_verified_effect");
    expect(result.effect.executionReceiptRef).toBe(execution.receiptRef);
    expect(result.effect.reservationRef).toBe(execution.reservationRef);
    expect(result.effect.wardenDecisionRef).toBe(execution.wardenDecisionRef);
    expect(result.effect.programRef).toBe(execution.programRef);
    expect(result.effect.eventRef).toBe(execution.eventRef);
    expect(result.effect.targetRef).toBe(execution.targetRef);
    expect(result.effect.observedStateRef).toBe(observed.observedStateRef);
    expect(result.effect.synthetic).toBe(true);
    expect(result.idempotentReplay).toBe(false);
    expect(verifier.verificationCount()).toBe(1);

    expect("sealRef" in result.effect).toBe(false);
    expect("registryEffectRef" in result.effect).toBe(false);
    expect("economicConsequenceRef" in result.effect).toBe(false);
  });

  it("derives observation from the synthetic adapter result, not requested effect text", () => {
    const execution = receipt({ adapterResultRef: "SYNTHETIC-SERVICE-REQUEST:RESULT-ABC" });
    const observed = observation(execution);

    expect(observed.observedStateRef).toMatch(/^SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:/);
    expect(observed.sourceEvidenceRef).toMatch(/^SYNTHETIC-OBSERVATION-EVIDENCE:/);
    expect(observed.observedStateRef).not.toContain("requestedEffect");
  });

  it("cannot verify requested intent without a post-execution observation", () => {
    const execution = receipt();
    const verifier = new EffectVerificationServiceV1();
    const result = verifier.verify({ receipt: execution, verifiedAt: VERIFIED_AT });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("expected_exception");
    expect(result.reasonCode).toBe("MISSING_SOURCE_EVIDENCE");
    expect(verifier.verificationCount()).toBe(0);
  });

  it("rejects a fabricated observation for another execution", () => {
    const execution = receipt();
    const verifier = new EffectVerificationServiceV1();
    const result = verifier.verify({
      receipt: execution,
      observation: observation(execution, { executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:OTHER" }),
      verifiedAt: VERIFIED_AT,
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("expected_exception");
    expect(result.reasonCode).toBe("OBSERVATION_EXECUTION_MISMATCH");
    expect(verifier.verificationCount()).toBe(0);
  });

  it("rejects program, event and correlation drift", () => {
    const execution = receipt();
    const drifts: Array<[Partial<PostExecutionObservationV1>, string]> = [
      [{ programRef: "SYNNERGYZE-PROGRAM:OTHER" }, "OBSERVATION_PROGRAM_MISMATCH"],
      [{ eventRef: "SYNNERGYZE-EVENT:OTHER" }, "OBSERVATION_EVENT_MISMATCH"],
      [{ correlationId: "CORR-OTHER" }, "OBSERVATION_CORRELATION_MISMATCH"],
    ];

    for (const [drift, expected] of drifts) {
      const verifier = new EffectVerificationServiceV1();
      const result = verifier.verify({
        receipt: execution,
        observation: observation(execution, drift),
        verifiedAt: VERIFIED_AT,
      });
      expect(result.state).toBe("EXCEPTION");
      if (result.state !== "EXCEPTION") throw new Error("expected_exception");
      expect(result.reasonCode).toBe(expected);
      expect(verifier.verificationCount()).toBe(0);
    }
  });

  it("rejects target drift", () => {
    const execution = receipt();
    const verifier = new EffectVerificationServiceV1();
    const result = verifier.verify({
      receipt: execution,
      observation: observation(execution, { targetRef: "TARGET:OTHER" }),
      verifiedAt: VERIFIED_AT,
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("expected_exception");
    expect(result.reasonCode).toBe("OBSERVATION_TARGET_MISMATCH");
  });

  it("rejects observations that predate execution", () => {
    const execution = receipt();
    const verifier = new EffectVerificationServiceV1();
    const observed = observation(execution, { observedAt: "2026-08-14T09:00:29.000Z" });
    const result = verifier.verify({ receipt: execution, observation: observed, verifiedAt: VERIFIED_AT });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("expected_exception");
    expect(result.reasonCode).toBe("OBSERVATION_BEFORE_EXECUTION");
  });

  it("rejects missing observed state or source evidence", () => {
    const execution = receipt();
    const cases: Array<[Partial<PostExecutionObservationV1>, string]> = [
      [{ observedStateRef: "" }, "MISSING_OBSERVED_STATE"],
      [{ sourceEvidenceRef: "" }, "MISSING_SOURCE_EVIDENCE"],
    ];

    for (const [drift, expected] of cases) {
      const verifier = new EffectVerificationServiceV1();
      const result = verifier.verify({
        receipt: execution,
        observation: observation(execution, drift),
        verifiedAt: VERIFIED_AT,
      });
      expect(result.state).toBe("EXCEPTION");
      if (result.state !== "EXCEPTION") throw new Error("expected_exception");
      expect(result.reasonCode).toBe(expected);
      expect(verifier.verificationCount()).toBe(0);
    }
  });

  it("replays identical verification idempotently", () => {
    const execution = receipt();
    const observed = observation(execution);
    const verifier = new EffectVerificationServiceV1();
    const first = verifier.verify({ receipt: execution, observation: observed, verifiedAt: VERIFIED_AT });
    const second = verifier.verify({ receipt: execution, observation: observed, verifiedAt: VERIFIED_AT });

    expect(first.state).toBe("VERIFIED_EFFECT");
    expect(second.state).toBe("VERIFIED_EFFECT");
    if (first.state !== "VERIFIED_EFFECT" || second.state !== "VERIFIED_EFFECT") {
      throw new Error("expected_verified_effect");
    }
    expect(second.effect.effectRef).toBe(first.effect.effectRef);
    expect(second.effect.verificationRef).toBe(first.effect.verificationRef);
    expect(second.idempotentReplay).toBe(true);
    expect(verifier.verificationCount()).toBe(1);
  });

  it("fails closed on conflicting replay and cannot mint a second effect", () => {
    const execution = receipt();
    const observed = observation(execution);
    const verifier = new EffectVerificationServiceV1();
    const first = verifier.verify({ receipt: execution, observation: observed, verifiedAt: VERIFIED_AT });
    const conflicting = verifier.verify({
      receipt: execution,
      observation: { ...observed, observationRef: "POST-EXECUTION-OBSERVATION:CONFLICT", observedStateRef: "STATE:CONFLICT" },
      verifiedAt: VERIFIED_AT,
    });

    expect(first.state).toBe("VERIFIED_EFFECT");
    expect(conflicting.state).toBe("EXCEPTION");
    if (conflicting.state !== "EXCEPTION") throw new Error("expected_exception");
    expect(conflicting.reasonCode).toBe("VERIFICATION_IDEMPOTENCY_CONFLICT");
    expect(verifier.verificationCount()).toBe(1);
  });
});
