import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";

export interface AmazonLiveAuthorityBundleV1 {
  action: ActionEnvelopeV1;
  decision: WardenAllowDecisionV1;
  reservation: EvidenceReservationV1;
  checkpoint: WardenExecutionCheckpointV1;
}

export interface AmazonLiveProofPrerequisitesV1 {
  activationAck: string | undefined;
  authority: AmazonLiveAuthorityBundleV1;
  includedData: readonly string[];
}

const RESTRICTED_DATA = new Set(["BUYER", "RECIPIENT", "TAX", "PAYMENT"]);
const SYNTHETIC_REF = /(?:^|[:._-])(TEST|SYNTHETIC|CONFORMANCE)(?:[:._-]|$)/i;

function authorityRefs(bundle: AmazonLiveAuthorityBundleV1): readonly string[] {
  return [
    bundle.action.actionRef,
    bundle.action.requestRef,
    bundle.action.actorRef,
    bundle.action.representedPrincipalRef,
    bundle.action.actingCapacityRef,
    bundle.action.contextRef,
    bundle.action.programRef,
    bundle.action.eventRef,
    bundle.action.targetRef,
    bundle.action.wardenDecisionRef,
    bundle.decision.decisionRef,
    bundle.decision.wardenRef,
    bundle.reservation.reservationRef,
    bundle.checkpoint.checkpointRef,
  ];
}

function requireConstraint(decision: WardenAllowDecisionV1, constraint: string): void {
  if (!decision.constraints.includes(constraint)) {
    throw new Error(`amazon_live_required_constraint_missing:${constraint}`);
  }
}

export function assertAmazonLiveProofPrerequisitesV1(
  input: AmazonLiveProofPrerequisitesV1,
): void {
  if (input.activationAck !== "READ_ONLY_PROVIDER_EFFECT") {
    throw new Error("amazon_live_read_only_ack_required");
  }

  if (authorityRefs(input.authority).some((ref) => SYNTHETIC_REF.test(ref))) {
    throw new Error("amazon_live_synthetic_authority_forbidden");
  }

  if (input.includedData.some((value) => RESTRICTED_DATA.has(value.toUpperCase()))) {
    throw new Error("amazon_live_restricted_data_requires_separate_capability");
  }

  const { action, decision, reservation, checkpoint } = input.authority;
  if (decision.decision !== "ALLOW" || !decision.actionToken) {
    throw new Error("amazon_live_warden_allow_required");
  }
  if (action.action !== "amazon.orders.search" || action.capabilityRef !== "amazon.orders.search") {
    throw new Error("amazon_live_orders_search_capability_required");
  }
  if (
    action.wardenDecisionRef !== decision.decisionRef ||
    action.requestRef !== decision.requestRef ||
    action.actionToken !== decision.actionToken ||
    action.targetRef !== decision.targetRef ||
    action.correlationId !== decision.correlationId
  ) {
    throw new Error("amazon_live_warden_action_binding_invalid");
  }
  if (
    reservation.state !== "RESERVED" ||
    reservation.actionRef !== action.actionRef ||
    reservation.wardenDecisionRef !== decision.decisionRef ||
    reservation.correlationId !== action.correlationId
  ) {
    throw new Error("amazon_live_river_reservation_binding_invalid");
  }
  if (
    checkpoint.state !== "VALID" ||
    checkpoint.decisionRef !== decision.decisionRef ||
    checkpoint.wardenRef !== decision.wardenRef ||
    checkpoint.correlationId !== action.correlationId
  ) {
    throw new Error("amazon_live_warden_checkpoint_invalid");
  }

  requireConstraint(decision, "READ_ONLY_PROVIDER_EFFECT");
  requireConstraint(decision, "NO_RESTRICTED_DATA");
  requireConstraint(decision, "NO_SETTLEMENT_FINALITY");
}
