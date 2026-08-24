import { GoogleGenAI } from "@google/genai";

import { ProviderFailureErrorV1 } from "../runtime.ts";
import type {
  GoogleGenerateContentClientV1,
  GoogleProviderConfigV1,
} from "./contracts.ts";

interface GoogleGenAIResponseLikeV1 {
  text?: string;
  responseId?: string;
  modelVersion?: string;
}

interface GoogleGenAIClientLikeV1 {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config: { maxOutputTokens: number };
    }): Promise<GoogleGenAIResponseLikeV1>;
  };
}

export type GoogleGenAIFactoryV1 = (options: {
  enterprise: true;
  project: string;
  location: string;
  apiVersion: "v1";
}) => GoogleGenAIClientLikeV1;

const defaultFactory: GoogleGenAIFactoryV1 = (options) =>
  new GoogleGenAI(options) as unknown as GoogleGenAIClientLikeV1;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}

export function mapGoogleGenAIErrorV1(error: unknown): ProviderFailureErrorV1 {
  if (error instanceof ProviderFailureErrorV1) return error;

  const message = errorMessage(error);
  const lower = message.toLowerCase();
  const status = errorStatus(error);
  const code = errorCode(error)?.toUpperCase();

  if (
    lower.includes("default credentials") ||
    lower.includes("application default credentials") ||
    lower.includes("metadata server") ||
    lower.includes("could not load the default credentials")
  ) {
    return new ProviderFailureErrorV1("CREDENTIAL_TRANSIENT", message);
  }

  if (status === 401 || status === 403) {
    return new ProviderFailureErrorV1("PROVIDER_AUTH_DENIED", message);
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("socket") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return new ProviderFailureErrorV1("HTTP_TIMEOUT_AFTER_SEND", message);
  }

  return new ProviderFailureErrorV1(
    "HTTP_TIMEOUT_AFTER_SEND",
    `google_provider_uncertain_failure:${message}`,
  );
}

export function createGoogleGenAIClientV1(
  config: GoogleProviderConfigV1,
  factory: GoogleGenAIFactoryV1 = defaultFactory,
): GoogleGenerateContentClientV1 {
  const ai = factory({
    enterprise: true,
    project: config.project,
    location: config.location,
    apiVersion: "v1",
  });

  return {
    async generateContent(input) {
      try {
        const response = await ai.models.generateContent({
          model: input.model,
          contents: input.prompt,
          config: { maxOutputTokens: input.maxOutputTokens },
        });
        return {
          text: response.text ?? "",
          responseId: response.responseId,
          modelVersion: response.modelVersion,
        };
      } catch (error) {
        throw mapGoogleGenAIErrorV1(error);
      }
    },
  };
}
