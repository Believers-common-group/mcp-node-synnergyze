import { describe, expect, it } from "vitest";
import type { WardenDecisionV1 } from "../warden/contracts.ts";
import {
  applyDestinationLicenceDecisionV1,
  createLicenceFederationObjectV1,
} from "./federated-mission.ts";

function allow(overrides: Partial<WardenDecisionV1> = {}): WardenDecisionV1 {
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
    ...overrides,
  } as WardenDecisionV1;
}

function deny(overrides: Partial<WardenDecisionV1> = {}): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:DENY-001",
    requestRef: "WARDEN-REQUEST:DENY-001",
    wardenRef: "WARDEN-IN",
    action: "federation.licence.present",
    targetRef: "PRODUCT-X-001",
    reasonCodes: ["required_authority_missing"],
    constraints: ["SYNTHETIC_REFERENCE_ONLY"],
    decidedAt: "2026-08-24T00:00:10.000Z",
    validUntil: "2026-08-24T00:10:00.000Z",
    correlationId: "CORR-DENY-001",
    decision: "DENY",
    ...overrides,
  } as WardenDecisionV1;
}

function sourceInput(sourceDecision: WardenDecisionV1) {
  return {
    federationId: "FED-IN-MY-LICENCE-001",
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
  } as const;
}

describe("VSR-FEDERATED-MISSION-REFERENCE-R1.0", () => {
  it("source ALLOW creates only a destination-ready object, never Malaysian local effect", () => {
    const result = createLicenceFederationObjectV1(sourceInput(allow()));

    expect(result.state).toBe("READY_FOR_DESTINATION");
    if (result.state !== "READY_FOR_DESTINATION") throw new Error("expected_ready");
    expect(result.federationObject.sourceWardenDecisionRef).toBe("WARDEN-DECISION:IN-001");
    expect(result.federationObject.localEffectRef).toBeUndefined();
  });

  it("source non-ALLOW fails closed", () => {
    const result = createLicenceFederationObjectV1(sourceInput(deny()));

    expect(result).toMatchObject({
      state: "SOURCE_EXCEPTION",
      reasonCode: "SOURCE_WARDEN_ALLOW_REQUIRED",
    });
  });

  it("creates Malaysian licence effect only after independent destination ALLOW", () => {
    const source = createLicenceFederationObjectV1(sourceInput(allow()));
    if (source.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");

    const destinationDecision = allow({
      decisionRef: "WARDEN-DECISION:MY-001",
      requestRef: "WARDEN-REQUEST:MY-001",
      wardenRef: "WARDEN-MY",
      action: "federation.licence.recognise",
      correlationId: "CORR-MY-LICENCE-001",
      actionToken: "WARDEN-ACTION-TOKEN:MY-001",
    });

    const result = applyDestinationLicenceDecisionV1({
      federationObject: source.federationObject,
      destinationDecision,
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result.state).toBe("LOCAL_EFFECT_CREATED");
    if (result.state !== "LOCAL_EFFECT_CREATED") throw new Error("expected_local_effect");
    expect(result.effect.domainRef).toBe("DOMAIN-MY");
    expect(result.effect.sourceWardenDecisionRef).toBe("WARDEN-DECISION:IN-001");
    expect(result.effect.destinationWardenDecisionRef).toBe("WARDEN-DECISION:MY-001");
  });

  it("destination DENY fails closed", () => {
    const source = createLicenceFederationObjectV1(sourceInput(allow()));
    if (source.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");

    const result = applyDestinationLicenceDecisionV1({
      federationObject: source.federationObject,
      destinationDecision: deny({
        decisionRef: "WARDEN-DECISION:MY-DENY-001",
        wardenRef: "WARDEN-MY",
        action: "federation.licence.recognise",
      }),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result).toMatchObject({
      state: "DESTINATION_EXCEPTION",
      reasonCode: "DESTINATION_WARDEN_ALLOW_REQUIRED",
    });
  });

  it("rejects reuse of source Warden as destination authority", () => {
    const source = createLicenceFederationObjectV1(sourceInput(allow()));
    if (source.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");

    const result = applyDestinationLicenceDecisionV1({
      federationObject: source.federationObject,
      destinationDecision: allow({
        decisionRef: "WARDEN-DECISION:MY-001",
        action: "federation.licence.recognise",
        correlationId: "CORR-MY-LICENCE-001",
      }),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result).toMatchObject({
      state: "DESTINATION_EXCEPTION",
      reasonCode: "DESTINATION_WARDEN_NOT_INDEPENDENT",
    });
  });

  it("rejects destination decision bound to a different product", () => {
    const source = createLicenceFederationObjectV1(sourceInput(allow()));
    if (source.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");

    const result = applyDestinationLicenceDecisionV1({
      federationObject: source.federationObject,
      destinationDecision: allow({
        decisionRef: "WARDEN-DECISION:MY-001",
        wardenRef: "WARDEN-MY",
        action: "federation.licence.recognise",
        targetRef: "PRODUCT-Y-001",
        correlationId: "CORR-MY-LICENCE-001",
      }),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result).toMatchObject({
      state: "DESTINATION_EXCEPTION",
      reasonCode: "DESTINATION_DECISION_LINEAGE_MISMATCH",
    });
  });
});
