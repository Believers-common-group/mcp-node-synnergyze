# QEL-FIXTURE-001 acceptance evidence

Acceptance target:

> An Alpha Node operator can consume a provider-neutral QEL operational frame and Pod Pulse without learning the underlying machine or platform vocabulary, while Warden authority and River verification remain distinct boundaries.

## Operator contract

The fixture exposes the compute plane as one QEL frame and one Pod Pulse:

- **NOW** reports object count, blocked count, critical count and aggregate health.
- **NEEDS** reports material, service, information or approval demand.
- **RISKS** reports severity and confidence without converting inference into fact.
- **MOVES** reports available actions with `ALLOWED`, `APPROVAL_REQUIRED`, `DENIED` or `UNRESOLVED` authority.
- **PROOF** reports evidence freshness, unresolved outcomes and River-bound verified outcomes.

The operator does not need provider vocabulary to distinguish these required states:

| Scenario | QEL state | Health | Required interpretation |
| --- | --- | --- | --- |
| Governed compute available | `READY` | `GOOD` | Monitoring is available; execution still requires the declared authority. |
| Apple MPP configured | `READY` | `WATCH` | Request Warden proof before execution. |
| Apple MPP misconfigured | `DEGRADED` | `ACT` | Configure the runner or disable the provider. |
| Non-governed compute settings | `BLOCKED` | `ACT` | Restore governed defaults; monitoring remains available. |
| Compute result without River receipt | outcome `EVIDENCE_BOUND` | unchanged | Do not call the effect verified. |
| Fresh matching River receipt | outcome `VERIFIED` | unchanged | The effect may be counted as River verified. |
| Mismatched/future River receipt | outcome `CONFLICTING_EVIDENCE` | unchanged | Escalate the evidence conflict; do not retry or claim success. |
| Stale River receipt | outcome `EVIDENCE_BOUND` | unchanged | Obtain fresh verification evidence. |

## Reproducible verification

Run:

```sh
npm run test:qel:acceptance
npm run type-check
npm run lint
```

The QEL suite covers ready, approval-required, degraded, blocked, evidence-bound, verified, conflicting and stale-receipt behavior.

Datadog is a separate environment acceptance gate. A green pull-request capability workflow may record that execution was skipped. An acceptance run must be manually dispatched with `require_execution=true`; it fails when credentials are unavailable.

The licence/SBOM workflow retains the CycloneDX SBOM, SHA-256 digest, dependency licence inventory and its digest as a workflow artifact tied to the tested commit SHA.

## Remaining human decision

A designated Alpha Node operator or Warden reviewer must record whether the table and returned Pulse are understandable without consulting provider-native vocabulary. That approval is external evidence and is not inferred from automated tests.
