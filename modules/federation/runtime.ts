import { createHash } from "node:crypto";

import type { EffectReceiptV1, EventReceiptV1 } from "../river/contracts.ts";
import type {
  WardenAllowDecisionV1,
  WardenDecisionRequestV1,
  WardenDecisionV1,
  WardenNonAllowDecisionV1,
} from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";

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
  localRecognition: FederatedLicenceRecognitionR1;
  riverEventReceipt: EventReceiptV1;
  effectReceipt: EffectReceiptV1;
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

  const correlationId = input.destination.request.correlationId;
  const lineage = JSON.stringify({
    missionRef: input.missionRef,
    federationObjectRef: input.federationObjectRef,
    productRef: input.productRef,
    sourceDecisionRef: sourceDecision.decisionRef,
    destinationDecisionRef: destinationDecision.decisionRef,
    destinationDomainRef: input.destination.request.contextRef,
  });
  const lineageDigest = digest(lineage);
  const recognitionRef = `FEDERATION-RECOGNITION:${lineageDigest.slice(0, 24)}`;
  const observedStateRef = `FEDERATION-LICENCE-STATE:LICENCE_RECOGNISED:${lineageDigest.slice(0, 24)}`;
  const eventRef = `FEDERATION-EVENT:${lineageDigest.slice(0, 24)}`;
  const payloadDigest = digest(
    JSON.stringify({
      recognitionRef,
      observedStateRef,
      executedAt: input.executedAt,
      observedAt: input.observedAt,
    }),
  );
  const riverEventReceipt: EventReceiptV1 = {
    receiptRef: `RIVER-EVENT-RECEIPT:${digest(`${eventRef}|${payloadDigest}`).slice(0, 24)}`,
    eventRef,
    correlationId,
    acceptedAt: input.observedAt,
    payloadDigest,
  };
  const verificationRef = `FEDERATION-EFFECT-VERIFICATION:${digest(
    `${recognitionRef}|${riverEventReceipt.receiptRef}|${input.verifiedAt}`,
  ).slice(0, 24)}`;
  const effectReceipt: EffectReceiptV1 = {
    effectRef: `FEDERATION-VERIFIED-EFFECT:${digest(
      `${recognitionRef}|${observedStateRef}|${verificationRef}`,
    ).slice(0, 24)}`,
    correlationId,
    targetRef: input.productRef,
    observedStateRef,
    verifiedAt: input.verifiedAt,
    verificationRef,
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
    effectiveAt: input.verifiedAt,
    synthetic: true,
  };

  return {
    state: "COMPLETED",
    sourceDecision,
    destinationDecision,
    localRecognition,
    riverEventReceipt,
    effectReceipt,
  };
}
