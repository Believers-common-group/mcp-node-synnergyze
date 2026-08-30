import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import type {
  ProviderAuthorityGateInputV1,
  ProviderAuthorityGrantV1,
  ProviderExecutionRequestV1,
  ProviderPrincipalBindingV1,
} from "./contracts.ts";
import {
  determineProviderRecoveryV1,
  executeProviderAttemptV1,
  executeWithProviderAuthorityV1,
  ProviderFailureErrorV1,
} from "./runtime.ts";

function tokenDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const decision: WardenAllowDecisionV1 = {
  decisionRef: "WARDEN-DECISION:PROVIDER-001",
  requestRef: "WARDEN-REQUEST:PROVIDER-001",
  wardenRef: "WARDEN:ALPHA",
  action: "provider.execute",
  targetRef: "PROJECT:GYROCELL",
  reasonCodes: ["provider_authority_fixture_allow"],
  constraints: ["provider:GOOGLE_CLOUD"],
  decidedAt: "2026-08-24T04:00:00+05:30",
  validUntil: "2026-08-24T04:25:00+05:30",
  correlationId: "CORR:PROVIDER-001",
  decision: "ALLOW",
  actionToken: "WARDEN-ACTION-TOKEN:PROVIDER-001",
};

const checkpoint: WardenExecutionCheckpointV1 = {
  checkpointRef: "WARDEN-CHECKPOINT:PROVIDER-001",
  decisionRef: decision.decisionRef,
  wardenRef: decision.wardenRef,
  correlationId: decision.correlationId,
  state: "VALID",
  checkedAt: "2026-08-24T04:14:00+05:30",
  reasonCodes: ["provider_authority_fixture_current"],
};

const action: ActionEnvelopeV1 = {
  actionRef: "ACTION:PROVIDER-001",
  requestRef: decision.requestRef,
  actorRef: "AGENTME:ENGINEERING-017",
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
  reservationRef: "RIVER-RESERVATION:PROVIDER-001",
  actionRef: action.actionRef,
  wardenDecisionRef: decision.decisionRef,
  correlationId: decision.correlationId,
  authorizationDigest: tokenDigest(decision.actionToken),
  state: "RESERVED",
  reservedAt: "2026-08-24T04:13:00+05:30",
};

const grant: ProviderAuthorityGrantV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  grantRef: "PROVIDER-GRANT:001",
  actionRef: action.actionRef,
  reservationRef: reservation.reservationRef,
  wardenDecisionRef: decision.decisionRef,
  wardenCheckpointRef: checkpoint.checkpointRef,
  delegatedAgentRef: action.actorRef,
  providerRef: "GOOGLE_CLOUD",
  capabilityRef: action.capabilityRef,
  purposeRef: action.requestedEffect!,
  resourceRefs: [action.targetRef],
  correlationId: decision.correlationId,
  issuedAt: "2026-08-24T04:14:30+05:30",
};

const binding: ProviderPrincipalBindingV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  bindingRef: "PROVIDER-BINDING:001",
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

function fixture(
  overrides: Partial<ProviderAuthorityGateInputV1> = {},
): ProviderAuthorityGateInputV1 {
  return {
    grant,
    binding,
    request,
    action,
    reservation,
    decision,
    checkpoint,
    authorizedAt: "2026-08-24T04:15:00+05:30",
    ...overrides,
  };
}

describe("Provider authority gate R0.4-B", () => {
  it("A: authorizes a provider execution only through the existing Warden/River lineage", () => {
    const providerInvoke = vi.fn((authorization) => authorization);

    const authorization = executeWithProviderAuthorityV1(fixture(), providerInvoke);

    expect(providerInvoke).toHaveBeenCalledTimes(1);
    expect(authorization.state).toBe("AUTHORIZED");
    expect(authorization.grantRef).toBe(grant.grantRef);
    expect(authorization.actionRef).toBe(action.actionRef);
    expect(authorization.reservationRef).toBe(reservation.reservationRef);
    expect(authorization.wardenDecisionRef).toBe(decision.decisionRef);
    expect(authorization.wardenCheckpointRef).toBe(checkpoint.checkpointRef);
    expect(authorization.agentRef).toBe(grant.delegatedAgentRef);
    expect(authorization.providerRef).toBe(grant.providerRef);
    expect(authorization.providerPrincipalRef).toBe(binding.providerPrincipalRef);
  });

  it("B: fails closed on AgentMe/provider-principal substitution before provider invocation", () => {
    const providerInvoke = vi.fn();
    const substitutedBinding: ProviderPrincipalBindingV1 = {
      ...binding,
      agentRef: "AGENTME:SUBSTITUTED-999",
      providerPrincipalRef: "spiffe://agents.example/substituted-999",
    };

    expect(() =>
      executeWithProviderAuthorityV1(
        fixture({ binding: substitutedBinding }),
        providerInvoke,
      ),
    ).toThrow("provider_authority_binding_agent_mismatch");
    expect(providerInvoke).not.toHaveBeenCalled();
  });

  it("C: fails closed when a retry would outlive the original Warden decision", () => {
    const providerInvoke = vi.fn();

    expect(() =>
      executeWithProviderAuthorityV1(
        fixture({ authorizedAt: "2026-08-24T04:26:00+05:30" }),
        providerInvoke,
      ),
    ).toThrow("provider_authority_decision_expired");
    expect(providerInvoke).not.toHaveBeenCalled();
  });

  it("D: treats timeout after send as unknown effect requiring reconciliation", async () => {
    const providerInvoke = vi.fn(async () => {
      throw new ProviderFailureErrorV1("HTTP_TIMEOUT_AFTER_SEND", "socket_timeout_after_send");
    });

    const result = await executeProviderAttemptV1(fixture(), providerInvoke);

    expect(providerInvoke).toHaveBeenCalledTimes(1);
    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("provider_exception_expected");
    expect(result.exception.actionRef).toBe(action.actionRef);
    expect(result.exception.reservationRef).toBe(reservation.reservationRef);
    expect(result.exception.exceptionClass).toBe("NETWORK_EXCEPTION");
    expect(result.exception.effectState).toBe("UNKNOWN");
    expect(result.exception.retryability).toBe("AFTER_RECONCILIATION");
    expect(determineProviderRecoveryV1(result.exception)).toBe("RECONCILE_FIRST");
  });

  it("E: requires reauthorization before retrying a transient provider credential failure", async () => {
    const result = await executeProviderAttemptV1(fixture(), async () => {
      throw new ProviderFailureErrorV1("CREDENTIAL_TRANSIENT", "temporary_adc_failure");
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("provider_exception_expected");
    expect(result.exception.exceptionClass).toBe("CREDENTIAL_EXCEPTION");
    expect(result.exception.effectState).toBe("NONE");
    expect(result.exception.retryability).toBe("SAFE");
    expect(determineProviderRecoveryV1(result.exception)).toBe("RETRY_AFTER_REAUTHORIZATION");
  });

  it("F: aborts rather than retrying a provider IAM denial", async () => {
    const result = await executeProviderAttemptV1(fixture(), async () => {
      throw new ProviderFailureErrorV1("PROVIDER_AUTH_DENIED", "google_iam_403");
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("provider_exception_expected");
    expect(result.exception.exceptionClass).toBe("PROVIDER_AUTH_EXCEPTION");
    expect(result.exception.retryability).toBe("NEVER");
    expect(determineProviderRecoveryV1(result.exception)).toBe("ABORT");
  });

  it("G: contains an Agent Identity context mismatch as an E3 event", async () => {
    const result = await executeProviderAttemptV1(fixture(), async () => {
      throw new ProviderFailureErrorV1(
        "AGENT_IDENTITY_CONTEXT_MISMATCH",
        "context_aware_access_identity_mismatch",
      );
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("provider_exception_expected");
    expect(result.exception.exceptionClass).toBe("IDENTITY_EXCEPTION");
    expect(result.exception.severity).toBe("E3");
    expect(result.exception.retryability).toBe("NEVER");
    expect(determineProviderRecoveryV1(result.exception)).toBe("CONTAIN");
  });

  it("H: never turns an unacknowledged timeout directly into retry", async () => {
    const result = await executeProviderAttemptV1(fixture(), async () => {
      throw new ProviderFailureErrorV1("HTTP_TIMEOUT_AFTER_SEND", "timeout_without_ack");
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("provider_exception_expected");
    expect(result.exception.effectState).toBe("UNKNOWN");
    expect(determineProviderRecoveryV1(result.exception)).toBe("RECONCILE_FIRST");
    expect(determineProviderRecoveryV1(result.exception)).not.toBe("RETRY_AFTER_REAUTHORIZATION");
  });
});
