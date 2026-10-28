# Synnergyze Tool-Contract and Retry Guard — R0.1 (DRAFT / HOLD)

An **isolated, non-executing** reference module to stop repeated invalid MCP tool invocations. It accepts a **trusted, version-pinned tool manifest** (from the connected server's tools/list plus a separately reviewed read-only classification) and an **injected** transport. It does not connect to GitHub, invoke a shell, register an MCP server, touch credentials, or authorize an operation.

## Verification

~~~bash
node --check apps/synnergyze-tool-guard-r01/guard.mjs
node --test apps/synnergyze-tool-guard-r01/guard.node-check.mjs
~~~

## Scope

- Normalize *only* explicitly pinned aliases **if the target field is advertised in the connected tool schema**. GitHub issue [#3605](https://github.com/github/github-mcp-server/issues/3605) illustrates pull_number/pullNumber and issueNumber/issue_number mismatches. These names are **observed examples**, not a universal GitHub schema claim.
- Fail closed for missing fields, unknown arguments, wrong primitive types, zero-length arrays, unsupported schema keywords, alias collisions, unregistered/unversioned tools, cyclic/accessor/sparse/deep inputs, schema drift, and inputs exceeding the fixed byte budget.
- Suppress an identical second call after an MCP JSON-RPC error or transport failure; also reject concurrent identical in-flight requests within the same process. The cache is **in-memory and bounded**, not cross-process or persistent. No arguments or tokens are printed to logs.
- Default to **zero automatic retries**. A caller may explicitly enable at most two retries only for **trusted, explicitly public read-only** tools and a narrow set of transient transport errors. **All private reads, mutating, or unknown-effect calls are rejected outright** with WARDEN_AUTHORIZATION_REQUIRED; R0.1 cannot dispatch them.
- Treat an MCP -32602 validation response, a nested MCP isError result, and malformed remote responses as terminal regardless of retry settings. Distinguish transportAttempts: 0 (locally denied) from a remote invocation.

## Critical limits / integration gates

1. **Not a complete JSON Schema implementation.** Only explicitly supported keywords are accepted; $ref, oneOf, anyOf, pattern, and other unsupported constraints deny the call. Before real integration, use a reviewed complete schema validator or establish conformance for each tool schema.
2. **No Warden authority is created.** This guard is intentionally read-only-only. A schema-valid request is only *structurally* valid. A reviewed local manifest must explicitly mark a read tool as both readOnly and publicRead. No effect-bearing requests may pass through R0.1; a separate reviewed runtime must enforce Warden authorization, principal/tenant checks, RiverOS evidence reservation, and native provider authorization.
3. **No cross-worker guarantee.** In-flight suppression and the terminal-error cache are process-local. Process restart clears both. Cross-worker duplicate suppression requires an independently governed, durable idempotency service; uncertain write effects require reconciliation, not replay.
4. **Manifest trust is external.** Do not let an untrusted remote server label its own calls safe to retry; readOnly must be validated against a reviewed local permission manifest.
5. **Public-read trust boundary.** Public-read classification is a separate local approval. Do not mark private GitHub repositories, secret-scanning results, Registry data, DigitalMe records, or any governed member resource public to bypass Warden. Even a read-only request can require Warden authority.
6. **No production adapter activated.** This package is not imported by the existing public Synnergyze discovery server or any live gateway; it is source/test only until independently reviewed and authorized.

## Example: synthetic-only use

~~~js
import { createMcpToolCallGuard } from './guard.mjs';

const guard = createMcpToolCallGuard({
  tools: {
    secret_scanning: {
      version: 'sandbox-scanner-schema-r01',
      readOnly: true,
      publicRead: true,
      inputSchema: {
        type: 'object', required: ['paths'],
        properties: { paths: { type: 'array', minItems: 1, items: { type: 'string' } } }
      }
    }
  },
  // Synthetic-only test fixture; this is NOT approval to expose live scanner data.
  // No production transport: demonstrate only.
  transport: async (_name, _args) => ({ result: 'SYNTHETIC_ONLY' })
});

const denied = await guard.invoke('secret_scanning', {});
// denied.classification === 'MISSING_REQUIRED_ARGUMENT'
// denied.transportAttempts === 0
~~~

Release posture: **DRAFT / HOLD**. No merge, publish, deployment, external scanner invocation or authority promotion is implied by CI passing.
