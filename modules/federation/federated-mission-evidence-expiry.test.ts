import { describe, expect, it } from "vitest";

import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import { ControlledExecutionGateV1 } from "../synnergyze/execution-gate.ts";
import { EffectVerificationServiceV1 } from "../synnergyze/effect-verification.ts";
import type { WardenDecisionRequestV1, WardenDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  createLicenceFederationObjectV1,
  type DestinationFederationAuthorityBindingV1,
} from "./federated-mission.ts";
import {
  FederatedLicenceEvidenceRuntimeV1,
  SyntheticFederationLicenceObservationSourceV1,
  SyntheticFederationLicenceRecognitionAdapterV1,
  type FederationContractResolutionV1,
  type TrustPathProofV1,
} from "./federated-mission-evidence.ts";

const sourceDecision: WardenDecisionV1 = {
  decisionRef: "WARDEN-DECISION:IN-EXPIRY-001",
  requestRef: "WARDEN-REQUEST:IN-EXPIRY-001",
  wardenRef: "WARDEN-IN",
  action: "federation.licence.present",
  targetRef: "PRODUCT-X-001",
  reasonCodes: ["bounded_policy_allow"],
  constraints: ["SYNTHETIC_REFERENCE_ONLY"],
  decidedAt: "2026-08-24T00:00:10.000Z",
  validUntil: "2026-08-24T00:10:00.000Z",
  correlationId: "CORR-IN-EXPIRY-001",
  decision: "ALLOW",
  actionToken: "WARDEN-ACTION-TOKEN:IN-EXPIRY-001",
};

function federationObject() {
  const result = createLicenceFederationObjectV1({
    federationId: "FED-IN-MY-EXPIRY-001",
    missionRef: "MISSION-CREATOR-CROSSBORDER-001",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    principalRef: "DM-IN-CREATOR-001",
    productRef: "PRODUCT-X-001",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    purpose: "CREATOR_IP_LICENSING",
    sourceDecision,
    createdAt: "2026-08-24T00:00:20.000Z",
    expiresAt: "2026-08-24T00:10:00.000Z",
  });
  if (result.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");
  return result.federationObject;
}

const destinationDecision: WardenDecisionV1 = {
  decisionRef: "WARDEN-DECISION:MY-EXPIRY-001",
  requestRef: "WARDEN-REQUEST:MY-EXPIRY-001",
  wardenRef: "WARDEN-MY",
  action: "federation.licence.recognise",
  targetRef: "PRODUCT-X-001",
  reasonCodes: ["bounded_policy_allow"],
  constraints: ["SYNTHETIC_REFERENCE_ONLY"],
  decidedAt: "2026-08-24T00:00:30.000Z",
  validUntil: "2026-08-24T00:10:00.000Z",
  correlationId: "CORR-MY-EXPIRY-001",
  decision: "ALLOW",
  actionToken: "WARDEN-ACTION-TOKEN:MY-EXPIRY-001",
};

function trust(validUntil: string): TrustPathProofV1 {
  return {
    proofRef: "TRUST-PATH-PROOF:EXPIRY-001",
    status: "VALID",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    purpose: "CREATOR_IP_LICENSING",
    principalRef: "DM-IN-CREATOR-001",
    productRef: "PRODUCT-X-001",
    resolvedAt: "2026-08-24T00:00:22.000Z",
    validUntil,
  };
}

function contract(validUntil: string): FederationContractResolutionV1 {
  return {
    resolutionRef: "FED-CONTRACT-RESOLUTION:EXPIRY-001",
    status: "ACTIVE",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    purpose: "CREATOR_IP_LICENSING",
    validFrom: "2026-08-23T23:00:00.000Z",
    validUntil,
  };
}

function binding(validUntil: string): DestinationFederationAuthorityBindingV1 {
  return {
    bindingRef: "FED-AUTH-BINDING:MY-EXPIRY-001",
    wardenRef: "WARDEN-MY",
    domainRef: "DOMAIN-MY",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    status: "ACTIVE",
    validFrom: "2026-08-23T23:00:00.000Z",
    validUntil,
  };
}

function request(trustPath: TrustPathProofV1, contractResolution: FederationContractResolutionV1): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:MY-EXPIRY-001",
    actorRef: "DIGITALME-MY-LICENCE-OPERATOR-001",
    representedPrincipalRef: "ENT-MY-BUYER-001",
    actingCapacityRef: "CAPACITY:MY-LICENCE-RECOGNISER-001",
    contextRef: "DOMAIN-MY",
    programRef: "MISSION-CREATOR-CROSSBORDER-001",
    eventRef: "FED-IN-MY-EXPIRY-001",
    action: "federation.licence.recognise",
    capabilityRef: "federation.licence.recognise",
    targetRef: "PRODUCT-X-001",
    requestedEffect: "federation.licence.recognised",
    authorityRefs: ["AUTHORITY:MY-LICENCE-RECOGNITION-001"],
    policyRefs: [contractResolution.resolutionRef],
    representationSourceRefs: [trustPath.proofRef, contractResolution.resolutionRef],
    requestedAt: "2026-08-24T00:00:25.000Z",
    correlationId: "CORR-MY-EXPIRY-001",
  };
}

const checkpoint: WardenExecutionCheckpointV1 = {
  checkpointRef: "WARDEN-CHECKPOINT:MY-EXPIRY-001",
  decisionRef: "WARDEN-DECISION:MY-EXPIRY-001",
  wardenRef: "WARDEN-MY",
  correlationId: "CORR-MY-EXPIRY-001",
  state: "VALID",
  checkedAt: "2026-08-24T00:00:36.000Z",
  reasonCodes: ["decision_current"],
};

function runtime() {
  const river = new SyntheticRiverReservationServiceV1();
  const adapter = new SyntheticFederationLicenceRecognitionAdapterV1();
  const gate = new ControlledExecutionGateV1([adapter]);
  const verifier = new EffectVerificationServiceV1();
  return {
    runtime: new FederatedLicenceEvidenceRuntimeV1({
      river,
      gate,
      verifier,
      observer: new SyntheticFederationLicenceObservationSourceV1(),
    }),
    river,
    gate,
    adapter,
  };
}

describe("VSR-FEDERATED-MISSION-EVIDENCE-EXPIRY-R1.2", () => {
  it.each([
    ["trust", "2026-08-24T00:00:36.000Z", "TRUST_PATH_EXPIRED"],
    ["contract", "2026-08-24T00:00:36.000Z", "CONTRACT_RESOLUTION_EXPIRED"],
    ["authority", "2026-08-24T00:00:36.000Z", "DESTINATION_AUTHORITY_TIME_INVALID"],
  ] as const)("rejects %s that expires after reservation but before execution", (kind, validUntil, expectedReason) => {
    const trustPath = trust(kind === "trust" ? validUntil : "2026-08-24T00:10:00.000Z");
    const contractResolution = contract(kind === "contract" ? validUntil : "2026-08-24T00:10:00.000Z");
    const authorityBinding = binding(kind === "authority" ? validUntil : "2026-08-24T00:10:00.000Z");
    const components = runtime();

    const result = components.runtime.execute({
      federationObject: federationObject(),
      trustPathProof: trustPath,
      contractResolution,
      destinationAuthorityBinding: authorityBinding,
      destinationRequest: request(trustPath, contractResolution),
      destinationDecision,
      checkpoint,
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result).toMatchObject({ state: "FEDERATION_EXCEPTION", reasonCode: expectedReason });
    expect(components.river.reservationCount()).toBe(0);
    expect(components.gate.executionCount()).toBe(0);
    expect(components.adapter.invocationCount()).toBe(0);
  });
});
