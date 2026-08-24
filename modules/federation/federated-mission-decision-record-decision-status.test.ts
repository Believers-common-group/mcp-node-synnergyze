import { describe, expect, it } from "vitest";

import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type { DestinationFederationAuthorityBindingV1, LicenceFederationObjectV1 } from "./federated-mission.ts";
import type {
  FederationContractResolutionV1,
  FederatedLicenceEvidenceSuccessV1,
  TrustPathProofV1,
} from "./federated-mission-evidence.ts";
import { buildFederationDecisionRecordV1 } from "./federated-mission-decision-record.ts";

const federationObject: LicenceFederationObjectV1 = {
  federationId: "FED-IN-MY-LICENCE-001",
  missionRef: "MISSION-CREATOR-CROSSBORDER-001",
  sourceDomainRef: "DOMAIN-IN",
  destinationDomainRef: "DOMAIN-MY",
  principalRef: "DM-IN-CREATOR-001",
  productRef: "PRODUCT-X-001",
  contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
  purpose: "CREATOR_IP_LICENSING",
  sourceWardenDecisionRef: "WARDEN-DECISION:IN-001",
  sourceWardenRef: "WARDEN-IN",
  sourceCorrelationId: "CORR-IN-LICENCE-001",
  createdAt: "2026-08-24T00:00:20.000Z",
  expiresAt: "2026-08-24T00:10:00.000Z",
};

const trustPathProof: TrustPathProofV1 = {
  proofRef: "TRUST-PATH-PROOF:IN-MY-001",
  status: "VALID",
  sourceDomainRef: "DOMAIN-IN",
  destinationDomainRef: "DOMAIN-MY",
  contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
  purpose: "CREATOR_IP_LICENSING",
  principalRef: "DM-IN-CREATOR-001",
  productRef: "PRODUCT-X-001",
  graphVersion: "FED-GRAPH:G12345",
  resolverRef: "SYN-NETWORK-ROUTE-RESOLVER-001",
  authoritativeSourceRefs: ["GENESIS:DOMAIN-IN", "GENESIS:DOMAIN-MY"],
  evidenceRefs: ["RIVER:TRUST-EDGE-IN-MY-001"],
  resolutionDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  resolvedAt: "2026-08-24T00:00:22.000Z",
  validUntil: "2026-08-24T00:10:00.000Z",
};

const contractResolution: FederationContractResolutionV1 = {
  resolutionRef: "FED-CONTRACT-RESOLUTION:IN-MY-001",
  status: "ACTIVE",
  contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
  sourceDomainRef: "DOMAIN-IN",
  destinationDomainRef: "DOMAIN-MY",
  purpose: "CREATOR_IP_LICENSING",
  validFrom: "2026-08-23T23:00:00.000Z",
  validUntil: "2026-08-24T01:00:00.000Z",
};

const binding: DestinationFederationAuthorityBindingV1 = {
  bindingRef: "FED-AUTH-BINDING:MY-001",
  wardenRef: "WARDEN-MY",
  domainRef: "DOMAIN-MY",
  contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
  status: "ACTIVE",
  validFrom: "2026-08-23T23:00:00.000Z",
  validUntil: "2026-08-24T01:00:00.000Z",
};

const governed = {
  state: "VERIFIED_LOCAL_EFFECT",
  federationId: "FED-IN-MY-LICENCE-001",
  trustPathProofRef: "TRUST-PATH-PROOF:IN-MY-001",
  contractResolutionRef: "FED-CONTRACT-RESOLUTION:IN-MY-001",
  destinationAuthorityBindingRef: "FED-AUTH-BINDING:MY-001",
  authorizationRequestRef: "WARDEN-REQUEST:FED:fixture",
  reservation: {
    reservationRef: "RIVER-RESERVATION:fixture",
    actionRef: "ACTION:fixture",
    wardenDecisionRef: "WARDEN-DECISION:MY-001",
    correlationId: "CORR-MY-LICENCE-001",
    authorizationDigest: "sha256:fixture",
    state: "RESERVED",
    reservedAt: "2026-08-24T00:00:35.000Z",
  },
  execution: {
    receiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:fixture",
    actionRef: "ACTION:fixture",
    reservationRef: "RIVER-RESERVATION:fixture",
    wardenDecisionRef: "WARDEN-DECISION:MY-001",
    checkpointRef: "WARDEN-CHECKPOINT:MY-001",
    programRef: "MISSION-CREATOR-CROSSBORDER-001",
    eventRef: "FED-IN-MY-LICENCE-001",
    capabilityRef: "federation.licence.recognise",
    targetRef: "PRODUCT-X-001",
    correlationId: "CORR-MY-LICENCE-001",
    adapterRef: "SYNTHETIC-FEDERATION-LICENCE-ADAPTER-001",
    adapterResultRef: "SYNTHETIC-FEDERATION-LICENCE:fixture",
    state: "EXECUTED_UNVERIFIED",
    executedAt: "2026-08-24T00:00:37.000Z",
    synthetic: true,
    idempotentReplay: false,
  },
  observation: {
    observationRef: "POST-EXECUTION-OBSERVATION:fixture",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:fixture",
    actionRef: "ACTION:fixture",
    programRef: "MISSION-CREATOR-CROSSBORDER-001",
    eventRef: "FED-IN-MY-LICENCE-001",
    targetRef: "PRODUCT-X-001",
    correlationId: "CORR-MY-LICENCE-001",
    observerRef: "SYNTHETIC-FEDERATION-LICENCE-OBSERVER-001",
    observedStateRef: "FEDERATION-LICENCE-STATE:RECOGNISED:fixture",
    observedAt: "2026-08-24T00:00:38.000Z",
    sourceEvidenceRef: "FEDERATION-OBSERVATION-EVIDENCE:fixture",
    synthetic: true,
  },
  verification: {
    state: "VERIFIED_EFFECT",
    effect: {
      effectRef: "VERIFIED-EFFECT:fixture",
      executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:fixture",
      reservationRef: "RIVER-RESERVATION:fixture",
      wardenDecisionRef: "WARDEN-DECISION:MY-001",
      programRef: "MISSION-CREATOR-CROSSBORDER-001",
      eventRef: "FED-IN-MY-LICENCE-001",
      correlationId: "CORR-MY-LICENCE-001",
      targetRef: "PRODUCT-X-001",
      observedStateRef: "FEDERATION-LICENCE-STATE:RECOGNISED:fixture",
      verifiedAt: "2026-08-24T00:00:39.000Z",
      verificationRef: "EFFECT-VERIFICATION:fixture",
      synthetic: true,
    },
    observationRef: "POST-EXECUTION-OBSERVATION:fixture",
    idempotentReplay: false,
  },
  idempotentReplay: false,
} as FederatedLicenceEvidenceSuccessV1;

describe("R1.4 decision status binding", () => {
  it("rejects a non-ALLOW destination decision even when decisionRef lineage is reused", () => {
    const destinationDecision: WardenDecisionV1 = {
      decisionRef: "WARDEN-DECISION:MY-001",
      requestRef: "WARDEN-REQUEST:FED:fixture",
      wardenRef: "WARDEN-MY",
      action: "federation.licence.recognise",
      targetRef: "PRODUCT-X-001",
      reasonCodes: ["policy_denied"],
      constraints: [],
      decidedAt: "2026-08-24T00:00:30.000Z",
      validUntil: "2026-08-24T00:10:00.000Z",
      correlationId: "CORR-MY-LICENCE-001",
      decision: "DENY",
    };

    const result = buildFederationDecisionRecordV1({
      federationObject,
      trustPathProof,
      contractResolution,
      destinationAuthorityBinding: binding,
      destinationDecision,
      governed,
      recordedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "DECISION_RECORD_LINEAGE_MISMATCH",
    });
  });
});
