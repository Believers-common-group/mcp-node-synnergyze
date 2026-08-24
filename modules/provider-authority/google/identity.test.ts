import { describe, expect, it } from "vitest";

import type { ProviderPrincipalBindingV1 } from "../contracts.ts";
import type { GoogleProviderConfigV1 } from "./contracts.ts";
import {
  assertGoogleIdentityBindingV1,
  resolveGoogleRuntimeIdentityV1,
} from "./identity.ts";

const config: GoogleProviderConfigV1 = {
  providerRef: "GOOGLE_CLOUD",
  project: "synnergyze-test-project",
  location: "global",
  model: "gemini-2.5-flash",
  maxPromptChars: 4_096,
  maxOutputTokens: 256,
};

function binding(providerPrincipalRef: string): ProviderPrincipalBindingV1 {
  return {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    bindingRef: "PROVIDER-BINDING:GOOGLE-R05-001",
    agentRef: "AGENTME:ENGINEERING-017",
    providerRef: "GOOGLE_CLOUD",
    providerPrincipalRef,
    state: "ACTIVE",
    boundAt: "2026-08-24T05:30:00.000Z",
  };
}

describe("Google runtime identity R0.5", () => {
  it("keeps ADC explicitly non-attested and distinct from Agent Identity", () => {
    const identity = resolveGoogleRuntimeIdentityV1({
      mode: "ADC",
      config,
    });

    expect(identity).toEqual({
      mode: "ADC",
      principalRef: "adc://projects/synnergyze-test-project",
      attested: false,
      source: "APPLICATION_DEFAULT_CREDENTIALS",
    });
  });

  it("rejects an ordinary service-account principal when Agent Identity mode is requested", () => {
    expect(() =>
      resolveGoogleRuntimeIdentityV1({
        mode: "AGENT_IDENTITY",
        config,
        hostedPrincipalRef: "serviceAccount:agent@example.iam.gserviceaccount.com",
      }),
    ).toThrow("google_agent_identity_principal_invalid");
  });

  it.each([
    "principal://agents.global.gcp.googleapis.com/projects/123/locations/global/reasoningEngines/456",
    "spiffe://agents.example/synnergyze/engineering-017",
  ])("accepts an explicit attested Agent Runtime principal: %s", (hostedPrincipalRef) => {
    const identity = resolveGoogleRuntimeIdentityV1({
      mode: "AGENT_IDENTITY",
      config,
      hostedPrincipalRef,
    });

    expect(identity).toEqual({
      mode: "AGENT_IDENTITY",
      principalRef: hostedPrincipalRef,
      attested: true,
      source: "GOOGLE_AGENT_RUNTIME",
    });
  });

  it("requires the runtime principal to exactly match the existing provider binding", () => {
    const identity = resolveGoogleRuntimeIdentityV1({
      mode: "AGENT_IDENTITY",
      config,
      hostedPrincipalRef:
        "principal://agents.global.gcp.googleapis.com/projects/123/locations/global/reasoningEngines/456",
    });

    expect(() =>
      assertGoogleIdentityBindingV1(
        identity,
        binding(
          "principal://agents.global.gcp.googleapis.com/projects/123/locations/global/reasoningEngines/999",
        ),
      ),
    ).toThrow("google_runtime_principal_binding_mismatch");

    expect(
      assertGoogleIdentityBindingV1(identity, binding(identity.principalRef)),
    ).toBe(true);
  });
});
