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
  buildFederationAuthorizationBindingV1,
  computeTrustPathProofDigestV1,
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
  const base = {
    proofRef: "TRUST-PATH-PROOF:IN-MY-001",
    status: "VALID" as const,
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    purpose: "CREATOR_IP_LICENSING",
    principalRef: "DM-IN-CREATOR-001",
    productRef: "PRODUCT-X-001",
    graphVersion: "FED-GRAPH:G12345",
    resolverRef: "SYN-NETWORK-ROUTE-RESOLVER-001",
    authoritativeSourceRefs: ["GENESIS:DOMAIN-IN", "GENESIS:DOMAIN-MY"],
    evidenceRefs: ["RIVER:TRUST-EDGE-IN-MY-001", "RIVER:CONTRACT-ACTIVE-001"],
    resolvedAt: "2026-08-24T00:00:22.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
  };
  const candidate = { ...base, ...overrides } as Omit<TrustPathProofV1, "resolutionDigest">;
  return {
    ...candidate,
    resolutionDigest: computeTrustPathProofDigestV1(candidate),
    ...(overrides.resolutionDigest ? { resolutionDigest: overrides.resolutionDigest } : {}),
  } as TrustPathProofV1;
}

function contractResolution(): FederationContractResolutionV1 {
  return {
    resolutionRef: "FED-CONTRACT-RESOLUTION:IN-MY-001",
    status: "ACTIVE",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    purpose: "CREATOR_IP_LICENSING",
    validFrom: "2026-08-23T23:00:00.000Z",
    validUntil: "2026-08-24T01:00:00.000Z",
  };
}

function authorityBinding(): DestinationFederationAuthorityBindingV1 {
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

function requestFor(trust: TrustPathProofV1): WardenDecisionRequestV1 {
  const contract = contractResolution();
  const binding = authorityBinding();
  const authorization = buildFederationAuthorizationBindingV1({
    federationObject: federationObject(),
    trustPathProof: trust,
    contractResolution: contract,
    destinationAuthorityBinding: binding,
  });
  return {
    requestRef: authorization.requestRef,
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
    representationSourceRefs: [
      trust.proofRef,
      contract.resolutionRef,
      authorization.trustPathDigestRef,
      authorization.contractResolutionDigestRef,
      authorization.destinationAuthorityDigestRef,
    ],
    requestedAt: "2026-08-24T00:00:25.000Z",
    correlationId: "CORR-MY-LICENCE-001",
  };
}

function decisionFor(request: WardenDecisionRequestV1): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:MY-001",
    requestRef: request.requestRef,
    wardenRef: "WARDEN-MY",
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: ["bounded_policy_allow"],
    constraints: ["SYNTHETIC_REFERENCE_ONLY"],
    decidedAt: "2026-08-24T00:00:30.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
    correlationId: request.correlationId,
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:MY-001",
  };
}

function checkpoint(decision: WardenDecisionV1): WardenExecutionCheckpointV1 {
  return {
    checkpointRef: "WARDEN-CHECKPOINT:MY-001",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: "2026-08-24T00:00:36.000Z",
    reasonCodes: ["decision_current"],
  };
}

function runtime() {
  const river = new SyntheticRiverReservationServiceV1();
  const adapter = new SyntheticFederationLicenceRecognitionAdapterV1();
  return {
    river,
    adapter,
    runtime: new FederatedLicenceEvidenceRuntimeV1({
      river,
      gate: new ControlledExecutionGateV1([adapter]),
      verifier: new EffectVerificationServiceV1(),
      observer: new SyntheticFederationLicenceObservationSourceV1(),
    }),
  };
}

describe("VSR-FEDERATED-MISSION-PROVENANCE-R1.3", () => {
  it("makes TrustPathProof digest stable across source/evidence ordering and sensitive to graph version", () => {
    const a = trustPath();
    const b = trustPath({
      authoritativeSourceRefs: [...a.authoritativeSourceRefs].reverse(),
      evidenceRefs: [...a.evidenceRefs].reverse(),
    });
    expect(b.resolutionDigest).toBe(a.resolutionDigest);

    const changed = trustPath({ graphVersion: "FED-GRAPH:G12346" });
    expect(changed.resolutionDigest).not.toBe(a.resolutionDigest);
  });

  it("binds trust/contract/authority digests into requestRef inherited by River reservation", () => {
    const trust = trustPath();
    const contract = contractResolution();
    const binding = authorityBinding();
    const request = requestFor(trust);
    const decision = decisionFor(request);
    const { runtime: governedRuntime } = runtime();

    const result = governedRuntime.execute({
      federationObject: federationObject(),
      trustPathProof: trust,
      contractResolution: contract,
      destinationAuthorityBinding: binding,
      destinationRequest: request,
      destinationDecision: decision,
      checkpoint: checkpoint(decision),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result.state).toBe("VERIFIED_LOCAL_EFFECT");
    if (result.state !== "VERIFIED_LOCAL_EFFECT") throw new Error("expected_verified_effect");
    expect(result.authorizationRequestRef).toBe(request.requestRef);
    expect(result.reservation.wardenDecisionRef).toBe(decision.decisionRef);
    expect(result.execution.actionRef).toBe(result.reservation.actionRef);
  });

  it("rejects trust-proof substitution after Warden authorization before any River reservation", () => {
    const authorisedTrust = trustPath();
    const substitutedTrust = trustPath({
      graphVersion: "FED-GRAPH:G12346",
      evidenceRefs: ["RIVER:TRUST-EDGE-SUBSTITUTED-999"],
    });
    const request = requestFor(authorisedTrust);
    const decision = decisionFor(request);
    const { runtime: governedRuntime, river, adapter } = runtime();

    const result = governedRuntime.execute({
      federationObject: federationObject(),
      trustPathProof: substitutedTrust,
      contractResolution: contractResolution(),
      destinationAuthorityBinding: authorityBinding(),
      destinationRequest: request,
      destinationDecision: decision,
      checkpoint: checkpoint(decision),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result).toMatchObject({
      state: "FEDERATION_EXCEPTION",
      reasonCode: "DESTINATION_REQUEST_PROVENANCE_MISMATCH",
    });
    expect(river.reservationCount()).toBe(0);
    expect(adapter.invocationCount()).toBe(0);
  });

  it("rejects a TrustPathProof whose claimed resolution digest is not reproducible", () => {
    const trust = trustPath({ resolutionDigest: "sha256:tampered" });
    const request = requestFor(trust);
    const decision = decisionFor(request);
    const { runtime: governedRuntime, river } = runtime();

    const result = governedRuntime.execute({
      federationObject: federationObject(),
      trustPathProof: trust,
      contractResolution: contractResolution(),
      destinationAuthorityBinding: authorityBinding(),
      destinationRequest: request,
      destinationDecision: decision,
      checkpoint: checkpoint(decision),
      reservedAt: "2026-08-24T00:00:35.000Z",
      executedAt: "2026-08-24T00:00:37.000Z",
      observedAt: "2026-08-24T00:00:38.000Z",
      verifiedAt: "2026-08-24T00:00:39.000Z",
    });

    expect(result).toMatchObject({
      state: "FEDERATION_EXCEPTION",
      reasonCode: "TRUST_PATH_PROVENANCE_INVALID",
    });
    expect(river.reservationCount()).toBe(0);
  });
});
