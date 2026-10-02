# Warden work-plan grant verifier — R0.2-D (reference only)

Change set: `GCS-20261002-VSR-WORK-ENGINE-R02`. Cross-repository work:
[Genesis contracts PR 64](https://github.com/Believers-common-group/genesis-stack/pull/64),
[Synnergyze proposal compiler PR 117](https://github.com/Believers-common-group/SynergyzeGovernance/pull/117),
[VSR work UI PR 43](https://github.com/Believers-common-group/Virtual-Silk-road/pull/43).

This module uses **real Ed25519 signature verification** on a synthetic
`WARDEN-EXECUTION-GRANT-001` envelope. Key material is injected by an
external trusted key resolver; tests generate ephemeral keys, **never ship
private keys**. The prototype uses a candidate canonical JSON signing profile:
UTF-8 object keys sorted lexicographically, integer/bool/string/null values,
and grant content excluding `grant_signature`. This profile is **NOT**
an adopted Warden provider signing specification, and cannot validate
production grants until the Warden authority publishes/pins its authentic
signature representation, key rotation and revocation contracts.

The only accepted reference workload is **synthetic zero-compute-credit READ,
network=DENY, supported containment**. Invalid signature, expired/revoked
grant, mismatched DigitalMe, policy/authority/target/action, unexpected
effect, non-synthetic data, additional spend or non-proposal states fail
closed. A signature-valid result is exactly
`CRYPTOGRAPHICALLY_VALID_NOT_ADMITTED`; `mayDispatchWorkGrant()` is
unconditionally false. This module does NOT create a Warden decision,
WardenExecutionGrant, ExecutionAdmission, worker execution lease,
River reservation, or verified effect.

**Important dependencies before actual execution:**
1. Trusted Genesis Registry capability, principal, estate, context and
   authoritative Warden key/issuer lookup (not caller/LLM-provided trust).
2. Official Warden signing serialization profile, key rotation, revocation
   freshness and per-action grants with explicit economic/token budgets.
3. Authenticated DigitalMe principal receipt bound to every request.
4. Separate `GENESIS-EXECUTION-ADMISSION-001`, replay/fencing state,
   containment, human approval where applicable, River reservation and
   provider-native effect readback.
5. River evidence seal following observed real effect; a draft is not proof
   of material execution.

Test:
```sh
npm ci
npm run type-check
npx vitest run modules/warden/work-plan-grant-verifier.test.ts
```

No runtime registration or deployed execution code is changed by this PR.
