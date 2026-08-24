# Google Reference Adapter R0.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-capable Google Vertex AI / Gemini reference adapter that uses Google Application Default Credentials (ADC) locally, accepts an explicitly supplied Agent Identity principal only in attested Agent Runtime mode, and executes exclusively through the verified R0.4-B Warden → River → ControlledExecutionGate lineage.

**Architecture:** The adapter is a provider implementation beneath `WARDEN-PROVIDER-AUTHORITY-BRIDGE-001`; it does not issue authority, create a second execution receipt, or store credentials. `@google/genai` is isolated behind a small client interface so unit tests never need network credentials. A live smoke test is opt-in and skipped unless explicit Google Cloud project/location/ADC environment is present.

**Tech Stack:** TypeScript 5.8, Node 22, Vitest 3, `@google/genai` 2.18.x, existing Warden/River/Synnergyze/provider-authority modules.

**Spec:** `GOOGLE-REFERENCE-ADAPTER-001 R0.5`, derived from the verified R0.4-B provider-authority bridge and current Google Cloud Agent Identity + Vertex AI Gemini guidance (2026-08-24).

## Global Constraints

- Base this slice on `feat/warden-provider-authority-r04b`, not `genesis`.
- `GOOGLE_CLOUD` remains only a provider implementation; it gains no authority of its own.
- Every call must pass `authorizeProviderExecutionV1()` before the Google client is invoked.
- Reuse the existing `ActionEnvelopeV1`, `EvidenceReservationV1`, Warden checkpoint, `ControlledExecutionGateV1`, canonical `SynnergyzeExecutionReceiptV1`, effect verification, and reconciliation fabric.
- Never persist Google access tokens, refresh tokens, API keys, ADC JSON, OAuth secrets, or raw credential material.
- ADC and Agent Identity are distinct identity modes. ADC must never be labeled or inferred as attested Agent Identity.
- Agent Identity mode requires an explicit Google Agent Identity principal matching `principal://agents.*` or `spiffe://agents.*` semantics and the existing `ProviderPrincipalBindingV1`.
- The live Gemini request is bounded by an explicit model, project, location, maximum prompt size, maximum output tokens, and deterministic provider configuration.
- No automatic provider fallback.
- No blind retry after unknown external effect; existing R0.4-B reconciliation rules remain controlling.
- Live tests are opt-in only and must not fail ordinary CI because credentials are absent.

---

### Task 1: Google adapter contracts and identity posture

**Files:**
- Create: `modules/provider-authority/google/contracts.ts`
- Create: `modules/provider-authority/google/identity.ts`
- Test: `modules/provider-authority/google/identity.test.ts`

**Interfaces:**
- Consumes: `ProviderAuthorityGateInputV1`, `ProviderPrincipalBindingV1`.
- Produces: `GoogleProviderConfigV1`, `GoogleRuntimeIdentityContextV1`, `resolveGoogleRuntimeIdentityV1()` and `assertGoogleIdentityBindingV1()`.

Required contracts:

```ts
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
```

- [ ] **Step 1: Write failing identity tests**

Tests must prove:
1. ADC resolves only to a non-attested ADC principal context.
2. Agent Identity mode rejects an ordinary service-account/user/ADC-looking principal.
3. Agent Identity accepts only `principal://agents...` or `spiffe://agents...` forms.
4. Resolved principal must exactly equal the existing provider binding principal.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/google/identity.test.ts`
Expected: FAIL because the Google identity module does not exist.

- [ ] **Step 3: Implement minimal identity validation**

Do not query or expose access tokens. ADC context is identified as `adc://projects/<project>` and `attested:false`; Agent Identity context is accepted only from an explicit hosting-layer principal and marked `attested:true`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/google/identity.test.ts`
Expected: PASS.

---

### Task 2: Bounded Google Gemini request adapter

**Files:**
- Create: `modules/provider-authority/google/adapter.ts`
- Test: `modules/provider-authority/google/adapter.test.ts`

**Interfaces:**
- Consumes: `ProviderAuthorityGateInputV1`, `GoogleProviderConfigV1`, `GoogleRuntimeIdentityContextV1`.
- Produces: `GoogleGenerateContentClientV1`, `GoogleReferenceAdapterV1`, `GoogleProviderCallReceiptV1`.

Required client seam:

```ts
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
```

Required adapter result:

```ts
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
```

- [ ] **Step 1: Write failing adapter tests**

Prove that:
1. provider client is not called if R0.4-B authority fails;
2. provider client is not called if Google runtime principal does not match provider binding;
3. prompt length and output-token bounds fail closed before network invocation;
4. successful invocation returns only hashes/metadata, never credential material;
5. provider failure is translated into the existing typed `ProviderFailureErrorV1` categories without changing R0.4-B retry semantics.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/google/adapter.test.ts`
Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement minimal adapter**

Call `authorizeProviderExecutionV1()` first, then `assertGoogleIdentityBindingV1()`, validate limits, invoke the injected client once, and hash the prompt/response using the existing provider-authority hashing utility. No credential fields are accepted by the adapter API.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/google/adapter.test.ts modules/provider-authority/*.test.ts`
Expected: PASS.

---

### Task 3: Real `@google/genai` Vertex AI client using ADC

**Files:**
- Create: `modules/provider-authority/google/genai-client.ts`
- Test: `modules/provider-authority/google/genai-client.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `GoogleProviderConfigV1`.
- Produces: `createGoogleGenAIClientV1(config): GoogleGenerateContentClientV1`.

Minimal live construction:

```ts
const client = new GoogleGenAI({
  vertexai: true,
  project: config.project,
  location: config.location,
});
```

The generated call must use the configured model and bounded generation config. Do not accept API keys in this constructor; use ADC / Google runtime credentials only.

- [ ] **Step 1: Write failing client-contract tests**

Use an injected factory seam to prove the client constructs Vertex AI mode with project/location, passes the exact model/prompt/maxOutputTokens, and extracts text/response ID/model version without exposing SDK credential internals.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/google/genai-client.test.ts`
Expected: FAIL before implementation/dependency integration.

- [ ] **Step 3: Add `@google/genai`**

Use the current stable 2.18.x line. Update `package-lock.json` using npm so dependency integrity is reproducible.

- [ ] **Step 4: Implement the client**

Use Vertex AI mode with ADC. The client must not read an API key or expose access tokens. Convert SDK/network/auth failures into stable errors that the adapter maps through existing provider failure categories.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run modules/provider-authority/google/genai-client.test.ts modules/provider-authority/google/adapter.test.ts`
Expected: PASS.

---

### Task 4: Canonical ControlledExecutionGate integration

**Files:**
- Create: `modules/provider-authority/google/integration.ts`
- Test: `modules/provider-authority/google/integration.test.ts`

**Interfaces:**
- Consumes: `ControlledExecutionGateV1`, `ControlledExecutionRequestV1`, provider authority input, Google adapter/client.
- Produces one canonical `SynnergyzeExecutionReceiptV1` plus a separate provider-call evidence receipt.

- [ ] **Step 1: Write failing integration tests**

Prove:
1. Google invocation and controlled execution share the exact action/reservation/decision/checkpoint lineage;
2. canonical execution receipt comes only from `ControlledExecutionGateV1`;
3. exact replay uses existing controlled-execution idempotency and does not create a second canonical receipt;
4. unknown Google effect remains routed through existing provider reconciliation behavior.

- [ ] **Step 2: Run RED**

Run: `npx vitest run modules/provider-authority/google/integration.test.ts`
Expected: FAIL because the integration wrapper does not exist.

- [ ] **Step 3: Implement the integration wrapper**

Do not create a provider execution registry. Keep Google call evidence separate from the canonical execution receipt and bind both by action/reservation/authorization references.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run modules/provider-authority/google/integration.test.ts modules/provider-authority/runtime-integrity.test.ts`
Expected: PASS.

---

### Task 5: Opt-in live smoke test and repository verification

**Files:**
- Create: `modules/provider-authority/google/live.google.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces opt-in evidence for an actual Vertex AI Gemini request when ADC is available.

Environment contract:

```text
GOOGLE_LIVE_PROVIDER_TEST=1
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=<location, default global>
GOOGLE_CLOUD_MODEL=<model, default gemini-2.5-flash>
```

The test must skip unless `GOOGLE_LIVE_PROVIDER_TEST=1` and a project is supplied. It must never print tokens or credential files. The smoke prompt must be short and non-sensitive, with a small output-token bound.

- [ ] **Step 1: Add focused scripts**

```json
"test:google-provider": "vitest run modules/provider-authority/google --exclude modules/provider-authority/google/live.google.test.ts",
"test:google-live": "vitest run modules/provider-authority/google/live.google.test.ts"
```

- [ ] **Step 2: Run focused non-live suites**

Run: `npm run test:google-provider && npm run test:provider-authority`
Expected: PASS.

- [ ] **Step 3: Run existing critical lineage suites**

Run: `npm run test:controlled-execution && npm run test:effect-verification && npm run test:reconciliation-conformance`
Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run: `npm run type-check && npm run lint && npm test -- --run`
Expected: PASS.

- [ ] **Step 5: Live smoke test if credentials are explicitly available**

Run only when the environment contract is present: `npm run test:google-live`.
Expected: one bounded Vertex AI Gemini response and no credential/token output. If ADC is unavailable, record live verification as NOT RUN rather than weakening the test.

- [ ] **Step 6: Diff/review/publish**

Confirm the R0.5 branch changes only Google provider files, dependency manifests, focused scripts, and this plan. Create a stacked draft PR with base `feat/warden-provider-authority-r04b`; do not merge either PR without explicit instruction.
