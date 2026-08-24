import { describe, expect, it, vi } from "vitest";

import { ProviderFailureErrorV1 } from "../runtime.ts";
import type { GoogleProviderConfigV1 } from "./contracts.ts";
import {
  createGoogleGenAIClientV1,
  mapGoogleGenAIErrorV1,
  type GoogleGenAIFactoryV1,
} from "./genai-client.ts";

const config: GoogleProviderConfigV1 = {
  providerRef: "GOOGLE_CLOUD",
  project: "synnergyze-test-project",
  location: "global",
  model: "gemini-2.5-flash",
  maxPromptChars: 4_096,
  maxOutputTokens: 256,
};

describe("Google GenAI ADC client R0.5", () => {
  it("constructs the current Gemini Enterprise / Vertex AI client with project, location and stable API", async () => {
    const generateContent = vi.fn(async () => ({
      text: "ok",
      responseId: "response-001",
      modelVersion: "gemini-2.5-flash-001",
    }));
    const factory = vi.fn(() => ({ models: { generateContent } })) as GoogleGenAIFactoryV1;

    const client = createGoogleGenAIClientV1(config, factory);
    const response = await client.generateContent({
      model: config.model,
      prompt: "hello",
      maxOutputTokens: 64,
    });

    expect(factory).toHaveBeenCalledWith({
      enterprise: true,
      project: config.project,
      location: config.location,
      apiVersion: "v1",
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: config.model,
      contents: "hello",
      config: { maxOutputTokens: 64 },
    });
    expect(response).toEqual({
      text: "ok",
      responseId: "response-001",
      modelVersion: "gemini-2.5-flash-001",
    });
  });

  it("maps an ADC/default-credential acquisition failure to the existing credential exception kind", () => {
    const mapped = mapGoogleGenAIErrorV1(
      new Error("Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication"),
    );

    expect(mapped).toBeInstanceOf(ProviderFailureErrorV1);
    expect(mapped.kind).toBe("CREDENTIAL_TRANSIENT");
  });

  it("maps Google 401/403 provider authorization failures without treating them as retryable credentials", () => {
    const mapped = mapGoogleGenAIErrorV1(
      Object.assign(new Error("Permission denied"), { status: 403 }),
    );

    expect(mapped.kind).toBe("PROVIDER_AUTH_DENIED");
  });

  it("maps uncertain network/timeout failures to reconcile-first semantics", () => {
    const mapped = mapGoogleGenAIErrorV1(
      Object.assign(new Error("socket timed out"), { code: "ETIMEDOUT" }),
    );

    expect(mapped.kind).toBe("HTTP_TIMEOUT_AFTER_SEND");
  });
});
