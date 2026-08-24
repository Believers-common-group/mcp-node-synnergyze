import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import {
  ControlledExecutionGateV1,
  type ControlledExecutionRequestV1,
} from "../../synnergyze/execution-gate.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import type {
  ProviderAuthorityGateInputV1,
  ProviderAuthorityGrantV1,
  ProviderExecutionRequestV1,
  ProviderPrincipalBindingV1,
} from "../contracts.ts";
import { ProviderFailureErrorV1 } from "../runtime.ts";
import {
  GoogleReferenceAdapterV1,
  googleProviderRequestHashV1,
} from "./adapter.ts";
import type {
  GoogleGenerateContentClientV1,
  GoogleProviderConfigV1,
} from "./contracts.ts";
import { resolveGoogleRuntimeIdentityV1 } from "./identity.ts";
import {
  GoogleControlledExecutionServiceV1,
  GoogleProviderDispatchAdapterV1,
} from "./integration.ts";

function tokenDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const PROMPT = "analyse thermal state";

const config: GoogleProviderConfigV1 = {
  providerRef: "GOOGLE_CLOUD",
  project: "synnergyze-test-project",
  location: "global",
  model: "gemini-2.5-flash",
  maxPromptChars: 128,
  maxOutputTokens: 128,
};

function fixture(): {
  authority: ProviderAuthorityGateInputV1;
  controlledExecution: ControlledExecutionRequestV1;
} {
  const decision: WardenAllowDecisionV1 = {
    decisionRef: "WARDEN-DECISION:GOOGLE-INTEGRATION-001",
    requestRef: "WARDEN-REQUEST:GOOGLE-INTEGRATION-001",
    wardenRef: "WARDEN:ALPHA",
    action: "provider.execute",
    targetRef: "PROJECT:GYROCELL",
    reasonCodes: ["bounded_policy_allow"],
    constraints: [
      "provider:GOOGLE_CLOUD",
      `provider_request:${googleProviderRequestHashV1(config, PROMPT)}`,
    ],
    decidedAt: "2026-08-24T06:00:00.000Z",
    validUntil: "2026-08-24T06:25:00.000Z",
    correlationId: "CORR:GOOGLE-INTEGRATION-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:GOOGLE-INTEGRATION-001",
  };
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:GOOGLE-INTEGRATION-001",
    requestRef: decision.requestRef,
    actorRef: "AGENTME:ENGINEERING-017",
    representedPrincipalRef: "ENTERPRISE:SYNNERGYZE",
    actingCapacityRef: "CAPACITY:ENGINEERING-AGENT",
    contextRef: "CONTEXT:ENGINEERING",
    programRef: "PROGRAM:GYROCELL",
    eventRef: "EVENT:THERMAL-VALIDATION-002",
    action: decision.action,
    capabilityRef: "engineering.analyse",
    targetRef: decision.targetRef,
    requestedEffect: "thermal_validation",
    wardenDecisionRef: decision.decisionRef,
    actionToken: decision.actionToken,
    requestedAt: "2026-08-24T05:59:00.000Z",
    correlationId: decision.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:GOOGLE-INTEGRATION-001",
    actionRef: action.actionRef,
    wardenDecisionRef: decision.decisionRef,
    correlationId: decision.correlationId,
    authorizationDigest: tokenDigest(decision.actionToken),
    state: "RESERVED",
    reservedAt: "2026-08-24T06:09:00.000Z",
  };
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: "WARDEN-CHECKPOINT:GOOGLE-INTEGRATION-001",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: "2026-08-24T06:10:00.000Z",
    reasonCodes: ["current"],
  };
  const grant: ProviderAuthorityGrantV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    grantRef: "PROVIDER-GRANT:GOOGLE-INTEGRATION-001",
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
    issuedAt: "2026-08-24T06:10:30.000Z",
  };
  const binding: ProviderPrincipalBindingV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    bindingRef: "PROVIDER-BINDING:GOOGLE-INTEGRATION-001",
    agentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    providerPrincipalRef: "adc://projects/synnergyze-test-project",
    state: "ACTIVE",
    boundAt: "2026-08-24T06:05:00.000Z",
  };
  const request: ProviderExecutionRequestV1 = {
    agentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    capabilityRef: action.capabilityRef,
    purposeRef: action.requestedEffect!,
    resourceRefs: [action.targetRef],
    requestedAt: "2026-08-24T06:11:00.000Z",
    correlationId: decision.correlationId,
  };
  const authorizedAt = "2026-08-24T06:12:00.000Z";
  return {
    authority: {
      grant,
      binding,
      request,
      action,
      reservation,
      decision,
      checkpoint,
      authorizedAt,
    },
    controlledExecution: {
      action,
      reservation,
      decision,
      checkpoint,
      executedAt: authorizedAt,
    },
  };
}

function serviceWith(
  generateContent: GoogleGenerateContentClientV1["generateContent"],
) {
  const client: GoogleGenerateContentClientV1 = {
    generateContent: vi.fn(generateContent),
  };
  const gate = new ControlledExecutionGateV1([
    new GoogleProviderDispatchAdapterV1("engineering.analyse"),
  ]);
  const google = new GoogleReferenceAdapterV1(config, client);
  return {
    client,
    service: new GoogleControlledExecutionServiceV1(gate, google),
  };
}

describe("Google canonical controlled execution integration R0.5", () => {
  it("binds the Google call to the one canonical ControlledExecutionGate receipt", async () => {
    const { service, client } = serviceWith(async () => ({
      text: "thermal analysis complete",
      responseId: "google-response-integration-001",
    }));
    const { authority, controlledExecution } = fixture();
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    const result = await service.execute({
      providerAuthority: authority,
      controlledExecution,
      identity,
      prompt: PROMPT,
      completedAt: "2026-08-24T06:13:00.000Z",
    });

    expect(result.state).toBe("PROVIDER_SUCCEEDED");
    if (result.state !== "PROVIDER_SUCCEEDED") throw new Error("provider_success_expected");
    expect(result.receipt.receiptRef).toMatch(/^SYNNERGYZE-EXECUTION-RECEIPT:/);
    expect(result.receipt.actionRef).toBe(authority.action.actionRef);
    expect(result.receipt.reservationRef).toBe(authority.reservation.reservationRef);
    expect(result.providerCall.executionReceiptRef).toBe(result.receipt.receiptRef);
    expect(result.providerCall.authorizationRef).toBe(result.authorization.authorizationRef);
    expect(client.generateContent).toHaveBeenCalledTimes(1);
  });

  it("reuses canonical execution and provider-call evidence on exact replay without calling Google twice", async () => {
    const { service, client } = serviceWith(async () => ({ text: "stable result" }));
    const input = fixture();
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });
    const request = {
      providerAuthority: input.authority,
      controlledExecution: input.controlledExecution,
      identity,
      prompt: PROMPT,
      completedAt: "2026-08-24T06:13:00.000Z",
    };

    const first = await service.execute(request);
    const replay = await service.execute(request);

    expect(first.receipt.receiptRef).toBe(replay.receipt.receiptRef);
    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(client.generateContent).toHaveBeenCalledTimes(1);
    expect(replay.providerEvidenceReplay).toBe(true);
  });

  it("preserves unknown Google effect as RECONCILE_FIRST against the canonical receipt", async () => {
    const { service } = serviceWith(async () => {
      throw new ProviderFailureErrorV1("HTTP_TIMEOUT_AFTER_SEND", "socket_timeout_after_send");
    });
    const { authority, controlledExecution } = fixture();
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    const result = await service.execute({
      providerAuthority: authority,
      controlledExecution,
      identity,
      prompt: PROMPT,
      completedAt: "2026-08-24T06:13:00.000Z",
    });

    expect(result.state).toBe("PROVIDER_EXCEPTION");
    if (result.state !== "PROVIDER_EXCEPTION") throw new Error("provider_exception_expected");
    expect(result.recoveryAction).toBe("RECONCILE_FIRST");
    expect(result.exception.effectState).toBe("UNKNOWN");
    expect(result.exception.executionReceiptRef).toBe(result.receipt.receiptRef);
  });
});
