# ALPHA-AGENT-RUNTIME-BINDING-001

Synthetic AF-002 / AF-003 conformance package for the Alpha Agent Fabric.

## Canonical separation

`ENTITY ≠ AGENT ≠ LLM ≠ AUTHORITY`

- Entity: represented principal.
- Agent: Warden-issued governed runtime interface.
- Model: replaceable cognition provider/adapter.
- Warden: authority and policy issuer.

The model cannot issue Agent identity, enlarge authority, generate an executable action token, or survive Warden revocation by changing provider.

## Synthetic identities

- Entity: `LAB-COMPANY-001`
- Requester: `DIGITALME-ALPHA-TEST-001`
- Agent Pack: `AGENT-PACK-COMPANY-BASE-001@1.0.0`
- Agent: `AGENT-LAB-COMPANY-001`
- Issuance: `AGENT-ISSUANCE-LAB-COMPANY-001`
- Warden: `WARDEN-ALPHA-RC1-001`
- Model A binding: `MODEL-BINDING-A-001`
- Model B binding: `MODEL-BINDING-B-001`

## Executable proof

1. Warden evaluates the issuance request.
2. Only `ALLOW` produces an ACTIVE bounded authority envelope.
3. A separately Warden-approved Model A binding activates the Agent runtime.
4. Model A may emit proposals, but proposals carry no authorization/action token.
5. Warden separately approves Model B.
6. Runtime supersedes Model A with Model B while preserving `agent_id`, `issuance_id`, represented entity and authority fingerprint.
7. Existing session continuity survives the swap.
8. Binding lineage records the predecessor and Warden change decision.
9. Warden revocation terminates later invocation regardless of active model/provider.

## Fail-closed vectors

- no Warden issuance -> no runtime;
- `DENY` or `ESCALATE` issuance -> no ACTIVE Agent;
- unapproved model adapter -> no binding change;
- Agent/issuance/entity/authority drift during swap -> rejected;
- duplicate swap idempotency key -> no duplicate active binding;
- model output -> proposal only, never authority;
- post-revocation invocation -> rejected;
- no external network/provider dependency in this conformance package.

## Provider posture

The adapters are deterministic fixtures. Supabase, Neon and external LLM APIs are not required to prove AF-002/AF-003 semantics. Provider-specific model adapters can be added later behind the same interface and Warden binding decision contract.

This package does not claim to be the production Warden service or a production model gateway. It proves the runtime boundary before provider activation.

## Governance

- `Believers-common-group/SynergyzeGovernance#17`
- `Believers-common-group/SynergyzeGovernance#25`
- `Believers-common-group/SynergyzeGovernance#13`
- `Believers-common-group/mcp-node-synnergyze#39`

Promotion into `genesis` requires the full repository test, lint, type-check and bridge/compute gates to remain green.
