import {
  stableDigest,
  type CapacityReservationV1,
  type OrchestrationAttemptV1,
  type PlacementPlanV1,
  type PlacementReasonCode,
  type SubstrateCapacitySnapshotV1,
  type SubstrateWardenBindingV1,
  type WorkloadRequirementV1,
} from "./contracts.ts";
import {
  SubstrateEvidenceJournalV1,
  type SubstrateEvidenceEnvelopeV1,
} from "./evidence-journal.ts";
import {
  compilePlacementV1,
  type CompilePlacementInputV1,
} from "./placement-compiler.ts";
import { CapacityReservationServiceV1 } from "./reservation-service.ts";

const KNOWN_DENIAL_REASONS = new Set<PlacementReasonCode>([
  "reservation_expired",
  "warden_decision_denied",
  "warden_reservation_mismatch",
  "warden_substrate_mismatch",
  "warden_identity_mismatch",
  "warden_decision_expired",
  "evidence_requirement_missing",
]);

function attemptRef(input: {
  correlationId: string;
  workloadRef: string;
  placementRef: string;
  reservationRef?: string;
  wardenDecisionRef?: string;
  riverEvidenceRef: string;
  status: OrchestrationAttemptV1["status"];
  reason?: PlacementReasonCode;
}): string {
  return `GENESIS-ORCHESTRATION-ATTEMPT:${stableDigest(input).slice(0, 24)}`;
}

function buildAttempt(input: {
  correlationId: string;
  workloadRef: string;
  placementRef: string;
  reservationRef?: string;
  wardenDecisionRef?: string;
  evidence: SubstrateEvidenceEnvelopeV1;
  status: OrchestrationAttemptV1["status"];
  reason?: PlacementReasonCode;
}): OrchestrationAttemptV1 {
  const base = {
    correlationId: input.correlationId,
    workloadRef: input.workloadRef,
    placementRef: input.placementRef,
    reservationRef: input.reservationRef,
    wardenDecisionRef: input.wardenDecisionRef,
    riverEvidenceRef: input.evidence.evidenceRef,
    status: input.status,
    reason: input.reason,
  };

  return {
    attemptRef: attemptRef(base),
    ...base,
    realWorldEffectOccurred: false,
  };
}

function denialReason(error: unknown): PlacementReasonCode | undefined {
  if (!(error instanceof Error)) return undefined;
  return KNOWN_DENIAL_REASONS.has(error.message as PlacementReasonCode)
    ? (error.message as PlacementReasonCode)
    : undefined;
}

export class SubstrateOrchestrationCoordinatorV1 {
  constructor(
    private readonly reservations: CapacityReservationServiceV1,
    private readonly evidence: SubstrateEvidenceJournalV1,
  ) {}

  plan(input: CompilePlacementInputV1): {
    placement: PlacementPlanV1;
    attempt: OrchestrationAttemptV1;
  } {
    const placement = compilePlacementV1(input);
    const blocked = !placement.primarySubstrateInstanceRef;
    const evidence = this.evidence.append({
      correlationId: input.workload.correlationId,
      workloadRef: input.workload.workloadRef,
      placementRef: placement.placementRef,
      substrateInstanceRef: placement.primarySubstrateInstanceRef,
      stage: blocked ? "PLACEMENT_BLOCKED" : "PLACEMENT_COMPUTED",
      reason: blocked ? "no_eligible_substrate" : undefined,
      recordedAt: input.computedAt,
    });

    return {
      placement,
      attempt: buildAttempt({
        correlationId: input.workload.correlationId,
        workloadRef: input.workload.workloadRef,
        placementRef: placement.placementRef,
        evidence,
        status: blocked
          ? "BLOCKED_NO_ELIGIBLE_SUBSTRATE"
          : "BLOCKED_RESERVATION_REQUIRED",
        reason: blocked ? "no_eligible_substrate" : undefined,
      }),
    };
  }

  requestReservation(input: {
    workload: WorkloadRequirementV1;
    placement: PlacementPlanV1;
    snapshot: SubstrateCapacitySnapshotV1;
    requestedAt: string;
    expiresAt: string;
  }): {
    reservation: CapacityReservationV1;
    attempt: OrchestrationAttemptV1;
  } {
    const evidence = this.evidence.append({
      correlationId: input.workload.correlationId,
      workloadRef: input.workload.workloadRef,
      placementRef: input.placement.placementRef,
      substrateInstanceRef: input.snapshot.substrateInstanceRef,
      stage: "RESERVATION_REQUESTED",
      recordedAt: input.requestedAt,
    });

    const reservation = this.reservations.request({
      workload: input.workload,
      placement: input.placement,
      snapshot: input.snapshot,
      requestedAt: input.requestedAt,
      expiresAt: input.expiresAt,
      riverEvidenceRef: evidence.evidenceRef,
    });

    return {
      reservation,
      attempt: buildAttempt({
        correlationId: input.workload.correlationId,
        workloadRef: input.workload.workloadRef,
        placementRef: input.placement.placementRef,
        reservationRef: reservation.reservationRef,
        evidence,
        status: "BLOCKED_WARDEN_REQUIRED",
        reason: "warden_decision_missing",
      }),
    };
  }

  authorizeReservation(input: {
    workload: WorkloadRequirementV1;
    placement: PlacementPlanV1;
    reservation: CapacityReservationV1;
    binding?: SubstrateWardenBindingV1;
    authorizedAt: string;
  }): {
    reservation?: CapacityReservationV1;
    attempt: OrchestrationAttemptV1;
  } {
    if (!input.binding) {
      const evidence = this.evidence.append({
        correlationId: input.workload.correlationId,
        workloadRef: input.workload.workloadRef,
        placementRef: input.placement.placementRef,
        substrateInstanceRef: input.reservation.substrateInstanceRef,
        reservationRef: input.reservation.reservationRef,
        stage: "RESERVATION_DENIED",
        reason: "warden_decision_missing",
        recordedAt: input.authorizedAt,
      });

      return {
        attempt: buildAttempt({
          correlationId: input.workload.correlationId,
          workloadRef: input.workload.workloadRef,
          placementRef: input.placement.placementRef,
          reservationRef: input.reservation.reservationRef,
          evidence,
          status: "BLOCKED_WARDEN_REQUIRED",
          reason: "warden_decision_missing",
        }),
      };
    }

    try {
      const reservation = this.reservations.authorize({
        reservation: input.reservation,
        workload: input.workload,
        binding: input.binding,
        authorizedAt: input.authorizedAt,
      });
      const evidence = this.evidence.append({
        correlationId: input.workload.correlationId,
        workloadRef: input.workload.workloadRef,
        placementRef: input.placement.placementRef,
        substrateInstanceRef: reservation.substrateInstanceRef,
        reservationRef: reservation.reservationRef,
        wardenDecisionRef: input.binding.decisionRef,
        stage: "RESERVATION_AUTHORIZED",
        recordedAt: input.authorizedAt,
      });

      return {
        reservation,
        attempt: buildAttempt({
          correlationId: input.workload.correlationId,
          workloadRef: input.workload.workloadRef,
          placementRef: input.placement.placementRef,
          reservationRef: reservation.reservationRef,
          wardenDecisionRef: input.binding.decisionRef,
          evidence,
          status: "PLACEMENT_READY",
        }),
      };
    } catch (error) {
      const reason = denialReason(error);
      if (!reason) throw error;

      const evidence = this.evidence.append({
        correlationId: input.workload.correlationId,
        workloadRef: input.workload.workloadRef,
        placementRef: input.placement.placementRef,
        substrateInstanceRef: input.reservation.substrateInstanceRef,
        reservationRef: input.reservation.reservationRef,
        wardenDecisionRef: input.binding.decisionRef,
        stage: "RESERVATION_DENIED",
        reason,
        recordedAt: input.authorizedAt,
      });

      return {
        attempt: buildAttempt({
          correlationId: input.workload.correlationId,
          workloadRef: input.workload.workloadRef,
          placementRef: input.placement.placementRef,
          reservationRef: input.reservation.reservationRef,
          wardenDecisionRef: input.binding.decisionRef,
          evidence,
          status: "DENIED",
          reason,
        }),
      };
    }
  }
}
