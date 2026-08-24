import { createHash } from "node:crypto";

import type { EventEnvelopeV1, EventReceiptV1, EffectReceiptV1 } from "../river/contracts.ts";
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
  | "DESTINATION_DECISION_LINEAGE_MISMATCH"
  | "DESTINATION_AUTHORITY_BINDING_MISMATCH"
  | "DESTINATION_DOMAIN_BINDING_MISMATCH"
  | "DESTINATION_CONTRACT_BINDING_MISMATCH"
  | "DESTINATION_AUTHORITY_NOT_ACTIVE"
  | "DESTINATION_AUTHORITY_TIME_INVALID"
  | "FEDERATION_OBJECT_TIME_INVALID"
  | "FEDERATION_OBJECT_EXPIRED"
  | "DESTINATION_DECISION_TIME_INVALID"
  | "DESTINATION_DECISION_EXPIRY_REQUIRED"
  | "DESTINATION_DECISION_EXPIRED"
  | "FEDERATION_REPLAY_CONFLICT";

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

export interface DestinationFederationAuthorityBindingV1 {
  bindingRef: string;
  wardenRef: string;
  domainRef: string;
  contractRef: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  validFrom: string;
  validUntil: string;
}

export interface SyntheticFederationEventReceiptV1 extends EventReceiptV1 {
  synthetic: true;
  persisted: false;
}

export interface SyntheticFederationEffectReceiptV1 extends EffectReceiptV1 {
  synthetic: true;
  persisted: false;
}

export interface FederationRiverReceiptBundleV1 {
  destinationAcceptedEvent: EventEnvelopeV1;
  destinationAcceptedReceipt: SyntheticFederationEventReceiptV1;
  localEffectEvent: EventEnvelopeV1;
  localEffectReceipt: SyntheticFederationEventReceiptV1;
  effectReceipt: SyntheticFederationEffectReceiptV1;
}

export interface FederatedLicenceRuntimeSuccessV1 {
  state: "LOCAL_EFFECT_CREATED";
  effect: LocalLicenceEffectV1;
  river: FederationRiverReceiptBundleV1;
  idempotentReplay: boolean;
}

export type FederatedLicenceRuntimeResultV1 =
  | FederatedLicenceRuntimeSuccessV1
  | DestinationFederationExceptionV1;

interface StoredFederationExecutionV1 {
  fingerprint: string;
  result: FederatedLicenceRuntimeSuccessV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function destinationFailure(
  federationId: string,
  reasonCode: DestinationFederationReasonCodeV1,
): DestinationFederationExceptionV1 {
  return {
    state: "DESTINATION_EXCEPTION",
    federationId,
    reasonCode,
  };
}

function createLocalLicenceEffect(
  federationObject: LicenceFederationObjectV1,
  destinationDecision: Extract<WardenDecisionV1, { decision: "ALLOW" }>,
  recognisedAt: string,
): LocalLicenceEffectV1 {
  return {
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
  };
}

function buildSyntheticRiverBundle(
  federationObject: LicenceFederationObjectV1,
  destinationDecision: Extract<WardenDecisionV1, { decision: "ALLOW" }>,
  binding: DestinationFederationAuthorityBindingV1,
  effect: LocalLicenceEffectV1,
  recognisedAt: string,
): FederationRiverReceiptBundleV1 {
  const correlationId = destinationDecision.correlationId;
  const destinationPayloadDigest = digest(
    JSON.stringify({
      federationId: federationObject.federationId,
      destinationDomainRef: federationObject.destinationDomainRef,
      contractRef: federationObject.contractRef,
      bindingRef: binding.bindingRef,
      destinationWardenDecisionRef: destinationDecision.decisionRef,
    }),
  );
  const destinationAcceptedEvent: EventEnvelopeV1 = {
    eventRef: `FEDERATION-EVENT:DESTINATION-ACCEPTED:${digest(
      `${federationObject.federationId}|${destinationPayloadDigest}`,
    ).slice(0, 24)}`,
    correlationId,
    sequence: 1,
    eventType: "FEDERATION_DESTINATION_ACCEPTED",
    occurredAt: recognisedAt,
    payloadDigest: destinationPayloadDigest,
  };
  const destinationAcceptedReceipt: SyntheticFederationEventReceiptV1 = {
    receiptRef: `FEDERATION-RIVER-RECEIPT:${digest(destinationAcceptedEvent.eventRef).slice(0, 24)}`,
    eventRef: destinationAcceptedEvent.eventRef,
    correlationId,
    acceptedAt: recognisedAt,
    payloadDigest: destinationPayloadDigest,
    synthetic: true,
    persisted: false,
  };

  const effectPayloadDigest = digest(JSON.stringify(effect));
  const localEffectEvent: EventEnvelopeV1 = {
    eventRef: `FEDERATION-EVENT:LOCAL-EFFECT:${digest(
      `${effect.effectRef}|${effectPayloadDigest}`,
    ).slice(0, 24)}`,
    correlationId,
    sequence: 2,
    eventType: "FEDERATION_LOCAL_EFFECT_CREATED",
    occurredAt: recognisedAt,
    payloadDigest: effectPayloadDigest,
    predecessorEventRef: destinationAcceptedEvent.eventRef,
  };
  const localEffectReceipt: SyntheticFederationEventReceiptV1 = {
    receiptRef: `FEDERATION-RIVER-RECEIPT:${digest(localEffectEvent.eventRef).slice(0, 24)}`,
    eventRef: localEffectEvent.eventRef,
    correlationId,
    acceptedAt: recognisedAt,
    payloadDigest: effectPayloadDigest,
    synthetic: true,
    persisted: false,
  };
  const effectReceipt: SyntheticFederationEffectReceiptV1 = {
    effectRef: effect.effectRef,
    correlationId,
    targetRef: effect.productRef,
    observedStateRef: `FEDERATION-LICENCE-STATE:RECOGNISED:${federationObject.federationId}`,
    verifiedAt: recognisedAt,
    verificationRef: `FEDERATION-EFFECT-VERIFICATION:${digest(
      `${localEffectEvent.eventRef}|${localEffectReceipt.receiptRef}|${recognisedAt}`,
    ).slice(0, 24)}`,
    synthetic: true,
    persisted: false,
  };

  return {
    destinationAcceptedEvent,
    destinationAcceptedReceipt,
    localEffectEvent,
    localEffectReceipt,
    effectReceipt,
  };
}

function cloneSuccess(result: FederatedLicenceRuntimeSuccessV1, idempotentReplay: boolean) {
  return {
    ...result,
    effect: { ...result.effect },
    river: {
      ...result.river,
      destinationAcceptedEvent: { ...result.river.destinationAcceptedEvent },
      destinationAcceptedReceipt: { ...result.river.destinationAcceptedReceipt },
      localEffectEvent: { ...result.river.localEffectEvent },
      localEffectReceipt: { ...result.river.localEffectReceipt },
      effectReceipt: { ...result.river.effectReceipt },
    },
    idempotentReplay,
  } satisfies FederatedLicenceRuntimeSuccessV1;
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

export class LicenceFederationRuntimeV1 {
  private readonly byFederationId = new Map<string, StoredFederationExecutionV1>();

  applyDestinationDecision(input: {
    federationObject: LicenceFederationObjectV1;
    destinationDecision: WardenDecisionV1;
    destinationAuthorityBinding: DestinationFederationAuthorityBindingV1;
    recognisedAt: string;
  }): FederatedLicenceRuntimeResultV1 {
    const {
      federationObject,
      destinationDecision,
      destinationAuthorityBinding,
      recognisedAt,
    } = input;

    const fingerprint = digest(
      JSON.stringify({
        federationObject,
        destinationDecision,
        destinationAuthorityBinding,
      }),
    );
    const existing = this.byFederationId.get(federationObject.federationId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return destinationFailure(federationObject.federationId, "FEDERATION_REPLAY_CONFLICT");
      }
      return cloneSuccess(existing.result, true);
    }

    if (destinationDecision.decision !== "ALLOW") {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_WARDEN_ALLOW_REQUIRED",
      );
    }
    if (destinationDecision.wardenRef === federationObject.sourceWardenRef) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_WARDEN_NOT_INDEPENDENT",
      );
    }
    if (
      destinationDecision.action !== "federation.licence.recognise" ||
      destinationDecision.targetRef !== federationObject.productRef
    ) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_DECISION_LINEAGE_MISMATCH",
      );
    }

    if (destinationAuthorityBinding.status !== "ACTIVE") {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_AUTHORITY_NOT_ACTIVE",
      );
    }
    if (destinationAuthorityBinding.wardenRef !== destinationDecision.wardenRef) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_AUTHORITY_BINDING_MISMATCH",
      );
    }
    if (destinationAuthorityBinding.domainRef !== federationObject.destinationDomainRef) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_DOMAIN_BINDING_MISMATCH",
      );
    }
    if (destinationAuthorityBinding.contractRef !== federationObject.contractRef) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_CONTRACT_BINDING_MISMATCH",
      );
    }

    const recognised = parseInstant(recognisedAt);
    const created = parseInstant(federationObject.createdAt);
    const expires = parseInstant(federationObject.expiresAt);
    if (
      recognised === null ||
      created === null ||
      expires === null ||
      expires < created ||
      recognised < created
    ) {
      return destinationFailure(
        federationObject.federationId,
        "FEDERATION_OBJECT_TIME_INVALID",
      );
    }
    if (recognised > expires) {
      return destinationFailure(federationObject.federationId, "FEDERATION_OBJECT_EXPIRED");
    }

    const decided = parseInstant(destinationDecision.decidedAt);
    if (decided === null || decided < created || recognised < decided) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_DECISION_TIME_INVALID",
      );
    }
    if (!destinationDecision.validUntil) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_DECISION_EXPIRY_REQUIRED",
      );
    }
    const decisionUntil = parseInstant(destinationDecision.validUntil);
    if (decisionUntil === null || decisionUntil < decided) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_DECISION_TIME_INVALID",
      );
    }
    if (recognised > decisionUntil) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_DECISION_EXPIRED",
      );
    }

    const bindingFrom = parseInstant(destinationAuthorityBinding.validFrom);
    const bindingUntil = parseInstant(destinationAuthorityBinding.validUntil);
    if (
      bindingFrom === null ||
      bindingUntil === null ||
      bindingUntil < bindingFrom ||
      decided < bindingFrom ||
      decided > bindingUntil ||
      recognised < bindingFrom ||
      recognised > bindingUntil
    ) {
      return destinationFailure(
        federationObject.federationId,
        "DESTINATION_AUTHORITY_TIME_INVALID",
      );
    }

    const effect = createLocalLicenceEffect(
      federationObject,
      destinationDecision,
      recognisedAt,
    );
    const result: FederatedLicenceRuntimeSuccessV1 = {
      state: "LOCAL_EFFECT_CREATED",
      effect,
      river: buildSyntheticRiverBundle(
        federationObject,
        destinationDecision,
        destinationAuthorityBinding,
        effect,
        recognisedAt,
      ),
      idempotentReplay: false,
    };
    this.byFederationId.set(federationObject.federationId, { fingerprint, result });
    return cloneSuccess(result, false);
  }

  effectCount(): number {
    return this.byFederationId.size;
  }
}
