import { createHash } from "node:crypto";

import type { EvidenceReservationV1 } from "../river/contracts.ts";
import {
  SyntheticRiverReservationServiceV1,
  buildAuthorizedActionEnvelopeV1,
} from "../river/reservation-service.ts";
import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import {
  ControlledExecutionGateV1,
  type SyntheticCapabilityAdapterInputV1,
  type SyntheticCapabilityAdapterResultV1,
  type SyntheticCapabilityAdapterV1,
} from "../synnergyze/execution-gate.ts";
import {
  EffectVerificationServiceV1,
  type EffectVerificationSuccessV1,
  type PostExecutionObservationSourceV1,
  type PostExecutionObservationV1,
} from "../synnergyze/effect-verification.ts";
import type {
  WardenDecisionRequestV1,
  WardenDecisionV1,
  WardenExecutionCheckpointV1,
} from "../warden/contracts.ts";
import type {
  DestinationFederationAuthorityBindingV1,
  LicenceFederationObjectV1,
} from "./federated-mission.ts";

export interface TrustPathProofV1 {
  proofRef: string;
  status: "VALID" | "SUSPENDED" | "REVOKED" | "EXPIRED";
  sourceDomainRef: string;
  destinationDomainRef: string;
  contractRef: string;
  purpose: string;
  principalRef: string;
  productRef: string;
  resolvedAt: string;
  validUntil: string;
}

export interface FederationContractResolutionV1 {
  resolutionRef: string;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "SUPERSEDED";
  contractRef: string;
  sourceDomainRef: string;
  destinationDomainRef: string;
  purpose: string;
  validFrom: string;
  validUntil: string;
}

export type FederatedLicenceEvidenceReasonCodeV1 =
  | "TRUST_PATH_NOT_VALID"
  | "TRUST_PATH_MISMATCH"
  | "TRUST_PATH_TIME_INVALID"
  | "TRUST_PATH_EXPIRED"
  | "CONTRACT_RESOLUTION_NOT_ACTIVE"
  | "CONTRACT_RESOLUTION_MISMATCH"
  | "CONTRACT_RESOLUTION_TIME_INVALID"
  | "CONTRACT_RESOLUTION_EXPIRED"
  | "DESTINATION_AUTHORITY_BINDING_MISMATCH"
  | "DESTINATION_AUTHORITY_NOT_ACTIVE"
  | "DESTINATION_AUTHORITY_TIME_INVALID"
  | "FEDERATION_OBJECT_TIME_INVALID"
  | "FEDERATION_OBJECT_EXPIRED"
  | "DESTINATION_REQUEST_LINEAGE_MISMATCH"
  | "DESTINATION_DECISION_LINEAGE_MISMATCH"
  | "FEDERATION_REPLAY_CONFLICT"
  | "GOVERNED_EXECUTION_REJECTED"
  | "EFFECT_VERIFICATION_FAILED";

export interface FederatedLicenceEvidenceExceptionV1 {
  state: "FEDERATION_EXCEPTION";
  federationId: string;
  reasonCode: FederatedLicenceEvidenceReasonCodeV1;
  reason?: string;
}

export interface FederatedLicenceEvidenceSuccessV1 {
  state: "VERIFIED_LOCAL_EFFECT";
  federationId: string;
  trustPathProofRef: string;
  contractResolutionRef: string;
  destinationAuthorityBindingRef: string;
  reservation: EvidenceReservationV1;
  execution: SynnergyzeExecutionReceiptV1;
  observation: PostExecutionObservationV1;
  verification: EffectVerificationSuccessV1;
  idempotentReplay: boolean;
}

export type FederatedLicenceEvidenceResultV1 =
  | FederatedLicenceEvidenceSuccessV1
  | FederatedLicenceEvidenceExceptionV1;

interface StoredGovernedExecutionV1 {
  fingerprint: string;
  result: FederatedLicenceEvidenceSuccessV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function failure(
  federationId: string,
  reasonCode: FederatedLicenceEvidenceReasonCodeV1,
  reason?: string,
): FederatedLicenceEvidenceExceptionV1 {
  return {
    state: "FEDERATION_EXCEPTION",
    federationId,
    reasonCode,
    ...(reason ? { reason } : {}),
  };
}

function includes(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function validateFederationObject(
  federationObject: LicenceFederationObjectV1,
  at: string,
): FederatedLicenceEvidenceExceptionV1 | undefined {
  const created = parseInstant(federationObject.createdAt);
  const expires = parseInstant(federationObject.expiresAt);
  const current = parseInstant(at);
  if (created === null || expires === null || current === null || expires < created || current < created) {
    return failure(federationObject.federationId, "FEDERATION_OBJECT_TIME_INVALID");
  }
  if (current > expires) {
    return failure(federationObject.federationId, "FEDERATION_OBJECT_EXPIRED");
  }
  return undefined;
}

function validateTrustPath(
  federationObject: LicenceFederationObjectV1,
  trustPathProof: TrustPathProofV1,
  at: string,
): FederatedLicenceEvidenceExceptionV1 | undefined {
  if (trustPathProof.status !== "VALID") {
    return failure(federationObject.federationId, "TRUST_PATH_NOT_VALID");
  }
  if (
    trustPathProof.sourceDomainRef !== federationObject.sourceDomainRef ||
    trustPathProof.destinationDomainRef !== federationObject.destinationDomainRef ||
    trustPathProof.contractRef !== federationObject.contractRef ||
    trustPathProof.purpose !== federationObject.purpose ||
    trustPathProof.principalRef !== federationObject.principalRef ||
    trustPathProof.productRef !== federationObject.productRef
  ) {
    return failure(federationObject.federationId, "TRUST_PATH_MISMATCH");
  }

  const resolved = parseInstant(trustPathProof.resolvedAt);
  const validUntil = parseInstant(trustPathProof.validUntil);
  const current = parseInstant(at);
  if (
    resolved === null ||
    validUntil === null ||
    current === null ||
    validUntil < resolved ||
    current < resolved
  ) {
    return failure(federationObject.federationId, "TRUST_PATH_TIME_INVALID");
  }
  if (current > validUntil) {
    return failure(federationObject.federationId, "TRUST_PATH_EXPIRED");
  }
  return undefined;
}

function validateContractResolution(
  federationObject: LicenceFederationObjectV1,
  contractResolution: FederationContractResolutionV1,
  at: string,
): FederatedLicenceEvidenceExceptionV1 | undefined {
  if (contractResolution.status !== "ACTIVE") {
    return failure(federationObject.federationId, "CONTRACT_RESOLUTION_NOT_ACTIVE");
  }
  if (
    contractResolution.contractRef !== federationObject.contractRef ||
    contractResolution.sourceDomainRef !== federationObject.sourceDomainRef ||
    contractResolution.destinationDomainRef !== federationObject.destinationDomainRef ||
    contractResolution.purpose !== federationObject.purpose
  ) {
    return failure(federationObject.federationId, "CONTRACT_RESOLUTION_MISMATCH");
  }

  const validFrom = parseInstant(contractResolution.validFrom);
  const validUntil = parseInstant(contractResolution.validUntil);
  const current = parseInstant(at);
  if (
    validFrom === null ||
    validUntil === null ||
    current === null ||
    validUntil < validFrom ||
    current < validFrom
  ) {
    return failure(federationObject.federationId, "CONTRACT_RESOLUTION_TIME_INVALID");
  }
  if (current > validUntil) {
    return failure(federationObject.federationId, "CONTRACT_RESOLUTION_EXPIRED");
  }
  return undefined;
}

function validateDestinationAuthority(
  federationObject: LicenceFederationObjectV1,
  destinationDecision: WardenDecisionV1,
  binding: DestinationFederationAuthorityBindingV1,
  at: string,
): FederatedLicenceEvidenceExceptionV1 | undefined {
  if (binding.status !== "ACTIVE") {
    return failure(federationObject.federationId, "DESTINATION_AUTHORITY_NOT_ACTIVE");
  }
  if (
    binding.wardenRef !== destinationDecision.wardenRef ||
    binding.domainRef !== federationObject.destinationDomainRef ||
    binding.contractRef !== federationObject.contractRef ||
    destinationDecision.wardenRef === federationObject.sourceWardenRef
  ) {
    return failure(federationObject.federationId, "DESTINATION_AUTHORITY_BINDING_MISMATCH");
  }

  const validFrom = parseInstant(binding.validFrom);
  const validUntil = parseInstant(binding.validUntil);
  const current = parseInstant(at);
  if (
    validFrom === null ||
    validUntil === null ||
    current === null ||
    validUntil < validFrom ||
    current < validFrom ||
    current > validUntil
  ) {
    return failure(federationObject.federationId, "DESTINATION_AUTHORITY_TIME_INVALID");
  }
  return undefined;
}

function validateDestinationLineage(input: {
  federationObject: LicenceFederationObjectV1;
  trustPathProof: TrustPathProofV1;
  contractResolution: FederationContractResolutionV1;
  destinationRequest: WardenDecisionRequestV1;
  destinationDecision: WardenDecisionV1;
}): FederatedLicenceEvidenceExceptionV1 | undefined {
  const {
    federationObject,
    trustPathProof,
    contractResolution,
    destinationRequest,
    destinationDecision,
  } = input;

  if (
    destinationRequest.contextRef !== federationObject.destinationDomainRef ||
    destinationRequest.programRef !== federationObject.missionRef ||
    destinationRequest.eventRef !== federationObject.federationId ||
    destinationRequest.action !== "federation.licence.recognise" ||
    destinationRequest.capabilityRef !== "federation.licence.recognise" ||
    destinationRequest.targetRef !== federationObject.productRef ||
    !includes(destinationRequest.representationSourceRefs, trustPathProof.proofRef) ||
    !includes(destinationRequest.representationSourceRefs, contractResolution.resolutionRef) ||
    !includes(destinationRequest.policyRefs, contractResolution.resolutionRef)
  ) {
    return failure(federationObject.federationId, "DESTINATION_REQUEST_LINEAGE_MISMATCH");
  }

  if (
    destinationDecision.decision !== "ALLOW" ||
    destinationDecision.requestRef !== destinationRequest.requestRef ||
    destinationDecision.action !== destinationRequest.action ||
    destinationDecision.targetRef !== destinationRequest.targetRef ||
    destinationDecision.correlationId !== destinationRequest.correlationId
  ) {
    return failure(federationObject.federationId, "DESTINATION_DECISION_LINEAGE_MISMATCH");
  }
  return undefined;
}

function cloneSuccess(
  result: FederatedLicenceEvidenceSuccessV1,
  idempotentReplay: boolean,
): FederatedLicenceEvidenceSuccessV1 {
  return {
    ...result,
    reservation: { ...result.reservation },
    execution: { ...result.execution, idempotentReplay },
    observation: { ...result.observation },
    verification: {
      ...result.verification,
      effect: { ...result.verification.effect },
      idempotentReplay,
    },
    idempotentReplay,
  };
}

export class SyntheticFederationLicenceRecognitionAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-FEDERATION-LICENCE-ADAPTER-001";
  readonly capabilityRef = "federation.licence.recognise";
  private invocations = 0;

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("federation_licence_adapter_capability_mismatch");
    }
    this.invocations += 1;
    const identity = digest(
      [
        input.action.actionRef,
        input.reservation.reservationRef,
        input.action.targetRef,
        input.action.correlationId,
      ].join("|"),
    ).slice(0, 24);
    return { adapterResultRef: `SYNTHETIC-FEDERATION-LICENCE:${identity}` };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export class SyntheticFederationLicenceObservationSourceV1
  implements PostExecutionObservationSourceV1
{
  readonly observerRef = "SYNTHETIC-FEDERATION-LICENCE-OBSERVER-001";

  observe(receipt: SynnergyzeExecutionReceiptV1, observedAt: string): PostExecutionObservationV1 {
    if (receipt.state !== "EXECUTED_UNVERIFIED") {
      throw new Error("federation_observation_execution_unverified_required");
    }
    if (receipt.adapterRef !== "SYNTHETIC-FEDERATION-LICENCE-ADAPTER-001") {
      throw new Error("federation_observation_adapter_not_supported");
    }
    if (!receipt.adapterResultRef) {
      throw new Error("federation_observation_adapter_result_required");
    }

    const observedStateRef = `FEDERATION-LICENCE-STATE:RECOGNISED:${digest(
      receipt.adapterResultRef,
    ).slice(0, 24)}`;
    const sourceEvidenceRef = `FEDERATION-OBSERVATION-EVIDENCE:${digest(
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

export class FederatedLicenceEvidenceRuntimeV1 {
  private readonly river: SyntheticRiverReservationServiceV1;
  private readonly gate: ControlledExecutionGateV1;
  private readonly verifier: EffectVerificationServiceV1;
  private readonly observer: PostExecutionObservationSourceV1;
  private readonly byFederationId = new Map<string, StoredGovernedExecutionV1>();

  constructor(input: {
    river: SyntheticRiverReservationServiceV1;
    gate: ControlledExecutionGateV1;
    verifier: EffectVerificationServiceV1;
    observer: PostExecutionObservationSourceV1;
  }) {
    this.river = input.river;
    this.gate = input.gate;
    this.verifier = input.verifier;
    this.observer = input.observer;
  }

  execute(input: {
    federationObject: LicenceFederationObjectV1;
    trustPathProof: TrustPathProofV1;
    contractResolution: FederationContractResolutionV1;
    destinationAuthorityBinding: DestinationFederationAuthorityBindingV1;
    destinationRequest: WardenDecisionRequestV1;
    destinationDecision: WardenDecisionV1;
    checkpoint: WardenExecutionCheckpointV1;
    reservedAt: string;
    executedAt: string;
    observedAt: string;
    verifiedAt: string;
  }): FederatedLicenceEvidenceResultV1 {
    const federationId = input.federationObject.federationId;
    const fingerprint = digest(JSON.stringify(input));
    const existing = this.byFederationId.get(federationId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return failure(federationId, "FEDERATION_REPLAY_CONFLICT");
      }
      return cloneSuccess(existing.result, true);
    }

    const validations = [
      validateFederationObject(input.federationObject, input.reservedAt),
      validateTrustPath(input.federationObject, input.trustPathProof, input.reservedAt),
      validateContractResolution(
        input.federationObject,
        input.contractResolution,
        input.reservedAt,
      ),
      validateDestinationAuthority(
        input.federationObject,
        input.destinationDecision,
        input.destinationAuthorityBinding,
        input.reservedAt,
      ),
      validateDestinationLineage(input),
    ];
    const validationFailure = validations.find(
      (candidate): candidate is FederatedLicenceEvidenceExceptionV1 => candidate !== undefined,
    );
    if (validationFailure) return validationFailure;

    try {
      const action = buildAuthorizedActionEnvelopeV1(
        input.destinationRequest,
        input.destinationDecision,
      );
      const reservation = this.river.reserve({
        request: input.destinationRequest,
        decision: input.destinationDecision,
        action,
        reservedAt: input.reservedAt,
      });
      const execution = this.gate.execute({
        action,
        reservation,
        decision: input.destinationDecision,
        checkpoint: input.checkpoint,
        executedAt: input.executedAt,
      });
      const observation = this.observer.observe(execution, input.observedAt);
      const verification = this.verifier.verify({
        receipt: execution,
        observation,
        verifiedAt: input.verifiedAt,
      });
      if (verification.state !== "VERIFIED_EFFECT") {
        return failure(
          federationId,
          "EFFECT_VERIFICATION_FAILED",
          verification.reasonCode,
        );
      }

      const result: FederatedLicenceEvidenceSuccessV1 = {
        state: "VERIFIED_LOCAL_EFFECT",
        federationId,
        trustPathProofRef: input.trustPathProof.proofRef,
        contractResolutionRef: input.contractResolution.resolutionRef,
        destinationAuthorityBindingRef: input.destinationAuthorityBinding.bindingRef,
        reservation,
        execution,
        observation,
        verification,
        idempotentReplay: false,
      };
      this.byFederationId.set(federationId, { fingerprint, result });
      return cloneSuccess(result, false);
    } catch (error) {
      return failure(
        federationId,
        "GOVERNED_EXECUTION_REJECTED",
        error instanceof Error ? error.message : "unknown_governed_execution_error",
      );
    }
  }

  executionCount(): number {
    return this.byFederationId.size;
  }
}
