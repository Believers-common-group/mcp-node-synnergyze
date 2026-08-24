import type { ProviderPrincipalBindingV1 } from "../contracts.ts";
import type {
  GoogleIdentityModeV1,
  GoogleProviderConfigV1,
  GoogleRuntimeIdentityContextV1,
} from "./contracts.ts";

function requireNonEmpty(value: string, code: string): string {
  if (!value.trim()) throw new Error(code);
  return value;
}

function isAgentIdentityPrincipal(value: string): boolean {
  return value.startsWith("principal://agents.") || value.startsWith("spiffe://agents.");
}

export function resolveGoogleRuntimeIdentityV1(input: {
  mode: GoogleIdentityModeV1;
  config: GoogleProviderConfigV1;
  hostedPrincipalRef?: string;
}): GoogleRuntimeIdentityContextV1 {
  requireNonEmpty(input.config.project, "google_project_required");

  if (input.mode === "ADC") {
    if (input.hostedPrincipalRef) throw new Error("google_adc_hosted_principal_unexpected");
    return {
      mode: "ADC",
      principalRef: `adc://projects/${input.config.project}`,
      attested: false,
      source: "APPLICATION_DEFAULT_CREDENTIALS",
    };
  }

  const hostedPrincipalRef = requireNonEmpty(
    input.hostedPrincipalRef ?? "",
    "google_agent_identity_principal_required",
  );
  if (!isAgentIdentityPrincipal(hostedPrincipalRef)) {
    throw new Error("google_agent_identity_principal_invalid");
  }

  return {
    mode: "AGENT_IDENTITY",
    principalRef: hostedPrincipalRef,
    attested: true,
    source: "GOOGLE_AGENT_RUNTIME",
  };
}

export function assertGoogleIdentityBindingV1(
  identity: GoogleRuntimeIdentityContextV1,
  binding: ProviderPrincipalBindingV1,
): true {
  if (binding.providerRef !== "GOOGLE_CLOUD") {
    throw new Error("google_provider_binding_required");
  }
  if (binding.state !== "ACTIVE") {
    throw new Error(`google_provider_binding_${binding.state.toLowerCase()}`);
  }
  if (identity.principalRef !== binding.providerPrincipalRef) {
    throw new Error("google_runtime_principal_binding_mismatch");
  }
  if (identity.mode === "AGENT_IDENTITY" && !identity.attested) {
    throw new Error("google_agent_identity_attestation_required");
  }
  if (identity.mode === "ADC" && identity.attested) {
    throw new Error("google_adc_must_not_be_attested");
  }
  return true;
}
