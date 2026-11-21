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
