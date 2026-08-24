import type {
  AuthorizedProviderExecutionV1,
  ProviderAttemptResultV1,
  ProviderAuthorityGateInputV1,
} from "../contracts.ts";
import {
  authorizeProviderExecutionV1,
  classifyProviderFailureV1,
  hashProviderPayloadV1,
  ProviderFailureErrorV1,
} from "../runtime.ts";
import type {
  GoogleGenerateContentClientV1,
  GoogleProviderCallReceiptV1,
  GoogleProviderConfigV1,
  GoogleRuntimeIdentityContextV1,
} from "./contracts.ts";
import { assertGoogleIdentityBindingV1 } from "./identity.ts";

const MAX_SUPPORTED_OUTPUT_TOKENS = 8_192;

function requireNonEmpty(value: string, code: string): void {
  if (!value.trim()) throw new Error(code);
}

function assertConfig(config: GoogleProviderConfigV1): void {
  if (config.providerRef !== "GOOGLE_CLOUD") throw new Error("google_provider_ref_invalid");
  requireNonEmpty(config.project, "google_project_required");
  requireNonEmpty(config.location, "google_location_required");
  requireNonEmpty(config.model, "google_model_required");
  if (!Number.isSafeInteger(config.maxPromptChars) || config.maxPromptChars <= 0) {
    throw new Error("google_max_prompt_chars_invalid");
  }
  if (
    !Number.isSafeInteger(config.maxOutputTokens) ||
    config.maxOutputTokens <= 0 ||
    config.maxOutputTokens > MAX_SUPPORTED_OUTPUT_TOKENS
  ) {
    throw new Error("google_max_output_tokens_invalid");
  }
}

function assertPrompt(prompt: string, config: GoogleProviderConfigV1): void {
  if (!prompt.trim()) throw new Error("google_prompt_required");
  if (prompt.length > config.maxPromptChars) throw new Error("google_prompt_limit_exceeded");
}

function assertCompletedAt(completedAt: string, authorizedAt: string): void {
  const completed = Date.parse(completedAt);
  const authorized = Date.parse(authorizedAt);
  if (!Number.isFinite(completed)) throw new Error("google_completed_at_invalid");
  if (!Number.isFinite(authorized)) throw new Error("google_authorized_at_invalid");
  if (completed < authorized) throw new Error("google_completed_before_authorization");
}

export function googleProviderRequestHashV1(
  config: GoogleProviderConfigV1,
  prompt: string,
): string {
  return hashProviderPayloadV1(
    JSON.stringify({
      providerRef: config.providerRef,
      project: config.project,
      location: config.location,
      model: config.model,
      prompt,
      maxOutputTokens: config.maxOutputTokens,
    }),
  );
}

export interface GoogleProviderPreflightV1 {
  authorization: AuthorizedProviderExecutionV1;
  requestHash: string;
}

export class GoogleReferenceAdapterV1 {
  constructor(
    private readonly config: GoogleProviderConfigV1,
    private readonly client: GoogleGenerateContentClientV1,
  ) {}

  preflight(input: {
    authority: ProviderAuthorityGateInputV1;
    identity: GoogleRuntimeIdentityContextV1;
    prompt: string;
    completedAt: string;
  }): GoogleProviderPreflightV1 {
    const authorization = authorizeProviderExecutionV1(input.authority);
    assertGoogleIdentityBindingV1(input.identity, input.authority.binding);
    assertConfig(this.config);
    assertPrompt(input.prompt, this.config);
    const requestHash = googleProviderRequestHashV1(this.config, input.prompt);
    if (!input.authority.decision.constraints.includes(`provider_request:${requestHash}`)) {
      throw new Error("google_provider_request_constraint_required");
    }
    assertCompletedAt(input.completedAt, authorization.authorizedAt);
    return { authorization, requestHash };
  }

  async execute(input: {
    authority: ProviderAuthorityGateInputV1;
    identity: GoogleRuntimeIdentityContextV1;
    prompt: string;
    completedAt: string;
  }): Promise<ProviderAttemptResultV1<GoogleProviderCallReceiptV1>> {
    const { authorization, requestHash } = this.preflight(input);

    try {
      const response = await this.client.generateContent({
        model: this.config.model,
        prompt: input.prompt,
        maxOutputTokens: this.config.maxOutputTokens,
      });
      requireNonEmpty(response.text, "google_empty_response");

      const responseHash = hashProviderPayloadV1(
        JSON.stringify({
          text: response.text,
          responseId: response.responseId ?? null,
          modelVersion: response.modelVersion ?? null,
        }),
      );
      const receipt: GoogleProviderCallReceiptV1 = {
        providerRef: "GOOGLE_CLOUD",
        authorizationRef: authorization.authorizationRef,
        actionRef: authorization.actionRef,
        reservationRef: authorization.reservationRef,
        providerPrincipalRef: input.identity.principalRef,
        identityMode: input.identity.mode,
        project: this.config.project,
        location: this.config.location,
        model: this.config.model,
        requestHash,
        responseHash,
        responseId: response.responseId,
        modelVersion: response.modelVersion,
        completedAt: input.completedAt,
      };

      return {
        state: "SUCCEEDED",
        authorization,
        value: receipt,
      };
    } catch (error) {
      if (!(error instanceof ProviderFailureErrorV1)) throw error;
      return {
        state: "EXCEPTION",
        authorization,
        exception: classifyProviderFailureV1(authorization, error),
      };
    }
  }
}
