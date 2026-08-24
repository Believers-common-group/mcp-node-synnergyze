import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
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

function tokenDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const config: GoogleProviderConfigV1 = {
  providerRef: "GOOGLE_CLOUD",
  project: "synnergyze-test-project",
  location: "global",
  model: "gemini-2.5-flash",
  maxPromptChars: 64,
  maxOutputTokens: 128,
};

function authorityFixture(options: {
  bindingPrincipalRef?: string;
  providerConstraint?: boolean;
  requestConstraint?: boolean;
  prompt?: string;
} = {}): ProviderAuthorityGateInputV1 {
  const prompt = options.prompt ?? "analyse thermal state";
  const constraints: string[] = ["provider_identity_mode:ADC"];
  if (options.providerConstraint !== false) constraints.push("provider:GOOGLE_CLOUD");
  if (options.requestConstraint !== false) {
    constraints.push(`provider_request:${googleProviderRequestHashV1(config, prompt)}`);
  }
  const decision: WardenAllowDecisionV1 = {
    decisionRef: "WARDEN-DECISION:GOOGLE-R05-001",
    requestRef: "WARDEN-REQUEST:GOOGLE-R05-001",
    wardenRef: "WARDEN:ALPHA",
    action: "provider.execute",
    targetRef: "PROJECT:GYROCELL",
    reasonCodes: ["bounded_policy_allow"],
    constraints,
    decidedAt: "2026-08-24T05:30:00.000Z",
    validUntil: "2026-08-24T05:55:00.000Z",
    correlationId: "CORR:GOOGLE-R05-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:GOOGLE-R05-001",
  };
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: "WARDEN-CHECKPOINT:GOOGLE-R05-001",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: "2026-08-24T05:40:00.000Z",
    reasonCodes: ["current"],
  };
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:GOOGLE-R05-001",
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
    requestedAt: "2026-08-24T05:29:00.000Z",
    correlationId: decision.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:GOOGLE-R05-001",
    actionRef: action.actionRef,
    wardenDecisionRef: decision.decisionRef,
    correlationId: decision.correlationId,
    authorizationDigest: tokenDigest(decision.actionToken),
    state: "RESERVED",
    reservedAt: "2026-08-24T05:39:00.000Z",
  };
  const grant: ProviderAuthorityGrantV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    grantRef: "PROVIDER-GRANT:GOOGLE-R05-001",
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
    issuedAt: "2026-08-24T05:40:30.000Z",
  };
  const binding: ProviderPrincipalBindingV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    bindingRef: "PROVIDER-BINDING:GOOGLE-R05-001",
    agentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    providerPrincipalRef:
      options.bindingPrincipalRef ?? "adc://projects/synnergyze-test-project",
    state: "ACTIVE",
    boundAt: "2026-08-24T05:35:00.000Z",
  };
  const request: ProviderExecutionRequestV1 = {
    agentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    capabilityRef: action.capabilityRef,
    purposeRef: action.requestedEffect!,
    resourceRefs: [action.targetRef],
    requestedAt: "2026-08-24T05:41:00.000Z",
    correlationId: decision.correlationId,
  };

  return {
    grant,
    binding,
    request,
    action,
    reservation,
    decision,
    checkpoint,
    authorizedAt: "2026-08-24T05:42:00.000Z",
  };
}

function client(
  implementation?: GoogleGenerateContentClientV1["generateContent"],
): GoogleGenerateContentClientV1 {
  return {
    generateContent: vi.fn(
      implementation ??
        (async () => ({
          text: "validated result",
          responseId: "google-response-001",
          modelVersion: "gemini-2.5-flash-001",
        })),
    ),
  };
}

describe("Google reference adapter R0.5", () => {
  it("does not invoke Google when R0.4-B provider authority fails", async () => {
    const google = client();
    const adapter = new GoogleReferenceAdapterV1(config, google);
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    await expect(
      adapter.execute({
        authority: authorityFixture({ providerConstraint: false }),
        identity,
        prompt: "analyse thermal state",
        completedAt: "2026-08-24T05:43:00.000Z",
      }),
    ).rejects.toThrow("provider_authority_provider_constraint_required");
    expect(google.generateContent).not.toHaveBeenCalled();
  });

  it("does not invoke Google when runtime identity does not match the provider binding", async () => {
    const google = client();
    const adapter = new GoogleReferenceAdapterV1(config, google);
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    await expect(
      adapter.execute({
        authority: authorityFixture({
          bindingPrincipalRef: "adc://projects/another-project",
        }),
        identity,
        prompt: "analyse thermal state",
        completedAt: "2026-08-24T05:43:00.000Z",
      }),
    ).rejects.toThrow("google_runtime_principal_binding_mismatch");
    expect(google.generateContent).not.toHaveBeenCalled();
  });

  it("fails closed on prompt and generation bounds before network invocation", async () => {
    const google = client();
    const adapter = new GoogleReferenceAdapterV1(config, google);
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    await expect(
      adapter.execute({
        authority: authorityFixture(),
        identity,
        prompt: "x".repeat(config.maxPromptChars + 1),
        completedAt: "2026-08-24T05:43:00.000Z",
      }),
    ).rejects.toThrow("google_prompt_limit_exceeded");
    expect(google.generateContent).not.toHaveBeenCalled();

    const invalidAdapter = new GoogleReferenceAdapterV1(
      { ...config, maxOutputTokens: 0 },
      google,
    );
    await expect(
      invalidAdapter.execute({
        authority: authorityFixture(),
        identity,
        prompt: "short",
        completedAt: "2026-08-24T05:43:00.000Z",
      }),
    ).rejects.toThrow("google_max_output_tokens_invalid");
    expect(google.generateContent).not.toHaveBeenCalled();
  });

  it("requires the exact Google provider request hash to be Warden-bound", async () => {
    const google = client();
    const adapter = new GoogleReferenceAdapterV1(config, google);
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    await expect(
      adapter.execute({
        authority: authorityFixture({ prompt: "authorized prompt" }),
        identity,
        prompt: "mutated prompt",
        completedAt: "2026-08-24T05:43:00.000Z",
      }),
    ).rejects.toThrow("google_provider_request_constraint_required");
    expect(google.generateContent).not.toHaveBeenCalled();
  });

  it("returns only bounded metadata and payload hashes on success", async () => {
    const google = client();
    const adapter = new GoogleReferenceAdapterV1(config, google);
    const authority = authorityFixture();
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    const result = await adapter.execute({
      authority,
      identity,
      prompt: "analyse thermal state",
      completedAt: "2026-08-24T05:43:00.000Z",
    });

    expect(result.state).toBe("SUCCEEDED");
    if (result.state !== "SUCCEEDED") throw new Error("google_success_expected");
    expect(google.generateContent).toHaveBeenCalledWith({
      model: config.model,
      prompt: "analyse thermal state",
      maxOutputTokens: config.maxOutputTokens,
    });
    expect(result.value).toMatchObject({
      providerRef: "GOOGLE_CLOUD",
      authorizationRef: result.authorization.authorizationRef,
      actionRef: authority.action.actionRef,
      reservationRef: authority.reservation.reservationRef,
      providerPrincipalRef: identity.principalRef,
      identityMode: "ADC",
      project: config.project,
      location: config.location,
      model: config.model,
      responseId: "google-response-001",
      modelVersion: "gemini-2.5-flash-001",
      completedAt: "2026-08-24T05:43:00.000Z",
    });
    expect(result.value.requestHash).toBe(
      googleProviderRequestHashV1(config, "analyse thermal state"),
    );
    expect(result.value.responseHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result.value)).not.toContain("token");
    expect(JSON.stringify(result.value)).not.toContain("credential");
  });

  it("preserves existing provider failure classification semantics", async () => {
    const google = client(async () => {
      throw new ProviderFailureErrorV1("PROVIDER_AUTH_DENIED", "google_iam_403");
    });
    const adapter = new GoogleReferenceAdapterV1(config, google);
    const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });

    const result = await adapter.execute({
      authority: authorityFixture(),
      identity,
      prompt: "analyse thermal state",
      completedAt: "2026-08-24T05:43:00.000Z",
    });

    expect(result.state).toBe("EXCEPTION");
    if (result.state !== "EXCEPTION") throw new Error("google_exception_expected");
    expect(result.exception).toMatchObject({
      exceptionClass: "PROVIDER_AUTH_EXCEPTION",
      failureKind: "PROVIDER_AUTH_DENIED",
      retryability: "NEVER",
      effectState: "NONE",
    });
  });
});
