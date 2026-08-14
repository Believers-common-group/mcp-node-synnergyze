import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import type { SynnergyzeEventDraftV1, SynnergyzeProgramDraftV1 } from "./contracts.ts";

export interface ResolvedRepresentationContextV1 {
  resolutionRef: string;
  actorRef: string;
  representedPrincipalRef: string;
  actingCapacityRef: string;
  contextRef: string;
  authorityRefs: readonly string[];
  policyRefs: readonly string[];
  sourceRefs: readonly string[];
  resolvedAt: string;
}

export interface WardenRequestBridgeInputV1 {
  program: SynnergyzeProgramDraftV1;
  event: SynnergyzeEventDraftV1;
  representation: ResolvedRepresentationContextV1;
  requestedAt: string;
}

export type WardenRequestBridgeErrorCodeV1 =
  | "PROGRAM_NOT_READY"
  | "EVENT_NOT_IN_PROGRAM"
  | "EVENT_NOT_READY"
  | "PROGRAM_EVENT_MISMATCH"
  | "ACTOR_MISMATCH"
  | "CONTEXT_MISMATCH"
  | "CORRELATION_MISMATCH"
  | "REPRESENTATION_INCOMPLETE"
  | "REPRESENTATION_SOURCE_MISSING"
  | "CAPABILITY_REQUIRED"
  | "TARGET_REQUIRED";

export interface WardenRequestBridgeFailureV1 {
  ok: false;
  code: WardenRequestBridgeErrorCodeV1;
  reason: string;
  programRef: string;
  eventRef: string;
  correlationId: string;
}

export interface WardenRequestBridgeSuccessV1 {
  ok: true;
  request: WardenDecisionRequestV1;
}

export type WardenRequestBridgeResultV1 =
  | WardenRequestBridgeSuccessV1
  | WardenRequestBridgeFailureV1;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalRefs(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function fail(
  code: WardenRequestBridgeErrorCodeV1,
  reason: string,
  input: WardenRequestBridgeInputV1,
): WardenRequestBridgeFailureV1 {
  return {
    ok: false,
    code,
    reason,
    programRef: input.program.programRef,
    eventRef: input.event.eventRef,
    correlationId: input.event.correlationId,
  };
}

export function buildWardenDecisionRequestV1(
  input: WardenRequestBridgeInputV1,
): WardenRequestBridgeResultV1 {
  const { program, event, representation } = input;

  if (program.state !== "READY_FOR_AUTHORIZATION" || program.authorized !== false) {
    return fail("PROGRAM_NOT_READY", "program_not_ready_for_authorization_request", input);
  }

  if (!program.eventRefs.includes(event.eventRef)) {
    return fail("EVENT_NOT_IN_PROGRAM", "event_not_member_of_program", input);
  }

  if (event.state !== "DRAFT" || event.authorized !== false) {
    return fail("EVENT_NOT_READY", "event_must_remain_non_authoritative_draft", input);
  }

  if (event.programRef !== program.programRef) {
    return fail("PROGRAM_EVENT_MISMATCH", "event_program_ref_mismatch", input);
  }

  if (event.actorRef !== program.actorRef) {
    return fail("ACTOR_MISMATCH", "event_program_actor_mismatch", input);
  }

  if (event.contextRef !== program.contextRef) {
    return fail("CONTEXT_MISMATCH", "event_program_context_mismatch", input);
  }

  if (event.correlationId !== program.correlationId) {
    return fail("CORRELATION_MISMATCH", "event_program_correlation_mismatch", input);
  }

  if (!representation.actorRef || !representation.representedPrincipalRef || !representation.actingCapacityRef) {
    return fail("REPRESENTATION_INCOMPLETE", "representation_identity_incomplete", input);
  }

  if (!representation.contextRef || !representation.resolutionRef) {
    return fail("REPRESENTATION_INCOMPLETE", "representation_context_incomplete", input);
  }

  if (representation.actorRef !== event.actorRef) {
    return fail("ACTOR_MISMATCH", "representation_actor_mismatch", input);
  }

  if (representation.contextRef !== event.contextRef) {
    return fail("CONTEXT_MISMATCH", "representation_context_mismatch", input);
  }

  const representationSourceRefs = canonicalRefs([
    representation.resolutionRef,
    ...representation.sourceRefs,
  ]);
  if (representationSourceRefs.length === 0) {
    return fail("REPRESENTATION_SOURCE_MISSING", "representation_source_missing", input);
  }

  if (!event.capabilityRef) {
    return fail("CAPABILITY_REQUIRED", "exact_capability_required_before_warden_request", input);
  }

  if (!event.targetRef) {
    return fail("TARGET_REQUIRED", "exact_target_required_before_warden_request", input);
  }

  if (program.capabilityRef && program.capabilityRef !== event.capabilityRef) {
    return fail("PROGRAM_EVENT_MISMATCH", "event_program_capability_mismatch", input);
  }

  const authorityRefs = canonicalRefs(representation.authorityRefs);
  const policyRefs = canonicalRefs(representation.policyRefs);

  const canonicalRequestIdentity = JSON.stringify({
    actorRef: event.actorRef,
    representedPrincipalRef: representation.representedPrincipalRef,
    actingCapacityRef: representation.actingCapacityRef,
    contextRef: event.contextRef,
    programRef: program.programRef,
    eventRef: event.eventRef,
    action: event.action,
    capabilityRef: event.capabilityRef,
    targetRef: event.targetRef,
    requestedEffect: event.requestedEffect ?? program.requestedEffect ?? null,
    authorityRefs,
    policyRefs,
    representationSourceRefs,
    correlationId: event.correlationId,
  });

  const requestRef = `WARDEN-REQUEST:${digest(canonicalRequestIdentity).slice(0, 20)}`;

  const request: WardenDecisionRequestV1 = {
    requestRef,
    actorRef: event.actorRef,
    representedPrincipalRef: representation.representedPrincipalRef,
    actingCapacityRef: representation.actingCapacityRef,
    contextRef: event.contextRef,
    programRef: program.programRef,
    eventRef: event.eventRef,
    action: event.action,
    capabilityRef: event.capabilityRef,
    targetRef: event.targetRef,
    requestedEffect: event.requestedEffect ?? program.requestedEffect,
    authorityRefs,
    policyRefs,
    representationSourceRefs,
    requestedAt: input.requestedAt,
    correlationId: event.correlationId,
  };

  return { ok: true, request };
}
