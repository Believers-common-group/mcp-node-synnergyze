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
  type FederatedLicenceEvidenceSuccessV1,
  type TrustPathProofV1,
} from "./federated-mission-evidence.ts";
import {
  AppendOnlyFederationDecisionRecordStoreV1,
  buildFederationDecisionRecordV1,
} from "./federated-mission-decision-record.ts";

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

function requestFor(
  trust: TrustPathProofV1,
  contract = contractResolution(),
  binding = authorityBinding(),
): WardenDecisionRequestV1 {
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

function verifiedExecution(trust = trustPath()) {
  const contract = contractResolution();
  const binding = authorityBinding();
  const request = requestFor(trust, contract, binding);
  const decision = decisionFor(request);
  const river = new SyntheticRiverReservationServiceV1();
  const adapter = new SyntheticFederationLicenceRecognitionAdapterV1();
  const runtime = new FederatedLicenceEvidenceRuntimeV1({
    river,
    gate: new ControlledExecutionGateV1([adapter]),
    verifier: new EffectVerificationServiceV1(),
    observer: new SyntheticFederationLicenceObservationSourceV1(),
  });
  const governed = runtime.execute({
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
  if (governed.state !== "VERIFIED_LOCAL_EFFECT") throw new Error("expected_verified_effect");
  return { trust, contract, binding, request, decision, governed };
}

function buildInput(overrides: Partial<{
  trustPathProof: TrustPathProofV1;
  governed: FederatedLicenceEvidenceSuccessV1;
  recordedAt: string;
}> = {}) {
  const fixture = verifiedExecution(overrides.trustPathProof ?? trustPath());
  return {
    federationObject: federationObject(),
    trustPathProof: overrides.trustPathProof ?? fixture.trust,
    contractResolution: fixture.contract,
    destinationAuthorityBinding: fixture.binding,
    destinationDecision: fixture.decision,
    governed: overrides.governed ?? fixture.governed,
    recordedAt: overrides.recordedAt ?? "2026-08-24T00:00:40.000Z",
  };
}

describe("VSR-FEDERATED-MISSION-DECISION-RECORD-R1.4", () => {
  it("builds one immutable evidence root only after a verified local effect", () => {
    const result = buildFederationDecisionRecordV1(buildInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reasonCode);

    expect(result.record).toMatchObject({
      federationId: "FED-IN-MY-LICENCE-001",
      missionRef: "MISSION-CREATOR-CROSSBORDER-001",
      sourceDecisionRef: "WARDEN-DECISION:IN-001",
      destinationDecisionRef: "WARDEN-DECISION:MY-001",
      trustPathProofRef: "TRUST-PATH-PROOF:IN-MY-001",
      trustGraphVersion: "FED-GRAPH:G12345",
      contractResolutionRef: "FED-CONTRACT-RESOLUTION:IN-MY-001",
      destinationAuthorityBindingRef: "FED-AUTH-BINDING:MY-001",
      synthetic: true,
      persisted: false,
    });
    expect(result.record.authorizationRequestRef).toMatch(/^WARDEN-REQUEST:FED:/);
    expect(result.record.riverReservationRef).toMatch(/^RIVER-RESERVATION:/);
    expect(result.record.executionReceiptRef).toMatch(/^SYNNERGYZE-EXECUTION-RECEIPT:/);
    expect(result.record.observationRef).toMatch(/^POST-EXECUTION-OBSERVATION:/);
    expect(result.record.verifiedEffectRef).toMatch(/^VERIFIED-EFFECT:/);
    expect(result.record.decisionTraceDigest).toMatch(/^sha256:/);
    expect(result.record.recordRef).toMatch(/^FEDERATION-DECISION-RECORD:/);
  });

  it("requires full reproducible Trust Path provenance before a decision record may be issued", () => {
    const legacyTrust: TrustPathProofV1 = {
      proofRef: "TRUST-PATH-PROOF:LEGACY-001",
      status: "VALID",
      sourceDomainRef: "DOMAIN-IN",
      destinationDomainRef: "DOMAIN-MY",
      contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
      purpose: "CREATOR_IP_LICENSING",
      principalRef: "DM-IN-CREATOR-001",
      productRef: "PRODUCT-X-001",
      resolvedAt: "2026-08-24T00:00:22.000Z",
      validUntil: "2026-08-24T00:10:00.000Z",
    };

    const result = buildFederationDecisionRecordV1(buildInput({ trustPathProof: legacyTrust }));
    expect(result).toMatchObject({
      ok: false,
      reasonCode: "DECISION_RECORD_TRUST_PROVENANCE_REQUIRED",
    });
  });

  it("rejects a verified-result lineage mutation rather than recording inconsistent evidence", () => {
    const fixture = verifiedExecution();
    const governed: FederatedLicenceEvidenceSuccessV1 = {
      ...fixture.governed,
      verification: {
        ...fixture.governed.verification,
        effect: {
          ...fixture.governed.verification.effect,
          wardenDecisionRef: "WARDEN-DECISION:MY-TAMPERED",
        },
      },
    };

    const result = buildFederationDecisionRecordV1({
      federationObject: federationObject(),
      trustPathProof: fixture.trust,
      contractResolution: fixture.contract,
      destinationAuthorityBinding: fixture.binding,
      destinationDecision: fixture.decision,
      governed,
      recordedAt: "2026-08-24T00:00:40.000Z",
    });
    expect(result).toMatchObject({
      ok: false,
      reasonCode: "DECISION_RECORD_LINEAGE_MISMATCH",
    });
  });

  it("appends exact record idempotently and rejects a second conflicting record for the same federation", () => {
    const built = buildFederationDecisionRecordV1(buildInput());
    if (!built.ok) throw new Error(built.reasonCode);
    const store = new AppendOnlyFederationDecisionRecordStoreV1();

    const first = store.append(built.record);
    const replay = store.append(built.record);
    expect(first.state).toBe("APPENDED");
    expect(replay).toMatchObject({ state: "APPENDED", idempotentReplay: true });
    expect(store.recordCount()).toBe(1);

    const later = buildFederationDecisionRecordV1(buildInput({
      recordedAt: "2026-08-24T00:00:41.000Z",
    }));
    if (!later.ok) throw new Error(later.reasonCode);
    const conflict = store.append(later.record);
    expect(conflict).toMatchObject({
      state: "REJECTED",
      reasonCode: "DECISION_RECORD_APPEND_CONFLICT",
    });
    expect(store.recordCount()).toBe(1);
  });

  it("rejects a record whose decision-trace digest was mutated after issuance", () => {
    const built = buildFederationDecisionRecordV1(buildInput());
    if (!built.ok) throw new Error(built.reasonCode);
    const store = new AppendOnlyFederationDecisionRecordStoreV1();
    const tampered = {
      ...built.record,
      verifiedEffectRef: "VERIFIED-EFFECT:TAMPERED",
    };

    const result = store.append(tampered);
    expect(result).toMatchObject({
      state: "REJECTED",
      reasonCode: "DECISION_RECORD_INTEGRITY_MISMATCH",
    });
    expect(store.recordCount()).toBe(0);
  });
});
