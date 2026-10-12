# Authority Reference R0.9 — Native Synnergyze preview

**Proposed only — not admitted, not a production worker, no source retrieval.**

## Verified integration source
The repository branch `estate-console-v0.1` contains the existing `compileQelPlanToSynnergyzeDraftsV1` in `modules/synnergyze/program-bridge.ts`, typed `NormalizedIntentV1` / `ProgramPlanDraftV1` in `modules/qel/contracts.ts`, and the `buildWardenDecisionRequestV1` gate. The new preview calls **that native compiler**, not a replica of the application code.

Connected Vercel metadata lists a project `synnergyze-genesis-mcp` with canceled recent deployments from `mcp-node-synnergyze`. This is a repository/runtime **candidate**, not evidence of a commissioned active Agentic Factory worker. Existing River reservations and execution adapters in this branch are explicitly synthetic. No production worker identity, approved admission or signed live River receipt has been established.

## Integration surface
- `modules/synnergyze/authority-reference-preview.ts` is an isolated pure preview adapter; exported function only, no MCP tool registration, event persistence, HTTP or background execution.
- Accepts one of `discover`, `retrieve_public`, `verify`, `reference` for `OFFLINE_REVIEW` or `STAGING_REVIEW`.
- Builds non-authoritative QEL intent/plan inputs and invokes `compileQelPlanToSynnergyzeDraftsV1`.
- Every output has `state=HOLD`, `authorized=false`, `executionAllowed=false`, `externalEffects=false`.
- Adds unresolved requirements to force the native compiler's plan state away from `READY_FOR_AUTHORIZATION` and the Warden request bridge to deny it.
- Keeps claimed event date separate from independent source date, timestamp and verification date; those latter fields remain null.
- Binds the claimed date and record reference into a deterministic candidate digest, but makes **no official-record authentication assertion**.

## Release gates (all closed)
1. Identify and independently commission the exact Synnergyze worker, signing identity, immutable artifact, runtime and owner.
2. Confirm a native job contract, trust and its policy version with the responsible owner.
3. Obtain explicit Warden capability admission and a live matching River admission receipt.
4. Independently verify DigitalMe identity/delegation, worker attestation and one-time execution permit.
5. Approve outbound-source permissions, redirects/content limits and evidence retention.
6. Confirm distinct signed live River execution receipt; separate deployment approval.

### Offline tests
```bash
npm ci --ignore-scripts
npx vitest run modules/synnergyze/authority-reference-preview.test.ts
```

The project CI checks are for code review only. No new handler, server start, registry connection, signing key, database mutation or production deployment is provided by this PR.
