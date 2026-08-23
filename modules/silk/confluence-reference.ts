import { createHash } from "node:crypto";

import type {
  SyntheticCapabilityAdapterInputV1,
  SyntheticCapabilityAdapterResultV1,
  SyntheticCapabilityAdapterV1,
} from "../synnergyze/execution-gate.ts";

export type SilkAccountClassV1 =
  | "INDIVIDUAL_STUDENT"
  | "FAMILY"
  | "ENTERPRISE"
  | "INSTITUTIONAL";

export type SilkCapabilityTypeV1 = "PAYMENT" | "CONNECTIVITY" | "COMPUTE" | "WORKSPACE";
export type SilkCapabilityHealthV1 = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
export type SilkResourceTypeV1 = "MONEY" | "CREDIT" | "COMPUTE" | "NETWORK";
export type SilkReservationStateV1 = "RESERVED" | "CONSUMED" | "RELEASED";

export interface SilkProviderCapabilityV1 {
  providerCapabilityRef: string;
  providerRef: string;
  capabilityRef: string;
  capabilityType: SilkCapabilityTypeV1;
  silkAccountRef: string;
  priority: number;
  fallback: boolean;
  health: SilkCapabilityHealthV1;
}

export interface SilkCapabilityResolutionRequestV1 {
  silkAccountRef: string;
  capabilityType: SilkCapabilityTypeV1;
}

export interface SilkCapabilityResolutionV1 {
  silkAccountRef: string;
  capabilityType: SilkCapabilityTypeV1;
  eligible: readonly SilkProviderCapabilityV1[];
  preferred?: SilkProviderCapabilityV1;
  fallbacks: readonly SilkProviderCapabilityV1[];
}

export interface SilkResourceCapacityV1 {
  resourceRef: string;
  resourceType: SilkResourceTypeV1;
  capacity: number;
  unit: string;
}

export interface SilkResourceReservationRequestV1 {
  journeyRef: string;
  silkAccountRef: string;
  resourceRef: string;
  resourceType: SilkResourceTypeV1;
  quantity: number;
  unit: string;
  wardenDecisionRef: string;
  correlationId: string;
  reservedAt: string;
}

export interface SilkResourceReservationV1 extends SilkResourceReservationRequestV1 {
  reservationRef: string;
  capacity: number;
  state: SilkReservationStateV1;
  idempotentReplay: boolean;
}

export interface SilkEconomicEventV1 {
  economicEventRef: string;
  journeyRef: string;
  transactionRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  actualPayerRef: string;
  amount: number;
  currency: string;
  instrumentRef: string;
  providerRef: string;
  occurredAt: string;
}

export interface SilkReimbursementObligationV1 {
  obligationRef: string;
  sourceEconomicEventRef: string;
  journeyRef: string;
  obligorRef: string;
  beneficiaryRef: string;
  amount: number;
  currency: string;
  type: "REIMBURSEMENT";
  state: "OPEN";
}

export interface NormalizedConfluenceProviderFailureV1 {
  failureClass: string;
  recoverable: boolean;
  providerError: string;
}

interface StoredReservationV1 {
  fingerprint: string;
  reservation: SilkResourceReservationV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cloneCapability(capability: SilkProviderCapabilityV1): SilkProviderCapabilityV1 {
  return { ...capability };
}

function reservationIdentity(input: SilkResourceReservationRequestV1, capacity: number): string {
  return JSON.stringify({
    journeyRef: input.journeyRef,
    silkAccountRef: input.silkAccountRef,
    resourceRef: input.resourceRef,
    resourceType: input.resourceType,
    quantity: input.quantity,
    unit: input.unit,
    capacity,
    wardenDecisionRef: input.wardenDecisionRef,
    correlationId: input.correlationId,
    reservedAt: input.reservedAt,
  });
}

function assertFinitePositive(value: number, code: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(code);
}

export class SyntheticSilkCapabilityRegistryV1 {
  private readonly capabilities: readonly SilkProviderCapabilityV1[];

  constructor(capabilities: readonly SilkProviderCapabilityV1[]) {
    const refs = new Set<string>();
    for (const capability of capabilities) {
      if (refs.has(capability.providerCapabilityRef)) {
        throw new Error("silk_duplicate_provider_capability_ref");
      }
      if (!Number.isInteger(capability.priority) || capability.priority < 0) {
        throw new Error("silk_invalid_capability_priority");
      }
      refs.add(capability.providerCapabilityRef);
    }
    this.capabilities = capabilities.map(cloneCapability);
  }

  resolve(input: SilkCapabilityResolutionRequestV1): SilkCapabilityResolutionV1 {
    const eligible = this.capabilities
      .filter(
        (capability) =>
          capability.silkAccountRef === input.silkAccountRef &&
          capability.capabilityType === input.capabilityType &&
          capability.health !== "UNAVAILABLE",
      )
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        return left.providerCapabilityRef.localeCompare(right.providerCapabilityRef);
      })
      .map(cloneCapability);

    const preferred = eligible.find((capability) => !capability.fallback) ?? eligible[0];
    const fallbacks = eligible
      .filter((capability) => capability.providerCapabilityRef !== preferred?.providerCapabilityRef)
      .map(cloneCapability);

    return {
      silkAccountRef: input.silkAccountRef,
      capabilityType: input.capabilityType,
      eligible,
      preferred: preferred ? cloneCapability(preferred) : undefined,
      fallbacks,
    };
  }
}

export class SyntheticSilkResourceReservationServiceV1 {
  private readonly capacities = new Map<string, SilkResourceCapacityV1>();
  private readonly byCorrelation = new Map<string, StoredReservationV1>();
  private readonly committedByResource = new Map<string, number>();

  constructor(capacities: readonly SilkResourceCapacityV1[]) {
    for (const capacity of capacities) {
      if (this.capacities.has(capacity.resourceRef)) {
        throw new Error("silk_duplicate_resource_capacity_ref");
      }
      assertFinitePositive(capacity.capacity, "silk_resource_capacity_positive_required");
      this.capacities.set(capacity.resourceRef, { ...capacity });
    }
  }

  reserve(input: SilkResourceReservationRequestV1): SilkResourceReservationV1 {
    assertFinitePositive(input.quantity, "silk_reservation_quantity_positive_required");
    if (!Number.isFinite(Date.parse(input.reservedAt))) {
      throw new Error("silk_reservation_invalid_time");
    }

    const authoritative = this.capacities.get(input.resourceRef);
    if (!authoritative) throw new Error("silk_resource_capacity_not_registered");
    if (authoritative.resourceType !== input.resourceType) {
      throw new Error("silk_resource_type_mismatch");
    }
    if (authoritative.unit !== input.unit) throw new Error("silk_resource_unit_mismatch");
    if (input.quantity > authoritative.capacity) throw new Error("silk_reservation_exceeds_capacity");

    const fingerprint = digest(reservationIdentity(input, authoritative.capacity));
    const existing = this.byCorrelation.get(input.correlationId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("silk_reservation_idempotency_conflict");
      }
      return { ...existing.reservation, idempotentReplay: true };
    }

    const committed = this.committedByResource.get(input.resourceRef) ?? 0;
    if (committed + input.quantity > authoritative.capacity) {
      throw new Error("silk_reservation_capacity_conflict");
    }

    const reservationRef = `SILK-RESERVATION:${digest(fingerprint).slice(0, 24)}`;
    const reservation: SilkResourceReservationV1 = {
      ...input,
      reservationRef,
      capacity: authoritative.capacity,
      state: "RESERVED",
      idempotentReplay: false,
    };

    this.byCorrelation.set(input.correlationId, { fingerprint, reservation });
    this.committedByResource.set(input.resourceRef, committed + input.quantity);
    return { ...reservation };
  }

  transition(
    reservationRef: string,
    nextState: Extract<SilkReservationStateV1, "CONSUMED" | "RELEASED">,
  ): SilkResourceReservationV1 {
    const stored = [...this.byCorrelation.values()].find(
      ({ reservation }) => reservation.reservationRef === reservationRef,
    );
    if (!stored) throw new Error("silk_reservation_not_found");
    if (stored.reservation.state !== "RESERVED") {
      if (stored.reservation.state === nextState) {
        return { ...stored.reservation, idempotentReplay: true };
      }
      throw new Error("silk_reservation_terminal_state_conflict");
    }

    stored.reservation = { ...stored.reservation, state: nextState, idempotentReplay: false };
    if (nextState === "RELEASED") {
      const committed = this.committedByResource.get(stored.reservation.resourceRef) ?? 0;
      this.committedByResource.set(
        stored.reservation.resourceRef,
        Math.max(0, committed - stored.reservation.quantity),
      );
    }
    return { ...stored.reservation };
  }

  reservedQuantity(resourceRef: string): number {
    return this.committedByResource.get(resourceRef) ?? 0;
  }
}

export class SyntheticConfluenceCapabilityAdapterV1 implements SyntheticCapabilityAdapterV1 {
  private invocations = 0;

  constructor(
    readonly adapterRef: string,
    readonly capabilityRef: string,
    private readonly failureCode?: string,
  ) {}

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("synthetic_confluence_adapter_capability_mismatch");
    }
    this.invocations += 1;
    if (this.failureCode) {
      throw new Error(`provider_execution_failed:${this.failureCode}`);
    }
    const identity = digest(
      [
        input.action.actionRef,
        input.reservation.reservationRef,
        input.action.targetRef,
        input.action.correlationId,
        this.adapterRef,
      ].join("|"),
    ).slice(0, 24);
    return { adapterResultRef: `SYNTHETIC-CONFLUENCE:${identity}` };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export function normalizeConfluenceProviderFailureV1(
  error: unknown,
): NormalizedConfluenceProviderFailureV1 {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = "provider_execution_failed:";
  if (!message.startsWith(prefix)) {
    return { failureClass: "UNKNOWN_PROVIDER_FAILURE", recoverable: false, providerError: message };
  }
  const failureClass = message.slice(prefix.length) || "UNKNOWN_PROVIDER_FAILURE";
  return {
    failureClass,
    recoverable: failureClass === "ISSUER_DECLINE" || failureClass === "PROVIDER_UNAVAILABLE",
    providerError: message,
  };
}

export function deriveReimbursementObligationV1(
  event: SilkEconomicEventV1,
): SilkReimbursementObligationV1 | undefined {
  assertFinitePositive(event.amount, "silk_economic_event_amount_positive_required");
  if (event.actualPayerRef === event.economicOwnerRef) return undefined;

  const identity = digest(
    [
      event.economicEventRef,
      event.journeyRef,
      event.economicOwnerRef,
      event.actualPayerRef,
      event.amount.toString(),
      event.currency,
    ].join("|"),
  ).slice(0, 24);

  return {
    obligationRef: `SILK-OBLIGATION:${identity}`,
    sourceEconomicEventRef: event.economicEventRef,
    journeyRef: event.journeyRef,
    obligorRef: event.economicOwnerRef,
    beneficiaryRef: event.actualPayerRef,
    amount: event.amount,
    currency: event.currency,
    type: "REIMBURSEMENT",
    state: "OPEN",
  };
}
