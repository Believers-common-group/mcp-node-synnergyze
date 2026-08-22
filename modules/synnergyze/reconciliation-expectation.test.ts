import { describe, expect, it } from "vitest";

import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { ExpectedEffectContractV1 } from "./effect-expectation.ts";
import { ReconciliationFabricV1, type ProviderReadbackV1 } from "./reconciliation-fabric.ts";

function exception(overrides: Partial<CanonicalExceptionRecordV1> = {}): CanonicalExceptionRecordV1 {
  return {
    version: "EXCEPTION-FABRIC-001",
    exceptionRef: "EXCEPTION:EXPECT-001",
    source: "EFFECT_VERIFICATION",
    classification: "EVIDENCE",
    reasonCode: "MISSING_SOURCE_EVIDENCE",
    reasonDigest: "sha256:reason",
    executionReceiptRef: "EXECUTION:EXPECT-001",
    actionRef: "ACTION:EXPECT-001",
    reservationRef: "RESERVATION:EXPECT-001",
    originalWardenDecisionRef: "WARDEN-DECISION:EXPECT-001",
    checkpointRef: "CHECKPOINT:EXPECT-001",
    programRef: "PROGRAM:EXPECT-001",
    eventRef: "EVENT:EXPECT-001",
    capabilityRef: "service_request.create",
    targetRef: "TARGET:EXPECT-001",
    requestedEffect: "service_request.created",
    correlationId: "CORR:EXPECT-001",
    sourceEvidenceRefs: [],
    lineageViolations: [],
    executedAt: "2026-08-22T12:00:03.000Z",
    detectedAt: "2026-08-22T12:00:04.000Z",
    sourceDigest: "sha256:exception",
    state: "OPEN",
    synthetic: true,
    ...overrides,
  };
}

function expectation(overrides: Partial<ExpectedEffectContractV1> = {}): ExpectedEffectContractV1 {
  return {
    version: "EXPECTED-EFFECT-CONTRACT-001",
    expectationRef: "EXPECTED-EFFECT:EXPECT-001",
    actionRef: "ACTION:EXPECT-001",
    reservationRef: "RESERVATION:EXPECT-001",
    wardenDecisionRef: "WARDEN-DECISION:EXPECT-001",
    programRef: "PROGRAM:EXPECT-001",
    eventRef: "EVENT:EXPECT-001",
    capabilityRef: "service_request.create",
    targetRef: "TARGET:EXPECT-001",
    requestedEffect: "service_request.created",
    correlationId: "CORR:EXPECT-001",
    matcher: { kind: "PREFIX", value: "SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:" },
    compilerRef: "SYNTHETIC-SERVICE-REQUEST-EXPECTATION-COMPILER-001",
    sourceDigest: "sha256:expectation",
    compiledAt: "2026-08-22T12:00:02.000Z",
    state: "BOUND_PRE_EXECUTION",
    synthetic: true,
    ...overrides,
  };
}

function readback(observedStateRef: string): ProviderReadbackV1 {
  return {
    readbackRef: "READBACK:EXPECT-001",
    executionReceiptRef: "EXECUTION:EXPECT-001",
    targetRef: "TARGET:EXPECT-001",
    correlationId: "CORR:EXPECT-001",
    providerRef: "PROVIDER:EXPECT-001",
    status: "AVAILABLE",
    observedStateRef,
    sourceEvidenceRef: "EVIDENCE:READBACK-001",
    readAt: "2026-08-22T12:00:05.000Z",
    synthetic: true,
  };
}

describe("RECONCILIATION-FABRIC-001 expected-effect binding", () => {
  it("records MATCH with no remedy when provider reality satisfies the pre-execution contract", () => {
    const result = new ReconciliationFabricV1().reconcile({
      exception: exception(),
      expectation: expectation(),
      readback: readback("SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:ABC"),
      reconciledAt: "2026-08-22T12:00:06.000Z",
    });

    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.classification).toBe("MATCH");
    expect(result.determination.expectationRef).toBe("EXPECTED-EFFECT:EXPECT-001");
    expect(result.determination.candidateRemedies).toEqual([]);
    expect(result.determination.authorized).toBe(false);
  });

  it("records UNEXPECTED_EFFECT but only proposes manual review", () => {
    const result = new ReconciliationFabricV1().reconcile({
      exception: exception(),
      expectation: expectation(),
      readback: readback("STATE:UNEXPECTED"),
      reconciledAt: "2026-08-22T12:00:06.000Z",
    });

    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.classification).toBe("UNEXPECTED_EFFECT");
    expect(result.determination.candidateRemedies).toHaveLength(1);
    expect(result.determination.candidateRemedies[0]).toMatchObject({
      kind: "MANUAL_REVIEW",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
  });

  it("does not let a matching readback wash away lineage or replay conflict", () => {
    const matching = readback("SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:ABC");
    for (const conflicted of [
      exception({ classification: "LINEAGE", reasonCode: "OBSERVATION_TARGET_MISMATCH" }),
      exception({ classification: "REPLAY_CONFLICT", reasonCode: "VERIFICATION_IDEMPOTENCY_CONFLICT" }),
    ]) {
      const result = new ReconciliationFabricV1().reconcile({
        exception: conflicted,
        expectation: expectation(),
        readback: matching,
        reconciledAt: "2026-08-22T12:00:06.000Z",
      });
      expect(result.state).toBe("DETERMINED");
      if (result.state !== "DETERMINED") throw new Error("expected_determined");
      expect(result.determination.classification).toBe("CONFLICTING_EFFECT");
    }
  });

  it("rejects an expectation created after execution or rebound to another intended effect", () => {
    const late = new ReconciliationFabricV1().reconcile({
      exception: exception(),
      expectation: expectation({ compiledAt: "2026-08-22T12:00:03.001Z" }),
      readback: readback("STATE:UNEXPECTED"),
      reconciledAt: "2026-08-22T12:00:06.000Z",
    });
    const rebound = new ReconciliationFabricV1().reconcile({
      exception: exception(),
      expectation: expectation({ requestedEffect: "service_request.deleted" }),
      readback: readback("STATE:UNEXPECTED"),
      reconciledAt: "2026-08-22T12:00:06.000Z",
    });

    expect(late).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_EXPECTATION_AFTER_EXECUTION",
    });
    expect(rebound).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_EXPECTATION_EFFECT_MISMATCH",
    });
  });
});
