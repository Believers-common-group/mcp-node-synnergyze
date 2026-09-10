# Osiris / EFOM Policy Kernel R0.1 — Design

Date: 2026-09-10
Status: Proposed for implementation
Target branch: `feat/osiris-efom-policy-r0-1`
Base branch: `genesis`

## 1. Purpose

Introduce a common policy and rules layer for Osiris / EFOM observations without creating a second authority plane. Warden remains the sole decision authority. Osiris / EFOM contributes governed observation, inference, provenance, confidence, visibility, and temporal context that Warden may evaluate.

The design must preserve the existing decision and execution chain:

`request -> Warden decision -> River reservation -> Warden execution checkpoint -> Synnergyze controlled execution -> post-execution observation -> effect verification`

The new layer extends that chain; it does not bypass or replace it.

## 2. Non-negotiable invariants

1. Observation is not identity.
2. Finding is not a decision.
3. Discrepancy is not a violation.
4. Inference is not authority.
5. Sensor, model, satellite, CCTV, maritime, air, terrain, or external-provider output cannot itself authorize execution.
6. Consequential action requires a current Warden `ALLOW` decision, valid action token, River evidence reservation, valid execution checkpoint, and matching action lineage.
7. Insufficient or materially conflicting evidence must fail closed or escalate for review; it must not silently promote to an actionable fact.
8. All policy-relevant physical-world inputs require provenance, observation time, source type, confidence or assurance context, and validity where applicable.
9. Observation time, inferred event interval, review time, decision time, execution time, and verification time remain distinct.
10. Existing immutable architecture framing remains additive: new rules carry scope, effective time, authority, evidence, and supersession lineage rather than mutating old facts in place.

## 3. Scope

### In scope

- Warden request and synthetic policy contracts.
- Warden decision evaluation rules.
- Runtime authorization bridge semantics.
- Osiris / EFOM domain policy types and evaluator.
- River evidence typing for observation/finding/discrepancy/attestation/decision artifacts.
- Genesis alignment for observation/inference/corroboration/verification claim states.
- Synnergyze execution-gate enforcement that physical-world findings cannot directly actuate.
- Tests covering policy, authorization, evidence, temporal, and actuation boundaries.

### Out of scope

- Replacing the Warden decision service with a new engine.
- Introducing autonomous enforcement from Osiris / EFOM.
- Reworking PESTEL classification rules beyond consuming shared evidence metadata where useful.
- Replacing existing `RuntimeEffectClass` values.
- Changing SILK settlement semantics.
- Adding live external satellite or CCTV providers in this release.

## 4. Architecture

### 4.1 Policy ownership

Warden is the policy decision point. Osiris / EFOM is a policy-information source.

The policy kernel consists of:

- `modules/osiris/contracts.ts`: domain contracts for governed physical-world observations and findings.
- `modules/osiris/policy.ts`: deterministic admissibility and escalation rules.
- Warden contract extensions: request-bound operation class and observation context references.
- Warden decision-service integration: evaluation of the Osiris / EFOM policy result as a mandatory precondition when the request binds such context.

No Osiris function emits a Warden action token.

### 4.2 Semantic operation classes

Add a semantic operation class distinct from runtime effect class:

- `OBSERVE`: capture or retrieve an observation.
- `INFER`: derive a finding from one or more observations.
- `DISCLOSE`: reveal or share governed observation/finding material.
- `ATTEST`: assert that evidence satisfies a bounded statement.
- `ACT`: request a consequential runtime effect.

These classes express policy meaning. They do not replace `READ`, `WRITE`, `EXECUTE`, `FINANCIAL`, `PHYSICAL`, or `EXTERNAL_PROVIDER` in the runtime authorization bridge.

Suggested default mapping:

- `OBSERVE` -> usually `READ`
- `INFER` -> usually `READ` or `WRITE` depending on persistence
- `DISCLOSE` -> `EXTERNAL_PROVIDER` or `WRITE` depending on destination
- `ATTEST` -> `WRITE`
- `ACT` -> `EXECUTE`, `PHYSICAL`, `FINANCIAL`, or `EXTERNAL_PROVIDER` according to the governed capability

The mapping is policy data, not an implicit rule hidden in adapters.

## 5. Osiris / EFOM contracts

### 5.1 Observation

`EfomObservationV1` fields:

- `observationRef`
- `sourceRef`
- `sourceType`
- `subjectCandidateRef?`
- `locationRef?`
- `terrainClass?`
- `observedAt`
- `validUntil?`
- `contentDigest`
- `sourceEvidenceRefs`
- `confidence`
- `assuranceLevel?`
- `visibilityScope`
- `jurisdictionRef?`
- `purposeRef`
- `synthetic?`

Observation contracts never assert canonical identity merely because a subject candidate is present.

### 5.2 Finding

`EfomFindingV1` binds one or more observations and records:

- `findingRef`
- `findingType`
- `observationRefs`
- `statementDigest`
- `confidence`
- `derivedAt`
- `validUntil?`
- `sourceEvidenceRefs`
- `status`

Status values:

- `HYPOTHESIS`
- `SUPPORTED`
- `CONFLICTED`
- `CORROBORATED`
- `REJECTED`
- `SUPERSEDED`

A finding may inform Warden but is never itself an authorization.

### 5.3 Discrepancy

`EfomDiscrepancyV1` records a mismatch between observations, findings, registry state, or declared state. It carries severity and review requirements but does not use violation terminology unless a separate authoritative compliance process reaches that conclusion.

### 5.4 Attestation

`EfomAttestationV1` requires an explicit attestor principal, authority references, evidence references, statement digest, issued time, expiry where applicable, and supersession lineage.

An attestation can be an input to Warden; it is not an `ALLOW` decision.

## 6. Warden contract extensions

Extend `WardenDecisionRequestV1` additively with optional fields so existing callers remain source-compatible:

- `operationClass?: EfomOperationClassV1`
- `observationRefs?: readonly string[]`
- `findingRefs?: readonly string[]`
- `discrepancyRefs?: readonly string[]`
- `attestationRefs?: readonly string[]`
- `purposeRef?: string`
- `visibilityScope?: string`
- `jurisdictionRef?: string`
- `physicalWorldContextDigest?: string`

Extend the synthetic policy with optional policy controls:

- `allowedOperationClasses?`
- `minimumObservationConfidence?`
- `requireCorroborationForOperationClasses?`
- `manualReviewOnConflict?`
- `allowedVisibilityScopes?`
- `allowedPurposeRefs?`
- `allowedJurisdictionRefs?`

The decision service remains fail-closed. If a request binds Osiris / EFOM context but required policy information is absent, return `DENY` with a stable reason code rather than silently ignoring the context.

## 7. Policy evaluation rules

The deterministic evaluator returns one of:

- `ADMISSIBLE`
- `REVIEW_REQUIRED`
- `REJECTED`

with stable reason codes and normalized evidence references.

Minimum rules:

- Missing provenance -> reject.
- Invalid or future observation timestamp -> reject.
- Expired observation -> reject for actionable use; possibly admissible for historical read-only use.
- Confidence below policy threshold -> review or reject according to operation class.
- Conflicted finding used for `ACT`, `ATTEST`, or `DISCLOSE` -> review required unless a stricter policy rejects it.
- `ACT` from a bare observation or uncorroborated hypothesis -> reject.
- Visibility scope outside policy -> reject.
- Purpose mismatch -> reject.
- Jurisdiction mismatch -> reject.
- Material evidence conflict -> review required.
- Valid, corroborated, in-scope observation/finding context -> admissible as policy input, not as authorization.

## 8. Warden decision behavior

The Warden decision service integrates the policy result before capability allow.

- `REJECTED` -> Warden `DENY`.
- `REVIEW_REQUIRED` -> Warden `ESCALATE`.
- `ADMISSIBLE` -> continue evaluating existing identity, authority, policy, capability, and time rules.

Only the existing Warden allow path can produce an action token.

New reason codes should be stable, machine-readable, and prefixed consistently, for example:

- `efom_context_missing`
- `efom_provenance_missing`
- `efom_observation_expired`
- `efom_confidence_below_threshold`
- `efom_material_conflict`
- `efom_action_from_unverified_observation`
- `efom_visibility_scope_not_permitted`
- `efom_purpose_not_permitted`
- `efom_jurisdiction_not_permitted`

## 9. Runtime authorization bridge

`RuntimeEffectClass` remains unchanged.

The runtime bridge must:

1. Include the semantic operation class and physical-world context digest in the canonical request digest when present.
2. Require `requestedEffect` for every non-READ runtime effect as today.
3. Refuse a consequential receipt if the request operation class is not `ACT` where policy classifies the capability as physical, financial, execute, or external-provider actuation.
4. Preserve DigitalMe principal binding, policy references, authority references, consent references, grant digest, and expiry.

This ensures an `OBSERVE` or `INFER` request cannot be relabeled late in the path as an actuator call.

## 10. River evidence extensions

Add a typed evidence artifact envelope instead of changing existing generic event/effect receipts destructively.

`GovernedEvidenceArtifactV1` should include:

- `artifactRef`
- `artifactType`: `OBSERVATION | FINDING | DISCREPANCY | ATTESTATION | DECISION`
- `sourceRefs`
- `evidenceRefs`
- `contentDigest`
- `observedAt?`
- `derivedAt?`
- `issuedAt?`
- `validUntil?`
- `correlationId`
- `supersedesArtifactRef?`

River stores provenance and causal lineage. Warden decides authority.

## 11. Genesis alignment

Do not add a parallel truth-state vocabulary when existing claim states suffice.

Map EFOM states as follows:

- raw observation -> `OBSERVED`
- evidence-backed observation -> `EVIDENCED`
- multi-source corroborated finding -> `CORROBORATED_PUBLIC` where sources are public, otherwise retain an evidence-backed controlled claim state without falsely marking public corroboration
- authoritative external verification -> `AUTHORITATIVELY_VERIFIED`
- model-derived unresolved claim -> `INFERRED`
- materially conflicting claim -> `DISPUTED`
- replaced claim -> `SUPERSEDED`

No EFOM adapter may directly set `AUTHORITATIVELY_VERIFIED` without an authoritative source or governed attestation path.

## 12. Synnergyze execution boundary

Synnergyze controlled execution keeps all existing checks and gains an explicit semantic-actuation guard:

- Warden decision must be `ALLOW`.
- Decision/action/token/correlation must match.
- River reservation must be current and matching.
- Execution checkpoint must be `VALID`.
- Device-security requirements remain enforced.
- Containment evaluation must allow execution.
- For consequential runtime effect classes, the request/action lineage must carry `operationClass = ACT` or an equivalent normalized action binding from Warden.

Findings, discrepancies, or attestations can influence Warden decisions but cannot be passed to an adapter as substitutes for an authorization token.

## 13. PESTEL boundary

PESTEL remains a separate deterministic classification domain. Existing legislative keyword and confidence rules are not replaced by EFOM rules.

PESTEL may consume shared evidence metadata such as provenance, jurisdiction, timestamps, and confidence, but its classification ontology remains political/economic/social/technological/environmental/legal.

## 14. Error handling and fail-closed behavior

Every policy failure must resolve deterministically to one of:

- structured reject -> Warden deny,
- structured review -> Warden escalate,
- malformed policy/context -> Warden deny,
- runtime mismatch after allow -> execution gate exception.

No malformed or absent EFOM field may default to actionable authority.

## 15. Test strategy

Implementation follows test-first development.

Required test groups:

1. Warden decision tests
   - low-confidence observation
   - expired observation
   - missing provenance
   - future observation
   - visibility mismatch
   - purpose mismatch
   - jurisdiction mismatch
   - conflicted evidence
   - bare observation attempting `ACT`
   - corroborated evidence continuing to existing capability authorization

2. Runtime authorization tests
   - operation class included in canonical digest
   - `OBSERVE` cannot produce consequential actuation receipt
   - `ACT` with matching runtime effect can proceed
   - relabel/tamper produces digest mismatch or rejection

3. River evidence tests
   - each artifact type serializes deterministically
   - supersession lineage is preserved
   - timestamps remain semantically distinct

4. Genesis alignment tests
   - observation maps to observed/evidenced, not authoritative verification
   - conflicts map to disputed
   - supersession is additive

5. Synnergyze execution tests
   - finding without Warden token cannot actuate
   - expired/revoked/superseded checkpoint blocks execution
   - valid EFOM-informed Warden allow still requires River reservation and containment allow

6. End-to-end conformance test
   - observation -> finding -> Warden request -> allow -> River reservation -> execution checkpoint -> Synnergyze execution -> post-execution observation -> verified effect

## 16. Compatibility

All new Warden request fields are optional at the type level in R0.1. Existing non-EFOM flows continue unchanged.

Strict EFOM semantics activate when one or more of the following is present:

- `operationClass`
- an EFOM observation/finding/discrepancy/attestation reference
- `physicalWorldContextDigest`

This preserves current flows while preventing partial EFOM adoption from bypassing the policy kernel.

## 17. Files expected to change

Likely additions:

- `modules/osiris/contracts.ts`
- `modules/osiris/policy.ts`
- `modules/osiris/policy.test.ts`
- `modules/river/governed-evidence.ts`
- `modules/river/governed-evidence.test.ts`

Likely modifications:

- `modules/warden/contracts.ts`
- `modules/warden/decision-service.ts`
- `modules/warden/decision-service.test.ts`
- `modules/warden/runtime-authz-bridge.ts`
- `modules/warden/runtime-authz-bridge.test.ts`
- `modules/river/contracts.ts`
- `modules/synnergyze/contracts.ts`
- `modules/synnergyze/execution-gate.ts`
- `modules/synnergyze/execution-gate.test.ts`
- `modules/genesis-node-builder/contracts.ts` only if an explicit mapping helper or additional controlled claim state is proven necessary; otherwise no schema expansion.

## 18. Acceptance criteria

R0.1 is complete only when:

- Osiris / EFOM cannot mint or synthesize a Warden authorization token.
- Observation, inference, discrepancy, attestation, and decision remain distinct objects.
- Consequential action cannot proceed from observation/finding state alone.
- Warden remains the sole authority decision point.
- River preserves source and temporal lineage.
- Synnergyze still requires the full execution interlock.
- Existing non-EFOM tests remain green.
- New EFOM policy tests cover fail-closed and escalation behavior.
- Type-check, lint, unit tests, and affected conformance tests pass before PR readiness is claimed.
