# Synnergyze two-business collaboration pilot R0.4

**Status: ISOLATED / SYNTHETIC / NOT ADMITTED / NO EXTERNAL EFFECTS**

This proof-of-concept provides a narrow, universal collaboration workflow with **two independent simulated organisations** and a finance reviewer. It does **not** grant BNR membership, access private repositories, connect to GitHub Apps, call a Warden or RiverOS service, communicate with Tally or an ERP, read a user machine, expose an HTTP service, or deploy to Vercel.

## Run without installing dependencies

Requires Node.js 22+.

```sh
node --test sandbox/synnergyze-collaboration-r04/pilot.node-check.mjs
node sandbox/synnergyze-collaboration-r04/demo.mjs
```

## What can be demonstrated

1. Register synthetic Business A and Business B actor identities and mock independent approval.
2. Create a workspace for Business A; send and accept Business B's invitation.
3. Issue expiring, scoped synthetic action grants. An uninvited or unauthorised actor is denied.
4. Propose an order using *integer minor currency units*; a second actor must accept.
5. A separate reviewer must approve finance; an in-memory mock ERP/Tally adapter returns an explicit `DRY_RUN_ACCEPTED` receipt.
6. Replay the same idempotency key without another mock adapter invocation. A conflicting replay is blocked. An uncertain response enters `RECONCILIATION_REQUIRED` without retrying.
7. Revoke a test grant; future reads are denied. Inspect filtered, **synthetic** hash-linked evidence.

`synthetic=true` and `externalEffects=false` are part of every adapter result. The chain is a process-local hash chain, **not a RiverOS signature or a tamper-resistant external ledger**.

## Risk boundaries — do not use as a production service

- Memory state disappears when the process exits; no persistence, distributed locking, cross-process idempotency, auth session, encryption at rest, external policy verification, qualified legal representation, tenancy-level IAM, runtime/transport security or real finance posting exists.
- The test-grant issuer and actor approver are **stubbed**, not authenticated Warden/BNR/DigitalMe authority.
- Test timestamps and grants are intentionally synthetic; production grants require cryptographic verification, signed revocation, durable policy/state and jurisdiction checks.
- Node.js module imports only `node:crypto` and its own source; there are no package dependencies, network listeners or secrets.
- The automated tests exercise 20 local engineering scenarios. They are **not** the independently documented 20 business-UAT cases, and no UI-based human acceptance has been performed.
- This proof-of-concept is additive and **does not modify** existing Genesis, Warden, RiverOS, AWCE or deployment branches.

## Release gates

Before any real integration: reconcile owner mandates, canonical source/PR dependencies, identity/authority provenance, persistent tenant isolation, Warden admission, RiverOS evidence schema, actual connector protocols, security assessments, browser/operator UI, rollback, audit retention, operational readiness and independent UAT.

Governance source of record: [Draft PR #157 — Synnergyze R0.3 acceptance contract](https://github.com/Believers-common-group/SynergyzeGovernance/pull/157). The sandbox PR targets `main` in **draft** state and should remain unmerged until independently reviewed.
