import { describe, expect, it } from "vitest";

import type {
  CausalRecordSupersessionV1,
  ExceptionCausalHistoryV1,
} from "./causal-record-store.ts";
import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { CanonicalExceptionRecordV1 } from "./exception-fabric.ts";
import type { VerifiedScopedRemedyEffectV1 } from "./remedy-effect-verification.ts";
import type {
  ExceptionSupersessionRecordV1,
  RemedyCausalSealV1,
} from "./remedy-lineage-closure.ts";
import {
  InMemoryRiverCausalPublicationSinkV1,
  publishRemedyClosureToRiverV1,
  type RiverCausalPublicationSinkV1,
} from "./river-causal-publication.ts";

const EXCEPTION_REF = "EXCEPTION:001";
const ASSESSMENT_REF = "PARTIAL-EFFECT-ASSESSMENT:001";
const EFFECT_REF = "VERIFIED-REMEDY-EFFECT:001";
const VERIFICATION_REF = "REMEDY-EFFECT-VERIFICATION:001";
const SEAL_REF = "RIVER-REMEDY-SEAL:001";
const SUPERSESSION_REF = "EXCEPTION-SUPERSESSION:001";

function exception(): CanonicalExceptionRecordV1 {
  return {
    version: "EXCEPTION-FABRIC-001",
    exceptionRef: EXCEPTION_REF,
    source: "EFFECT_VERIFICATION",
    classification: "STATE",
    reasonCode: "EXECUTION_NOT_UNVERIFIED",
    reasonDigest: "sha256:reason",
    executionReceiptRef: "EXECUTION:ORIGINAL:001",
    actionRef: "ACTION:001",
    reservationRef: "RESERVATION:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL:001",
    checkpointRef: "CHECKPOINT:001",
    programRef: "PROGRAM:001",
    eventRef: "EVENT:001",
    capabilityRef: "inventory.transfer",
    targetRef: "TRANSFER:001",
    requestedEffect: "inventory.transfer.completed",
    correlationId: "CORR:PARENT:001",
    sourceEvidenceRefs: ["EVIDENCE:EXCEPTION:001"],
    lineageViolations: [],
    executedAt: "2026-08-23T04:00:00.000Z",
    detectedAt: "2026-08-23T04:00:01.000Z",
    sourceDigest: "sha256:exception-source-001",
    state: "OPEN",
    synthetic: true,
  };
}

function assessment(): CompositeEffectAssessmentV1 {
  return {
    version: "PARTIAL-EFFECT-ASSESSMENT-001",
    assessmentRef: ASSESSMENT_REF,
    effectSetRef: "EXPECTED-EFFECT-SET:001",
    executionReceiptRef: "EXECUTION:ORIGINAL:001",
    reservationRef: "RESERVATION:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL:001",
    programRef: "PROGRAM:001",
    eventRef: "EVENT:001",
    targetRef: "TRANSFER:001",
    correlationId: "CORR:PARENT:001",
    classification: "PARTIAL_EFFECT",
    matchedComponentRefs: ["COMPONENT:SOURCE"],
    missingComponentRefs: ["COMPONENT:DEST"],
    unexpectedComponentRefs: [],
    duplicateComponentRefs: [],
    conflictingComponentRefs: [],
    sourceEvidenceRefs: ["EVIDENCE:SOURCE:001"],
    candidateRemedies: [
      {
        proposalRef: "REMEDY-PROPOSAL:RECOVER:001",
        kind: "RECOVER",
        capabilityRef: "inventory.destination_credit.recover",
        effectSetRef: "EXPECTED-EFFECT-SET:001",
        componentRefs: ["COMPONENT:DEST"],
        reasonCode: "complete_exact_missing_components",
        requiresFreshWardenDecision: true,
        authorized: false,
      },
    ],
    assessedAt: "2026-08-23T04:00:02.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
  };
}

function effect(): VerifiedScopedRemedyEffectV1 {
  return {
    version: "SCOPED-REMEDY-EFFECT-VERIFICATION-001",
    effectRef: EFFECT_REF,
    verificationRef: VERIFICATION_REF,
    assessmentRef: ASSESSMENT_REF,
    effectSetRef: "EXPECTED-EFFECT-SET:001",
    proposalRef: "REMEDY-PROPOSAL:RECOVER:001",
    proposalKind: "RECOVER",
    authorizationRef: "REMEDY-AUTHORIZATION:001",
    remedyExecutionReceiptRef: "EXECUTION:REMEDY:001",
    originalExecutionReceiptRef: "EXECUTION:ORIGINAL:001",
    originalReservationRef: "RESERVATION:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL:001",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY:001",
    parentCorrelationId: "CORR:PARENT:001",
    remedyCorrelationId: "CORR:REMEDY:001",
    targetRef: "TRANSFER:001",
    componentRefs: ["COMPONENT:DEST"],
    observationRefs: ["OBSERVATION:REMEDY:001"],
    sourceEvidenceRefs: ["EVIDENCE:REMEDY:001"],
    verifiedAt: "2026-08-23T04:00:03.000Z",
    state: "VERIFIED_REMEDY_EFFECT",
    synthetic: true,
  };
}

function seal(): RemedyCausalSealV1 {
  return {
    version: "REMEDY-CAUSAL-SEAL-001",
    sealRef: SEAL_REF,
    reservationRef: "RESERVATION:001",
    correlationId: "CORR:PARENT:001",
    state: "SEALED",
    traceDigest: "sha256:trace-001",
    sealedAt: "2026-08-23T04:00:04.000Z",
    originalExceptionRef: EXCEPTION_REF,
    assessmentRef: ASSESSMENT_REF,
    effectSetRef: "EXPECTED-EFFECT-SET:001",
    proposalRef: "REMEDY-PROPOSAL:RECOVER:001",
    authorizationRef: "REMEDY-AUTHORIZATION:001",
    originalExecutionReceiptRef: "EXECUTION:ORIGINAL:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL:001",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY:001",
    remedyExecutionReceiptRef: "EXECUTION:REMEDY:001",
    remedyEffectRef: EFFECT_REF,
    remedyVerificationRef: VERIFICATION_REF,
    parentCorrelationId: "CORR:PARENT:001",
    remedyCorrelationId: "CORR:REMEDY:001",
    componentRefs: ["COMPONENT:DEST"],
    observationRefs: ["OBSERVATION:REMEDY:001"],
    sourceEvidenceRefs: ["EVIDENCE:EXCEPTION:001", "EVIDENCE:SOURCE:001", "EVIDENCE:REMEDY:001"],
    synthetic: true,
  };
}

function exceptionSupersession(): ExceptionSupersessionRecordV1 {
  return {
    version: "EXCEPTION-SUPERSESSION-001",
    supersessionRef: SUPERSESSION_REF,
    exceptionRef: EXCEPTION_REF,
    priorState: "OPEN",
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    assessmentRef: ASSESSMENT_REF,
    proposalRef: "REMEDY-PROPOSAL:RECOVER:001",
    authorizationRef: "REMEDY-AUTHORIZATION:001",
    remedyEffectRef: EFFECT_REF,
    remedyVerificationRef: VERIFICATION_REF,
    riverSealRef: SEAL_REF,
    originalExecutionReceiptRef: "EXECUTION:ORIGINAL:001",
    remedyExecutionReceiptRef: "EXECUTION:REMEDY:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL:001",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY:001",
    parentCorrelationId: "CORR:PARENT:001",
    remedyCorrelationId: "CORR:REMEDY:001",
    componentRefs: ["COMPONENT:DEST"],
    sourceEvidenceRefs: ["EVIDENCE:EXCEPTION:001", "EVIDENCE:SOURCE:001", "EVIDENCE:REMEDY:001"],
    supersededAt: "2026-08-23T04:00:04.000Z",
    state: "RESOLVED_APPEND_ONLY",
    synthetic: true,
  };
}

function history(supersessions: readonly CausalRecordSupersessionV1[] = []): ExceptionCausalHistoryV1 {
  return {
    exception: exception(),
    scalarReconciliations: [],
    compositeAssessments: [assessment()],
    supersessions,
  };
}

describe("RIVER-CAUSAL-PUBLICATION-001", () => {
  it("publishes content-addressed causal objects and a predecessor-linked PEF event trace", async () => {
    const sink = new InMemoryRiverCausalPublicationSinkV1();
    const result = await publishRemedyClosureToRiverV1({
      history: history(),
      effect: effect(),
      seal: seal(),
      supersession: exceptionSupersession(),
      sink,
    });

    expect(result.state).toBe("PUBLISHED_WITH_REGISTRY_CANDIDATE");
    expect(result.receipt.state).toBe("PUBLISHED");
    expect(result.receipt.signatureState).toBe("UNSIGNED_SYNTHETIC");
    expect(result.receipt.eventRefs).toHaveLength(5);
    expect(result.receipt.evidenceObjectRefs).toHaveLength(5);
    expect(sink.eventCount()).toBe(5);
    expect(sink.evidenceObjectCount()).toBe(5);

    const events = sink.publishedEvents();
    expect(events.map((value) => value.event_type)).toEqual([
      "WARDEN_EXCEPTION_RECORDED",
      "WARDEN_COMPOSITE_EFFECT_ASSESSED",
      "WARDEN_REMEDY_EFFECT_VERIFIED",
      "WARDEN_REMEDY_CAUSAL_SEALED",
      "WARDEN_EXCEPTION_SUPERSEDED",
    ]);
    expect(events[0]?.predecessor_event_id).toBeUndefined();
    expect(events[0]?.source_event_id).toBeUndefined();
    expect(events[1]?.predecessor_event_id).toBe(events[0]?.event_id);
    expect(events[1]?.source_event_id).toBe(events[0]?.event_id);
    expect(events[4]?.predecessor_event_id).toBe(events[3]?.event_id);
    expect(events.every((value) => value.schema_version === "pef-event.v1")).toBe(true);
    expect(events.every((value) => value.assurance === "A0")).toBe(true);
  });

  it("never converts unsigned synthetic River publication into Registry write authority", async () => {
    const result = await publishRemedyClosureToRiverV1({
      history: history(),
      effect: effect(),
      seal: seal(),
      supersession: exceptionSupersession(),
      sink: new InMemoryRiverCausalPublicationSinkV1(),
    });

    expect(result.registryCandidate).toMatchObject({
      version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001",
      originalExceptionRef: EXCEPTION_REF,
      riverRemedySealRef: SEAL_REF,
      riverPublicationRef: result.receipt.publicationRef,
      requiresSignedEvidence: true,
      registryWriteAuthorized: false,
      state: "CANDIDATE_BLOCKED_UNSIGNED_EVIDENCE",
      synthetic: true,
    });
  });

  it("is replay-stable and does not duplicate River facts", async () => {
    const sink = new InMemoryRiverCausalPublicationSinkV1();
    const first = await publishRemedyClosureToRiverV1({
      history: history(), effect: effect(), seal: seal(), supersession: exceptionSupersession(), sink,
    });
    const second = await publishRemedyClosureToRiverV1({
      history: history(), effect: effect(), seal: seal(), supersession: exceptionSupersession(), sink,
    });

    expect(second.receipt.publicationRef).toBe(first.receipt.publicationRef);
    expect(second.receipt.traceDigest).toBe(first.receipt.traceDigest);
    expect(second.receipt.eventRefs).toEqual(first.receipt.eventRefs);
    expect(sink.eventCount()).toBe(5);
    expect(sink.evidenceObjectCount()).toBe(5);
  });

  it("fails closed when the assessment used for remedy closure has already been superseded", async () => {
    const stale: CausalRecordSupersessionV1 = {
      version: "CAUSAL-RECORD-SUPERSESSION-001",
      supersessionRef: "CAUSAL-SUPERSESSION:ASSESSMENT:001",
      recordKind: "COMPOSITE_ASSESSMENT",
      recordRef: ASSESSMENT_REF,
      supersededByRef: "PARTIAL-EFFECT-ASSESSMENT:CORRECTED:001",
      reasonCode: "evidence_correction",
      sourceEvidenceRefs: ["EVIDENCE:CORRECTION:001"],
      supersededAt: "2026-08-23T04:00:02.500Z",
      state: "SUPERSEDED_APPEND_ONLY",
      synthetic: true,
    };

    await expect(publishRemedyClosureToRiverV1({
      history: history([stale]),
      effect: effect(),
      seal: seal(),
      supersession: exceptionSupersession(),
      sink: new InMemoryRiverCausalPublicationSinkV1(),
    })).rejects.toThrow("river_causal_publication_stale_causal_record");
  });

  it("does not emit a Registry candidate when River event persistence returns the wrong receipt identity", async () => {
    const delegate = new InMemoryRiverCausalPublicationSinkV1();
    const sink: RiverCausalPublicationSinkV1 = {
      putEvidenceObject: (object) => delegate.putEvidenceObject(object),
      publishEvent: async (event) => ({
        ...(await delegate.publishEvent(event)),
        eventId: "RIVER-EVENT:OTHER",
      }),
    };

    await expect(publishRemedyClosureToRiverV1({
      history: history(),
      effect: effect(),
      seal: seal(),
      supersession: exceptionSupersession(),
      sink,
    })).rejects.toThrow("river_causal_publication_event_receipt_mismatch");
  });

  it("rejects a remedy effect that drifts from the persisted original Warden decision", async () => {
    await expect(publishRemedyClosureToRiverV1({
      history: history(),
      effect: { ...effect(), originalWardenDecisionRef: "WARDEN-DECISION:OTHER" },
      seal: seal(),
      supersession: exceptionSupersession(),
      sink: new InMemoryRiverCausalPublicationSinkV1(),
    })).rejects.toThrow("river_causal_publication_effect_lineage_mismatch");
  });
});
