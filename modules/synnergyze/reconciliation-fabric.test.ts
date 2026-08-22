import { describe, expect, it } from "vitest";

import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import { ReconciliationFabricV1, type ProviderReadbackV1 } from "./reconciliation-fabric.ts";

const EXECUTED_AT = "2026-08-22T12:00:00.000Z";
const DETECTED_AT = "2026-08-22T12:00:01.000Z";
const RECONCILED_AT = "2026-08-22T12:00:03.000Z";

function exception(
  overrides: Partial<CanonicalExceptionRecordV1> = {},
): CanonicalExceptionRecordV1 {
  return {
    version: "EXCEPTION-FABRIC-001",
    exceptionRef: "EXCEPTION:REC-001",
    source: "EFFECT_VERIFICATION",
    classification: "EVIDENCE",
    reasonCode: "MISSING_SOURCE_EVIDENCE",
    reasonDigest: "sha256:reason",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:REC-001",
    actionRef: "ACTION:REC-001",
    reservationRef: "RIVER-RESERVATION:REC-001",
    originalWardenDecisionRef: "WARDEN-DECISION:REC-001",
    checkpointRef: "WARDEN-EXEC-CHECK:REC-001",
    programRef: "SYNNERGYZE-PROGRAM:REC-001",
    eventRef: "SYNNERGYZE-EVENT:REC-001:001",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    correlationId: "CORR-REC-001",
    sourceEvidenceRefs: [],
    lineageViolations: [],
    executedAt: EXECUTED_AT,
    detectedAt: DETECTED_AT,
    sourceDigest: "sha256:exception-source",
    state: "OPEN",
    synthetic: true,
    ...overrides,
  };
}

function readback(overrides: Partial<ProviderReadbackV1> = {}): ProviderReadbackV1 {
  return {
    readbackRef: "PROVIDER-READBACK:REC-001",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:REC-001",
    targetRef: "LAB-SERVICE-DESK-001",
    correlationId: "CORR-REC-001",
    providerRef: "SYNTHETIC-PROVIDER-001",
    status: "AVAILABLE",
    observedStateRef: "PROVIDER-STATE:REC-001",
    sourceEvidenceRef: "PROVIDER-EVIDENCE:REC-001",
    readAt: "2026-08-22T12:00:02.000Z",
    synthetic: true,
    ...overrides,
  };
}

describe("RECONCILIATION-FABRIC-001", () => {
  it("classifies insufficient evidence and emits only an unauthorized observation retry proposal", () => {
    const fabric = new ReconciliationFabricV1();
    const result = fabric.reconcile({ exception: exception(), reconciledAt: RECONCILED_AT });

    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.version).toBe("RECONCILIATION-FABRIC-001");
    expect(result.determination.classification).toBe("EVIDENCE_INSUFFICIENT");
    expect(result.determination.state).toBe("DETERMINED_UNAUTHORIZED");
    expect(result.determination.authorized).toBe(false);
    expect(result.determination.originalWardenDecisionRef).toBe("WARDEN-DECISION:REC-001");
    expect(result.determination.candidateRemedies).toHaveLength(1);
    expect(result.determination.candidateRemedies[0]).toMatchObject({
      kind: "RETRY_OBSERVATION",
      capabilityRef: "effect.observe.retry",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
    expect("actionToken" in result.determination).toBe(false);
    expect(result.determination.candidateRemedies.some((proposal) => proposal.kind === "RECOVER")).toBe(false);
    expect(result.determination.candidateRemedies.some((proposal) => proposal.kind === "COMPENSATE")).toBe(false);
  });

  it("treats provider readback outage as PROVIDER_UNAVAILABLE without widening authority", () => {
    const fabric = new ReconciliationFabricV1();
    const result = fabric.reconcile({
      exception: exception(),
      readback: readback({
        status: "UNAVAILABLE",
        observedStateRef: undefined,
        reasonCode: "PROVIDER_TIMEOUT",
      }),
      reconciledAt: RECONCILED_AT,
    });

    expect(result.state).toBe("DETERMINED");
    if (result.state !== "DETERMINED") throw new Error("expected_determined");
    expect(result.determination.classification).toBe("PROVIDER_UNAVAILABLE");
    expect(result.determination.sourceEvidenceRefs).toContain("PROVIDER-EVIDENCE:REC-001");
    expect(result.determination.candidateRemedies[0]?.requiresFreshWardenDecision).toBe(true);
    expect(result.determination.authorized).toBe(false);
  });

  it("maps lineage and replay conflicts to CONFLICTING_EFFECT and only proposes manual review", () => {
    const fabric = new ReconciliationFabricV1();
    const cases: CanonicalExceptionRecordV1[] = [
      exception({
        exceptionRef: "EXCEPTION:LINEAGE",
        classification: "LINEAGE",
        reasonCode: "OBSERVATION_TARGET_MISMATCH",
      }),
      exception({
        exceptionRef: "EXCEPTION:REPLAY",
        classification: "REPLAY_CONFLICT",
        reasonCode: "VERIFICATION_IDEMPOTENCY_CONFLICT",
      }),
    ];

    for (const value of cases) {
      const result = fabric.reconcile({ exception: value, reconciledAt: RECONCILED_AT });
      expect(result.state).toBe("DETERMINED");
      if (result.state !== "DETERMINED") throw new Error("expected_determined");
      expect(result.determination.classification).toBe("CONFLICTING_EFFECT");
      expect(result.determination.candidateRemedies).toHaveLength(1);
      expect(result.determination.candidateRemedies[0]?.kind).toBe("MANUAL_REVIEW");
      expect(result.determination.candidateRemedies[0]?.requiresFreshWardenDecision).toBe(true);
    }
  });

  it("fails closed on readback lineage drift", () => {
    const fabric = new ReconciliationFabricV1();
    const targetDrift = fabric.reconcile({
      exception: exception(),
      readback: readback({ targetRef: "TARGET:OTHER" }),
      reconciledAt: RECONCILED_AT,
    });
    const correlationDrift = fabric.reconcile({
      exception: exception(),
      readback: readback({
        readbackRef: "PROVIDER-READBACK:REC-002",
        correlationId: "CORR:OTHER",
      }),
      reconciledAt: RECONCILED_AT,
    });

    expect(targetDrift).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_READBACK_TARGET_MISMATCH",
    });
    expect(correlationDrift).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_READBACK_CORRELATION_MISMATCH",
    });
    expect(fabric.determinationCount()).toBe(0);
  });

  it("replays an identical determination idempotently but rejects mutated evidence under the same readback identity", () => {
    const fabric = new ReconciliationFabricV1();
    const first = fabric.reconcile({
      exception: exception(),
      readback: readback(),
      reconciledAt: RECONCILED_AT,
    });
    const replay = fabric.reconcile({
      exception: exception(),
      readback: readback(),
      reconciledAt: "2026-08-22T12:00:09.000Z",
    });
    const conflict = fabric.reconcile({
      exception: exception(),
      readback: readback({ sourceEvidenceRef: "PROVIDER-EVIDENCE:MUTATED" }),
      reconciledAt: "2026-08-22T12:00:10.000Z",
    });

    expect(first.state).toBe("DETERMINED");
    expect(replay.state).toBe("DETERMINED");
    if (first.state !== "DETERMINED" || replay.state !== "DETERMINED") {
      throw new Error("expected_determined");
    }
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.determination.reconciliationRef).toBe(first.determination.reconciliationRef);
    expect(replay.determination.reconciledAt).toBe(RECONCILED_AT);
    expect(conflict).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_CONFLICT",
    });
    expect(fabric.determinationCount()).toBe(1);
  });

  it("rejects readback from before execution and reconciliation timestamps from before the exception", () => {
    const fabric = new ReconciliationFabricV1();
    const staleReadback = fabric.reconcile({
      exception: exception(),
      readback: readback({ readAt: "2026-08-22T11:59:59.000Z" }),
      reconciledAt: RECONCILED_AT,
    });
    const prematureReconciliation = fabric.reconcile({
      exception: exception(),
      reconciledAt: "2026-08-22T12:00:00.500Z",
    });

    expect(staleReadback).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_READBACK_BEFORE_EXECUTION",
    });
    expect(prematureReconciliation).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "RECONCILIATION_BEFORE_EXCEPTION",
    });
  });
});
