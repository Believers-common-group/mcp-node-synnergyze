# GEN-CON-GCHAT-001 — Warden on Synnergyze

Status: **DRAFT / NO LIVE PROVIDER EFFECT / NOT COMMISSIONED**

This change adds a pure Google Chat read admission guard at
\`modules/integrations/google-chat/warden-read-gate.ts\`.
It intentionally does not add OAuth callback routes, external Google calls,
or modify the deployed MCP server.

## Ownership

- **Genesis** registers the Google connector, endpoint, resources and account bindings.
- **DigitalMe** identifies the consenting human and represented principal.
- **Warden** supplies the authenticated per-action decision from an internal trusted service.
- **Synnergyze** orchestrates execution only after a valid decision and independent checks.
- **RiverOS** reserves and records metadata evidence; avoid raw message retention by default.

## Google Configuration

- Project: \`triple-hour-458713-d9\`.
- Endpoint: \`https://chatmcp.googleapis.com/mcp/v1\`.
- Existing OAuth client is a **Web application**, shown with the AI-powered-agent checkbox checked in the user's screenshot; confirm that configuration was saved.
- Never configure \`https://claude.ai/api/mcp/auth_callback\` unless Claude is the actual OAuth host. Synnergyze needs a callback actually implemented, served and registered for Synnergyze.
- The existing Synnergyze Vercel project was not confirmed live, so **NO CALLBACK URI IS YET APPROVED**.
- Request the minimum Pilot 01 scopes only: \`chat.spaces.readonly\`, \`chat.messages.readonly\`, \`chat.memberships.readonly\`. Do not request \`chat.messages.create\` or read-state write scopes.
- Google Chat MCP remains Developer Preview: verify access with the actual OAuth identity.
- Keep Client Secret and refresh/access tokens in a secret manager; never in the repository, logs or chat.

## Read path

1. Resolve the authenticated DigitalMe actor, principal and Google provider account through trusted back-end identity/consent services.
2. Resolve a real Google \`spaces/{id}\` identifier, bind it to the Genesis Room and an allowlist.
3. Construct Warden request using the repo's established \`WardenDecisionRequestV1\` contract; obtain a verified decision through trusted internal Warden, **not from untrusted MCP tool arguments**.
4. Verify consent and exact project, actor, account, resource, tool, time, scope and decision bindings using the new guard.
5. Run the existing River reservation/checkpoint and containment chain; revalidate authorization immediately before the external call.
6. Invoke an audited read-only Google MCP client. Verify server-advertised tool schema, handle MCP session lifecycle and deny unexpected tools.
7. Screen all retrieved message content as untrusted data; return only the approved response and record a minimal River metadata receipt.

**Important:** the existing \`evaluateSyntheticWardenDecisionV1\` and \`ControlledExecutionGateV1\` examples are synthetic conformance implementations. Synthetic action tokens and \`EXECUTED_UNVERIFIED\` receipts do not prove production authority or actual Google effects. Do not use synthetic services as a production authorizer.

## Tool restrictions

- Allowed by this guard: \`list_messages\`, \`list_memberships\` for an already-resolved, allowlisted space.
- Not yet allowed: \`search_conversations\` (requires separate discovery policy and result filtering), \`search_messages\`, \`send_message\`, \`mark_as_read\`, \`mark_as_unread\`, and notifications APIs.
- If an MCP host exposes tools to an LLM, enforcement must be on the *server-side execution path*, not solely UI filtering or model instructions.

## Release gate

Do not enable a live read until:

- the OAuth client is confirmed dedicated and saved with agent designation;
- consent screen/test user and preview eligibility are verified;
- Synnergyze has a valid reachable callback with code-flow PKCE, state, strict redirect validation and CSRF defense;
- credentials are stored and rotated securely;
- the provider identity, real Chat space ID, scopes, consent and Warden policy are confirmed;
- tests pass on CI and review validates the policy and external adapter;
- a successful one-space read has a reconciled River receipt.

Run: \`npx vitest run modules/integrations/google-chat/warden-read-gate.test.ts\`.

This change only introduces pure policy code and unit tests. It does not itself assert successful CI, completed OAuth or verified Google Chat access.

## Stage 3: Durable nonce reservation

- `nonce-ledger.ts` contains a Neon SQL-backed one-time ledger. It hashes the nonce and the ordered trusted binding; it never stores OAuth authorization codes, access tokens, or the user's plaintext identity binding.
- `migrations/google-chat-oauth-ledger.sql` is **proposed and NOT applied**. The credentials used to run this migration must be scoped to the intended development database.
- The OAuth **start** handler must call `beginGoogleChatOAuth`, then await `reserveGoogleChatOAuthTransaction(ledger, result, trustedBinding, now + 600000)` before setting the cookie and issuing the redirect. Do not issue the redirect if reservation fails.
- The callback must use the same durable ledger for atomic `consumeTransactionNonce`; consuming an absent, expired, mismatched or already-consumed nonce fails closed.
- `exchangeAndVaultGoogleChatOAuth` still requires a real encrypted credential vault and trusted provider-account verifier. The callback remains intentionally disabled until these are present, independently qualified and deployed.
- Audit note: when OAuth fails *after* nonce consumption, start a new transaction instead of retrying the consumed code. Restrict the database user so it cannot access unrelated Estate or River tables.
- The current transaction-cookie design is a pre-commissioning specification: third-party cookie support, host browser/session binding, OAuth-provider behavior and production replay controls still require end-to-end qualification.

### Security review hold

Never interpret a Vitest mock test as evidence of production authorization. Existing synthetic Warden decisions remain test-only. The project still needs: authenticated session recovery, tenant isolation, exact actor/binding attestation, encryption-at-rest key rotation, strict outbound egress, provider identity verification, and separately governed River receipts.

## Stage 4: encrypted credential persistence

- The proposed `token-vault.ts` supports AES-256-GCM with AAD binding to stable DigitalMe actor, represented principal, Google account and consent. Per-request Warden/correlation identifiers are NOT used as the durable credential primary key.
- `migrations/google-chat-token-vault.sql` is **not applied**. It holds ciphertext, IV, tag, key identifier, scope fingerprint and expiry only.
- Encryption keys are supplied by the hosting secret manager, never by untrusted MCP caller input. The read-only pilot does not request refresh tokens.
- The database adapter is intentionally **write-only** for now. A future read path requires a server-verifiable Warden checkpoint, separate trusted identity resolver, current consent, allowed Google Chat resource, and River reservation before token decryption and provider execution. A claimed identity string is insufficient.
- Key rotation: keep old decryption keys until encrypted rows are re-encrypted or expire. Revoke consent by deleting that binding; also revoke provider-side grants when supported.
- Release gate: apply least-privilege DB access, encryption-key handling, retention cleanup, audit logging without token contents, and independent account verification. Existing CI checks are not proof of live authorization.

## Stage 5 — Verified Google OpenID account binding (proposed)

- Google OAuth request now asks for `openid` alongside the three existing **read-only Chat scopes**, and sends a random nonce in the authorization request.
- The token exchange requires `id_token` and a trusted `verifyProviderAccount` adapter before any access token is handed to the encrypted vault.
- `google-id-token.ts` provides a cryptographic RS256 verification primitive against Google's published JWKS endpoint. It checks exact client audience, allowed issuer, expiry, issuance time, original transaction nonce, and immutable Google `sub` matched to a **trusted Genesis registry lookup**.
- The registry is a trusted interface only, not a working binding implementation: it must be populated from a separately verified account-enrollment process. Never trust a `sub` supplied in an MCP argument, HTTP request body or user-editable profile field.
- The existing `verifyProviderAccount` hook is intentionally not wired to any live callback; the callback still returns 503. The function must be bound to this cryptographic verification before activation, never a stub that merely returns `true`.
- Existing token-vault storage continues to retain only the authorized three Chat read scopes; identity permission `openid` is authentication-specific and not a Chat execution permission.
- Production hardening: pin Google JWKS retrieval, account for signing-key rotation and cache limits, add verified session lookup and revocation, audit token handling and consent expiry, and review multiple-account linking/anti-rebinding conditions. Current tests use synthetic signed tokens and fixtures only.
- **No live Google user identity, Chat message or OAuth secret has been accessed by this PR.**
