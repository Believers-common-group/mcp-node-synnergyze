# AUTHORITY-REFERENCE-R11 — Offline Signed Admission Chain (HOLD)

**R1.1 is a cryptographic contract conformance test, not real admission.**

## Canonical context
The existing Synnergyze `program-bridge.ts` creates `authorized=false` program/event drafts. The R0.9 authority-reference preview remains `HOLD`. `modules/warden/contracts.ts` describes Warden decisions and checkpoints, and `modules/river/contracts.ts` describes reservations and receipts, but the tested Synnergyze River reservation is synthetic. The source branch and production Vercel deployment provenance were assessed in R1.0. No proof of a deployed authority-reference worker or independently trusted signer exists.

## R1.1 implementation
- `modules/synnergyze/authority-reference-admission-chain.ts` accepts two **separately signed Ed25519 offline test envelopes**, one claiming a Warden decision and another claiming a River admission receipt.
- The Warden test proof signs a bounded decision and binds request ID, actor, context, event, program, correlation, operation, capability, target, candidate digest, compilation digest, worker binding digest, action-token digest, issue time and expiry.
- The independent River test proof signs receipt ID, accepted time, status, exact Warden decision reference and digest, source candidate/worker digests, program/event, correlation and request.
- Trust configuration explicitly requires `mode=TEST_FIXTURE_ONLY`, distinct issuer IDs and distinct signing public keys; revoked key IDs are rejected. Signature format is strict canonical base64; claims use deterministic canonical JSON.
- Enforces receipt chronology: Warden issuance <= River acceptance <= evaluation <= Warden expiry; maximum Warden validity 15 minutes.
- Negative tests cover tampering, revoked keys, unknown issuers, altered scope/actor/target/digests, replay-related omissions and bad receipt binding.

## Hard safety boundary
**Even if both fixture signatures are valid and all fields align, every output is:**
```json
{"state":"HOLD","executionAllowed":false,"wardenAdmissionGranted":false,"riverLiveReceiptVerified":false,"oneTimePermitConsumed":false,"realWorkerAttested":false}
```

The trust config is input data, not an independently rooted production issuer directory. R1.1 does **not** verify authoritative government or independent audit evidence; it does not resolve real DigitalMe delegations, Genesis capacity, BNR Door admission, or Warden live policy/revocation; it does not operate RiverOS, enforce a distributed replay ledger, consume a real permit, run a worker, or read external sources.

**No registry calls, egress, production settings, secret retrieval, databases, browser sessions or user devices are accessed. No MCP handler is registered.**

## Tests
```bash
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install vitest run modules/synnergyze/authority-reference-preview.test.ts modules/synnergyze/authority-reference-commissioning.test.ts modules/synnergyze/authority-reference-admission-chain.test.ts
npm run type-check
```

## R1.2 gates
Confirm separately delegated production issuers and actual Synnergyze worker artifact; provision independent external trust anchors; validate authority and revocation **from authoritative services**; bind an atomic shared replay ledger; verify live River admission receipt *before* execution and a distinct live River execution receipt *after* execution. All activation needs an explicit production go-live approval, not a signed local fixture or GitHub CI.
