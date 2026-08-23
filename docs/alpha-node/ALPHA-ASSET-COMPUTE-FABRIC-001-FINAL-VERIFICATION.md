# ALPHA-ASSET-COMPUTE-FABRIC-001 — Final Verification Addendum

Status: ALPHA 0.1 IMPLEMENTATION COMPLETE — PUBLIC-SAFE MERGE CANDIDATE

Branch: `feat/vsr-asset-compute-fabric-alpha`

Pull request: `#71`

This addendum extends `ALPHA-ASSET-COMPUTE-FABRIC-001-VERIFICATION.md` with the final code-review hardening performed after the original Alpha 0.1 evidence record. It does not replace that historical RED/GREEN record.

## Final review finding 1 — Warden capability scope was too broad

The initial Alpha Warden decision bound execution ID, principal, currency, cost and expiry, but the capability constructor still accepted the asset, requested operations and selected provider route from the caller. That was an authority-widening seam.

The final contract now requires `WardenDecision` to bind:

- `executionId`;
- `principalId`;
- `assetId`;
- authorized `operations[]`;
- `selectedRoute`;
- `maxCost`;
- `currency`;
- `expiresAt`; and
- the Warden outcome.

Capability issuance now fails closed with:

- `WARDEN_DECISION_ASSET_MISMATCH` when the requested asset differs from the authorized asset;
- `WARDEN_DECISION_OPERATION_MISMATCH` when any requested operation is outside the authorized operation set; and
- `WARDEN_DECISION_ROUTE_MISMATCH` when the selected execution route differs from the Warden-authorized route.

RED evidence: commit `79b1f4903c04804e80d50ec3a70de75cd062270f` added the scope tests and the test workflow failed while the existing gate still permitted substitution.

GREEN implementation: commits `da98bd6cc469845ccac2aea02d6837f42289da9e` and `6f724947216b2025d8b585f0c3e802182cf3a961` made the Warden scope mandatory in the type contract and enforced it in capability issuance.

The end-to-end fixtures were then updated at commit `1afa3aea4ab7fa170fd10b2d0747b2e6f5aafec5`. At that head all five Warden scope/gate tests passed.

## Final review finding 2 — retry clock time was incorrectly part of idempotency identity

The initial completed-execution fingerprint included `input.now`. A semantically identical retry at a later clock time therefore produced `EXECUTION_IDEMPOTENCY_CONFLICT` instead of returning the completed transaction.

RED evidence: test run `32621818625` on commit `1afa3aea4ab7fa170fd10b2d0747b2e6f5aafec5` produced exactly one failure:

- 44 tests passed;
- the later-clock completed replay failed with `EXECUTION_IDEMPOTENCY_CONFLICT`.

GREEN implementation: commit `11afefb031304b66483c64cf4138022806141ec9` removed retry clock time from transaction identity and added the Warden-authorized asset, operations and selected route to the completed-execution fingerprint.

The execution timestamp is still used for the first execution's evidence and Warden-expiry evaluation. It is simply not treated as a stable idempotency identity field for replay of an already completed transaction.

## Fresh final code verification

Fresh CI on commit `11afefb031304b66483c64cf4138022806141ec9`:

- test workflow `32621879935`: PASS — **9 test files / 45 tests passed**;
- type-check workflow `32621879881`: PASS;
- lint workflow `32621879885`: PASS;
- Datadog synthetic workflow `32621879909`: PASS.

The repository test runtime resolved `.nvmrc` to Node.js `22.14.0`.

## Final verified authority/replay invariants

The Alpha 0.1 executable slice now additionally demonstrates:

1. A Warden authorization for one asset cannot be reused to mint a capability for another asset.
2. A Warden-authorized operation set cannot be widened by the capability caller.
3. A Warden-authorized provider route cannot be substituted by the capability caller.
4. The exact Warden scope participates in completed-execution identity.
5. Retry clock time does not change the identity of an already completed transaction.
6. A completed replay at a later clock time does not call the provider, append duplicate events or settle funds again.
7. A materially changed transaction under the same completed execution ID still fails closed with `EXECUTION_IDEMPOTENCY_CONFLICT`.

## Completion boundary

`ALPHA-ASSET-COMPUTE-FABRIC-001` is complete as a **public-safe, in-memory/simulated Alpha 0.1 transaction primitive**.

This completion statement does not claim production Genesis, Warden service, RiverOS storage, SILK persistence, GCP execution, Cloud Workstations execution, external provider billing, durable cross-process idempotency or canonical derived-asset registration. Those remain subsequent adapter milestones and require their own evidence.

The final code-review hardening did not modify the legacy application entrypoint or broaden the Alpha slice into production deployment.
