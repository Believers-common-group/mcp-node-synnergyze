# Authority Reference R2.0 — Independent Owner Discovery and Commissioning Gate

**STATUS: HOLD.** This is a source-only commissioning register. No issuer is appointed, trusted, enrolled, or authorised by this document. No live service keys, RiverOS receipts, external official-register calls, migrations, deployment or client-device access.

## Evidence observed in connected repository/deployment metadata (13 October 2026)

| Claim domain | Observed source | Evidence classification | What remains unverified |
| --- | --- | --- | --- |
| Synnergyze worker | `Believers-common-group/mcp-node-synnergyze`, staging draft PR #150 | Native source-code integration; GitHub CI evidence | Actual commissioned worker, immutable released artifact and R0.9–R2.0 deployment |
| Vercel runtime | `synnergyze-genesis-mcp` | Older `genesis` READY production deployment; recent `estate-console-v0.1` deployments CANCELED | Exact authority-reference commit and worker instance deployed with independently attested identity |
| Warden admission | `Believers-common-group/alpha-warden-admission-core` | Policy gate source code; builder.* capabilities initially allowlisted | Independent production Warden policy signer and live signed authority_reference.* ALLOW |
| Warden-named repository | `Believers-common-group/Warden` README | OpenAI Agents SDK codebase, **not evidence of Warden signer** | Actual estate Warden authority service and owner |
| DigitalMe | `Believers-common-group/DigitalMe` README | Identity / memory / context contracts; README expressly disclaims production deployment proof | Active principal, independently verified delegation, key custody and revocation |
| DigitalMeIdentity | `Believers-common-group/DigitalMeIdentity` | Repository reported empty | Issuer identity, runtime and owner |
| BNR-named repository | `Believers-common-group/processor-BNR` README | GitHub MCP Server codebase, **not evidence of BNR Door authority** | Actual Door issuer, membership, legal/operator mandate |
| Genesis | `Believers-common-group/genesis-stack` README | Canonical architecture parent, expressly not all runtime services | Admitted capacity and resource registrar |
| RiverOS | Previous synthetic/ephemeral River evidence contracts and tests | Local synthetic evidence; no verified live receipt issuer | Live independently signed admission and separate execution receipts |
| Replay | R1.2 single-host local ledger; R1.3–R1.6 staging PostgreSQL/recovery/audit tests | Staging conformance | Production shared atomic permit ledger with authenticated ownership and audit anchoring |

**Scope of fact:** repository ownership, README text and Vercel metadata were observed via connected read-only APIs. They do not prove independent signer identity or legal authority. The list is not exhaustive; absence of identified authority is not evidence that no authority exists anywhere.

## R2.0 implementation

`modules/synnergyze/authority-reference-r20-owner-discovery.ts` classifies observations against the 13 R1.7 domains. It detects:
- missing/ambiguous records, malformed provenance, stale or future observations;
- repository names whose README describes a different upstream product;
- old READY, mismatched-commit, CANCELED or absent deployment records;
- unsupported owner nomination via caller-supplied `verified=true` or `ownerAccepted=true`.

The function makes **no network calls**. Source summaries remain untrusted input and warning heuristics; an upstream-looking README is a reason to investigate, not a claim of misconduct. Even fully matching records produce `state=HOLD`, `executionAllowed=false`, `realIssuerVerified=false`, and `ownerMandatesAccepted=false`.

## Required independently accepted commissioning roles

| Priority | Control family | Required separately accepted mandate and proof |
| --- | --- | --- |
| P0 | Worker/build/runtime | Verified release custodian, reproducible immutable artifact and exact runtime attestation |
| P0 | DigitalMe/tenant/ARK/Door | Independently verified principal and delegated scope, BNR-issued Door and membership |
| P0 | Warden policy/admission | Signing custodian and independently authenticated current policy/decision/revocation |
| P0 | River admission | Separate RiverOS signer and **live** signed admission receipt bound to Warden decision |
| P0 | Permit/replay | Authenticated production DB/ledger operator, ACID isolation and shared replay refusal |
| P1 | Genesis capacity | Independently attested allocated/available Genesis runtime capacity |
| P1 | Official source access | Origin/path/method allowlist, retention, purpose and legal access approval |
| P1 | River execution/audit | Distinct live signed execution receipt and out-of-worker audit witness |
| P0 release | Commissioning/go-live | Individually accepted delegated authority, complete evidence review and explicit signed release |

**No named individual, team or GitHub account is assumed to have accepted any of these roles.** Sources must be independently authenticated outside this PR; a GitHub comment alone is not a mandate.

## Repository workflow decision

GitHub Issues in `mcp-node-synnergyze` is disabled (attempted issue creation returned HTTP 410). The source-backed checklist is therefore recorded in this **draft PR and versioned document**, not a fictitious issue. Do not change repository settings solely to accommodate the checklist.

## Test command

```sh
npx --no-install vitest run modules/synnergyze/authority-reference-r20-owner-discovery.test.ts
npm run type-check
npm run lint
```

## Release and privacy boundary

No merge, active MCP tool registration, Vercel deployment, Warden admission policy edit, production-key installation, live RiverOS intake, official-source retrieval, client data access or personal screen/device observation is authorised. HOLD applies to this proposed authority-reference capability only and does not impede separate authorised estate development.
