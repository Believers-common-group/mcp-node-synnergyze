import { createHash } from "node:crypto";

import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type { EffectVerificationSuccessV1 } from "../synnergyze/effect-verification.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  SilkCapabilityTypeV1,
  SilkResourceReservationV1,
  SilkResourceTypeV1,
} from "./confluence-reference.ts";
import { ModernJourneyEventLogV1, type ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import {
  projectModernJourneyTransactionV1,
  type ModernJourneyTransactionProjectionV1,
} from "./modern-journey-projection.ts";

export type ModernCapabilityLegStateV1 =
  | "OPEN"
  | "RECOVERY_REQUIRED"
  | "BLOCKED"
  | "EXECUTED_UNVERIFIED"
  | "EFFECT_VERIFIED"
  | "CLOSED";

export interface ModernCapabilityConsumptionV1 {
  consumptionRef: string;
  legRef: string;
  journeyRef: string;
  silkAccountRef: string;
  capabilityType: Exclude<SilkCapabilityTypeV1, "PAYMENT" | "WORKSPACE">;
  providerRef: string;
  capabilityRef: string;
  resourceRef: string;
  resourceType: Extract<SilkResourceTypeV1, "NETWORK" | "COMPUTE">;
  resourceOwnerRef: string;
  economicOwnerRef: string;
  quantity: number;
  unit: string;
  monetaryValue?: number;
  currency?: string;
  occurredAt: string;
}

export interface ModernCapabilityLegAttemptV1 {
  attemptRef: string;
  providerRef: string;
  capabilityRef: string;
  status: "FAILED" | "EXECUTED_UNVERIFIED";
  recoverable?: boolean;
  failureClass?: string;
  executionReceiptRef?: string;
}

export interface ModernCapabilityLegV1 {
  legRef: string;
  journeyRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  capabilityType: Exclude<SilkCapabilityTypeV1, "PAYMENT" | "WORKSPACE">;
  resourceType: Extract<SilkResourceTypeV1, "NETWORK" | "COMPUTE">;
  quantity: number;
  unit: string;
  state: ModernCapabilityLegStateV1;
  attempts: readonly ModernCapabilityLegAttemptV1[];
  consumption?: ModernCapabilityConsumptionV1;
  successfulExecutionReceiptRef?: string;
  verifiedEffectRef?: string;
}

export interface ModernCapabilityLegSnapshotV1 {
  leg: ModernCapabilityLegV1;
  projection: ModernJourneyTransactionProjectionV1;
  events: readonly ModernJourneyEventRecordV1[];
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function assertFinitePositive(value: number, code: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
}

function cloneLeg(leg: ModernCapabilityLegV1): ModernCapabilityLegV1 {
  return {
    ...leg,
    attempts: leg.attempts.map((attempt) => ({ ...attempt })),
    consumption: leg.consumption ? { ...leg.consumption } : undefined,
  };
}

export class SyntheticModernCapabilityLegRuntimeV1 {
  private readonly legs = new Map<string, ModernCapabilityLegV1>();
  private readonly eventLog = new ModernJourneyEventLogV1();

  open(input: {
    legRef: string;
    journeyRef: string;
    silkAccountRef: string;
    economicOwnerRef: string;
    capabilityType: Exclude<SilkCapabilityTypeV1, "PAYMENT" | "WORKSPACE">;
    resourceType: Extract<SilkResourceTypeV1, "NETWORK" | "COMPUTE">;
    quantity: number;
    unit: string;
    actorRef: string;
    openedAt: string;
  }): ModernCapabilityLegSnapshotV1 {
    if (this.legs.has(input.legRef)) throw new Error("modern_capability_leg_exists");
    assertFinitePositive(input.quantity, "modern_capability_leg_quantity_positive_required");
    parseInstant(input.openedAt, "modern_capability_leg_invalid_open_time");
    if (!input.legRef.trim()) throw new Error("modern_capability_leg_ref_required");
    if (!input.journeyRef.trim()) throw new Error("modern_capability_leg_journey_ref_required");
    if (!input.silkAccountRef.trim()) throw new Error("modern_capability_leg_account_ref_required");
    if (!input.economicOwnerRef.trim()) throw new Error("modern_capability_leg_owner_ref_required");
    if (!input.actorRef.trim()) throw new Error("modern_capability_leg_actor_ref_required");
    if (!input.unit.trim()) throw new Error("modern_capability_leg_unit_required");
    if (
      (input.capabilityType === "CONNECTIVITY" && input.resourceType !== "NETWORK") ||
      (input.capabilityType === "COMPUTE" && input.resourceType !== "COMPUTE")
    ) {
      throw new Error("modern_capability_leg_resource_type_mismatch");
    }

    const leg: ModernCapabilityLegV1 = {
      legRef: input.legRef,
      journeyRef: input.journeyRef,
      silkAccountRef: input.silkAccountRef,
      economicOwnerRef: input.economicOwnerRef,
      capabilityType: input.capabilityType,
      resourceType: input.resourceType,
      quantity: input.quantity,
      unit: input.unit,
      state: "OPEN",
      attempts: [],
    };
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:OPEN`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "TRANSACTION_OPENED",
      occurredAt: input.openedAt,
      payload: {
        kind: "CAPABILITY_LEG",
        capabilityType: leg.capabilityType,
        resourceType: leg.resourceType,
        silkAccountRef: leg.silkAccountRef,
        economicOwnerRef: leg.economicOwnerRef,
        quantity: leg.quantity,
        unit: leg.unit,
      },
    });
    this.legs.set(leg.legRef, leg);
    return this.snapshot(leg.legRef);
  }

  recordReservation(input: {
    legRef: string;
    reservation: SilkResourceReservationV1;
    actorRef: string;
    occurredAt: string;
    fallback: boolean;
  }): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(input.legRef);
    if (input.reservation.state !== "RESERVED") {
      throw new Error("modern_capability_leg_reserved_resource_required");
    }
    this.assertReservationLineage(leg, input.reservation);
    if (!input.fallback && leg.state !== "OPEN") {
      throw new Error("modern_capability_leg_primary_reservation_state_conflict");
    }
    if (input.fallback) {
      if (leg.state !== "RECOVERY_REQUIRED") {
        throw new Error("modern_capability_leg_fallback_reservation_state_conflict");
      }
      const authorization = this.latestFallbackAuthorization(leg.legRef);
      if (!authorization) throw new Error("modern_capability_leg_fallback_authorization_required");
      if (authorization.decisionRef !== input.reservation.wardenDecisionRef) {
        throw new Error("modern_capability_leg_fallback_reservation_decision_mismatch");
      }
      if (
        parseInstant(
          input.reservation.reservedAt,
          "modern_capability_leg_invalid_reservation_time",
        ) < authorization.authorizedAt
      ) {
        throw new Error("modern_capability_leg_fallback_reservation_before_authorization");
      }
    }
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.reservation.reservationRef}:RESERVED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: input.fallback ? "FALLBACK_RESOURCE_RESERVED" : "RESOURCE_RESERVED",
      occurredAt: input.occurredAt,
      payload: {
        reservationRef: input.reservation.reservationRef,
        resourceRef: input.reservation.resourceRef,
        resourceOwnerRef: input.reservation.resourceOwnerRef,
        resourceType: input.reservation.resourceType,
        quantity: input.reservation.quantity,
        unit: input.reservation.unit,
        wardenDecisionRef: input.reservation.wardenDecisionRef,
      },
    });
    return this.snapshot(leg.legRef);
  }

  recordFailure(input: {
    legRef: string;
    attemptRef: string;
    providerRef: string;
    capabilityRef: string;
    failureClass: string;
    recoverable: boolean;
    actorRef: string;
    occurredAt: string;
  }): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(input.legRef);
    if (leg.state !== "OPEN" && leg.state !== "RECOVERY_REQUIRED") {
      throw new Error("modern_capability_leg_failure_state_conflict");
    }
    if (leg.attempts.some((attempt) => attempt.attemptRef === input.attemptRef)) {
      throw new Error("modern_capability_leg_attempt_ref_conflict");
    }
    const updated: ModernCapabilityLegV1 = {
      ...cloneLeg(leg),
      state: input.recoverable ? "RECOVERY_REQUIRED" : "BLOCKED",
      attempts: [
        ...leg.attempts.map((attempt) => ({ ...attempt })),
        {
          attemptRef: input.attemptRef,
          providerRef: input.providerRef,
          capabilityRef: input.capabilityRef,
          status: "FAILED",
          failureClass: input.failureClass,
          recoverable: input.recoverable,
        },
      ],
    };
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.attemptRef}:FAILED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "PROVIDER_EXECUTION_FAILED",
      occurredAt: input.occurredAt,
      payload: {
        attemptRef: input.attemptRef,
        providerRef: input.providerRef,
        capabilityRef: input.capabilityRef,
        failureClass: input.failureClass,
        recoverable: input.recoverable,
      },
    });
    this.legs.set(leg.legRef, updated);
    return this.snapshot(leg.legRef);
  }

  recordRelease(input: {
    legRef: string;
    reservation: SilkResourceReservationV1;
    actorRef: string;
    occurredAt: string;
  }): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(input.legRef);
    if (leg.state !== "RECOVERY_REQUIRED" && leg.state !== "BLOCKED") {
      throw new Error("modern_capability_leg_release_state_conflict");
    }
    if (input.reservation.state !== "RELEASED") {
      throw new Error("modern_capability_leg_released_resource_required");
    }
    this.assertReservationLineage(leg, input.reservation);
    const projection = this.snapshot(leg.legRef).projection;
    if (!projection.activeResourceRefs.includes(input.reservation.resourceRef)) {
      throw new Error("modern_capability_leg_release_resource_not_active");
    }
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.reservation.reservationRef}:RELEASED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "RESOURCE_RELEASED",
      occurredAt: input.occurredAt,
      payload: {
        reservationRef: input.reservation.reservationRef,
        resourceRef: input.reservation.resourceRef,
        resourceOwnerRef: input.reservation.resourceOwnerRef,
      },
    });
    return this.snapshot(leg.legRef);
  }

  authorizeFallback(input: {
    legRef: string;
    decision: WardenDecisionV1;
    providerRef: string;
    capabilityRef: string;
    actorRef: string;
    authorizedAt: string;
  }): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(input.legRef);
    if (leg.state !== "RECOVERY_REQUIRED") {
      throw new Error("modern_capability_leg_fallback_state_conflict");
    }
    const projection = this.snapshot(leg.legRef).projection;
    if (projection.activeResourceRefs.length > 0) {
      throw new Error("modern_capability_leg_fallback_requires_release");
    }
    if (input.decision.decision !== "ALLOW") {
      throw new Error("modern_capability_leg_fallback_allow_required");
    }
    if (input.decision.action !== input.capabilityRef) {
      throw new Error("modern_capability_leg_fallback_capability_mismatch");
    }
    if (!input.decision.validUntil) {
      throw new Error("modern_capability_leg_fallback_validity_required");
    }
    const decided = parseInstant(
      input.decision.decidedAt,
      "modern_capability_leg_invalid_decision_time",
    );
    const validUntil = parseInstant(
      input.decision.validUntil,
      "modern_capability_leg_invalid_decision_validity",
    );
    const authorized = parseInstant(
      input.authorizedAt,
      "modern_capability_leg_invalid_authorization_time",
    );
    if (validUntil < decided) throw new Error("modern_capability_leg_invalid_decision_window");
    if (authorized < decided) throw new Error("modern_capability_leg_authorized_before_decision");
    if (authorized > validUntil) throw new Error("modern_capability_leg_decision_expired");

    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.decision.decisionRef}:FALLBACK_AUTHORIZED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "FALLBACK_AUTHORIZED",
      occurredAt: input.authorizedAt,
      payload: {
        wardenDecisionRef: input.decision.decisionRef,
        providerRef: input.providerRef,
        capabilityRef: input.capabilityRef,
        decisionValidUntil: input.decision.validUntil,
      },
    });
    return this.snapshot(leg.legRef);
  }

  recordExecution(input: {
    legRef: string;
    attemptRef: string;
    providerRef: string;
    receipt: SynnergyzeExecutionReceiptV1;
    consumedReservation: SilkResourceReservationV1;
    actorRef: string;
    occurredAt: string;
    monetaryValue?: number;
    currency?: string;
  }): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(input.legRef);
    if (leg.state !== "OPEN" && leg.state !== "RECOVERY_REQUIRED") {
      throw new Error("modern_capability_leg_execution_state_conflict");
    }
    if (input.consumedReservation.state !== "CONSUMED") {
      throw new Error("modern_capability_leg_consumed_resource_required");
    }
    this.assertReservationLineage(leg, input.consumedReservation);
    if (input.consumedReservation.wardenDecisionRef !== input.receipt.wardenDecisionRef) {
      throw new Error("modern_capability_leg_consumed_decision_mismatch");
    }
    if (input.receipt.programRef !== leg.journeyRef) {
      throw new Error("modern_capability_leg_execution_journey_mismatch");
    }
    if (leg.attempts.some((attempt) => attempt.attemptRef === input.attemptRef)) {
      throw new Error("modern_capability_leg_attempt_ref_conflict");
    }
    if (leg.state === "RECOVERY_REQUIRED") {
      const authorization = this.latestFallbackAuthorization(leg.legRef);
      if (!authorization) throw new Error("modern_capability_leg_fallback_authorization_required");
      if (authorization.decisionRef !== input.receipt.wardenDecisionRef) {
        throw new Error("modern_capability_leg_fallback_execution_decision_mismatch");
      }
      if (
        parseInstant(input.receipt.executedAt, "modern_capability_leg_invalid_execution_time") <
        authorization.authorizedAt
      ) {
        throw new Error("modern_capability_leg_execution_before_authorization");
      }
    }
    const projection = this.snapshot(leg.legRef).projection;
    if (!projection.activeResourceRefs.includes(input.consumedReservation.resourceRef)) {
      throw new Error("modern_capability_leg_consumed_resource_not_reserved");
    }
    if (input.monetaryValue !== undefined) {
      if (!Number.isFinite(input.monetaryValue) || input.monetaryValue < 0) {
        throw new Error("modern_capability_leg_invalid_monetary_value");
      }
      if (!input.currency?.trim()) throw new Error("modern_capability_leg_currency_required");
    } else if (input.currency !== undefined) {
      throw new Error("modern_capability_leg_monetary_value_required");
    }

    const consumptionRef = `SILK-CAPABILITY-CONSUMPTION:${digest(
      [
        leg.legRef,
        input.attemptRef,
        input.consumedReservation.reservationRef,
        input.receipt.receiptRef,
      ].join("|"),
    ).slice(0, 24)}`;
    const consumption: ModernCapabilityConsumptionV1 = {
      consumptionRef,
      legRef: leg.legRef,
      journeyRef: leg.journeyRef,
      silkAccountRef: leg.silkAccountRef,
      capabilityType: leg.capabilityType,
      providerRef: input.providerRef,
      capabilityRef: input.receipt.capabilityRef,
      resourceRef: input.consumedReservation.resourceRef,
      resourceType: leg.resourceType,
      resourceOwnerRef: input.consumedReservation.resourceOwnerRef,
      economicOwnerRef: leg.economicOwnerRef,
      quantity: leg.quantity,
      unit: leg.unit,
      monetaryValue: input.monetaryValue,
      currency: input.currency,
      occurredAt: input.occurredAt,
    };
    const updated: ModernCapabilityLegV1 = {
      ...cloneLeg(leg),
      state: "EXECUTED_UNVERIFIED",
      attempts: [
        ...leg.attempts.map((attempt) => ({ ...attempt })),
        {
          attemptRef: input.attemptRef,
          providerRef: input.providerRef,
          capabilityRef: input.receipt.capabilityRef,
          status: "EXECUTED_UNVERIFIED",
          executionReceiptRef: input.receipt.receiptRef,
        },
      ],
      successfulExecutionReceiptRef: input.receipt.receiptRef,
      consumption,
    };
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.attemptRef}:EXECUTED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "PROVIDER_EXECUTED_UNVERIFIED",
      occurredAt: input.occurredAt,
      payload: {
        attemptRef: input.attemptRef,
        providerRef: input.providerRef,
        capabilityRef: input.receipt.capabilityRef,
        executionReceiptRef: input.receipt.receiptRef,
        wardenDecisionRef: input.receipt.wardenDecisionRef,
      },
    });
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.consumedReservation.reservationRef}:CONSUMED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "RESOURCE_CONSUMED",
      occurredAt: input.occurredAt,
      payload: {
        consumptionRef,
        reservationRef: input.consumedReservation.reservationRef,
        resourceRef: input.consumedReservation.resourceRef,
        resourceOwnerRef: input.consumedReservation.resourceOwnerRef,
        economicOwnerRef: leg.economicOwnerRef,
        quantity: leg.quantity,
        unit: leg.unit,
        monetaryValue: input.monetaryValue ?? null,
        currency: input.currency ?? null,
      },
    });
    this.legs.set(leg.legRef, updated);
    return this.snapshot(leg.legRef);
  }

  verifyAndClose(input: {
    legRef: string;
    verification: EffectVerificationSuccessV1;
    actorRef: string;
    verifiedAt: string;
    closedAt: string;
  }): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(input.legRef);
    if (leg.state !== "EXECUTED_UNVERIFIED") {
      throw new Error("modern_capability_leg_effect_state_conflict");
    }
    if (!leg.successfulExecutionReceiptRef) {
      throw new Error("modern_capability_leg_success_receipt_required");
    }
    if (input.verification.effect.executionReceiptRef !== leg.successfulExecutionReceiptRef) {
      throw new Error("modern_capability_leg_effect_execution_mismatch");
    }
    if (input.verification.effect.programRef !== leg.journeyRef) {
      throw new Error("modern_capability_leg_effect_journey_mismatch");
    }
    const projection = this.snapshot(leg.legRef).projection;
    if (projection.activeResourceRefs.length > 0) {
      throw new Error("modern_capability_leg_close_with_active_resource");
    }

    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:${input.verification.effect.effectRef}:VERIFIED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "EFFECT_VERIFIED",
      occurredAt: input.verifiedAt,
      payload: {
        effectRef: input.verification.effect.effectRef,
        executionReceiptRef: input.verification.effect.executionReceiptRef,
        observedStateRef: input.verification.effect.observedStateRef,
      },
    });
    this.eventLog.append({
      idempotencyKey: `${leg.legRef}:CLOSED`,
      transactionRef: leg.legRef,
      journeyRef: leg.journeyRef,
      actorRef: input.actorRef,
      eventType: "TRANSACTION_CLOSED",
      occurredAt: input.closedAt,
      payload: { kind: "CAPABILITY_LEG", state: "CLOSED" },
    });
    const closed: ModernCapabilityLegV1 = {
      ...cloneLeg(leg),
      state: "CLOSED",
      verifiedEffectRef: input.verification.effect.effectRef,
    };
    this.legs.set(leg.legRef, closed);
    return this.snapshot(leg.legRef);
  }

  snapshot(legRef: string): ModernCapabilityLegSnapshotV1 {
    const leg = this.requireLeg(legRef);
    const events = this.eventLog.stream(legRef);
    return {
      leg: cloneLeg(leg),
      projection: projectModernJourneyTransactionV1(events),
      events,
    };
  }

  private requireLeg(legRef: string): ModernCapabilityLegV1 {
    const leg = this.legs.get(legRef);
    if (!leg) throw new Error("modern_capability_leg_not_found");
    return leg;
  }

  private latestFallbackAuthorization(
    legRef: string,
  ): { decisionRef: string; authorizedAt: number } | undefined {
    const event = [...this.eventLog.stream(legRef)]
      .reverse()
      .find((candidate) => candidate.eventType === "FALLBACK_AUTHORIZED");
    const decisionRef = event?.payload.wardenDecisionRef;
    if (!event || typeof decisionRef !== "string" || !decisionRef.trim()) return undefined;
    return {
      decisionRef,
      authorizedAt: parseInstant(
        event.occurredAt,
        "modern_capability_leg_invalid_fallback_authorization_time",
      ),
    };
  }

  private assertReservationLineage(
    leg: ModernCapabilityLegV1,
    reservation: SilkResourceReservationV1,
  ): void {
    if (reservation.journeyRef !== leg.journeyRef) {
      throw new Error("modern_capability_leg_reservation_journey_mismatch");
    }
    if (reservation.silkAccountRef !== leg.silkAccountRef) {
      throw new Error("modern_capability_leg_reservation_account_mismatch");
    }
    if (reservation.resourceType !== leg.resourceType) {
      throw new Error("modern_capability_leg_reservation_resource_type_mismatch");
    }
    if (reservation.quantity !== leg.quantity || reservation.unit !== leg.unit) {
      throw new Error("modern_capability_leg_reservation_value_mismatch");
    }
  }
}