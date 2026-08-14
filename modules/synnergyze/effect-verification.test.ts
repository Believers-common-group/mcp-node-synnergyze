import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  EffectVerificationServiceV1,
  SyntheticServiceRequestObservationSourceV1,
} from "./effect-verification.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";

const DECIDED_AT = "2026-08-14T09:00:10.000Z";
const RESERVED_AT = "2026-08-14T09:00:20.000Z";
const CHECKED_AT = "2026-08-14T09:00:25.000Z";
const EXECUTED_AT = "2026-08-14T09:00:30.000Z";
const OBSERVED_AT = "2026-08-14T09:00:35.000Z";
const VERIFIED_AT = "2026-08-14T09:00:40.000Z";

function request(): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:EFFECT-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:EFFECT-001",
    eventRef: "SYNNERGYZE-EVENT:EFFECT-001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-14T09:00:00.000Z",
    correlationId: "CORR-EFFECT-001",
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:EFFECT-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-14T08:55:00.000Z",
    validUntil: "2026-08-14T09:05:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:EFFECT-001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
  };
}

function execute() {
  const requestValue = request();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: policy(),
    decidedAt: DECIDED_AT,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_chain");
  const action = buildAuthorizedActionEnvelopeV1(requestValue, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({ request: requestValue, decision, action, reservedAt: RESERVED_AT });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${decision.decisionRef}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["decision_active_for_execution"],
  };
  const adapter = new SyntheticServiceRequestCreateAdapterV1();
  const gate = new ControlledExecutionGateV1([adapter]);
  const execution = gate.execute({
    action,
    reservation,
    decision,
    checkpoint,
    executedAt: EXECUTED_AT,
  });
  return { request: requestValue, adapter, execution };
}

function observedChain() {
  const runtime = execute();
  const observer = new SyntheticServiceRequestObservationSourceV1(runtime.adapter);
  const observation = observer.observe(runtime.execution, OBSERVED_AT);
  return { ...runtime, observer, observation };
}

describe("ALPHA-EFFECT-VERIFY-001", () => {
  it("creates a verified effect only after a post-execution observation", () => {
    const runtime = observedChain();
    const verifier = new EffectVerificationServiceV1();

    expect(runtime.execution.state).toBe("EXECUTED_UNVERIFIED");
    expect("effectRef" in runtime.execution).toBe(false);
    expect(runtime.observation.observedStateRef).toContain(runtime.execution.adapterResultRef);

    const result = verifier.verify({
      execution: runtime.execution,
      observation: runtime.observation,
      verifiedAt: VERIFIED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.state).toBe("VERIFIED_EFFECT");
    expect(result.effect.executionReceiptRef).toBe(runtime.execution.receiptRef);
    expect(result.effect.reservationRef).toBe(runtime.execution.reservationRef);
    expect(result.effect.wardenDecisionRef).toBe(runtime.execution.wardenDecisionRef);
    expect(result.effect.observedStateRef).toBe(runtime.observation.observedStateRef);
    expect(result.effect.state).toBe("VERIFIED_EFFECT");
    expect("sealRef" in result.effect).toBe(false);
    expect(verifier.verificationCount()).toBe(1);
  });

  it("replays identical verification idempotently", () => {
    const runtime = observedChain();
    const verifier = new EffectVerificationServiceV1();
    const input = {
      execution: runtime.execution,
      observation: runtime.observation,
      verifiedAt: VERIFIED_AT,
    };
    const first = verifier.verify(input);
    const second = verifier.verify(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("expected_verified_effect");
    expect(second.effect.effectRef).toBe(first.effect.effectRef);
    expect(second.effect.verificationRef).toBe(first.effect.verificationRef);
    expect(second.idempotentReplay).toBe(true);
    expect(verifier.verificationCount()).toBe(1);
  });

  it("rejects conflicting verification replay for the same execution", () => {
    const runtime = observedChain();
    const verifier = new EffectVerificationServiceV1();
    verifier.verify({
      execution: runtime.execution,
      observation: runtime.observation,
      verifiedAt: VERIFIED_AT,
    });

    const conflict = verifier.verify({
      execution: runtime.execution,
      observation: {
        ...runtime.observation,
        observationRef: "SYNTHETIC-OBSERVATION:CONFLICT",
        observedStateRef: "SYNTHETIC-SERVICE-REQUEST-STATE:CONFLICT",
      },
      verifiedAt: VERIFIED_AT,
    });

    expect(conflict).toMatchObject({
      ok: false,
      state: "EXCEPTION",
      code: "VERIFICATION_CONFLICT",
    });
    expect(verifier.verificationCount()).toBe(1);
  });

  it("fails closed on execution/action/program/event/target/correlation lineage drift", () => {
    const runtime = observedChain();
    const cases = [
      ["OBSERVATION_EXECUTION_MISMATCH", { executionReceiptRef: "EXECUTION:OTHER" }],
      ["OBSERVATION_ACTION_MISMATCH", { actionRef: "ACTION:OTHER" }],
      ["OBSERVATION_PROGRAM_MISMATCH", { programRef: "PROGRAM:OTHER" }],
      ["OBSERVATION_EVENT_MISMATCH", { eventRef: "EVENT:OTHER" }],
      ["OBSERVATION_TARGET_MISMATCH", { targetRef: "TARGET:OTHER" }],
      ["OBSERVATION_CORRELATION_MISMATCH", { correlationId: "CORR-OTHER" }],
    ] as const;

    for (const [code, drift] of cases) {
      const verifier = new EffectVerificationServiceV1();
      const result = verifier.verify({
        execution: runtime.execution,
        observation: { ...runtime.observation, ...drift },
        verifiedAt: VERIFIED_AT,
      });
      expect(result).toMatchObject({ ok: false, state: "EXCEPTION", code });
      expect(verifier.verificationCount()).toBe(0);
    }
  });

  it("rejects observations before execution and verification before observation", () => {
    const runtime = observedChain();
    const beforeExecution = new EffectVerificationServiceV1().verify({
      execution: runtime.execution,
      observation: { ...runtime.observation, observedAt: "2026-08-14T09:00:29.000Z" },
      verifiedAt: VERIFIED_AT,
    });
    const beforeObservation = new EffectVerificationServiceV1().verify({
      execution: runtime.execution,
      observation: runtime.observation,
      verifiedAt: "2026-08-14T09:00:34.000Z",
    });

    expect(beforeExecution).toMatchObject({
      ok: false,
      code: "OBSERVATION_BEFORE_EXECUTION",
    });
    expect(beforeObservation).toMatchObject({
      ok: false,
      code: "VERIFICATION_BEFORE_OBSERVATION",
    });
  });

  it("rejects missing observed state or source evidence", () => {
    const runtime = observedChain();
    const missingState = new EffectVerificationServiceV1().verify({
      execution: runtime.execution,
      observation: { ...runtime.observation, observedStateRef: "" },
      verifiedAt: VERIFIED_AT,
    });
    const missingEvidence = new EffectVerificationServiceV1().verify({
      execution: runtime.execution,
      observation: { ...runtime.observation, sourceEvidenceRef: "" },
      verifiedAt: VERIFIED_AT,
    });

    expect(missingState).toMatchObject({ ok: false, code: "MISSING_OBSERVED_STATE" });
    expect(missingEvidence).toMatchObject({ ok: false, code: "MISSING_SOURCE_EVIDENCE" });
  });

  it("does not let requested-effect text substitute for observed adapter state", () => {
    const runtime = execute();
    const verifier = new EffectVerificationServiceV1();
    expect(runtime.request.requestedEffect).toBe("service_request.created");
    expect("effectRef" in runtime.execution).toBe(false);
    expect(verifier.verificationCount()).toBe(0);

    const observer = new SyntheticServiceRequestObservationSourceV1(runtime.adapter);
    const observation = observer.observe(runtime.execution, OBSERVED_AT);
    expect(observation.observedStateRef).not.toBe(runtime.request.requestedEffect);
  });

  it("requires the observation source to find the executed adapter result", () => {
    const runtime = execute();
    const observer = new SyntheticServiceRequestObservationSourceV1(runtime.adapter);
    const fabricatedExecution = {
      ...runtime.execution,
      adapterResultRef: "SYNTHETIC-SERVICE-REQUEST:NOT-FOUND",
    };

    expect(() => observer.observe(fabricatedExecution, OBSERVED_AT)).toThrow(
      "observation_adapter_result_not_found",
    );
  });
});
