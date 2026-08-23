import { describe, expect, it } from "vitest";

import {
  InMemoryCausalRecordStoreV1,
  compositeAssessmentSourceDigestV1,
} from "./causal-record-store.ts";
import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { ReconciliationDeterminationV1 } from "./reconciliation-fabric.ts";

function exception(overrides: Partial<CanonicalExceptionRecordV1> = {}): CanonicalExceptionRecordV1 {
  return {
    version: "EXCEPTION-FABRIC-001",
    exceptionRef: "EXCEPTION:001",
    source: "EFFECT_VERIFICATION",
    classification: "STATE",
    reasonCode: "EXECUTION_NOT_UNVERIFIED",
    reasonDigest: "sha256:reason",
    executionReceiptRef: "EXECUTION:001",
    actionRef: "ACTION:001",
    reservationRef: "RESERVATION:001",
    originalWardenDecisionRef: "WARDEN-DECISION:001",
    checkpointRef: "CHECKPOINT:001",
    programRef: "PROGRAM:001",
    eventRef: "EVENT:001",
    capabilityRef: "inventory.transfer",
    targetRef: "TRANSFER:001",
    requestedEffect: "inventory.transfer.completed",
    correlationId: "CORR:001",
    sourceEvidenceRefs: ["EVIDENCE:EXCEPTION:001"],
    lineageViolations: [],
    executedAt: "2026-08-23T04:00:00.000Z",
    detectedAt: "2026-08-23T04:00:01.000Z",
    sourceDigest: "sha256:exception-source-001",
    state: "OPEN",
    synthetic: true,
    ...overrides,
  };
}

function scalar(
  sourceException = exception(),
  overrides: Partial<ReconciliationDeterminationV1> = {},
): ReconciliationDeterminationV1 {
  return {
    version: "RECONCILIATION-FABRIC-001",
    reconciliationRef: "RECONCILIATION:001",
    exceptionRef: sourceException.exceptionRef,
    classification: "UNKNOWN",
    executionReceiptRef: sourceException.executionReceiptRef,
    reservationRef: sourceException.reservationRef,
    originalWardenDecisionRef: sourceException.originalWardenDecisionRef,
    programRef: sourceException.programRef,
    eventRef: sourceException.eventRef,
    targetRef: sourceException.targetRef,
    requestedEffect: sourceException.requestedEffect,
    correlationId: sourceException.correlationId,
    sourceEvidenceRefs: [...sourceException.sourceEvidenceRefs],
    candidateRemedies: [{
      proposalRef: "REMEDY-PROPOSAL:MANUAL:001",
      kind: "MANUAL_REVIEW",
      capabilityRef: "reconciliation.manual_review",
      reasonCode: "human_resolution_required",
      requiresFreshWardenDecision: true,
      authorized: false,
    }],
    sourceDigest: "sha256:reconciliation-source-001",
    reconciledAt: "2026-08-23T04:00:02.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
    ...overrides,
  };
}

function composite(
  sourceException = exception(),
  overrides: Partial<CompositeEffectAssessmentV1> = {},
): CompositeEffectAssessmentV1 {
  return {
    version: "PARTIAL-EFFECT-ASSESSMENT-001",
    assessmentRef: "PARTIAL-EFFECT-ASSESSMENT:001",
    effectSetRef: "EXPECTED-EFFECT-SET:001",
    executionReceiptRef: sourceException.executionReceiptRef,
    reservationRef: sourceException.reservationRef,
    originalWardenDecisionRef: sourceException.originalWardenDecisionRef,
    programRef: sourceException.programRef,
    eventRef: sourceException.eventRef,
    targetRef: sourceException.targetRef,
    correlationId: sourceException.correlationId,
    classification: "PARTIAL_EFFECT",
    matchedComponentRefs: ["COMPONENT:SOURCE"],
    missingComponentRefs: ["COMPONENT:DEST"],
    unexpectedComponentRefs: [],
    duplicateComponentRefs: [],
    conflictingComponentRefs: [],
    sourceEvidenceRefs: ["EVIDENCE:SOURCE"],
    candidateRemedies: [{
      proposalRef: "REMEDY-PROPOSAL:RECOVER:001",
      kind: "RECOVER",
      capabilityRef: "inventory.destination_credit.recover",
      effectSetRef: "EXPECTED-EFFECT-SET:001",
      componentRefs: ["COMPONENT:DEST"],
      reasonCode: "complete_exact_missing_components",
      requiresFreshWardenDecision: true,
      authorized: false,
    }],
    assessedAt: "2026-08-23T04:00:03.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
    ...overrides,
  };
}

describe("CAUSAL-RECORD-STORE-001", () => {
  it("reconstructs exception, scalar reconciliation, composite assessment and supersession after writes", async () => {
    const store = new InMemoryCausalRecordStoreV1();
    const sourceException = exception();
    const scalarRecord = scalar(sourceException);
    const compositeRecord = composite(sourceException);

    await expect(store.putException(sourceException, "2026-08-23T04:00:04.000Z")).resolves.toMatchObject({ state: "STORED" });
    await expect(store.putScalarReconciliation({
      exception: sourceException,
      determination: scalarRecord,
      recordedAt: "2026-08-23T04:00:05.000Z",
    })).resolves.toMatchObject({ state: "STORED" });
    await expect(store.putCompositeAssessment({
      exception: sourceException,
      assessment: compositeRecord,
      recordedAt: "2026-08-23T04:00:06.000Z",
    })).resolves.toMatchObject({ state: "STORED" });
    await expect(store.supersede({
      recordKind: "SCALAR_RECONCILIATION",
      recordRef: scalarRecord.reconciliationRef,
      supersededByRef: compositeRecord.assessmentRef,
      reasonCode: "composite_effect_evidence_supersedes_scalar_unknown",
      sourceEvidenceRefs: ["EVIDENCE:SOURCE"],
      supersededAt: "2026-08-23T04:00:07.000Z",
    })).resolves.toMatchObject({ state: "STORED" });

    const history = await store.reconstruct(sourceException.exceptionRef);
    expect(history?.exception).toEqual(sourceException);
    expect(history?.scalarReconciliations).toEqual([scalarRecord]);
    expect(history?.compositeAssessments).toEqual([compositeRecord]);
    expect(history?.supersessions).toHaveLength(1);
    expect(history?.supersessions[0]).toMatchObject({
      recordRef: scalarRecord.reconciliationRef,
      supersededByRef: compositeRecord.assessmentRef,
      state: "SUPERSEDED_APPEND_ONLY",
    });
  });

  it("accepts exact durable replay but rejects mutation under the same exception identity", async () => {
    const store = new InMemoryCausalRecordStoreV1();
    const sourceException = exception();
    await store.putException(sourceException, "2026-08-23T04:00:04.000Z");

    await expect(store.putException(sourceException, "2026-08-23T04:00:05.000Z")).resolves.toMatchObject({ state: "IDEMPOTENT_REPLAY" });
    await expect(store.putException({
      ...sourceException,
      sourceDigest: "sha256:mutated",
    }, "2026-08-23T04:00:06.000Z")).resolves.toEqual({ state: "CONFLICT" });
  });

  it("rejects attaching a reconciliation to the wrong exception lineage before persistence", async () => {
    const store = new InMemoryCausalRecordStoreV1();
    const sourceException = exception();
    const otherException = exception({
      exceptionRef: "EXCEPTION:OTHER",
      executionReceiptRef: "EXECUTION:OTHER",
      sourceDigest: "sha256:other",
    });

    await expect(store.putScalarReconciliation({
      exception: otherException,
      determination: scalar(sourceException),
      recordedAt: "2026-08-23T04:00:05.000Z",
    })).rejects.toThrow("causal_store_scalar_exception_mismatch");

    await expect(store.putCompositeAssessment({
      exception: otherException,
      assessment: composite(sourceException),
      recordedAt: "2026-08-23T04:00:06.000Z",
    })).rejects.toThrow("causal_store_composite_execution_mismatch");
  });

  it("permits only one append-only successor for one persisted record identity", async () => {
    const store = new InMemoryCausalRecordStoreV1();
    const sourceException = exception();
    await store.putException(sourceException, "2026-08-23T04:00:04.000Z");

    const first = await store.supersede({
      recordKind: "EXCEPTION",
      recordRef: sourceException.exceptionRef,
      supersededByRef: "EXCEPTION:CORRECTION:001",
      reasonCode: "evidence_correction",
      sourceEvidenceRefs: ["EVIDENCE:CORRECTION:001"],
      supersededAt: "2026-08-23T04:00:07.000Z",
    });
    expect(first.state).toBe("STORED");

    const replay = await store.supersede({
      recordKind: "EXCEPTION",
      recordRef: sourceException.exceptionRef,
      supersededByRef: "EXCEPTION:CORRECTION:001",
      reasonCode: "evidence_correction",
      sourceEvidenceRefs: ["EVIDENCE:CORRECTION:001"],
      supersededAt: "2026-08-23T04:00:08.000Z",
    });
    expect(replay.state).toBe("IDEMPOTENT_REPLAY");

    const conflict = await store.supersede({
      recordKind: "EXCEPTION",
      recordRef: sourceException.exceptionRef,
      supersededByRef: "EXCEPTION:CORRECTION:002",
      reasonCode: "another_correction",
      sourceEvidenceRefs: ["EVIDENCE:CORRECTION:002"],
      supersededAt: "2026-08-23T04:00:09.000Z",
    });
    expect(conflict).toEqual({ state: "CONFLICT" });
  });

  it("rejects supersession for a record that was never persisted", async () => {
    const store = new InMemoryCausalRecordStoreV1();
    await expect(store.supersede({
      recordKind: "EXCEPTION",
      recordRef: "EXCEPTION:MISSING",
      supersededByRef: "EXCEPTION:CORRECTION:001",
      reasonCode: "evidence_correction",
      sourceEvidenceRefs: ["EVIDENCE:CORRECTION:001"],
      supersededAt: "2026-08-23T04:00:07.000Z",
    })).rejects.toThrow("causal_store_superseded_record_missing");
  });

  it("normalizes composite assessment identity independent of input ordering", () => {
    const left = composite();
    const right = {
      ...composite(),
      matchedComponentRefs: [...left.matchedComponentRefs].reverse(),
      missingComponentRefs: [...left.missingComponentRefs].reverse(),
      sourceEvidenceRefs: [...left.sourceEvidenceRefs].reverse(),
      candidateRemedies: [...left.candidateRemedies].reverse(),
    };
    expect(compositeAssessmentSourceDigestV1(left)).toBe(compositeAssessmentSourceDigestV1(right));
  });
});
