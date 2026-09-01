# PESTEL-Friendly Legislative Intelligence R0.1 Runbook

## Credential handling

1. Never paste a Congress.gov API key into chat, Git, issue trackers, screenshots, URLs, logs, fixtures, or evidence records.
2. The canonical encrypted Windows-user secret location is `$HOME\.alpha\credentials\congress-gov\api-key.dpapi`.
3. The canonical credential admission reference is `CONGRESS-GOV-API-KEY-001`.
4. Use the Windows DPAPI credential provider for the default runtime. Tests use injected fake providers only.

## Validate the source boundary

Run:

```bash
npm run validate:pestel:congress
```

The validator prints only source health, HTTP status when available, credential admission metadata, an optional non-secret fingerprint prefix, the check timestamp, and a bounded error code on failure. It never prints the decrypted credential, request headers, response body, or DPAPI bytes.

## Test commands

```bash
npm run test:pestel
npm run test:pestel:congress
npm run test:pestel:conformance
npm run test:pestel:mcp
```

## MCP enablement

Both conditions are required:

```text
VSR_PESTEL_MCP_R0_1=1
exact operation ID present in --allow-tools
```

The R0.1 operation IDs are:

- `pestel_legislative_ingest`
- `pestel_impact_brief`

A generic `all` allow-list entry does not implicitly expose these operations.

## Operational interpretation

The tools are read-side legislative intelligence surfaces. Lifecycle state, PESTEL scores, impact candidates, local evidence receipts, and Synnergyze review candidates are not Warden authority. A consequential external action must be proposed separately and routed through the existing Warden decision boundary. R0.1 performs no SILK settlement.
