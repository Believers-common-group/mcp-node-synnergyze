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
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";
import {
  EffectVerifierV1,
  SyntheticServiceRequestObservationSourceV1,
} from "./effect-verifier.ts";
import type { PostExecutionObservationV1 } from "./contracts.ts";

const DECIDED_AT = "2026-08-15T05:00:10.000Z";
const RESERVED_AT = "2026-08-15T05:00:20.000Z";
const CHECKED_AT = "2026-08-15T05:00:25.000Z";
const EXECUTED_AT = "2026-08-15T05:00:30.000Z";
const OBSERVED_AT = "2026-08-15T05:00:40.000Z";
const VERIFIED_AT = "2026-08-15T05:00:45.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
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
    requestedEffect: "THIS_IS_ONLY_AN_INTENDED_EFFECT",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-15T05:00:00.000Z",
    correlationId: "CORR-EFFECT-001",
    ...overrides,
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:EFFECT-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-15T04:55:00.000Z",
    validUntil: "2026-08-15T05:05:00.000Z",
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

function execution() {
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
  const receipt = gate.execute({ action, reservation, decision, checkpoint, executedAt: EXECUTED_AT });
  return { request: requestValue, decision, action, reservation, receipt };
}

function observation(receipt = execution().receipt): PostExecutionObservationV1 {
  return new SyntheticServiceRequestObservationSourceV1().observe(receipt, OBSERVED_AT);
}

describe("ALPHA-EFFECT-VERIFY-001", () => {
  it("verifies an effect only after a matching post-execution observation", () => {
    const e = execution();
    const observed = observation(e.receipt);
    const verifier = new EffectVerifierV1();
    const result = verifier.verify({ receipt: e.receipt, observation: observed, verifiedAt: VERIFIED_AT });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected_verified_effect");
    expect(result.state).toBe("VERIFIED_EFFECT");
    expect(result.idempotentReplay).toBe(false);
    expect(result.effect.executionReceiptRef).toBe(e.receipt.receiptRef);
    expect(result.effect.reservationRef).toBe(e.receipt.reservationRef);
    expect(result.effect.wardenDecisionRef).toBe(e.receipt.wardenDecisionRef);
    expect(result.effect.programRef).toBe(e.receipt.programRef);
    expect(result.effect.eventRef).toBe(e.receipt.eventRef);
    expect(result.effect.targetRef).toBe(e.receipt.targetRef);
    expect(result.effect.correlationId).toBe(e.receipt.correlationId);
    expect(result.effect.sourceObservationRef).toBe(observed.observationRef);
    expect(result.effect.sourceEvidenceRef).toBe(observed.sourceEvidenceRef);
    expect(result.effect.observedStateRef).toContain("SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:");
    expect(result.effect.observedStateRef).not.toBe(e.request.requestedEffect);
    expect("sealRef" in result.effect).toBe(false);
    expect("registryEffectRef" in result.effect).toBe(false);
    expect("economicObligationRef" in result.effect).toBe(false);
    expect(verifier.effectCount()).toBe(1);
  });

  it("does not infer a verified effect from the execution receipt or intended effect alone", () => {
    const e = execution();
    const result = new EffectVerifierV1().verify({ receipt: e.receipt, verifiedAt: VERIFIED_AT });
    expect(result).toMatchObject({ ok: false, state: "EXCEPTION", code: "MISSING_OBSERVATION" });
  });

  it("rejects a fabricated observation for another execution receipt", () => {
    const e = execution();
    const observed = { ...observation(e.receipt), executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:OTHER" };
    const result = new EffectVerifierV1().verify({ receipt: e.receipt, observation: observed, verifiedAt: VERIFIED_AT });
    expect(result).toMatchObject({ ok: false, code: "EXECUTION_RECEIPT_MISMATCH" });
  });

  it("rejects action, program, event and correlation lineage drift", () => {
    const e = execution();
    const base = observation(e.receipt);
    const vectors: Array<[Partial<PostExecutionObservationV1>, string]> = [
      [{ actionRef: "ACTION:OTHER" }, "ACTION_MISMATCH"],
      [{ programRef: "PROGRAM:OTHER" }, "PROGRAM_MISMATCH"],
      [{ eventRef: "EVENT:OTHER" }, "EVENT_MISMATCH"],
      [{ correlationId: "CORR-OTHER" }, "CORRELATION_MISMATCH"],
    ];

    for (const [drift, code] of vectors) {
      const result = new EffectVerifierV1().verify({
        receipt: e.receipt,
        observation: { ...base, ...drift },
        verifiedAt: VERIFIED_AT,
      });
      expect(result).toMatchObject({ ok: false, code });
    }
  });

  it("rejects target drift", () => {
    const e = execution();
    const result = new EffectVerifierV1().verify({
      receipt: e.receipt,
      observation: { ...observation(e.receipt), targetRef: "TARGET:OTHER" },
      verifiedAt: VERIFIED_AT,
    });
    expect(result).toMatchObject({ ok: false, code: "TARGET_MISMATCH" });
  });

  it("rejects observations before execution and verification before observation", () => {
    const e = execution();
    const valid = observation(e.receipt);
    const earlyObservation = { ...valid, observedAt: "2026-08-15T05:00:29.000Z" };
    expect(
      new EffectVerifierV1().verify({ receipt: e.receipt, observation: earlyObservation, verifiedAt: VERIFIED_AT }),
    ).toMatchObject({ ok: false, code: "OBSERVATION_BEFORE_EXECUTION" });

    expect(
      new EffectVerifierV1().verify({
        receipt: e.receipt,
        observation: valid,
        verifiedAt: "2026-08-15T05:00:39.000Z",
      }),
    ).toMatchObject({ ok: false, code: "VERIFICATION_BEFORE_OBSERVATION" });
  });

  it("rejects missing observed state and missing observation evidence", () => {
    const e = execution();
    const valid = observation(e.receipt);
    expect(
      new EffectVerifierV1().verify({
        receipt: e.receipt,
        observation: { ...valid, observedStateRef: "" },
        verifiedAt: VERIFIED_AT,
      }),
    ).toMatchObject({ ok: false, code: "OBSERVED_STATE_MISSING" });
    expect(
      new EffectVerifierV1().verify({
        receipt: e.receipt,
        observation: { ...valid, sourceEvidenceRef: "" },
        verifiedAt: VERIFIED_AT,
      }),
    ).toMatchObject({ ok: false, code: "SOURCE_EVIDENCE_MISSING" });
  });

  it("replays identical verification idempotently without minting another effect", () => {
    const e = execution();
    const observed = observation(e.receipt);
    const verifier = new EffectVerifierV1();
    const first = verifier.verify({ receipt: e.receipt, observation: observed, verifiedAt: VERIFIED_AT });
    const second = verifier.verify({ receipt: e.receipt, observation: observed, verifiedAt: VERIFIED_AT });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("expected_verified_effects");
    expect(second.effect.effectRef).toBe(first.effect.effectRef);
    expect(second.idempotentReplay).toBe(true);
    expect(verifier.effectCount()).toBe(1);
  });

  it("fails closed on conflicting verification replay", () => {
    const e = execution();
    const observed = observation(e.receipt);
    const verifier = new EffectVerifierV1();
    const first = verifier.verify({ receipt: e.receipt, observation: observed, verifiedAt: VERIFIED_AT });
    expect(first.ok).toBe(true);

    const conflict = verifier.verify({
      receipt: e.receipt,
      observation: {
        ...observed,
        observationRef: "SYNNERGYZE-OBSERVATION:CONFLICT",
        observedStateRef: "SYNTHETIC-SERVICE-REQUEST-STATE:CONFLICT",
      },
      verifiedAt: VERIFIED_AT,
    });
    expect(conflict).toMatchObject({ ok: false, state: "EXCEPTION", code: "IDEMPOTENCY_CONFLICT" });
    expect(verifier.effectCount()).toBe(1);
  });

  it("observation source itself refuses to fabricate pre-execution observation time", () => {
    const e = execution();
    expect(() =>
      new SyntheticServiceRequestObservationSourceV1().observe(
        e.receipt,
        "2026-08-15T05:00:29.000Z",
      ),
    ).toThrow("observation_before_execution");
  });
});
