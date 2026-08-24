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

function binding(
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

function fixture() {
  const source = createLicenceFederationObjectV1({
    federationId: "FED-IN-MY-LICENCE-001",
    missionRef: "MISSION-CREATOR-CROSSBORDER-001",
    sourceDomainRef: "DOMAIN-IN",
    destinationDomainRef: "DOMAIN-MY",
    principalRef: "DM-IN-CREATOR-001",
    productRef: "PRODUCT-X-001",
    contractRef: "FED-CONTRACT-IN-MY-CREATOR-001",
    purpose: "CREATOR_IP_LICENSING",
    sourceDecision: allow(),
    createdAt: "2026-08-24T00:00:20.000Z",
    expiresAt: "2026-08-24T00:10:00.000Z",
  });
  if (source.state !== "READY_FOR_DESTINATION") throw new Error("expected_source_ready");

  return {
    federationObject: source.federationObject,
    destinationDecision: allow({
      decisionRef: "WARDEN-DECISION:MY-001",
      requestRef: "WARDEN-REQUEST:MY-001",
      wardenRef: "WARDEN-MY",
      action: "federation.licence.recognise",
      decidedAt: "2026-08-24T00:00:30.000Z",
      correlationId: "CORR-MY-LICENCE-001",
      actionToken: "WARDEN-ACTION-TOKEN:MY-001",
    }),
    destinationAuthorityBinding: binding(),
  };
}

describe("VSR-FEDERATED-MISSION-REFERENCE-R1.1", () => {
  it("returns the original effect on a later-clock duplicate instead of executing twice", () => {
    const runtime = new LicenceFederationRuntimeV1();
    const input = fixture();
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
  });

  it("rejects a binding for a different Warden even when domain and contract match", () => {
    const input = fixture();
    const result = new LicenceFederationRuntimeV1().applyDestinationDecision({
      ...input,
      destinationAuthorityBinding: binding({ wardenRef: "WARDEN-MY-OTHER" }),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result).toMatchObject({
      state: "DESTINATION_EXCEPTION",
      reasonCode: "DESTINATION_AUTHORITY_BINDING_MISMATCH",
    });
  });

  it("requires the authority binding to cover both destination decision and recognition time", () => {
    const input = fixture();
    const result = new LicenceFederationRuntimeV1().applyDestinationDecision({
      ...input,
      destinationAuthorityBinding: binding({ validFrom: "2026-08-24T00:00:35.000Z" }),
      recognisedAt: "2026-08-24T00:00:40.000Z",
    });

    expect(result).toMatchObject({
      state: "DESTINATION_EXCEPTION",
      reasonCode: "DESTINATION_AUTHORITY_TIME_INVALID",
    });
  });
});
