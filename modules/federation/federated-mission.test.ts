import { describe, expect, it } from "vitest";

import type { WardenDecisionV1 } from "../warden/contracts.ts";
import {
  LicenceFederationRuntimeV1,
  createLicenceFederationObjectV1,
  type DestinationFederationAuthorityBindingV1,
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

function destinationAllow(overrides: Partial<WardenDecisionV1> = {}): WardenDecisionV1 {
  return allow({
    decisionRef: "WARDEN-DECISION:MY-001",
    requestRef: "WARDEN-REQUEST:MY-001",
    wardenRef: "WARDEN-MY",
    action: "federation.licence.recognise",
    decidedAt: "2026-08-24T00:00:30.000Z",
    correlationId: "CORR-MY-LICENCE-001",
    actionToken: "WARDEN-ACTION-TOKEN:MY-001",
    ...overrides,
  });
}

function destinationBinding(
  overrides: Partial<DestinationFederationAuthorityBindingV1> = {},
): DestinationFederationAuthorityBindingV1 {
  return {
    bindingRef: "FED-AUTH-BINDING:MY-001",
    wardenRef: "WARDEN-MY",
    domainRef: "DOMAIN-MY",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    status: "ACTIVE",
    validFrom: "2026-08-23T23:00:00.000Z",
    validUntil: "2026-08-24T01:00:00.000Z",
    ...overrides,
  };
}

function readyObject() {
  const source = createLicenceFederationObjectV1(sourceInput(allow()));
  if (source.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");
  return source.federationObject;
}

describe("VSR-FEDERATED-MISSION-REFERENCE-R1.1", () => {
  it("source ALLOW creates only a destination-ready object", () => {
    const result = createLicenceFederationObjectV1(sourceInput(allow()));
    expect(result.state).toBe("READY_FOR_DESTINATION");
    if (result.state !== "READY_FOR_DESTINATION") throw new Error("expected_ready");
    expect(result.federationObject.localEffectRef).toBeUndefined();
  });

  it("source non-ALLOW fails closed", () => {
    expect(createLicenceFederationObjectV1(sourceInput(deny()))).toMatchObject({
      state: "SOURCE_EXCEPTION",
      reasonCode: "SOURCE_WARDEN_ALLOW_REQUIRED",
    });
  });

  it("creates Malaysian effect only through independently bound destination authority", () => {
    const result = new LicenceFederationRuntimeV1().applyDestinationDecision({
      federationObject: readyObject(),
      destinationDecision: destinationAllow(),
      destinationAuthorityBinding: destinationBinding(),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });
    expect(result.state).toBe("LOCAL_EFFECT_CREATED");
    if (result.state !== "LOCAL_EFFECT_CREATED") throw new Error("expected_local_effect");
    expect(result.effect).toMatchObject({
      domainRef: "DOMAIN-MY",
      sourceWardenDecisionRef: "WARDEN-DECISION:IN-001",
      destinationWardenDecisionRef: "WARDEN-DECISION:MY-001",
    });
  });

  it("fails closed on destination denial, Warden reuse, and product mismatch", () => {
    const federationObject = readyObject();
    expect(
      new LicenceFederationRuntimeV1().applyDestinationDecision({
        federationObject,
        destinationDecision: deny({
          decisionRef: "WARDEN-DECISION:MY-DENY-001",
          wardenRef: "WARDEN-MY",
          action: "federation.licence.recognise",
          decidedAt: "2026-08-24T00:00:30.000Z",
        }),
        destinationAuthorityBinding: destinationBinding(),
        recognisedAt: "2026-08-24T00:00:40.000Z",
      }),
    ).toMatchObject({ reasonCode: "DESTINATION_WARDEN_ALLOW_REQUIRED" });

    expect(
      new LicenceFederationRuntimeV1().applyDestinationDecision({
        federationObject,
        destinationDecision: destinationAllow({ wardenRef: "WARDEN-IN" }),
        destinationAuthorityBinding: destinationBinding({ wardenRef: "WARDEN-IN" }),
        recognisedAt: "2026-08-24T00:00:40.000Z",
      }),
    ).toMatchObject({ reasonCode: "DESTINATION_WARDEN_NOT_INDEPENDENT" });

    expect(
      new LicenceFederationRuntimeV1().applyDestinationDecision({
        federationObject,
        destinationDecision: destinationAllow({ targetRef: "PRODUCT-Y-001" }),
        destinationAuthorityBinding: destinationBinding(),
        recognisedAt: "2026-08-24T00:00:40.000Z",
      }),
    ).toMatchObject({ reasonCode: "DESTINATION_DECISION_LINEAGE_MISMATCH" });
  });

  it("requires exact Warden, domain, contract, active status, and valid binding time", () => {
    const federationObject = readyObject();
    const cases = [
      [destinationBinding({ wardenRef: "WARDEN-MY-OTHER" }), "DESTINATION_AUTHORITY_BINDING_MISMATCH"],
      [destinationBinding({ domainRef: "DOMAIN-SG" }), "DESTINATION_DOMAIN_BINDING_MISMATCH"],
      [
        destinationBinding({ contractRef: "FED-CONTRACT-IN-MY-CREATOR-999" }),
        "DESTINATION_CONTRACT_BINDING_MISMATCH",
      ],
      [destinationBinding({ status: "REVOKED" }), "DESTINATION_AUTHORITY_NOT_ACTIVE"],
      [
        destinationBinding({ validFrom: "2026-08-24T00:00:35.000Z" }),
        "DESTINATION_AUTHORITY_TIME_INVALID",
      ],
    ] as const;

    for (const [destinationAuthorityBinding, reasonCode] of cases) {
      const result = new LicenceFederationRuntimeV1().applyDestinationDecision({
        federationObject,
        destinationDecision: destinationAllow(),
        destinationAuthorityBinding,
        recognisedAt: "2026-08-24T00:00:40.000Z",
      });
      expect(result).toMatchObject({ state: "DESTINATION_EXCEPTION", reasonCode });
    }
  });

  it("rejects expired federation object and destination decision", () => {
    const federationObject = readyObject();
    expect(
      new LicenceFederationRuntimeV1().applyDestinationDecision({
        federationObject: { ...federationObject, expiresAt: "2026-08-24T00:00:30.000Z" },
        destinationDecision: destinationAllow(),
        destinationAuthorityBinding: destinationBinding(),
        recognisedAt: "2026-08-24T00:00:40.000Z",
      }),
    ).toMatchObject({ reasonCode: "FEDERATION_OBJECT_EXPIRED" });

    expect(
      new LicenceFederationRuntimeV1().applyDestinationDecision({
        federationObject,
        destinationDecision: destinationAllow({ validUntil: "2026-08-24T00:00:35.000Z" }),
        destinationAuthorityBinding: destinationBinding(),
        recognisedAt: "2026-08-24T00:00:40.000Z",
      }),
    ).toMatchObject({ reasonCode: "DESTINATION_DECISION_EXPIRED" });
  });

  it("replays later-clock duplicate idempotently and rejects mutated replay", () => {
    const runtime = new LicenceFederationRuntimeV1();
    const input = {
      federationObject: readyObject(),
      destinationDecision: destinationAllow(),
      destinationAuthorityBinding: destinationBinding(),
    } as const;
    const first = runtime.applyDestinationDecision({ ...input, recognisedAt: "2026-08-24T00:00:40.000Z" });
    const replay = runtime.applyDestinationDecision({ ...input, recognisedAt: "2026-08-24T00:05:00.000Z" });
    expect(first.state).toBe("LOCAL_EFFECT_CREATED");
    expect(replay.state).toBe("LOCAL_EFFECT_CREATED");
    if (first.state !== "LOCAL_EFFECT_CREATED" || replay.state !== "LOCAL_EFFECT_CREATED") {
      throw new Error("expected_local_effect");
    }
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.effect).toEqual(first.effect);
    expect(replay.river).toEqual(first.river);
    expect(runtime.effectCount()).toBe(1);

    expect(
      runtime.applyDestinationDecision({
        ...input,
        federationObject: { ...input.federationObject, contractRef: "FED-CONTRACT-IN-MY-CREATOR-002" },
        destinationAuthorityBinding: destinationBinding({ contractRef: "FED-CONTRACT-IN-MY-CREATOR-002" }),
        recognisedAt: "2026-08-24T00:05:00.000Z",
      }),
    ).toMatchObject({ reasonCode: "FEDERATION_REPLAY_CONFLICT" });
  });

  it("emits causally linked synthetic non-persisted River receipts", () => {
    const result = new LicenceFederationRuntimeV1().applyDestinationDecision({
      federationObject: readyObject(),
      destinationDecision: destinationAllow(),
      destinationAuthorityBinding: destinationBinding(),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });
    expect(result.state).toBe("LOCAL_EFFECT_CREATED");
    if (result.state !== "LOCAL_EFFECT_CREATED") throw new Error("expected_local_effect");
    expect(result.river.destinationAcceptedEvent.eventType).toBe("FEDERATION_DESTINATION_ACCEPTED");
    expect(result.river.destinationAcceptedReceipt).toMatchObject({ synthetic: true, persisted: false });
    expect(result.river.localEffectEvent.predecessorEventRef).toBe(result.river.destinationAcceptedEvent.eventRef);
    expect(result.river.localEffectReceipt).toMatchObject({ synthetic: true, persisted: false });
    expect(result.river.effectReceipt).toMatchObject({ targetRef: "PRODUCT-X-001", synthetic: true, persisted: false });
  });
});
