# Authority Reference R1.0 — Commissioning Gate (HOLD)

## Source-backed findings (12 October 2026)
- Canonical source-code target: `Believers-common-group/mcp-node-synnergyze`, draft PR #150 based on `estate-console-v0.1`.
- Vercel project `synnergyze-genesis-mcp` lists current latest **CANCELED** deployment `dpl_D37e2y7wKptEUZs8qW78BkumzTkt` from `estate-console-v0.1` commit `1145c4c671d18f1da08156659443fbbc3477cd10`.
- An older **READY** production deployment `dpl_hnRgdWSK3Z41h6YQKZzuiEGEbUT7` exists from branch `genesis`, commit `6c5192964c9af002daf09bdb5c1e78424db281a2`. This does not contain the R0.9 candidate commit.
- `vercel.json` deliberately skips branches other than `genesis`; do not weaken this configuration.
- `api/health.ts` returns a basic service indicator; it does not establish source-code provenance, DigitalMe identity, Warden authority, or River receipt authenticity.
- `api/mcp.ts` is an existing service surface, but the authority-reference preview is **not registered** there.
- Previous R0.9 GitHub source integration CI passed; deployment and capability admission were not performed.

## Added R1.0 assessment
`modules/synnergyze/authority-reference-commissioning.ts` is a pure read-only assessor. It separates:
1. valid candidate repository/commit/capability scope
2. Vercel project and source repository binding
3. deployment branch policy
4. latest deployment state and exact commit equality
5. historical READY deployment versus candidate-provenance mismatch
6. cryptographic build trust, DigitalMe, signed Warden admission, live River admission and execution receipts, single-use permit, source egress and explicit go-live approval.

The preflight must not infer authority from an observed READY deployment, a caller-supplied `approved=true` field, local CI or a GitHub commit. Every assessment returns **HOLD**, `deployPermitted=false`, `runtimeInvocationPermitted=false`, `authorityAdmitted=false`, `sourceRetrievalPermitted=false`. Provided metadata is untrusted unless independently collected and verified; the assessor does not authenticate Vercel responses.

## Verification
```bash
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install vitest run modules/synnergyze/authority-reference-preview.test.ts modules/synnergyze/authority-reference-commissioning.test.ts
npm run type-check
```

## Commissioning prerequisites
- Confirm immutable R1.0 worker artifact and correct operational owner.
- Have security reviewers approve the exact deployment commit, release environment, signer trust roots, revocation, and worker instance.
- Authoritatively verify DigitalMe delegation, Warden admission and linked **live River admission receipt**.
- Independently verify one-time execution permit consumption and a separate River execution receipt.
- Approve registry-specific external egress, privacy, data retention and programme boundaries.
- Obtain a separate go-live decision; do not treat this CI review as deployment approval.

No production token retrieval, external API call, database write, Warden policy expansion, runtime route modification or deployment is part of this patch.
