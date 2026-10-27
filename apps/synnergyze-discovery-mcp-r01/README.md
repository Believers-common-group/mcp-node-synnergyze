# Synnergyze Discovery MCP R0.1 — existing sandbox adapter

**CANDIDATE / HOLD | read-only public metadata | stdio only | no publication**

This directory adds a small **real MCP-protocol adapter** on the same branch as the existing Synnergyze R0.4/R0.5 sandbox. It provides discovery information about that sandbox and its release gates; it does **not** connect a remote GitHub registry to a running machine, import the R0.5 demo state or open a network port.

## Existing work — preserved

- Sandbox: `sandbox/synnergyze-collaboration-r04/` and `apps/synnergyze-workspace-r05/`
- Draft review: [PR #153](https://github.com/Believers-common-group/mcp-node-synnergyze/pull/153)
- Governance: [SynergyzeGovernance PR #157](https://github.com/Believers-common-group/SynergyzeGovernance/pull/157)
- Admission documentation: [handoff](../../docs/mcp-registry/SYNNERGYZE-SANDBOX-CONNECTION-R0.1.md)
- External catalogue onboarding: [GitHub discussion #1257](https://github.com/github/github-mcp-server/discussions/1257)

## Run locally (from the repository root)

Requires Node.js 22 and existing root `package-lock.json` dependencies.

```sh
npm ci
node apps/synnergyze-discovery-mcp-r01/server.mjs
```

The process speaks MCP JSON-RPC over **stdio**, not an HTTP browser URL. Do not paste it into a web browser or proxy it to the R0.5 local demo.

A standard MCP client supporting stdio can launch the script with `node` and an **absolute** working-copy path, such as:

```json
{
  "mcpServers": {
    "synnergyze-discovery-candidate": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/REPO/apps/synnergyze-discovery-mcp-r01/server.mjs"]
    }
  }
}
```

The example is configuration only; no client was installed or authorized by committing this file.

## Deliberately limited tools

| MCP tool | Scope |
| --- | --- |
| `synnergyze_public_overview` | Public repo and sandbox pointers; explicit synthetic/unpublished state |
| `synnergyze_registry_admission_gates` | Read-only release requirements and prohibited operations |

No file read, GitHub token, external process launch, HTTP listener, Warden grant, BNR membership modification, RiverOS data access, accounting or financial tools are offered. The repository currently contains a separate inherited `algolia-mcp` root package; **do not publish that package as Synnergyze**.

## Test

```sh
node --check apps/synnergyze-discovery-mcp-r01/server.mjs
node --test apps/synnergyze-discovery-mcp-r01/discovery.node-check.mjs
```

The smoke test exercises the real MCP `initialize`, `tools/list`, and `tools/call` methods, checks the declared HOLD state, and verifies unregistered mutation tools fail closed.

## What is NOT connected yet

1. No npm registry release or public Streamable HTTP endpoint exists for this candidate.
2. No `server.json` exists with verified live package metadata.
3. No MCP Registry publication or GitHub MCP catalogue listing has occurred.
4. No MCP principal identity, organization membership, DigitalMe authentication, Warden enforcement or independent RiverOS receipts exist.
5. No R0.5 workroom business operations are exposed through this candidate.

Next: confirm publisher and namespace ownership, peer-review the tool contract, package/release the candidate or build a separately hardened remote MCP, verify the actual distribution, then publish through the official MCP registry under separate authority. GitHub's curator request follows verified official publication. Keep the branch and PR in DRAFT/HOLD until approvals.
