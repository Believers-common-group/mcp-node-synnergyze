import { describe, expect, it } from "vitest";

import { SyntheticRiverReservationServiceV1 } from "../river/reservation-service.ts";
import {
  ControlledExecutionGateV1,
} from "../synnergyze/execution-gate.ts";
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

function sourceAllow(): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:IN-001",
    requestRef: "WARDEN-REQUEST:IN-001",
    wardenRef: "WARDEN-IN",
    action: "federation.licence.present",
    targetRef: "PRODUCT-X-001",
    reasonCodes: ["bounded_policy_allow"],
    constraints: ["SYNTHETIC_REFERENCE_ONLY"],
    decidedAt: "2026-08-24T00:00:10.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
    correlationId: "CORR-IN-LICENCE-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:IN-001",
  };
}

function federationObject() {
  const result = createLicenceFederationObjectV1({
    federationId: "FED-IN-MY-LICENCE-001",
    missionRef: "MISSION-CREATOR-CROSSBORDER-001",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    principalRef: "DM-IN-CREATOR-001",
    productRef: "PRODUCT-X-001",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    purpose: "CREATOR_IP_LICENSING",
    sourceDecision: sourceAllow(),
    createdAt: "2026-08-24T00:00:20.000Z",
    expiresAt: "2026-08-24T00:10:00.000Z",
  });
  if (result.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");
  return result.federationObject;
}

function trustPath(overrides: Partial<TrustPathProofV1> = {}): TrustPathProofV1 {
  return {
    proofRef: "TRUST-PATH-PROOF:IN-MY-001",
    status: "VALID",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    purpose: "CREATOR_IP_LICENSING",
    principalRef: "DM-IN-CREATOR-001",
    productRef: "PRODUCT-X-001",
    resolvedAt: "2026-08-24T00:00:22.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
    ...overrides,
  };
}

function contractResolution(
  overrides: Partial<FederationContractResolutionV1> = {},
): FederationContractResolutionV1 {
  return {
    resolutionRef: "FED-CONTRACT-RESOLUTION:IN-MY-001",
    status: "ACTIVE",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    purpose: "CREATOR_IP_LICENSING",
    validFrom: "2026-08-23T23:00:00.000Z",
    validUntil: "2026-08-24T01:00:00.000Z",
    ...overrides,
  };
}

function binding(): DestinationFederationAuthorityBindingV1 {
  return {
    bindingRef: "FED-AUTH-BINDING:MY-001",
    wardenRef: "WARDEN-MY",
    domainRef: "DOMAIN-MY",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    status: "ACTIVE",
    validFrom: "2026-08-23T23:00:00.000Z",
    validUntil: "2026-08-24T01:00:00.000Z",
  };
}

function destinationRequest(
  trust: TrustPathProofV1 = trustPath(),
  contract: FederationContractResolutionV1 = contractResolution(),
): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:MY-001",
    actorRef: "DIGITALME-MY-LICENCE-OPERATOR-001",
    representedPrincipalRef: "ENT-MY-BUYER-001",
    actingCapacityRef: "CAPACITY:MY-LICENCE-RECOGNISER-001",
    contextRef: "DOMAIN-MY",
    programRef: "MISSION-CREATOR-CROSSBORDER-001",
    eventRef: "FED-IN-MY-LICENCE-001",
    action: "federation.licence.recognise",
    capabilityRef: "federation.licence.recognise",
    targetRef: "PRODUCT-X-001",
    requestedEffect: "federation.licence.recognised",
    authorityRefs: ["AUTHORITY:MY-LICENCE-RECOGNITION-001"],
    policyRefs: [contract.resolutionRef],
    representationSourceRefs: [trust.proofRef, contract.resolutionRef],
    requestedAt: "2026-08-24T00:00:25.000Z",
    correlationId: "CORR-MY-LICENCE-001",
  };
}

function destinationAllow(): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:MY-001",
    requestRef: "WARDEN-REQUEST:MY-001",
    wardenRef: "WARDEN-MY",
    action: "federation.licence.recognise",
    targetRef: "PRODUCT-X-001",
    reasonCodes: ["bounded_policy_allow"],
    constraints: ["SYNTHETIC_REFERENCE_ONLY"],
    decidedAt: "2026-08-24T00:00:30.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
    correlationId: "CORR-MY-LICENCE-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:MY-001",
  };
}

function checkpoint(): WardenExecutionCheckpointV1 {
  return {
    checkpointRef: "WARDEN-CHECKPOINT:MY-001",
    decisionRef: "WARDEN-DECISION:MY-001",
    wardenRef: "WARDEN-MY",
    correlationId: "CORR-MY-LICENCE-001",
    state: "VALID",
    checkedAt: "2026-08-24T00:00:36.000Z",
    reasonCodes: ["decision_current"],
  };
}

function makeRuntime() {
  const river = new SyntheticRiverReservationServiceV1();
  const adapter = new SyntheticFederationLicenceRecognitionAdapterV1();
  const gate = new ControlledExecutionGateV1([adapter]);
  const verifier = new EffectVerificationServiceV1();
  const observer = new SyntheticFederationLicenceObservationSourceV1();
  const runtime = new FederatedLicenceEvidenceRuntimeV1({
    river,
    gate,
    verifier,
    observer,
  });
  return { runtime, river, gate, verifier, adapter };
}

describe("VSR-FEDERATED-MISSION-EVIDENCE-R1.2", () => {
  it("requires trust + contract resolution, reserves River evidence, executes unverified, then verifies effect", () => {
    const trust = trustPath();
    const contract = contractResolution();
    const { runtime, river, gate, verifier, adapter } = makeRuntime();

    const result = runtime.execute({
      federationObject: federationObject(),
      trustPathProof: trust,
      contractResolution: contract,
      destinationAuthorityBinding: binding(),
      destinationRequest: destinationRequest(trust, contract),
      destinationDecision: destinationAllow(),
      checkpoint: checkpoint(),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result.state).toBe("VERIFIED_LOCAL_EFFECT");
    if (result.state !== "VERIFIED_LOCAL_EFFECT") throw new Error("expected_verified_effect");
    expect(result.reservation.state).toBe("RESERVED");
    expect(result.execution.state).toBe("EXECUTED_UNVERIFIED");
    expect(result.verification.state).toBe("VERIFIED_EFFECT");
    expect(result.trustPathProofRef).toBe(trust.proofRef);
    expect(result.contractResolutionRef).toBe(contract.resolutionRef);
    expect(river.reservationCount()).toBe(1);
    expect(gate.executionCount()).toBe(1);
    expect(verifier.verificationCount()).toBe(1);
    expect(adapter.invocationCount()).toBe(1);
  });

  it("rejects an invalid trust path before River reservation or execution", () => {
    const trust = trustPath({ status: "REVOKED" });
    const contract = contractResolution();
    const { runtime, river, gate, verifier, adapter } = makeRuntime();

    const result = runtime.execute({
      federationObject: federationObject(),
      trustPathProof: trust,
      contractResolution: contract,
      destinationAuthorityBinding: binding(),
      destinationRequest: destinationRequest(trust, contract),
      destinationDecision: destinationAllow(),
      checkpoint: checkpoint(),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result).toMatchObject({ state: "FEDERATION_EXCEPTION", reasonCode: "TRUST_PATH_NOT_VALID" });
    expect(river.reservationCount()).toBe(0);
    expect(gate.executionCount()).toBe(0);
    expect(verifier.verificationCount()).toBe(0);
    expect(adapter.invocationCount()).toBe(0);
  });

  it("rejects a contract resolution that does not bind the exact federation contract", () => {
    const trust = trustPath();
    const contract = contractResolution({ contractRef: "FED-CONTRACT-IN-MY-CREATOR-999" });
    const { runtime, river, gate } = makeRuntime();

    const result = runtime.execute({
      federationObject: federationObject(),
      trustPathProof: trust,
      contractResolution: contract,
      destinationAuthorityBinding: binding(),
      destinationRequest: destinationRequest(trust, contract),
      destinationDecision: destinationAllow(),
      checkpoint: checkpoint(),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result).toMatchObject({
      state: "FEDERATION_EXCEPTION",
      reasonCode: "CONTRACT_RESOLUTION_MISMATCH",
    });
    expect(river.reservationCount()).toBe(0);
    expect(gate.executionCount()).toBe(0);
  });

  it("replays the exact governed execution without duplicate reservation, adapter effect, or verification", () => {
    const trust = trustPath();
    const contract = contractResolution();
    const { runtime, river, gate, verifier, adapter } = makeRuntime();
    const input = {
      federationObject: federationObject(),
      trustPathProof: trust,
      contractResolution: contract,
      destinationAuthorityBinding: binding(),
      destinationRequest: destinationRequest(trust, contract),
      destinationDecision: destinationAllow(),
      checkpoint: checkpoint(),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    } as const;

    const first = runtime.execute(input);
    const replay = runtime.execute(input);
    expect(first.state).toBe("VERIFIED_LOCAL_EFFECT");
    expect(replay.state).toBe("VERIFIED_LOCAL_EFFECT");
    if (first.state !== "VERIFIED_LOCAL_EFFECT" || replay.state !== "VERIFIED_LOCAL_EFFECT") {
      throw new Error("expected_verified_effect");
    }
    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.verification.effect.effectRef).toBe(first.verification.effect.effectRef);
    expect(river.reservationCount()).toBe(1);
    expect(gate.executionCount()).toBe(1);
    expect(verifier.verificationCount()).toBe(1);
    expect(adapter.invocationCount()).toBe(1);
  });
});
