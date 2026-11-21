# SYN-WARDEN-AGG-001 — Platform × Agent Aggregation Constitution

Status: **Proposed contract, review-only, no deployment or IAM mutation**

## Operating separation

| Plane | Owner | Responsibility |
|---|---|---|
| Identity, accounts and licenses | Genesis + DigitalMe | Registered account category, legal/principal identity, license assignments and independently resolved human authority |
| Platform aggregation | Synnergyze | Connect independently operated platforms and their accounts, expose licensed capabilities and coordinate workflows |
| Agent aggregation | Warden | Register agent appointments, issuance lineage, scope, platform binding and policy review |
| Execution | Synnergyze after Warden | Invoke an actual adapter only with qualified provider rights, authorization and execution checkpoint |
| Evidence | RiverOS | Capture provenance, transitions, receipts and reconciliation, not blanket copies of external platform content |

## License-matched topology

Each Genesis account is of category `INDIVIDUAL`, `INSTITUTIONAL`, or `ENTERPRISE`.
Each platform and each agent must reference the **same actual account and license assignment**. Neither an enterprise nor an institution category implies broader authority; actual capability rights, delegated roles and constraints determine permissions.

A human belongs to an account by a verified membership and acting capacity. The same human may have multiple account memberships, but may not silently bridge provider accounts, Warden agents, paid licenses, tenants or evidence between them. The server must resolve the membership for each specific request.

An agent can be associated with multiple platform bindings **only by separate scoped assignments**, not by inheriting all capabilities of the organization. Agent contribution records must carry the human originator, principal, agent binding, platform binding, requested capability, content digest, source references, correlation and time.

## IAM command catalog

The catalog includes license assignment/revocation, platform attach/detach, agent issuance/revocation, agent/platform binding/unbinding, invocation and contribution read/submission. These are proposed **command names**, not shell commands, cloud IAM role grants, or automatically executable provider APIs.

Commands enter as `DRAFT` with `authorized:false`. Synnergyze and the registry resolve existing identity/licensing; the Warden independently decides. For IAM changes that themselves alter authority (e.g., a new license or agent issuance), a separately authorized administrator and approval workflow must validate the new target state — an ordinary member cannot self-grant merely because the command exists in the catalog.

## Preflight

`modules/aggregation/preflight.ts` validates:

- canonical account, principal, category, license, membership and evidence alignment;
- active, time-valid account/license/membership and platform/agent admission;
- agent-to-platform explicit assignment and capability intersection;
- human originator and per-account IAM command eligibility;
- rejection of self-declared authorization/action tokens.

A successful preflight is **READY_FOR_WARDEN**, not ALLOW or EXECUTED. It does not call external systems, mutate IAM, issue licenses, issue agents, or forge River receipts.

## Integration plan

1. Register actual independent accounts and license assignments in Genesis, maintaining per-category partitions.
2. Use authoritative DigitalMe and Registry resolver services to produce authenticated membership and licensed records.
3. Attach provider platform accounts in Synnergyze with consent and provider-specific rights.
4. Record Warden agent issuance and explicit platform binding (distinct from provider/MCP model installation).
5. Compose a WardenDecisionRequestV1 for the exact action, target, principal, capacity, program and correlation.
6. Obtain real Warden policy decision and recheck license, delegation, context, revocation and validity immediately before execution.
7. Reserve River evidence, execute the qualified provider adapter, reconcile observed effect and persist attribution.
8. Deny, revoke or hand back using narrow scope; retain evidence without cross-account leakage.

Existing synthetic Warden and AgentFabric implementations are fixtures, **not** production authority. No migration or deployment is supplied by this PR.
