import type { WardenDecisionV1 } from "../warden/contracts.ts";

export interface LicenceFederationObjectV1 {
  federationId: string;
  missionRef: string;
  sourceDomainRef: string;
  destinationDomainRef: string;
  principalRef: string;
  productRef: string;
  contractRef: string;
  purpose: string;
  sourceWardenDecisionRef: string;
  sourceWardenRef: string;
  sourceCorrelationId: string;
  createdAt: string;
  expiresAt: string;
  localEffectRef?: string;
}

export type SourceFederationReasonCodeV1 =
  | "SOURCE_WARDEN_ALLOW_REQUIRED"
  | "SOURCE_DECISION_LINEAGE_MISMATCH";

export type DestinationFederationReasonCodeV1 =
  | "DESTINATION_WARDEN_ALLOW_REQUIRED"
  | "DESTINATION_WARDEN_NOT_INDEPENDENT"
  | "DESTINATION_DECISION_LINEAGE_MISMATCH";

export interface SourceFederationExceptionV1 {
  state: "SOURCE_EXCEPTION";
  federationId: string;
  reasonCode: SourceFederationReasonCodeV1;
}

export interface DestinationFederationExceptionV1 {
  state: "DESTINATION_EXCEPTION";
  federationId: string;
  reasonCode: DestinationFederationReasonCodeV1;
}

export interface DestinationReadyFederationV1 {
  state: "READY_FOR_DESTINATION";
  federationObject: LicenceFederationObjectV1;
}

export interface LocalLicenceEffectV1 {
  effectRef: string;
  effectType: "LOCAL_LICENCE_RECOGNITION";
  federationId: string;
  missionRef: string;
  domainRef: string;
  principalRef: string;
  productRef: string;
  contractRef: string;
  purpose: string;
  sourceWardenDecisionRef: string;
  destinationWardenDecisionRef: string;
  recognisedAt: string;
}

export interface LocalLicenceEffectCreatedV1 {
  state: "LOCAL_EFFECT_CREATED";
  effect: LocalLicenceEffectV1;
}

export function createLicenceFederationObjectV1(input: {
  federationId: string;
  missionRef: string;
  sourceDomainRef: string;
  destinationDomainRef: string;
  principalRef: string;
  productRef: string;
  contractRef: string;
  purpose: string;
  sourceDecision: WardenDecisionV1;
  createdAt: string;
  expiresAt: string;
}): DestinationReadyFederationV1 | SourceFederationExceptionV1 {
  if (input.sourceDecision.decision !== "ALLOW") {
    return {
      state: "SOURCE_EXCEPTION",
      federationId: input.federationId,
      reasonCode: "SOURCE_WARDEN_ALLOW_REQUIRED",
    };
  }

  if (
    input.sourceDecision.action !== "federation.licence.present" ||
    input.sourceDecision.targetRef !== input.productRef
  ) {
    return {
      state: "SOURCE_EXCEPTION",
      federationId: input.federationId,
      reasonCode: "SOURCE_DECISION_LINEAGE_MISMATCH",
    };
  }

  return {
    state: "READY_FOR_DESTINATION",
    federationObject: {
      federationId: input.federationId,
      missionRef: input.missionRef,
      sourceDomainRef: input.sourceDomainRef,
      destinationDomainRef: input.destinationDomainRef,
      principalRef: input.principalRef,
      productRef: input.productRef,
      contractRef: input.contractRef,
      purpose: input.purpose,
      sourceWardenDecisionRef: input.sourceDecision.decisionRef,
      sourceWardenRef: input.sourceDecision.wardenRef,
      sourceCorrelationId: input.sourceDecision.correlationId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    },
  };
}

export function applyDestinationLicenceDecisionV1(input: {
  federationObject: LicenceFederationObjectV1;
  destinationDecision: WardenDecisionV1;
  recognisedAt: string;
}): LocalLicenceEffectCreatedV1 | DestinationFederationExceptionV1 {
  const { federationObject, destinationDecision, recognisedAt } = input;

  if (destinationDecision.decision !== "ALLOW") {
    return {
      state: "DESTINATION_EXCEPTION",
      federationId: federationObject.federationId,
      reasonCode: "DESTINATION_WARDEN_ALLOW_REQUIRED",
    };
  }

  if (destinationDecision.wardenRef === federationObject.sourceWardenRef) {
    return {
      state: "DESTINATION_EXCEPTION",
      federationId: federationObject.federationId,
      reasonCode: "DESTINATION_WARDEN_NOT_INDEPENDENT",
    };
  }

  if (
    destinationDecision.action !== "federation.licence.recognise" ||
    destinationDecision.targetRef !== federationObject.productRef
  ) {
    return {
      state: "DESTINATION_EXCEPTION",
      federationId: federationObject.federationId,
      reasonCode: "DESTINATION_DECISION_LINEAGE_MISMATCH",
    };
  }

  return {
    state: "LOCAL_EFFECT_CREATED",
    effect: {
      effectRef: `FEDERATION-LOCAL-EFFECT:${federationObject.federationId}:${destinationDecision.decisionRef}`,
      effectType: "LOCAL_LICENCE_RECOGNITION",
      federationId: federationObject.federationId,
      missionRef: federationObject.missionRef,
      domainRef: federationObject.destinationDomainRef,
      principalRef: federationObject.principalRef,
      productRef: federationObject.productRef,
      contractRef: federationObject.contractRef,
      purpose: federationObject.purpose,
      sourceWardenDecisionRef: federationObject.sourceWardenDecisionRef,
      destinationWardenDecisionRef: destinationDecision.decisionRef,
      recognisedAt,
    },
  };
}
