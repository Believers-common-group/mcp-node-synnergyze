export type GoogleIdentityModeV1 = "ADC" | "AGENT_IDENTITY";

export interface GoogleProviderConfigV1 {
  providerRef: "GOOGLE_CLOUD";
  project: string;
  location: string;
  model: string;
  maxPromptChars: number;
  maxOutputTokens: number;
}

export interface GoogleRuntimeIdentityContextV1 {
  mode: GoogleIdentityModeV1;
  principalRef: string;
  attested: boolean;
  source: "APPLICATION_DEFAULT_CREDENTIALS" | "GOOGLE_AGENT_RUNTIME";
}

export interface GoogleProviderCallReceiptV1 {
  providerRef: "GOOGLE_CLOUD";
  authorizationRef: string;
  actionRef: string;
  reservationRef: string;
  providerPrincipalRef: string;
  identityMode: GoogleIdentityModeV1;
  project: string;
  location: string;
  model: string;
  requestHash: string;
  responseHash: string;
  responseId?: string;
  modelVersion?: string;
  completedAt: string;
}

export interface GoogleGenerateContentClientV1 {
  generateContent(input: {
    model: string;
    prompt: string;
    maxOutputTokens: number;
  }): Promise<{
    text: string;
    responseId?: string;
    modelVersion?: string;
  }>;
}
