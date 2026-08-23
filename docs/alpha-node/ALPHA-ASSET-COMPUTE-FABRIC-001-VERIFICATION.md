# ALPHA-ASSET-COMPUTE-FABRIC-001 — Verification Record

Status: PUBLIC-SAFE ALPHA 0.1 EVIDENCE RECORD

Branch: `feat/vsr-asset-compute-fabric-alpha`

Pull request: `#71`

This record distinguishes observed repository/CI evidence from integrations that have not been exercised. It is not evidence of production Genesis, Warden, RiverOS, SILK, GCP, Cloud Workstations or financial-provider operation.

## Verified implementation surface

The branch contains a self-contained TypeScript module under `src/vsr/assetCompute/` with:

- `InMemoryFundingLedger`;
- Warden decision validation and execution capability issuance;
- guarded execution state transitions;
- replay-safe `InMemoryEventLog`;
- deterministic provider adapter;
- `AssetComputeFabric` orchestration;
- independent effect-verifier contract;
- provider-failure reservation release and exception/reconciliation evidence;
- effect-rejection evidence and derived-asset gating;
- completed-execution replay/idempotency protection; and
- `index.ts` public module exports.

No change to the legacy application entrypoint is required for this Alpha slice.

## TDD evidence chain

### Task 1 — funding reservation

RED — commit `0e0321fa010a2ec44f5356b3db3b8eb6b9bac240`

- test run `32600061213`: failed because `./fundingLedger.ts` was intentionally absent;
- type-check run `32600061201`: failed on the same missing implementation.

GREEN — commit `5d09d49edc847f879eff84592e6e802a719794b0`

- test `32617760135`: PASS;
- type-check `32617760057`: PASS;
- lint `32617760054`: PASS;
- Datadog synthetics `32617760139`: PASS.

Observed economic fixture: INR 100 -> reserve INR 50 -> settle INR 32 -> release INR 18 -> INR 68 available / INR 32 settled.

### Task 2 — Warden capability gate

RED — commit `fc68c1ef75cfd137ec1fa79cfa0db953e4b71988`

- test `32618542571`: failed because `./wardenGate.ts` was intentionally absent;
- type-check `32618542574`: failed on the same missing implementation.

GREEN — commit `a81d54575a3f02270c7eb304bac7896a2b4ff01a`

- test `32618595226`: PASS;
- type-check `32618595339`: PASS;
- lint `32618595229`: PASS;
- Datadog synthetics `32618595261`: PASS.

Verified boundary: sufficient funding does not override `DENY`; expired `ALLOW` cannot issue a capability.

### Task 3A — guarded execution states

RED — commit `ef988b2060eae307fc11ca527f45058e20d36978`

- type-check `32618827220`: failed because `./stateMachine.ts` was intentionally absent.

GREEN — commit `0204e6c816115b9b2577bc96fe533d3fdf1f3dac`

- test `32618880716`: PASS;
- type-check `32618880744`: PASS;
- lint `32618880756`: PASS;
- Datadog synthetics `32618880738`: PASS.

Verified rejects include `REQUESTED -> DISPATCHED`, `AUTHORIZED -> EFFECT_VERIFIED`, and `DISPATCHED -> SETTLED`.

### Task 3B — River-style event replay

RED — commit `b06b9a72e759fffed28898d7b20e93c5faf7ba05`

- type-check `32618915615`: failed because `./eventLog.ts` was intentionally absent.

GREEN — commit `6dbebc3706bcd636a4266b86803da1f633665d73`

- test `32618959626`: PASS;
- type-check `32618959625`: PASS;
- lint `32618959613`: PASS;
- Datadog synthetics `32618959788`: PASS.

Verified boundary: exact event replay returns the existing event; changed content under the same event ID fails `EVENT_IDEMPOTENCY_CONFLICT`.

### Task 4 — provider boundary

RED — commit `24b21bc9f47d8f067f30b36556cd4ae74bb9c2e3`

- test `32619578880`: failed only because `./providerAdapter.ts` was intentionally absent; the existing seven suites remained green.

GREEN — commit `86a2ece9df7cd7925e75bcce7ee0cf5fa6a2193e`

- test `32619628638`: PASS;
- type-check `32619628569`: PASS;
- lint `32619628626`: PASS;
- Datadog synthetics `32619628567`: PASS.

Verified boundary: provider completion returns receipt + output observation and cannot self-declare effect verification.

### Task 5A — governed end-to-end happy path

RED — commit `f37d3c9f261c6789d06f1ac70760ca28d297d5eb`

- `fabric.test.ts` failed because `./fabric.ts` was intentionally absent while the previously implemented suites remained green.

GREEN — commit `342849910c78da38e6b12664a47196465bb93c61`

- test `32619879330`: PASS;
- type-check `32619879283`: PASS;
- lint `32619879274`: PASS;
- Datadog synthetics `32619879296`: PASS.

Verified path: externally supplied resolution refs -> Warden validation -> funding reservation -> capability -> provider -> output observation -> independent effect verification -> derived-asset candidate -> settlement -> closure.

### Task 5B — provider failure recovery

RED — commit `32c732134d776e1a76e0f7ca9e1355370590750f`

- test `32619930831` observed the intended defect: after a provider failure the balance was INR 60 available / INR 40 reserved instead of full release.

GREEN — commit `9c91005f6f7af5570201daa1fee0f24e0cb0c0f9`

- test `32620068920`: PASS;
- type-check `32620068916`: PASS;
- lint `32620068923`: PASS;
- Datadog synthetics `32620068917`: PASS.

Verified boundary: pre-settlement provider failure releases the full Alpha reservation, records exception/reconciliation and creates no derived-asset candidate.

### Task 5C — failed effect verification

RED — commit `98b35c5f2441ac77d2ea9a9eb6cd601f07afcd39`

- test `32620115783` failed only because the explicit `effect.rejected` event was absent; the funding release and other recovery behavior already held.

GREEN — commit `2053b4d697b65867c80cb3f4c66a5a06e23b155f`

- test `32620166446`: PASS;
- type-check `32620166425`: PASS;
- lint `32620166415`: PASS;
- Datadog synthetics `32620166426`: PASS.

Verified boundary: provider completion is retained as evidence, effect rejection is separately recorded, reservation is released under Alpha policy, and no successful settlement or derived asset is inferred.

### Task 5D — completed execution replay

RED — commit `098610184a330a6f5f3badd5c23d5465fb9182d7`

- test `32620237945` observed two intended failures:
  - exact replay called the provider twice (`2` calls vs expected `1`);
  - conflicting completed-execution reuse surfaced `EVENT_IDEMPOTENCY_CONFLICT` rather than a fabric-level execution conflict.

GREEN — commit `942c19ce765b1bfa6ceb2857889ba5f5730b39b9`

- test `32620308037`: PASS;
- type-check `32620308025`: PASS;
- lint `32620308056`: PASS;
- Datadog synthetics `32620308024`: PASS.

Verified boundary: exact completed replay returns the stored result without another provider/ledger/event side effect; conflicting reuse fails `EXECUTION_IDEMPOTENCY_CONFLICT` before side effects.

## Latest verified code snapshot before documentation reconciliation

Commit `285fd171dcc2c4120a69ca6437b3e42722203031` added the module export surface.

Fresh checks on that head:

- test run `32620344416`: PASS — **9 test files / 42 tests passed**;
- type-check run `32620344500`: PASS;
- lint run `32620344378`: PASS;
- Datadog synthetics run `32620344388`: PASS.

The test workflow executed on Node.js `22.14.0` from the repository `.nvmrc`.

## Verified Alpha invariants

The automated evidence above supports these public-safe Alpha statements:

1. Funding availability does not create Warden authority.
2. Expired or denied authority cannot issue an execution capability.
3. State transitions cannot skip the tested authority/funding/effect boundaries.
4. Provider completion is distinct from effect verification.
5. Provider failure before settlement releases the Alpha reservation.
6. Effect rejection is explicitly evidenced and does not create a derived asset.
7. The successful INR 100/50/32/18/68 accounting fixture reconciles.
8. Event replay with changed content fails closed.
9. Completed execution replay does not rerun the provider or settlement.
10. Conflicting completed-execution reuse fails at the fabric boundary.

## Explicitly unverified / not implemented as production integration

Alpha 0.1 does **not** prove:

- live Genesis/Registry principal, asset or rights resolution;
- live Warden decision-service or signed Warden-token verification;
- live RiverOS durable evidence ingestion;
- live SILK account/reservation/settlement persistence;
- GCP, Cloud Workstations, Cloud Run, Batch, AWS, BNR or other real provider execution;
- provider invoice/billing reconciliation;
- mixed-source funding allocations;
- durable idempotency across process restart;
- simultaneous in-flight duplicate suppression across distributed workers;
- canonical Genesis derived-asset registration;
- physical factory/machine capacity routing;
- tax, accounting, credit or regulated-payment treatment; or
- production recovery/compensation policy for partially billable failed effects.

Those are later adapters/contracts and require their own execution evidence.

## Next adapter seams

The tested Alpha module is designed to replace in-memory/simulated dependencies one boundary at a time:

1. **Genesis resolver adapter** — resolve principal, asset, rights/entitlement and canonical derived-asset registration references.
2. **Warden decision adapter** — consume signed/validated external decisions without letting the fabric mint authority.
3. **SILK funding adapter** — durable reservation/settlement with transactional replay safety.
4. **RiverOS event sink** — durable correlated event/effect receipts while retaining append-only replay semantics.
5. **GCP provider adapter** — first real compute execution adapter, initially preferably a bounded container/job target before introducing workstation lifecycle.
6. **Durable execution idempotency store** — replace process-memory completed-result cache and add distributed in-flight lease semantics.

## Repository observations outside this slice

CI `npm i` currently reports **2 high-severity npm audit findings**. This Alpha slice did not perform broad dependency remediation; those findings should be triaged separately rather than hidden inside the asset-compute implementation.

GitHub Actions also reports a platform warning that some action versions target deprecated Node.js 20 internals while the runner forces Node.js 24; the project test runtime itself resolves `.nvmrc` to Node.js 22.14.0.

Vercel preview failures are separate from this module verification. The inspected Vercel project expects a static `public/` output directory while this repository is a Node/MCP service. Alpha verification does not add a fake static output directory to suppress that configuration mismatch.

## Verification rule

Only the observed public-safe evidence above is considered verified. Production system names in this document describe adapter boundaries, not evidence that those systems were exercised.