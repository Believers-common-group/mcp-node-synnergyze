# Authority Reference R1.7 — Independent Trust Handoff

**Source-only review. HOLD. No new runtime route, deployment, issuer installation, database migration or production execution.**

The R1.6 test signer's ephemeral self-derived public-key pin proves mathematical integrity of a synthetic GitHub Actions artifact, not externally anchored production provenance. Earlier R1.2 keys are explicitly fixture roots and R1.3–R1.6 replay/recovery assurance is synthetic/ephemeral. None can be elevated to official identity or regulatory certification.

## Reviewable R1.7 control surface
`modules/synnergyze/authority-reference-trust-handoff.ts` accepts one bounded staging candidate and candidate-specific evidence from thirteen domains: immutable worker build, deployment, DigitalMe identity/delegation, BNR Door, Genesis capacity, Warden policy and admission, River admission, replay ledger, source egress, River execution, independent audit anchor and commissioning approval.

For each control it identifies missing, untrusted, duplicate, stale, scope-mismatched or *present but still unverified* evidence. Evidence must bind the **same** source SHA and artifact digest, deployment, worker, request digest, capability, principal, tenant, Door, ARK, Genesis capacity, source and purpose. Independent issuers and true signature verification are **not** established by an `issuerRef` string or a `verified=true` flag.

All outcomes, including complete-looking envelopes, return:
- `state=HOLD`
- `commissioningAuthorized=false`
- `executeAllowed=false`
- `externalSourceAccessAllowed=false`
- `actualIssuerTrustVerified=false`
- `liveRiverAdmissionVerified=false`
- `liveRiverExecutionVerified=false`

No reads of personal devices, secrets, browsers or remote endpoints are performed. The candidate digest is deterministic but is not an independently timestamped attestation.

## Independent validation required
The nominated authorities must furnish independently authenticated records with bound subject/scope, immutable worker artifact, expected deployment, verified current revocation, receipt provenance, permit issuance/one-time consumption and separate execution evidence. A reviewer must independently verify each issuer's delegated mandate before changing any capability policy. Nothing in this PR constitutes that mandate.

```sh
npx --no-install vitest run modules/synnergyze/authority-reference-trust-handoff.test.ts
npm run type-check
```

**Do not merge as authority expansion or deploy.**