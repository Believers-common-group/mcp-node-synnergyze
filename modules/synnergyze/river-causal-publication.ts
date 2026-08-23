import { createHash } from "node:crypto";

import {
  compositeAssessmentSourceDigestV1,
  type CausalRecordSupersessionV1,
  type ExceptionCausalHistoryV1,
} from "./causal-record-store.ts";
import type { CompositeEffectAssessmentV1 } from "./composite-effect-reconciliation.ts";
import type { ReconciliationDeterminationV1 } from "./reconciliation-fabric.ts";
import type { VerifiedScopedRemedyEffectV1 } from "./remedy-effect-verification.ts";
import type {
  ExceptionSupersessionRecordV1,
  RemedyCausalSealV1,
} from "./remedy-lineage-closure.ts";

export type RiverAssertionTypeV1 =
  | "effect"
  | "exception"
  | "reconciliation";

/**
 * Structurally compatible with the PEF event grammar introduced in the
 * dedicated River persistence slice. The bridge stays local to 0.5.1 so it
 * does not copy the River store implementation or assert that the other PR is merged.
 */
export interface RiverCausalEventV1 {
  schema_version: "pef-event.v1";
  event_id: string;
  event_type: string;
  assertion_type: RiverAssertionTypeV1;
  assurance: "A0";
  occurred_at: string;
  recorded_at: string;
  producer: {
    producer_id: "SYNNERGYZE-WARDEN-0.5.1";
    producer_type: "service";
  };
  payload: {
    source_ref: string;
    evidence_object_ref: string;
    content_digest: string;
    causal_role: string;
    original_exception_ref: string;
    river_remedy_seal_ref: string;
  };
  payload_hash: string;
  source_event_id?: string;
  predecessor_event_id?: string;
}

export interface RiverEvidenceObjectV1 {
  version: "RIVER-EVIDENCE-OBJECT-001";
  objectRef: string;
  objectType: string;
  subjectRef: string;
  contentDigest: string;
  sourceEvidenceRefs: readonly string[];
  payload: unknown;
  occurredAt: string;
  recordedAt: string;
  signatureState: "UNSIGNED_SYNTHETIC";
  state: "CONTENT_ADDRESSED";
  synthetic: true;
}

export interface RiverEvidenceObjectReceiptV1 {
  objectRef: string;
  contentDigest: string;
  storedAt: string;
  state: "STORED";
  idempotentReplay: boolean;
}

export interface RiverEventPublicationReceiptV1 {
  eventId: string;
  eventReceiptRef: string;
  payloadHash: string;
  acceptedAt: string;
  state: "PERSISTED";
  idempotentReplay: boolean;
}

export interface RiverCausalPublicationSinkV1 {
  putEvidenceObject(object: RiverEvidenceObjectV1): Promise<RiverEvidenceObjectReceiptV1>;
  publishEvent(event: RiverCausalEventV1): Promise<RiverEventPublicationReceiptV1>;
}

export interface RiverCausalPublicationReceiptV1 {
  version: "RIVER-CAUSAL-PUBLICATION-001";
  publicationRef: string;
  originalExceptionRef: string;
  assessmentRef: string;
  remedyEffectRef: string;
  riverRemedySealRef: string;
  exceptionSupersessionRef: string;
  eventRefs: readonly string[];
  eventReceiptRefs: readonly string[];
  evidenceObjectRefs: readonly string[];
  traceDigest: string;
  recordedAt: string;
  signatureState: "UNSIGNED_SYNTHETIC";
  state: "PUBLISHED";
  synthetic: true;
}

export interface RegistryExceptionResolutionProjectionCandidateV1 {
  version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001";
  projectionRef: string;
  registryObjectRef: string;
  registryRevisionRef: string;
  originalExceptionRef: string;
  assessmentRef: string;
  disposition: ExceptionSupersessionRecordV1["disposition"];
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverRemedySealRef: string;
  riverPublicationRef: string;
  riverTraceDigest: string;
  riverEventRefs: readonly string[];
  riverEvidenceObjectRefs: readonly string[];
  sourceEvidenceRefs: readonly string[];
  generatedAt: string;
  requiresSignedEvidence: true;
  registryWriteAuthorized: false;
  state: "CANDIDATE_BLOCKED_UNSIGNED_EVIDENCE";
  synthetic: true;
}

export type RiverCausalPublicationResultV1 = {
  state: "PUBLISHED_WITH_REGISTRY_CANDIDATE";
  receipt: RiverCausalPublicationReceiptV1;
  registryCandidate: RegistryExceptionResolutionProjectionCandidateV1;
};

interface CausalSourceV1 {
  sourceRef: string;
  objectType: string;
  assertionType: RiverAssertionTypeV1;
  eventType: string;
  causalRole: string;
  occurredAt: string;
  sourceEvidenceRefs: readonly string[];
  sourceDigest: string;
  payload: unknown;
  sortRank: number;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentDigest(value: unknown): string {
  return `sha256:${digest(stableJson(value))}`;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function scalarSource(record: ReconciliationDeterminationV1): CausalSourceV1 {
  return {
    sourceRef: record.reconciliationRef,
    objectType: record.version,
    assertionType: "reconciliation",
    eventType: "WARDEN_RECONCILIATION_DETERMINED",
    causalRole: "SCALAR_RECONCILIATION",
    occurredAt: record.reconciledAt,
    sourceEvidenceRefs: record.sourceEvidenceRefs,
    sourceDigest: record.sourceDigest,
    payload: record,
    sortRank: 20,
  };
}

function compositeSource(record: CompositeEffectAssessmentV1): CausalSourceV1 {
  return {
    sourceRef: record.assessmentRef,
    objectType: record.version,
    assertionType: "reconciliation",
    eventType: "WARDEN_COMPOSITE_EFFECT_ASSESSED",
    causalRole: "COMPOSITE_ASSESSMENT",
    occurredAt: record.assessedAt,
    sourceEvidenceRefs: record.sourceEvidenceRefs,
    sourceDigest: compositeAssessmentSourceDigestV1(record),
    payload: record,
    sortRank: 30,
  };
}

function causalSupersessionSource(record: CausalRecordSupersessionV1): CausalSourceV1 {
  return {
    sourceRef: record.supersessionRef,
    objectType: record.version,
    assertionType: "reconciliation",
    eventType: "WARDEN_CAUSAL_RECORD_SUPERSEDED",
    causalRole: "CAUSAL_RECORD_SUPERSESSION",
    occurredAt: record.supersededAt,
    sourceEvidenceRefs: record.sourceEvidenceRefs,
    sourceDigest: contentDigest(record),
    payload: record,
    sortRank: 40,
  };
}

function assertExactClosure(input: {
  history: ExceptionCausalHistoryV1;
  effect: VerifiedScopedRemedyEffectV1;
  seal: RemedyCausalSealV1;
  supersession: ExceptionSupersessionRecordV1;
}): CompositeEffectAssessmentV1 {
  const { history, effect, seal, supersession } = input;
  const exception = history.exception;
  if (exception.synthetic !== true || effect.synthetic !== true || seal.synthetic !== true || supersession.synthetic !== true) {
    throw new Error("river_causal_publication_non_synthetic_input");
  }
  if (seal.state !== "SEALED" || supersession.state !== "RESOLVED_APPEND_ONLY" || effect.state !== "VERIFIED_REMEDY_EFFECT") {
    throw new Error("river_causal_publication_terminal_state_required");
  }
  if (
    exception.exceptionRef !== seal.originalExceptionRef ||
    supersession.exceptionRef !== exception.exceptionRef ||
    supersession.riverSealRef !== seal.sealRef
  ) {
    throw new Error("river_causal_publication_exception_seal_mismatch");
  }
  const assessment = history.compositeAssessments.find(
    (candidate) => candidate.assessmentRef === seal.assessmentRef,
  );
  if (!assessment) throw new Error("river_causal_publication_assessment_missing");

  if (
    effect.assessmentRef !== assessment.assessmentRef ||
    effect.effectSetRef !== assessment.effectSetRef ||
    effect.originalExecutionReceiptRef !== exception.executionReceiptRef ||
    effect.originalReservationRef !== exception.reservationRef ||
    effect.originalWardenDecisionRef !== exception.originalWardenDecisionRef ||
    effect.parentCorrelationId !== exception.correlationId ||
    seal.remedyEffectRef !== effect.effectRef ||
    seal.remedyVerificationRef !== effect.verificationRef ||
    seal.remedyExecutionReceiptRef !== effect.remedyExecutionReceiptRef ||
    supersession.remedyEffectRef !== effect.effectRef ||
    supersession.remedyVerificationRef !== effect.verificationRef
  ) {
    throw new Error("river_causal_publication_effect_lineage_mismatch");
  }

  const stale = history.supersessions.some(
    (record) =>
      (record.recordKind === "EXCEPTION" && record.recordRef === exception.exceptionRef) ||
      (record.recordKind === "COMPOSITE_ASSESSMENT" && record.recordRef === assessment.assessmentRef),
  );
  if (stale) throw new Error("river_causal_publication_stale_causal_record");

  const verifiedAt = parseInstant(effect.verifiedAt, "river_causal_publication_invalid_verification_time");
  const sealedAt = parseInstant(seal.sealedAt, "river_causal_publication_invalid_seal_time");
  if (sealedAt < verifiedAt) throw new Error("river_causal_publication_seal_before_verification");
  if (seal.sealedAt !== supersession.supersededAt) {
    throw new Error("river_causal_publication_supersession_time_mismatch");
  }

  return assessment;
}

function sourcesFor(input: {
  history: ExceptionCausalHistoryV1;
  effect: VerifiedScopedRemedyEffectV1;
  seal: RemedyCausalSealV1;
  supersession: ExceptionSupersessionRecordV1;
}): readonly CausalSourceV1[] {
  const { history, effect, seal, supersession } = input;
  const exception = history.exception;
  const sources: CausalSourceV1[] = [
    {
      sourceRef: exception.exceptionRef,
      objectType: exception.version,
      assertionType: "exception",
      eventType: "WARDEN_EXCEPTION_RECORDED",
      causalRole: "ORIGINAL_EXCEPTION",
      occurredAt: exception.detectedAt,
      sourceEvidenceRefs: exception.sourceEvidenceRefs,
      sourceDigest: exception.sourceDigest,
      payload: exception,
      sortRank: 10,
    },
    ...history.scalarReconciliations.map(scalarSource),
    ...history.compositeAssessments.map(compositeSource),
    ...history.supersessions.map(causalSupersessionSource),
    {
      sourceRef: effect.effectRef,
      objectType: effect.version,
      assertionType: "effect",
      eventType: "WARDEN_REMEDY_EFFECT_VERIFIED",
      causalRole: "VERIFIED_REMEDY_EFFECT",
      occurredAt: effect.verifiedAt,
      sourceEvidenceRefs: effect.sourceEvidenceRefs,
      sourceDigest: contentDigest(effect),
      payload: effect,
      sortRank: 50,
    },
    {
      sourceRef: seal.sealRef,
      objectType: seal.version,
      assertionType: "effect",
      eventType: "WARDEN_REMEDY_CAUSAL_SEALED",
      causalRole: "REMEDY_CAUSAL_SEAL",
      occurredAt: seal.sealedAt,
      sourceEvidenceRefs: seal.sourceEvidenceRefs,
      sourceDigest: seal.traceDigest,
      payload: seal,
      sortRank: 60,
    },
    {
      sourceRef: supersession.supersessionRef,
      objectType: supersession.version,
      assertionType: "reconciliation",
      eventType: "WARDEN_EXCEPTION_SUPERSEDED",
      causalRole: "VERIFIED_EXCEPTION_RESOLUTION",
      occurredAt: supersession.supersededAt,
      sourceEvidenceRefs: supersession.sourceEvidenceRefs,
      sourceDigest: contentDigest(supersession),
      payload: supersession,
      sortRank: 70,
    },
  ];

  return sources.sort((left, right) => {
    const time = parseInstant(left.occurredAt, "river_causal_publication_invalid_source_time") -
      parseInstant(right.occurredAt, "river_causal_publication_invalid_source_time");
    if (time !== 0) return time;
    if (left.sortRank !== right.sortRank) return left.sortRank - right.sortRank;
    return left.sourceRef.localeCompare(right.sourceRef);
  });
}

function makeEvidenceObject(
  source: CausalSourceV1,
  recordedAt: string,
): RiverEvidenceObjectV1 {
  const calculated = contentDigest(source.payload);
  if (source.sourceDigest.startsWith("sha256:") && source.sourceDigest !== calculated) {
    // Exception/reconciliation digests bind a canonical subset rather than the complete JSON.
    // Preserve both: object digest proves stored bytes; source digest remains inside the payload.
  }
  const objectRef = `RIVER-EVIDENCE-OBJECT:${digest(
    `${source.objectType}|${source.sourceRef}|${calculated}`,
  ).slice(0, 24)}`;
  return {
    version: "RIVER-EVIDENCE-OBJECT-001",
    objectRef,
    objectType: source.objectType,
    subjectRef: source.sourceRef,
    contentDigest: calculated,
    sourceEvidenceRefs: stableUnique(source.sourceEvidenceRefs),
    payload: structuredClone(source.payload),
    occurredAt: source.occurredAt,
    recordedAt,
    signatureState: "UNSIGNED_SYNTHETIC",
    state: "CONTENT_ADDRESSED",
    synthetic: true,
  };
}

function makeEvent(input: {
  source: CausalSourceV1;
  object: RiverEvidenceObjectV1;
  originalExceptionRef: string;
  riverRemedySealRef: string;
  recordedAt: string;
  rootEventId?: string;
  predecessorEventId?: string;
}): RiverCausalEventV1 {
  const payload = {
    source_ref: input.source.sourceRef,
    evidence_object_ref: input.object.objectRef,
    content_digest: input.object.contentDigest,
    causal_role: input.source.causalRole,
    original_exception_ref: input.originalExceptionRef,
    river_remedy_seal_ref: input.riverRemedySealRef,
  };
  const payloadHash = `sha256:${digest(stableJson(payload))}`;
  const eventId = `RIVER-EVENT:${digest(
    `${input.source.eventType}|${input.source.sourceRef}|${input.object.objectRef}|${payloadHash}`,
  ).slice(0, 24)}`;
  return {
    schema_version: "pef-event.v1",
    event_id: eventId,
    event_type: input.source.eventType,
    assertion_type: input.source.assertionType,
    assurance: "A0",
    occurred_at: input.source.occurredAt,
    recorded_at: input.recordedAt,
    producer: {
      producer_id: "SYNNERGYZE-WARDEN-0.5.1",
      producer_type: "service",
    },
    payload,
    payload_hash: payloadHash,
    source_event_id: input.rootEventId,
    predecessor_event_id: input.predecessorEventId,
  };
}

export async function publishRemedyClosureToRiverV1(input: {
  history: ExceptionCausalHistoryV1;
  effect: VerifiedScopedRemedyEffectV1;
  seal: RemedyCausalSealV1;
  supersession: ExceptionSupersessionRecordV1;
  sink: RiverCausalPublicationSinkV1;
}): Promise<RiverCausalPublicationResultV1> {
  const assessment = assertExactClosure(input);
  const recordedAt = input.seal.sealedAt;
  const sources = sourcesFor(input);

  const evidenceObjects: RiverEvidenceObjectV1[] = [];
  const objectReceipts: RiverEvidenceObjectReceiptV1[] = [];
  for (const source of sources) {
    const object = makeEvidenceObject(source, recordedAt);
    const receipt = await input.sink.putEvidenceObject(object);
    if (
      receipt.state !== "STORED" ||
      receipt.objectRef !== object.objectRef ||
      receipt.contentDigest !== object.contentDigest
    ) {
      throw new Error("river_causal_publication_evidence_receipt_mismatch");
    }
    evidenceObjects.push(object);
    objectReceipts.push(receipt);
  }

  const events: RiverCausalEventV1[] = [];
  const eventReceipts: RiverEventPublicationReceiptV1[] = [];
  let predecessorEventId: string | undefined;
  let rootEventId: string | undefined;
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const object = evidenceObjects[index];
    if (!source || !object) throw new Error("river_causal_publication_compilation_invariant");
    const event = makeEvent({
      source,
      object,
      originalExceptionRef: input.history.exception.exceptionRef,
      riverRemedySealRef: input.seal.sealRef,
      recordedAt,
      rootEventId,
      predecessorEventId,
    });
    if (!rootEventId) rootEventId = event.event_id;
    const receipt = await input.sink.publishEvent(event);
    if (
      receipt.state !== "PERSISTED" ||
      receipt.eventId !== event.event_id ||
      receipt.payloadHash !== event.payload_hash
    ) {
      throw new Error("river_causal_publication_event_receipt_mismatch");
    }
    events.push(event);
    eventReceipts.push(receipt);
    predecessorEventId = event.event_id;
  }

  const eventRefs = events.map((event) => event.event_id);
  const eventReceiptRefs = eventReceipts.map((receipt) => receipt.eventReceiptRef);
  const evidenceObjectRefs = objectReceipts.map((receipt) => receipt.objectRef);
  const traceDigest = `sha256:${digest(stableJson({
    originalExceptionRef: input.history.exception.exceptionRef,
    assessmentRef: assessment.assessmentRef,
    remedyEffectRef: input.effect.effectRef,
    riverRemedySealRef: input.seal.sealRef,
    exceptionSupersessionRef: input.supersession.supersessionRef,
    eventRefs,
    eventReceiptRefs,
    evidenceObjectRefs,
  }))}`;
  const publicationRef = `RIVER-CAUSAL-PUBLICATION:${digest(
    `${input.seal.sealRef}|${traceDigest}`,
  ).slice(0, 24)}`;
  const receipt: RiverCausalPublicationReceiptV1 = {
    version: "RIVER-CAUSAL-PUBLICATION-001",
    publicationRef,
    originalExceptionRef: input.history.exception.exceptionRef,
    assessmentRef: assessment.assessmentRef,
    remedyEffectRef: input.effect.effectRef,
    riverRemedySealRef: input.seal.sealRef,
    exceptionSupersessionRef: input.supersession.supersessionRef,
    eventRefs,
    eventReceiptRefs,
    evidenceObjectRefs,
    traceDigest,
    recordedAt,
    signatureState: "UNSIGNED_SYNTHETIC",
    state: "PUBLISHED",
    synthetic: true,
  };

  const registryRevisionRef = `REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:${digest(
    `${input.history.exception.exceptionRef}|${publicationRef}|${input.seal.traceDigest}`,
  ).slice(0, 24)}`;
  const registryCandidate: RegistryExceptionResolutionProjectionCandidateV1 = {
    version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001",
    projectionRef: `REGISTRY-PROJECTION-CANDIDATE:${digest(
      `${registryRevisionRef}|${input.supersession.supersessionRef}`,
    ).slice(0, 24)}`,
    registryObjectRef: `WARDEN-EXCEPTION-RESOLUTION:${input.history.exception.exceptionRef}`,
    registryRevisionRef,
    originalExceptionRef: input.history.exception.exceptionRef,
    assessmentRef: assessment.assessmentRef,
    disposition: input.supersession.disposition,
    remedyEffectRef: input.effect.effectRef,
    remedyVerificationRef: input.effect.verificationRef,
    riverRemedySealRef: input.seal.sealRef,
    riverPublicationRef: publicationRef,
    riverTraceDigest: traceDigest,
    riverEventRefs: [...eventRefs],
    riverEvidenceObjectRefs: [...evidenceObjectRefs],
    sourceEvidenceRefs: stableUnique([
      ...input.history.exception.sourceEvidenceRefs,
      ...assessment.sourceEvidenceRefs,
      ...input.effect.sourceEvidenceRefs,
      ...input.seal.sourceEvidenceRefs,
    ]),
    generatedAt: recordedAt,
    requiresSignedEvidence: true,
    registryWriteAuthorized: false,
    state: "CANDIDATE_BLOCKED_UNSIGNED_EVIDENCE",
    synthetic: true,
  };

  return {
    state: "PUBLISHED_WITH_REGISTRY_CANDIDATE",
    receipt,
    registryCandidate,
  };
}

interface StoredEvidenceV1 {
  contentDigest: string;
  object: RiverEvidenceObjectV1;
}

interface StoredEventV1 {
  payloadHash: string;
  event: RiverCausalEventV1;
  receipt: RiverEventPublicationReceiptV1;
}

export class InMemoryRiverCausalPublicationSinkV1 implements RiverCausalPublicationSinkV1 {
  private readonly evidence = new Map<string, StoredEvidenceV1>();
  private readonly events = new Map<string, StoredEventV1>();

  async putEvidenceObject(object: RiverEvidenceObjectV1): Promise<RiverEvidenceObjectReceiptV1> {
    if (object.state !== "CONTENT_ADDRESSED" || object.signatureState !== "UNSIGNED_SYNTHETIC") {
      throw new Error("river_causal_sink_invalid_evidence_state");
    }
    const existing = this.evidence.get(object.objectRef);
    if (existing) {
      if (existing.contentDigest !== object.contentDigest || stableJson(existing.object) !== stableJson(object)) {
        throw new Error("river_causal_sink_evidence_idempotency_conflict");
      }
      return {
        objectRef: object.objectRef,
        contentDigest: object.contentDigest,
        storedAt: object.recordedAt,
        state: "STORED",
        idempotentReplay: true,
      };
    }
    this.evidence.set(object.objectRef, {
      contentDigest: object.contentDigest,
      object: structuredClone(object),
    });
    return {
      objectRef: object.objectRef,
      contentDigest: object.contentDigest,
      storedAt: object.recordedAt,
      state: "STORED",
      idempotentReplay: false,
    };
  }

  async publishEvent(event: RiverCausalEventV1): Promise<RiverEventPublicationReceiptV1> {
    if (event.schema_version !== "pef-event.v1" || event.assurance !== "A0") {
      throw new Error("river_causal_sink_pef_boundary_mismatch");
    }
    const existing = this.events.get(event.event_id);
    if (existing) {
      if (existing.payloadHash !== event.payload_hash || stableJson(existing.event) !== stableJson(event)) {
        throw new Error("river_causal_sink_event_idempotency_conflict");
      }
      return { ...existing.receipt, idempotentReplay: true };
    }
    const receipt: RiverEventPublicationReceiptV1 = {
      eventId: event.event_id,
      eventReceiptRef: `RIVER-EVENT-RECEIPT:${digest(
        `${event.event_id}|${event.payload_hash}`,
      ).slice(0, 24)}`,
      payloadHash: event.payload_hash,
      acceptedAt: event.recorded_at,
      state: "PERSISTED",
      idempotentReplay: false,
    };
    this.events.set(event.event_id, {
      payloadHash: event.payload_hash,
      event: structuredClone(event),
      receipt,
    });
    return { ...receipt };
  }

  eventCount(): number {
    return this.events.size;
  }

  evidenceObjectCount(): number {
    return this.evidence.size;
  }

  publishedEvents(): readonly RiverCausalEventV1[] {
    return [...this.events.values()].map(({ event }) => structuredClone(event));
  }
}
