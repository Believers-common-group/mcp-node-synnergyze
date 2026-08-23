import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import type {
  ProviderAuthorityGateInputV1,
  ProviderAuthorityGrantV1,
  ProviderExecutionRequestV1,
  ProviderPrincipalBindingV1,
} from "./contracts.ts";
import * as providerRuntime from "./runtime.ts";

function tokenDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function fixture(options: {
  decisionConstraints?: readonly string[];
  actionActorRef?: string;
} = {}) {
  const decision: WardenAllowDecisionV1 = {
    decisionRef: "WARDEN-DECISION:BINDING-001",
    requestRef: "WARDEN-REQUEST:BINDING-001",
    wardenRef: "WARDEN:ALPHA",
    action: "provider.execute",
    targetRef: "PROJECT:GYROCELL",
    reasonCodes: ["bounded_policy_allow"],
    constraints: options.decisionConstraints ?? [],
    decidedAt: "2026-08-24T04:00:00+05:30",
    validUntil: "2026-08-24T04:25:00+05:30",
    correlationId: "CORR:BINDING-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:BINDING-001",
  };
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: "WARDEN-CHECKPOINT:BINDING-001",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: "2026-08-24T04:14:00+05:30",
    reasonCodes: ["current"],
  };
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:BINDING-001",
    requestRef: decision.requestRef,
    actorRef: options.actionActorRef ?? "AGENTME:ENGINEERING-017",
    representedPrincipalRef: "ENTERPRISE:SYNNERGYZE",
    actingCapacityRef: "CAPACITY:ENGINEERING-AGENT",
    contextRef: "CONTEXT:ENGINEERING",
    programRef: "PROGRAM:GYROCELL",
    eventRef: "EVENT:THERMAL-VALIDATION-001",
    action: decision.action,
    capabilityRef: "engineering.analyse",
    targetRef: decision.targetRef,
    requestedEffect: "thermal_validation",
    wardenDecisionRef: decision.decisionRef,
    actionToken: decision.actionToken,
    requestedAt: "2026-08-24T03:59:00+05:30",
    correlationId: decision.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:BINDING-001",
    actionRef: action.actionRef,
    wardenDecisionRef: decision.decisionRef,
    correlationId: decision.correlationId,
    authorizationDigest: tokenDigest(decision.actionToken),
    state: "RESERVED",
    reservedAt: "2026-08-24T04:13:00+05:30",
  };
  const grant: ProviderAuthorityGrantV1 & { actionRef: string; reservationRef: string } = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    grantRef: "PROVIDER-GRANT:BINDING-001",
    actionRef: action.actionRef,
    reservationRef: reservation.reservationRef,
    wardenDecisionRef: decision.decisionRef,
    wardenCheckpointRef: checkpoint.checkpointRef,
    delegatedAgentRef: "AGENTME:ENGINEERING-017",
    providerRef: "GOOGLE_CLOUD",
    capabilityRef: action.capabilityRef,
    purposeRef: action.requestedEffect!,
    resourceRefs: [action.targetRef],
    correlationId: decision.correlationId,
    issuedAt: "2026-08-24T04:14:30+05:30",
  };
  const binding: ProviderPrincipalBindingV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    bindingRef: "PROVIDER-BINDING:BINDING-001",
    agentRef: grant.delegatedAgentRef,
    providerRef: grant.providerRef,
    providerPrincipalRef: "spiffe://agents.example/engineering-017",
    state: "ACTIVE",
    boundAt: "2026-08-24T04:10:00+05:30",
  };
  const request: ProviderExecutionRequestV1 = {
    agentRef: grant.delegatedAgentRef,
    providerRef: grant.providerRef,
    capabilityRef: grant.capabilityRef,
    purposeRef: grant.purposeRef,
    resourceRefs: [...grant.resourceRefs],
    requestedAt: "2026-08-24T04:15:00+05:30",
    correlationId: grant.correlationId,
  };

  return {
    gate: {
      grant,
      binding,
      request,
      decision,
      checkpoint,
      action,
      reservation,
      authorizedAt: "2026-08-24T04:15:00+05:30",
    } as ProviderAuthorityGateInputV1 & {
      action: ActionEnvelopeV1;
      reservation: EvidenceReservationV1;
    },
  };
}

describe("Provider authority source binding review", () => {
  it("requires the selected provider to be explicitly bounded by the Warden decision constraints", () => {
    const { gate } = fixture({ decisionConstraints: [] });

    expect(() => providerRuntime.authorizeProviderExecutionV1(gate)).toThrow(
      "provider_authority_provider_constraint_required",
    );
  });

  it("rejects an AgentMe grant that is not the exact actor in the Warden/River action", () => {
    const { gate } = fixture({
      decisionConstraints: ["provider:GOOGLE_CLOUD"],
      actionActorRef: "AGENTME:SUBSTITUTED-999",
    });

    expect(() => providerRuntime.authorizeProviderExecutionV1(gate)).toThrow(
      "provider_authority_action_agent_mismatch",
    );
  });

  it("requires transient provider retry to pass through reauthorization rather than returning a bare RETRY", () => {
    const recovery = providerRuntime.determineProviderRecoveryV1({
      version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
      exceptionRef: "PROVIDER-EXCEPTION:CREDENTIAL-001",
      authorizationRef: "PROVIDER-AUTH:001",
      exceptionClass: "CREDENTIAL_EXCEPTION",
      effectState: "NONE",
      retryability: "SAFE",
      severity: "E1",
      failureKind: "CREDENTIAL_TRANSIENT",
      message: "temporary_adc_failure",
    });

    expect(recovery).toBe("RETRY_AFTER_REAUTHORIZATION");
  });

  it("exposes a provider-controlled wrapper around the existing ControlledExecutionGateV1", () => {
    expect("executeProviderControlledExecutionV1" in providerRuntime).toBe(true);
  });
});
