import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";

export interface SynnergyzeEvidenceReservationInputV1 {
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  reservedAt: string;
  service: SyntheticRiverReservationServiceV1;
}

export interface SynnergyzeEvidenceReservationResultV1 {
  action: ActionEnvelopeV1;
  reservation: EvidenceReservationV1;
}

/**
 * Converts an already-authorized Synnergyze/Warden request into River's
 * existing canonical action envelope and evidence reservation. This function
 * deliberately does not accept an execution adapter and cannot execute an
 * external effect: ALLOW != RESERVATION != EXECUTION.
 */
export function reserveSynnergyzeEvidenceV1(
  input: SynnergyzeEvidenceReservationInputV1,
): SynnergyzeEvidenceReservationResultV1 {
  const action = buildAuthorizedActionEnvelopeV1(input.request, input.decision);
  const reservation = input.service.reserve({
    request: input.request,
    decision: input.decision,
    action,
    reservedAt: input.reservedAt,
  });

  return { action, reservation };
}
