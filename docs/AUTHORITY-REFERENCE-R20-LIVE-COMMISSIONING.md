# R2.0 — Independent Authority Owner Register and Source Provenance

**Decision: HOLD. Unappointed owners: 13 of 13 controls. Live authoritative service attestations: 0 verified. Production capability admitted: NO.**

## What was independently observed on 13 October 2026
- [Synnergyze PR #150](https://github.com/Believers-common-group/mcp-node-synnergyze/pull/150) contains the R0.9–R1.9 source-only work. All checked head workflows were successful before adding R2.0, but GitHub CI does not commission a real worker.
- The [Alpha Warden admission core](https://github.com/Believers-common-group/alpha-warden-admission-core) admits only bounded `builder.*` capabilities in its current policy and requires real Warden decision + matching live River admission receipt. `authority_reference.*` is not admitted.
- The [DigitalMe repository](https://github.com/Believers-common-group/DigitalMe) contains identity/continuity contracts and explicitly states that repository contracts do not establish a deployed identity authority.
- GitHub repository metadata **confirms** [Believers-common-group/Warden](https://github.com/Believers-common-group/Warden) is a fork of `openai/openai-agents-js`, and [processor-BNR](https://github.com/Believers-common-group/processor-BNR) is a fork of `github/github-mcp-server`. They cannot be classified as estate signing or Door authorities from their names alone.
- GitHub metadata identifies [mcp-node-synnergyze](https://github.com/Believers-common-group/mcp-node-synnergyze) as a fork of `thekingznqueenz11/mcp-node`, substantially developed under estate branches; fork ancestry alone neither establishes nor disproves the estate's worker mandate.
- [genesis-stack](https://github.com/Believers-common-group/genesis-stack) identifies itself as an architecture parent, not a live Genesis capacity registrar.
- Vercel project `synnergyze-genesis-mcp` has older `genesis` READY deployments, but no independently commissioned deployment of the authority-reference integration. Older READY deployments do not satisfy R1.0 candidate provenance.

## R2.0 artifacts
- `docs/AUTHORITY-REFERENCE-R20-OWNER-REGISTER.json`: source-backed **provenance snapshot**, 13 required controls, candidate roles **not appointed**, all `UNVERIFIED`. It contains no private credentials, client data, actual owner identities or fabricated signed receipts.
- `modules/synnergyze/authority-reference-r20-owner-gate.ts`: pure audit; confirms that metadata, source classifications, unverified owner assertions and SDK-fork labels are never promoted into a commissioned signer or execution permission.
- `modules/synnergyze/authority-reference-r20-owner-gate.test.ts`: verifies schema completeness, fork ancestry, no synthetic appointments, no silently trusted Warden/BNR origins, no elevated permission from positive caller flags, and fail-closed behavior.

## Owner acceptance work queue
Each of the 13 controls requires a separately appointed custodian and independently validated mandate. Register fields `ownerUserId=null`, `mandateRef=null`, `ownerAccepted=false`, `liveAuthorityVerified=false` accurately mean **not verified**, not that the role has been rejected.

Before moving any individual control, the responsible authority must independently authenticate its own signing key and revocation freshness, identify the corresponding service and accepted mandate, and provide a non-secret verified evidence locator bound to the exact request, worker, Door, ARK, tenant, permitted capability and intended source/purpose. An identity provider login, README, signature created under test trust, or `ownerAccepted=true` from the same untrusted packet is insufficient.

**Admission sequence**: DigitalMe delegation and BNR/Genesis scope → Warden signed permission → distinct live River admission receipt → shared atomic replay reservation and single-use permit → approved source-scoped ARK read-only execution → distinct signed River execution receipt → independent audit witness. Production release must be separately mandated and approved.

## Implementation and privacy boundaries
The repository has GitHub Issues disabled (API 410); track this gate in **draft PR #150** and this checked-in register, not by inventing an issue number. Neither artifact performs network requests, grants capabilities, registers MCP tools, requests credentials, deploys Vercel, changes GitHub protections, migrates databases, observes personal files/devices, or accesses government registries.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install vitest run modules/synnergyze/authority-reference-r20-owner-gate.test.ts
npm run type-check
```

**No automatic promotion.** R2.0 is an evidence-based readiness register and release gate, not live commissioning. Keep `state=HOLD` and `executionAllowed=false` until a separately governed production process independently verifies the missing authorities.
