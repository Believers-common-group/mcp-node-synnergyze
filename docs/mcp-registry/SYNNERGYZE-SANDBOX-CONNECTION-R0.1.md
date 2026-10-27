# Synnergyze MCP — GitHub registry connection handoff (R0.1)

**Status: CANDIDATE / HOLD — NOT PUBLISHED, NOT LISTED, NOT DEPLOYED.**

This file connects the **existing** Synnergyze sandbox review to the external MCP registry onboarding process. It does **not** register an MCP service, provision any external endpoint, grant permissions, or modify the runtime.

## Existing source of record

- GitHub organization/repository: [Believers-common-group/mcp-node-synnergyze](https://github.com/Believers-common-group/mcp-node-synnergyze)
- Existing implementation branch: `sandbox/synnergyze-collaboration-r04` — reuse, **do not clone into another invented sandbox**.
- Existing draft: [PR #153](https://github.com/Believers-common-group/mcp-node-synnergyze/pull/153) — **DRAFT/HOLD, unmerged**.
- R0.4 engineering simulation: `sandbox/synnergyze-collaboration-r04/`.
- R0.5 browser workroom and office control panel: `apps/synnergyze-workspace-r05/`.
- Existing governance reference: [SynergyzeGovernance PR #157](https://github.com/Believers-common-group/SynergyzeGovernance/pull/157) — draft; approval remains independent.
- GitHub's onboarding clarification: [github/github-mcp-server discussion #1257](https://github.com/github/github-mcp-server/discussions/1257).
- Official publishing specifications: [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry).

## Verified and unverified properties

| Property | Current state |
| --- | --- |
| Repository visibility | Public GitHub repository. Public **source** is not an operational authorization grant. |
| Repository root package | Still named `algolia-mcp`; retained only as an inherited scaffold. Not a Synnergyze release. |\n| Isolated candidate package | `apps/synnergyze-discovery-mcp-r01/package.json` independently identifies `@believers-common-group/synnergyze-discovery-mcp` (v0.1.0), sets `private: true`, and requires only MCP SDK and Zod. **Not published or registry-listed**; npm namespace ownership remains unverified. |
| R0.5 browser demo | Node 22+ local, `127.0.0.1:4177`, enabled only by `SYNNERGYZE_DEMO_MODE=1`. |
| R0.5 demo security | Synthetic `x-demo-role` header, not real authentication or tenant isolation. Do **not** tunnel, proxy, expose, or deploy. |
| Warden / DigitalMe / BNR | Not integrated into the R0.5 runtime; synthetic roles/grants are not entitlement. |
| RiverOS | Synthetic local event history; no independent production receipts. |
| Public MCP endpoint | **None verified.** The R0.5 HTTP workroom is NOT an MCP remote endpoint. |
| Official MCP Registry record | **Not established / not verified** for a Synnergyze server. |
| GitHub MCP catalogue entry | **Not established / not verified** for a Synnergyze server. |
| Permission to publish/promote | **Not granted** by this handoff. |

## Architecture boundary

```text
Public GitHub source/docs
    -> external official MCP Registry metadata
    -> optional GitHub curated MCP catalogue
    -> separately deployed, hardened Synnergyze discovery MCP
    -> authenticated identity / BNR membership / Warden scope check
    -> Synnergyze approved tool execution
    -> RiverOS evidence and exception handling
```

Registry discovery, BNR admission, Warden authorization and operational execution are independent layers. Never infer one from another.

**Important:** The current local R0.5 workspace is *not* the separately deployed discovery MCP in this architecture. There is no automatic bridge from this GitHub branch to localhost or Docker on an operator's machine.

## Release preparation gates (deny by default)

- [x] Identify the actual existing source branch and draft PR.
- [x] Verify that repo-wide tests, lint, type-check and the dedicated R0.4/R0.5 checks pass on the then-current PR head (2026-10-27, `ceb895d5`). Check again after any new changes.
- [x] Implement a minimal read-only discovery candidate with exactly two metadata tools, separate from the local demo. This is a **candidate contract**, not approved for publication.\n- [x] Give the candidate its own private package identity and executable, without Algolia imports; leave the attributed upstream scaffold unchanged.\n- [x] Run executable MCP protocol and isolated npm tarball-install smoke tests in GitHub Actions. These tests establish technical packaging compatibility, **not** production security.
- [ ] Select actual distribution: publicly accessible secured Streamable HTTP MCP endpoint **or** a real published stdio-compatible package, not a localhost URL or an imaginary deployment.
- [ ] Verify ownership of the intended `io.github.<owner>/<server>` namespace or a domain-verified namespace; use the authorized publisher identity.
- [ ] If remote: deploy behind authentication, rate limits, audit, no synthetic role bypass, per-resource least privilege, tenant isolation, and network controls.
- [ ] Review Warden admission, DigitalMe representation and RiverOS evidence handoff. No finance, ERP, Tally or private repo write capability in first discovery release.
- [ ] Author a truthful `server.json` with a real package/remote URL and version only after the above exists.
- [ ] Validate and publish with official `mcp-publisher` using approved publisher credentials. No publishing is performed by this document.
- [ ] Query official registry and verify response status `active` + `isLatest`; do not infer from local file.
- [ ] Query GitHub catalogue for an existing entry.
- [ ] Only then request **manual initial onboarding** under [discussion #1257](https://github.com/github/github-mcp-server/discussions/1257), with verified entry, auth, transport, version, repository, license and description.
- [ ] Independent approval, version pinning, rollback and owner-reviewed promotion before any operational release.

Registry verification commands (READ-ONLY; do not substitute their search results for owner confirmation):

```sh
curl -fsS 'https://registry.modelcontextprotocol.io/v0.1/servers?search=synnergyze'
curl -fsS 'https://api.mcp.github.com/v0.1/servers?search=synnergyze'
```

Publishing command — **DO NOT RUN until all gates above are approved**:

```sh
mcp-publisher publish ./server.json
```

## Safe catalogue submission — draft only

> Requesting initial GitHub MCP catalogue review for **[verified registry name]**. Official MCP Registry entry: **[verified URL]**. Version **[verified version]**, status **active/isLatest** checked **[UTC date]**. Package or remote transport: **[real distribution]**. Authentication: **[verified mechanism]**. Source repository: https://github.com/Believers-common-group/mcp-node-synnergyze. License of the distributed service: **[verified]**. Scope: **[accurate implemented tools]**. Registry evidence: **[verification response]**.

**Never post the above with placeholders.** A repository and a local demo are not sufficient to make an honest listing claim.

## Operational control

Until independent admission, keep PR #153 draft and unmerged; do not expose `127.0.0.1:4177`, mount Docker sockets, grant GitHub repo permissions, or use unapproved credentials. New publication artifacts require a reviewed branch/PR and evidence of their actual server endpoint or package. This document is a traceability and readiness connection only.
