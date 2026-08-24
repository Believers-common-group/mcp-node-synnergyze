import { createHash } from "node:crypto";

import { expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import type {
  ProviderAuthorityGateInputV1,
  ProviderAuthorityGrantV1,
  ProviderExecutionRequestV1,
  ProviderPrincipalBindingV1,
} from "../contracts.ts";
import {
  GoogleReferenceAdapterV1,
  googleProviderRequestHashV1,
} from "./adapter.ts";
import type { GoogleProviderConfigV1 } from "./contracts.ts";
import { createGoogleGenAIClientV1 } from "./genai-client.ts";
import { resolveGoogleRuntimeIdentityV1 } from "./identity.ts";

function tokenDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const liveEnabled =
  process.env.GOOGLE_LIVE_PROVIDER_TEST === "1" &&
  Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());
const liveIt = liveEnabled ? it : it.skip;

liveIt("executes one bounded Vertex AI Gemini request using ADC", async () => {
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const project = process.env.GOOGLE_CLOUD_PROJECT!.trim();
  const config: GoogleProviderConfigV1 = {
    providerRef: "GOOGLE_CLOUD",
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
    model: process.env.GOOGLE_CLOUD_MODEL?.trim() || "gemini-2.5-flash",
    maxPromptChars: 128,
    maxOutputTokens: 32,
  };
  const prompt = "Reply with the single word OK.";
  const requestHash = googleProviderRequestHashV1(config, prompt);
  const actionToken = "WARDEN-ACTION-TOKEN:GOOGLE-LIVE-R05";
  const decision: WardenAllowDecisionV1 = {
    decisionRef: "WARDEN-DECISION:GOOGLE-LIVE-R05",
    requestRef: "WARDEN-REQUEST:GOOGLE-LIVE-R05",
    wardenRef: "WARDEN:LIVE-SMOKE",
    action: "provider.execute",
    targetRef: "PROJECT:GOOGLE-LIVE-SMOKE",
    reasonCodes: ["bounded_live_smoke_allow"],
    constraints: [
      "provider:GOOGLE_CLOUD",
      "provider_identity_mode:ADC",
      `provider_request:${requestHash}`,
    ],
    decidedAt: at(-60_000),
    validUntil: at(5 * 60_000),
    correlationId: "CORR:GOOGLE-LIVE-R05",
    decision: "ALLOW",
    actionToken,
  };
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:GOOGLE-LIVE-R05",
    requestRef: decision.requestRef,
    actorRef: "AGENTME:GOOGLE-LIVE-R05",
    representedPrincipalRef: "ENTERPRISE:SYNNERGYZE",
    actingCapacityRef: "CAPACITY:LIVE-PROVIDER-SMOKE",
    contextRef: "CONTEXT:GOOGLE-LIVE-R05",
    programRef: "PROGRAM:GOOGLE-REFERENCE-ADAPTER-R05",
    eventRef: "EVENT:GOOGLE-LIVE-R05",
    action: decision.action,
    capabilityRef: "google.genai.generate_content",
    targetRef: decision.targetRef,
    requestedEffect: "google.response.generated",
    wardenDecisionRef: decision.decisionRef,
    actionToken,
    requestedAt: at(-50_000),
    correlationId: decision.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:GOOGLE-LIVE-R05",
    actionRef: action.actionRef,
    wardenDecisionRef: decision.decisionRef,
    correlationId: decision.correlationId,
    authorizationDigest: tokenDigest(actionToken),
    state: "RESERVED",
    reservedAt: at(-40_000),
  };
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: "WARDEN-CHECKPOINT:GOOGLE-LIVE-R05",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: at(-30_000),
    reasonCodes: ["live_smoke_current"],
  };
  const grant: ProviderAuthorityGrantV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    grantRef: "PROVIDER-GRANT:GOOGLE-LIVE-R05",
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
    issuedAt: at(-20_000),
  };
  const binding: ProviderPrincipalBindingV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    bindingRef: "PROVIDER-BINDING:GOOGLE-LIVE-R05",
    agentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    providerPrincipalRef: `adc://projects/${project}`,
    state: "ACTIVE",
    boundAt: at(-70_000),
  };
  const request: ProviderExecutionRequestV1 = {
    agentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    capabilityRef: action.capabilityRef,
    purposeRef: action.requestedEffect!,
    resourceRefs: [action.targetRef],
    requestedAt: at(-10_000),
    correlationId: decision.correlationId,
  };
  const authority: ProviderAuthorityGateInputV1 = {
    grant,
    binding,
    request,
    action,
    reservation,
    decision,
    checkpoint,
    authorizedAt: at(0),
  };
  const identity = resolveGoogleRuntimeIdentityV1({ mode: "ADC", config });
  const adapter = new GoogleReferenceAdapterV1(config, createGoogleGenAIClientV1(config));

  const result = await adapter.execute({
    authority,
    identity,
    prompt,
    completedAt: at(1),
  });

  expect(result.state).toBe("SUCCEEDED");
  if (result.state !== "SUCCEEDED") throw new Error("google_live_smoke_expected_success");
  expect(result.value).toMatchObject({
    providerRef: "GOOGLE_CLOUD",
    project,
    location: config.location,
    model: config.model,
    requestHash,
    identityMode: "ADC",
  });
  expect(result.value.responseHash).toMatch(/^sha256:[a-f0-9]{64}$/);
});
