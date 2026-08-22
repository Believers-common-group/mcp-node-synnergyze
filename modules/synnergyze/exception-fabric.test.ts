import { describe, expect, it } from "vitest";

import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import type { EffectVerificationFailureV1, PostExecutionObservationV1 } from "./effect-verification.ts";
import { ExceptionFabricV1 } from "./exception-fabric.ts";

const EXECUTED_AT = "2026-08-22T12:00:00.000Z";
const DETECTED_AT = "2026-08-22T12:00:01.000Z";

function receipt(overrides: Partial<SynnergyzeExecutionReceiptV1> = {}): SynnergyzeExecutionReceiptV1 {
  return {
    receiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:EXC-001",
    actionRef: "ACTION:EXC-001",
    reservationRef: "RIVER-RESERVATION:EXC-001",
    wardenDecisionRef: "WARDEN-DECISION:EXC-001",
    checkpointRef: "WARDEN-EXEC-CHECK:EXC-001",
    programRef: "SYNNERGYZE-PROGRAM:EXC-001",
    eventRef: "SYNNERGYZE-EVENT:EXC-001:001",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    correlationId: "CORR-EXC-001",
    adapterRef: "SYNTHETIC-SERVICE-REQUEST-ADAPTER-001",
    adapterResultRef: "SYNTHETIC-SERVICE-REQUEST:EXC-001",
    state: "EXECUTED_UNVERIFIED",
    executedAt: EXECUTED_AT,
    synthetic: true,
    idempotentReplay: false,
    ...overrides,
  };
}

function failure(
  overrides: Partial<EffectVerificationFailureV1> = {},
): EffectVerificationFailureV1 {
  return {
    state: "EXCEPTION",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:EXC-001",
    reasonCode: "MISSING_SOURCE_EVIDENCE",
    reason: "post-execution observation is required",
    ...overrides,
  };
}

function observation(
  overrides: Partial<PostExecutionObservationV1> = {},
): PostExecutionObservationV1 {
  return {
    observationRef: "POST-EXECUTION-OBSERVATION:EXC-001",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:EXC-001",
    actionRef: "ACTION:EXC-001",
    programRef: "SYNNERGYZE-PROGRAM:EXC-001",
    eventRef: "SYNNERGYZE-EVENT:EXC-001:001",
    targetRef: "LAB-SERVICE-DESK-001",
    correlationId: "CORR-EXC-001",
    observerRef: "SYNTHETIC-SERVICE-REQUEST-OBSERVER-001",
    observedStateRef: "STATE:EXC-001",
    observedAt: "2026-08-22T12:00:00.500Z",
    sourceEvidenceRef: "SYNTHETIC-OBSERVATION-EVIDENCE:EXC-001",
    synthetic: true,
    ...overrides,
  };
}

describe("EXCEPTION-FABRIC-001", () => {
  it("canonicalizes an effect-verification failure without minting authority", () => {
    const fabric = new ExceptionFabricV1();
    const result = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure(),
      detectedAt: DETECTED_AT,
    });

    expect(result.state).toBe("CAPTURED_EXCEPTION");
    if (result.state !== "CAPTURED_EXCEPTION") throw new Error("expected_captured_exception");
    expect(result.record.version).toBe("EXCEPTION-FABRIC-001");
    expect(result.record.classification).toBe("EVIDENCE");
    expect(result.record.reservationRef).toBe("RIVER-RESERVATION:EXC-001");
    expect(result.record.originalWardenDecisionRef).toBe("WARDEN-DECISION:EXC-001");
    expect(result.record.state).toBe("OPEN");
    expect(result.record.reasonDigest).toMatch(/^sha256:/);
    expect(result.record.sourceDigest).toMatch(/^sha256:/);
    expect("actionToken" in result.record).toBe(false);
    expect("authorized" in result.record).toBe(false);
    expect(fabric.exceptionCount()).toBe(1);
  });

  it("replays the same semantic exception idempotently and retains first detection time", () => {
    const fabric = new ExceptionFabricV1();
    const first = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure(),
      detectedAt: DETECTED_AT,
    });
    const replay = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure(),
      detectedAt: "2026-08-22T12:00:09.000Z",
    });

    expect(first.state).toBe("CAPTURED_EXCEPTION");
    expect(replay.state).toBe("CAPTURED_EXCEPTION");
    if (first.state !== "CAPTURED_EXCEPTION" || replay.state !== "CAPTURED_EXCEPTION") {
      throw new Error("expected_captured_exception");
    }
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.record.exceptionRef).toBe(first.record.exceptionRef);
    expect(replay.record.detectedAt).toBe(DETECTED_AT);
    expect(fabric.exceptionCount()).toBe(1);
  });

  it("fails closed if the same exception identity is replayed with mutated execution lineage", () => {
    const fabric = new ExceptionFabricV1();
    const first = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure(),
      detectedAt: DETECTED_AT,
    });
    const conflict = fabric.captureEffectVerificationFailure({
      receipt: receipt({ targetRef: "TARGET:MUTATED" }),
      failure: failure(),
      detectedAt: "2026-08-22T12:00:02.000Z",
    });

    expect(first.state).toBe("CAPTURED_EXCEPTION");
    expect(conflict).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "EXCEPTION_CAPTURE_CONFLICT",
    });
    expect(fabric.exceptionCount()).toBe(1);
  });

  it("preserves the exact observation lineage violation instead of normalizing it away", () => {
    const fabric = new ExceptionFabricV1();
    const observed = observation({ targetRef: "TARGET:OTHER" });
    const result = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure({
        observationRef: observed.observationRef,
        reasonCode: "OBSERVATION_TARGET_MISMATCH",
        reason: "observation target lineage mismatch",
      }),
      observation: observed,
      detectedAt: DETECTED_AT,
    });

    expect(result.state).toBe("CAPTURED_EXCEPTION");
    if (result.state !== "CAPTURED_EXCEPTION") throw new Error("expected_captured_exception");
    expect(result.record.classification).toBe("LINEAGE");
    expect(result.record.lineageViolations).toEqual(["OBSERVATION_TARGET"]);
    expect(result.record.sourceEvidenceRefs).toEqual([
      "SYNTHETIC-OBSERVATION-EVIDENCE:EXC-001",
    ]);
  });

  it("rejects cross-receipt substitution and impossible detection time", () => {
    const fabric = new ExceptionFabricV1();
    const wrongReceipt = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure({ executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:OTHER" }),
      detectedAt: DETECTED_AT,
    });
    const beforeExecution = fabric.captureEffectVerificationFailure({
      receipt: receipt(),
      failure: failure(),
      detectedAt: "2026-08-22T11:59:59.999Z",
    });

    expect(wrongReceipt).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "EXCEPTION_SOURCE_RECEIPT_MISMATCH",
    });
    expect(beforeExecution).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "EXCEPTION_DETECTED_BEFORE_EXECUTION",
    });
    expect(fabric.exceptionCount()).toBe(0);
  });
});
