import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type { ActionEnvelopeV1, EvidenceReservationV1 } from "./contracts.ts";

export interface RiverReservationRequestV1 {
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  action: ActionEnvelopeV1;
  reservedAt: string;
}

interface StoredReservation {
  fingerprint: string;
  reservation: EvidenceReservationV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(errorCode);
  }
  return parsed;
}

function actionAuthorizationDigest(actionToken: string): string {
  return `sha256:${digest(actionToken)}`;
}

function canonicalActionPayload(request: WardenDecisionRequestV1, decision: WardenDecisionV1) {
  if (decision.decision !== "ALLOW") {
    throw new Error("river_warden_allow_required");
  }
  if (!decision.actionToken) {
    throw new Error("river_warden_action_token_required");
  }
  if (decision.requestRef !== request.requestRef) {
    throw new Error("river_warden_request_mismatch");
  }
  if (decision.action !== request.action) {
    throw new Error("river_warden_action_mismatch");
  }
  if (decision.targetRef !== request.targetRef) {
    throw new Error("river_warden_target_mismatch");
  }
  if (decision.correlationId !== request.correlationId) {
    throw new Error("river_warden_correlation_mismatch");
  }

  return {
    requestRef: request.requestRef,
    actorRef: request.actorRef,
    representedPrincipalRef: request.representedPrincipalRef,
    actingCapacityRef: request.actingCapacityRef,
    contextRef: request.contextRef,
    programRef: request.programRef,
    eventRef: request.eventRef,
    action: request.action,
    capabilityRef: request.capabilityRef,
    targetRef: request.targetRef,
    wardenDecisionRef: decision.decisionRef,
    actionToken: decision.actionToken,
    requestedAt: request.requestedAt,
    correlationId: request.correlationId,
  } as const;
}

export function buildAuthorizedActionEnvelopeV1(
  request: WardenDecisionRequestV1,
  decision: WardenDecisionV1,
): ActionEnvelopeV1 {
  const payload = canonicalActionPayload(request, decision);
  const identity = JSON.stringify({
    ...payload,
    actionToken: actionAuthorizationDigest(payload.actionToken),
  });

  return {
    actionRef: `ACTION:${digest(identity).slice(0, 24)}`,
    ...payload,
  };
}

function actionFingerprint(action: ActionEnvelopeV1): string {
  return digest(
    JSON.stringify({
      ...action,
      actionToken: actionAuthorizationDigest(action.actionToken),
    }),
  );
}

function assertExactAction(expected: ActionEnvelopeV1, actual: ActionEnvelopeV1): void {
  const fields: Array<keyof ActionEnvelopeV1> = [
    "actionRef",
    "requestRef",
    "actorRef",
    "representedPrincipalRef",
    "actingCapacityRef",
    "contextRef",
    "programRef",
    "eventRef",
    "action",
    "capabilityRef",
    "targetRef",
    "wardenDecisionRef",
    "actionToken",
    "requestedAt",
    "correlationId",
  ];

  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      throw new Error(`river_action_envelope_mismatch:${field}`);
    }
  }
}

function assertDecisionWindow(decision: WardenDecisionV1, reservedAt: string): void {
  if (decision.decision !== "ALLOW") {
    throw new Error("river_warden_allow_required");
  }
  if (!decision.validUntil) {
    throw new Error("river_warden_validity_required");
  }

  const decided = parseInstant(decision.decidedAt, "river_invalid_decision_time");
  const expires = parseInstant(decision.validUntil, "river_invalid_decision_validity");
  const reserved = parseInstant(reservedAt, "river_invalid_reservation_time");

  if (expires < decided) {
    throw new Error("river_invalid_decision_validity_window");
  }
  if (reserved < decided) {
    throw new Error("river_reservation_before_decision");
  }
  if (reserved > expires) {
    throw new Error("river_warden_decision_expired");
  }
}

export class SyntheticRiverReservationServiceV1 {
  private readonly byActionRef = new Map<string, StoredReservation>();
  private readonly actionRefByCorrelation = new Map<string, string>();

  reserve(input: RiverReservationRequestV1): EvidenceReservationV1 {
    const expected = buildAuthorizedActionEnvelopeV1(input.request, input.decision);
    assertExactAction(expected, input.action);
    assertDecisionWindow(input.decision, input.reservedAt);

    const fingerprint = actionFingerprint(input.action);
    const existing = this.byActionRef.get(input.action.actionRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("river_reservation_idempotency_conflict");
      }
      return { ...existing.reservation };
    }

    const correlatedAction = this.actionRefByCorrelation.get(input.action.correlationId);
    if (correlatedAction && correlatedAction !== input.action.actionRef) {
      throw new Error("river_reservation_correlation_conflict");
    }

    const authorizationDigest = actionAuthorizationDigest(input.action.actionToken);
    const reservationIdentity = JSON.stringify({
      actionRef: input.action.actionRef,
      wardenDecisionRef: input.action.wardenDecisionRef,
      correlationId: input.action.correlationId,
      authorizationDigest,
    });
    const reservation: EvidenceReservationV1 = {
      reservationRef: `RIVER-RESERVATION:${digest(reservationIdentity).slice(0, 24)}`,
      actionRef: input.action.actionRef,
      wardenDecisionRef: input.action.wardenDecisionRef,
      correlationId: input.action.correlationId,
      authorizationDigest,
      state: "RESERVED",
      reservedAt: input.reservedAt,
    };

    this.byActionRef.set(input.action.actionRef, { fingerprint, reservation });
    this.actionRefByCorrelation.set(input.action.correlationId, input.action.actionRef);
    return { ...reservation };
  }

  reservationCount(): number {
    return this.byActionRef.size;
  }

  reservations(): readonly EvidenceReservationV1[] {
    return [...this.byActionRef.values()].map(({ reservation }) => ({ ...reservation }));
  }
}
