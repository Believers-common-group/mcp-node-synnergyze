import { createHash } from "node:crypto";

import type { EvidenceReservationV1, EventReceiptV1 } from "../river/contracts.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type {
  WardenAllowDecisionV1,
  WardenDecisionRequestV1,
  WardenDecisionV1,
  WardenExecutionCheckpointV1,
  WardenNonAllowDecisionV1,
} from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import {
  ControlledExecutionGateV1,
  type SyntheticCapabilityAdapterInputV1,
  type SyntheticCapabilityAdapterResultV1,
  type SyntheticCapabilityAdapterV1,
} from "../synnergyze/execution-gate.ts";
import {
  EffectVerificationServiceV1,
  type PostExecutionObservationSourceV1,
  type PostExecutionObservationV1,
  type VerifiedEffectV1,
} from "../synnergyze/effect-verification.ts";

export interface FederatedWardenEvaluationR1 {
  request: WardenDecisionRequestV1;
  policy: SyntheticWardenDecisionPolicyV1;
  decidedAt: string;
}

export interface FederatedLicenceRecognitionR1 {
  recognitionRef: string;
  missionRef: string;
  federationObjectRef: string;
  productRef: string;
  domainRef: string;
  createdByWardenRef: string;
  sourceDecisionRef: string;
  destinationDecisionRef: string;
  effectRef: string;
  effectiveAt: string;
  synthetic: true;
}

export interface FederatedLicenceCompletedR1 {
  state: "COMPLETED";
  sourceDecision: WardenAllowDecisionV1;
  destinationDecision: WardenAllowDecisionV1;
  reservation: EvidenceReservationV1;
  executionReceipt: SynnergyzeExecutionReceiptV1;
  observation: PostExecutionObservationV1;
  localRecognition: FederatedLicenceRecognitionR1;
  riverEventReceipt: EventReceiptV1;
  effectReceipt: VerifiedEffectV1;
}

export interface FederatedLicenceBlockedDestinationR1 {
  state: "BLOCKED_DESTINATION";
  sourceDecision: WardenAllowDecisionV1;
  destinationDecision: WardenNonAllowDecisionV1;
}

export type FederatedLicenceResultR1 =
  | FederatedLicenceCompletedR1
  | FederatedLicenceBlockedDestinationR1;

export interface ExecuteSyntheticFederatedLicenceInputR1 {
  missionRef: string;
  federationObjectRef: string;
  productRef: string;
  source: FederatedWardenEvaluationR1;
  destination: FederatedWardenEvaluationR1;
  executedAt: string;
  observedAt: string;
  verifiedAt: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireSourceAllow(decision: WardenDecisionV1): WardenAllowDecisionV1 {
  if (decision.decision !== "ALLOW") {
    throw new Error("federation_source_warden_allow_required");
  }
  return decision;
}

class SyntheticFederatedLicenceRecognitionAdapterR1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-FEDERATED-LICENCE-ADAPTER-001";
  readonly capabilityRef = "federation.licence.recognise";

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("federation_adapter_capability_mismatch");
    }
    const identity = digest(
      [
        input.action.actionRef,
        input.reservation.reservationRef,
        input.action.targetRef,
        input.action.correlationId,
      ].join("|"),
    ).slice(0, 24);
    return { adapterResultRef: `SYNTHETIC-FEDERATED-LICENCE:${identity}` };
  }
}

class SyntheticFederatedLicenceObservationSourceR1
  implements PostExecutionObservationSourceV1
{
  readonly observerRef = "SYNTHETIC-FEDERATED-LICENCE-OBSERVER-001";

  observe(receipt: SynnergyzeExecutionReceiptV1, observedAt: string): PostExecutionObservationV1 {
    if (receipt.state !== "EXECUTED_UNVERIFIED") {
      throw new Error("federation_observation_execution_unverified_required");
    }
    if (receipt.adapterRef !== "SYNTHETIC-FEDERATED-LICENCE-ADAPTER-001") {
      throw new Error("federation_observation_adapter_not_supported");
    }

    const stateIdentity = digest(receipt.adapterResultRef).slice(0, 24);
    const observedStateRef = `FEDERATION-LICENCE-STATE:LICENCE_RECOGNISED:${stateIdentity}`;
    const sourceEvidenceRef = `SYNTHETIC-FEDERATION-EVIDENCE:${digest(
      `${receipt.receiptRef}|${receipt.adapterResultRef}|${observedAt}`,
    ).slice(0, 24)}`;
    const observationRef = `POST-EXECUTION-OBSERVATION:${digest(
      `${receipt.receiptRef}|${this.observerRef}|${observedStateRef}|${sourceEvidenceRef}|${observedAt}`,
    ).slice(0, 24)}`;

    return {
      observationRef,
      executionReceiptRef: receipt.receiptRef,
      actionRef: receipt.actionRef,
      programRef: receipt.programRef,
      eventRef: receipt.eventRef,
      targetRef: receipt.targetRef,
      correlationId: receipt.correlationId,
      observerRef: this.observerRef,
      observedStateRef,
      observedAt,
      sourceEvidenceRef,
      synthetic: true,
    };
  }
}

export function executeSyntheticFederatedLicenceR1(
  input: ExecuteSyntheticFederatedLicenceInputR1,
): FederatedLicenceResultR1 {
  const sourceDecision = requireSourceAllow(evaluateSyntheticWardenDecisionV1(input.source));
  const destinationDecision = evaluateSyntheticWardenDecisionV1(input.destination);

  if (destinationDecision.decision !== "ALLOW") {
    return {
      state: "BLOCKED_DESTINATION",
      sourceDecision,
      destinationDecision,
    };
  }

  const action = buildAuthorizedActionEnvelopeV1(input.destination.request, destinationDecision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({
    request: input.destination.request,
    decision: destinationDecision,
    action,
    reservedAt: input.destination.decidedAt,
  });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${destinationDecision.decisionRef}`,
    decisionRef: destinationDecision.decisionRef,
    wardenRef: destinationDecision.wardenRef,
    correlationId: destinationDecision.correlationId,
    state: "VALID",
    checkedAt: input.destination.decidedAt,
    reasonCodes: ["decision_active_for_federated_execution"],
  };
  const adapter = new SyntheticFederatedLicenceRecognitionAdapterR1();
  const executionGate = new ControlledExecutionGateV1([adapter]);
  const executionReceipt = executionGate.execute({
    action,
    reservation,
    decision: destinationDecision,
    checkpoint,
    executedAt: input.executedAt,
  });
  const observationSource = new SyntheticFederatedLicenceObservationSourceR1();
  const observation = observationSource.observe(executionReceipt, input.observedAt);
  const effectVerification = new EffectVerificationServiceV1().verify({
    receipt: executionReceipt,
    observation,
    verifiedAt: input.verifiedAt,
  });
  if (effectVerification.state !== "VERIFIED_EFFECT") {
    throw new Error(`federation_effect_verification_failed:${effectVerification.reasonCode}`);
  }
  const effectReceipt = effectVerification.effect;

  const lineage = JSON.stringify({
    missionRef: input.missionRef,
    federationObjectRef: input.federationObjectRef,
    productRef: input.productRef,
    sourceDecisionRef: sourceDecision.decisionRef,
    destinationDecisionRef: destinationDecision.decisionRef,
    destinationDomainRef: input.destination.request.contextRef,
    reservationRef: reservation.reservationRef,
    executionReceiptRef: executionReceipt.receiptRef,
    effectRef: effectReceipt.effectRef,
  });
  const lineageDigest = digest(lineage);
  const recognitionRef = `FEDERATION-RECOGNITION:${lineageDigest.slice(0, 24)}`;
  const payloadDigest = digest(
    JSON.stringify({
      recognitionRef,
      observationRef: observation.observationRef,
      effectRef: effectReceipt.effectRef,
    }),
  );
  const riverEventReceipt: EventReceiptV1 = {
    receiptRef: `RIVER-EVENT-RECEIPT:${digest(
      `${input.destination.request.eventRef}|${payloadDigest}`,
    ).slice(0, 24)}`,
    eventRef: input.destination.request.eventRef,
    correlationId: input.destination.request.correlationId,
    acceptedAt: input.observedAt,
    payloadDigest,
  };

  const localRecognition: FederatedLicenceRecognitionR1 = {
    recognitionRef,
    missionRef: input.missionRef,
    federationObjectRef: input.federationObjectRef,
    productRef: input.productRef,
    domainRef: input.destination.request.contextRef,
    createdByWardenRef: destinationDecision.wardenRef,
    sourceDecisionRef: sourceDecision.decisionRef,
    destinationDecisionRef: destinationDecision.decisionRef,
    effectRef: effectReceipt.effectRef,
    effectiveAt: effectReceipt.verifiedAt,
    synthetic: true,
  };

  return {
    state: "COMPLETED",
    sourceDecision,
    destinationDecision,
    reservation,
    executionReceipt,
    observation,
    localRecognition,
    riverEventReceipt,
    effectReceipt,
  };
}
