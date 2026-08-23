# Amazon BNR-001 Design

Status: approved architecture specification
Date: 2026-08-23
Target branch: `agent/amazon-orders-e2e-r01`
Related draft PR: #73

## 1. Purpose

Promote the existing governed Amazon provider integration into the first named BNR candidate node without implying that Amazon has entered, endorsed, contracted for, or activated participation in the network.

`BNR-001` is reserved for Amazon as a proposed external commercial infrastructure node. `ALPHA-NODE-001` remains the reference/demo node. Physical proximity between Alpha and an Amazon office is useful for outreach and pilot coordination only; it creates no authority, entitlement, contract, or activation state.

## 2. Canonical distinction

The system MUST distinguish:

- node identity;
- partner lifecycle;
- service/capability binding;
- external authority evidence;
- technical readiness;
- evidence readiness;
- operational activation.

A named node may exist before it is active.

`BNR-001 = Amazon` MAY exist in `PROPOSED_PARTNER` state.

`BNR-001 = ACTIVE` MUST NOT be asserted unless the required Amazon-side contractual/technical authority and network-side Warden/River/Registry evidence gates are satisfied.

## 3. Partner lifecycle

Add an explicit lifecycle for external BNR partners:

1. `PROPOSED_PARTNER`
2. `ENGAGEMENT`
3. `CONTRACTED`
4. `AUTHORITY_EVIDENCED`
5. `TECHNICALLY_READY`
6. `ACTIVE`
7. `SUSPENDED`
8. `RETIRED`

Transitions are monotonic except that `ACTIVE` may move to `SUSPENDED`, and suspended nodes may return to `ACTIVE` only after re-evaluation.

No API credential, office meeting, cloud account, provider account, commercial conversation, physical proximity, source-code integration, or passing CI job may independently advance a node to `ACTIVE`.

## 4. BNR-001 manifest

`BNR-001` represents Amazon as an external commercial infrastructure node candidate.

Required manifest fields:

- `nodeRef = BNR-001`
- `nodeClass = BNR`
- `partnerRef = PARTNER:AMAZON`
- `partnerLifecycle`
- `registryRef`
- `policySetRef`
- `releaseRef`
- `serviceBindings[]`
- `authorityEvidenceRefs[]`
- `commercialEvidenceRefs[]`
- `technicalEvidenceRefs[]`
- `activationEvidenceRefs[]`
- `activationState`

Initial lifecycle: `PROPOSED_PARTNER`.
Initial activation state: `INACTIVE`.

## 5. Service boundaries

Amazon is not one undifferentiated capability. Each surface is separately governed.

Initial service bindings:

- `AMAZON-SPAPI-ORDERS` — read-only order search/observation; implemented in PR #73.
- `AMAZON-MARKETPLACE-LISTINGS` — separately authorized future effect-bearing capability.
- `AMAZON-FULFILMENT` — future capability, separate authority.
- `AMAZON-ADS` — future capability, separate authority.
- `AMAZON-BUSINESS-PROCUREMENT` — future capability, separate authority.
- `AWS-COMPUTE` — future infrastructure binding; AWS account/contract authority is separate from Seller Partner API authority.

A valid relationship for one service MUST NOT imply authority for any other service.

## 6. Alpha relationship

`ALPHA-NODE-001` remains the reference node and demonstration surface.

Relationship:

`ALPHA-NODE-001 -> proposes/tests governed capability binding -> BNR-001`

Alpha does not become subordinate to Amazon, and Amazon does not become authority over Alpha.

The nearby Amazon office may be recorded only as engagement context in a non-authoritative programme record. It MUST NOT be used as activation evidence.

## 7. Canonical runtime path

The first BNR-001 capability proof uses the existing Amazon Orders runtime:

`DigitalMe / represented principal`
`-> Warden authority decision`
`-> River evidence reservation`
`-> Synnergyze governed execution`
`-> BNR-001 / AMAZON-SPAPI-ORDERS`
`-> provider observation`
`-> non-PII normalization`
`-> Registry projection + deterministic revision`
`-> atomic Registry outbox`
`-> River publication / evidence seal`
`-> VSR and Empire equivalent projection`
`-> SILK economic observation, non-final`

SILK MUST retain `moneyMoved=false` and `settlementFinality=false` for this R0.1 proof.

## 8. BNR readiness model

Extend readiness beyond the existing runtime/authority/evidence trio.

A BNR node readiness result MUST expose:

- `partnerLifecycle`
- `runtimeReadiness`
- `authorityState`
- `evidenceState`
- `commercialState`
- `activationState`
- `blockers[]`
- `readinessCheckedAt`

Recommended values:

- runtime: `BLOCKED | READY`
- authority: `EXTERNAL_UNRESOLVED | EXTERNAL_EVIDENCED`
- evidence: `UNRESOLVED | READY`
- commercial: `UNRESOLVED | EVIDENCED`
- activation: `INACTIVE | ELIGIBLE | ACTIVE | SUSPENDED`

`ELIGIBLE` means all technical and authority prerequisites are satisfied but activation has not yet been explicitly completed.

## 9. Activation predicate

`ACTIVE` is derived, never manually asserted.

Minimum predicate:

`partnerLifecycle == AUTHORITY_EVIDENCED or TECHNICALLY_READY or ACTIVE`
AND `runtimeReadiness == READY`
AND `authorityState == EXTERNAL_EVIDENCED`
AND `evidenceState == READY`
AND `commercialState == EVIDENCED`
AND required service bindings are resolved
AND required Warden policy is active
AND River publication/seal path is operational
AND Registry canonical state is durable
AND explicit activation evidence exists.

Passing synthetic tests does not satisfy the external-evidence terms.

## 10. Authority and credential rules

- Amazon credentials remain provider-native and environment/secret-store held.
- DigitalMe remains the represented principal context.
- Warden remains the authorization boundary.
- Amazon provider authorization does not become Warden authority.
- Amazon account ownership does not become DigitalMe identity.
- No repository secret may be added.
- Restricted Amazon data (`BUYER`, `RECIPIENT`, `TAX`, `PAYMENT`) remains outside ordinary `amazon.orders.search` and requires a separately governed restricted-data/RDT capability.

## 11. River and Registry rules

The Registry stores canonical node/relationship/service-binding/lifecycle state.

A governed provider observation and its Registry outbox event MUST commit atomically when using the relational adapter.

RiverOS remains append/lineage oriented. The runtime MUST NOT claim a River seal until a real River publisher has acknowledged/persisted the material event.

Provider or Registry success with River publication pending is a recoverable intermediate state, not `ACTIVE`.

## 12. Failure semantics

The implementation MUST preserve fail-closed behavior for:

- Warden deny or escalation;
- expired/revoked authority;
- Amazon LWA failure;
- Amazon API timeout/5xx;
- malformed provider response;
- restricted-data request through ordinary capability;
- Registry transaction failure;
- outbox write failure;
- River publication lag/failure;
- duplicate provider event;
- mismatched provider observation;
- revoked Amazon credential;
- commercial/contract evidence expiry.

Unknown external outcomes are reconciled before retry.

## 13. Implementation scope

Modify the existing runtime; do not create a parallel Amazon stack.

Expected code changes:

1. Extend `modules/bnr/contracts.ts` with partner lifecycle, richer readiness and activation types.
2. Add `modules/bnr/readiness.ts` implementing deterministic BNR readiness/activation resolution.
3. Add tests for lifecycle transitions, blockers and fail-closed activation.
4. Add `modules/providers/amazon/bnr-node-001.ts` containing the BNR-001 manifest and Amazon service bindings.
5. Bind the existing Amazon Orders governed runtime to `BNR-001` / `AMAZON-SPAPI-ORDERS` rather than a standalone provider-only identity.
6. Add Registry/outbox event semantics for BNR node/service readiness and activation evidence where required.
7. Keep the existing live-proof harness read-only and external-authority-dependent.
8. Update PR #73 documentation/status so Amazon Orders is explicitly the first BNR capability adapter.

## 14. Tests

Required test families:

- BNR-001 starts `PROPOSED_PARTNER` + `INACTIVE`.
- technical readiness alone cannot activate BNR-001.
- Amazon credential availability alone cannot activate BNR-001.
- physical proximity/engagement metadata cannot activate BNR-001.
- missing commercial evidence blocks activation.
- missing external authority blocks activation.
- missing River readiness blocks activation.
- all required evidence may produce `ELIGIBLE` but not `ACTIVE` without explicit activation evidence.
- explicit valid activation evidence produces `ACTIVE`.
- service authority does not bleed across Amazon service bindings.
- Amazon Orders R0.1 remains read-only and non-final economically.
- VSR and Empire resolve from the same Registry revision.

Repository gates: test, type-check, lint, existing Datadog synthetic checks.

## 15. Definition of done

This architecture slice is complete when:

- BNR-001 exists canonically as Amazon in `PROPOSED_PARTNER` state;
- node lifecycle/readiness/activation are machine-resolved;
- Amazon Orders is bound to BNR-001 as the first governed service capability;
- no code path can infer ACTIVE from credentials, proximity, CI, or provider success alone;
- Registry/River/Warden boundaries remain intact;
- all repository checks pass;
- PR #73 accurately reports remaining live blockers.

A real Amazon partnership or active BNR status remains an external business/governance milestone, not something this code change may fabricate.
