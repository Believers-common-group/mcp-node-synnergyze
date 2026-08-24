# Google Reference Adapter R0.5 Implementation Plan

**Goal:** Add a live-capable Google Gemini/Vertex AI reference adapter beneath the verified R0.4-B Warden → River → Synnergyze provider-authority path.

**Architecture:** Google remains an external provider implementation, not an authority engine. The adapter consumes the exact R0.4-B action, River reservation, Warden decision/checkpoint and provider-principal binding. It reuses `ControlledExecutionGateV1` for the only canonical execution receipt, stores only hashes and provider metadata, and routes uncertain effects through the existing provider recovery/reconciliation semantics.

**Tech Stack:** TypeScript 5.8, Node 22, Vitest 3, pinned `@google/genai` 2.18.0, existing Warden/River/Synnergyze/provider-authority modules.

**Base:** `feat/warden-provider-authority-r04b` / PR #86.

## Governing constraints

- `GOOGLE_CLOUD` gains no independent authority.
- Provider invocation must pass the existing R0.4-B provider-authority gate first.
- Reuse `ActionEnvelopeV1`, `EvidenceReservationV1`, Warden checkpoint, `ControlledExecutionGateV1`, canonical `SynnergyzeExecutionReceiptV1`, effect verification and reconciliation.
- Never accept or persist an API key, access token, refresh token, ADC JSON, OAuth secret or credential file in provider receipts.
- ADC and Agent Identity are distinct modes. ADC is explicitly non-attested and must never be relabeled as Agent Identity.
- Agent Identity requires an explicit hosted principal and exact `ProviderPrincipalBindingV1` match.
- Warden must explicitly bind all three provider dimensions before network invocation:
  - `provider:GOOGLE_CLOUD`
  - `provider_identity_mode:ADC` or `provider_identity_mode:AGENT_IDENTITY`
  - `provider_request:<sha256>` over provider/project/location/model/prompt/max-output-tokens.
- Prompt and generation bounds fail closed before the network call.
- Unknown external effect is never blindly retried; R0.4-B `RECONCILE_FIRST` remains controlling.
- No automatic provider fallback.
- Live tests are opt-in and skipped in ordinary CI.

## Task 1 — Identity posture

**Files:**
- `modules/provider-authority/google/contracts.ts`
- `modules/provider-authority/google/identity.ts`
- `modules/provider-authority/google/identity.test.ts`

- [x] RED: repository type-check failed while identity modules were absent.
- [x] ADC resolves to `adc://projects/<project>`, `attested:false`, source `APPLICATION_DEFAULT_CREDENTIALS`.
- [x] Agent Identity rejects ordinary service-account/user-looking principals.
- [x] Explicit `principal://agents...` / `spiffe://agents...` hosted-principal forms are accepted as attested mode.
- [x] Runtime principal must exactly equal the active provider binding.
- [x] GREEN: test/type-check/lint passed on the identity implementation head.

## Task 2 — Bounded Google request adapter

**Files:**
- `modules/provider-authority/google/adapter.ts`
- `modules/provider-authority/google/adapter.test.ts`
- `modules/provider-authority/google/identity-mode-binding.test.ts`

- [x] RED: adapter tests failed before the module existed.
- [x] Call `authorizeProviderExecutionV1()` before provider invocation.
- [x] Require exact Google runtime identity/provider binding.
- [x] Require explicit Warden identity-mode constraint to prevent ADC downgrade.
- [x] Bind exact provider request hash in Warden constraints.
- [x] Enforce prompt/output-token bounds before network invocation.
- [x] Return only provider metadata plus request/response SHA-256 bindings; generated text and credentials are not stored in the provider receipt.
- [x] Preserve R0.4-B typed provider failure classification.
- [x] GREEN: adapter and identity-mode guard pass in full and focused suites.

## Task 3 — Real `@google/genai` client using ADC

**Files:**
- `modules/provider-authority/google/genai-client.ts`
- `modules/provider-authority/google/genai-client.test.ts`
- `package.json`
- `package-lock.json`

Current SDK construction uses the 2.18.0 enterprise/Vertex AI path with ADC:

```ts
const client = new GoogleGenAI({
  enterprise: true,
  project: config.project,
  location: config.location,
  apiVersion: "v1",
});
```

- [x] RED: client contract tests failed before implementation.
- [x] Pin `@google/genai` to exactly `2.18.0`.
- [x] Generate and commit the npm lockfile using the repository's Node 22 environment.
- [x] Use project/location and stable `v1`; do not accept an API-key parameter.
- [x] Map ADC/default-credential acquisition failures to `CREDENTIAL_TRANSIENT`.
- [x] Map Google 401/403 to `PROVIDER_AUTH_DENIED`.
- [x] Map timeout/network uncertainty to `HTTP_TIMEOUT_AFTER_SEND` so reconciliation remains required.
- [x] GREEN: client tests/type-check pass with the real SDK dependency installed.

## Task 4 — Canonical controlled-execution integration

**Files:**
- `modules/provider-authority/google/integration.ts`
- `modules/provider-authority/google/integration.test.ts`

- [x] RED: integration test head failed before the wrapper existed.
- [x] Use `GoogleProviderDispatchAdapterV1` only as the synchronous deterministic adapter for the existing `ControlledExecutionGateV1`.
- [x] Canonical execution receipt comes only from `ControlledExecutionGateV1`.
- [x] Provider-call evidence is separately bound to canonical `executionReceiptRef`.
- [x] Exact replay reuses controlled-execution idempotency and stored provider evidence without calling Google twice.
- [x] Mutated provider request cannot hide behind replay because preflight revalidates the Warden-bound request hash.
- [x] Unknown Google effect remains `RECONCILE_FIRST` against the canonical receipt.
- [x] No parallel provider execution registry was introduced.

## Task 5 — Live smoke and verification

**Files:**
- `modules/provider-authority/google/live.google.test.ts`
- `package.json`

Environment contract:

```text
GOOGLE_LIVE_PROVIDER_TEST=1
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=<location, default global>
GOOGLE_CLOUD_MODEL=<model, default gemini-2.5-flash>
```

The smoke path uses a short non-sensitive prompt, 32 output tokens, a short dynamic Warden validity window, explicit `provider_identity_mode:ADC`, and does not print or persist credentials or generated text.

- [x] Add `test:google-provider` focused non-live suite.
- [x] Add `test:google-live` opt-in live suite.
- [x] Full ordinary CI skips the live test when the environment contract is absent.
- [x] Locked `npm ci` focused verification passed:
  - `npm run test:google-provider`
  - `npm run test:provider-authority`
  - `npm run test:controlled-execution`
  - `npm run test:effect-verification`
  - `npm run test:reconciliation-conformance`
- [ ] Live ADC network smoke: intentionally **NOT RUN** in repository CI because no explicit live credential/project contract is supplied.
- [ ] Final exact-head standard CI and diff/review freeze.

## Release boundary

R0.5 is complete only when the final clean head has passing standard test/type-check/lint/bridge workflows and the diff contains no temporary CI workflow. Keep PR #87 draft and stacked on PR #86. Do not merge or mark ready without explicit instruction.
