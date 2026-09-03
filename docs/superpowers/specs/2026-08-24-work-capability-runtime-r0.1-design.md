# WORK-CAPABILITY-RUNTIME-001 R0.1 — Closed Loop Proof

## Status

Design checkpoint for implementation on branch `feat/work-capability-runtime-r0.1`, based on `genesis` at `cfe1138db85ce9b5046d7805cdf60b6fd6a8e02c`.

This design is additive. It must reuse the existing Warden → River reservation → Synnergyze controlled execution → post-execution observation/effect verification → reconciliation/remedy lineage already present on `genesis`. It must not create a parallel authority engine, evidence system, execution gate, or effect-verification path.

## Objective

Prove one end-to-end governed work transaction in which a real objective is decomposed into Work Units, required capabilities are resolved, a lawful human/agent/machine composition is selected, execution occurs through the existing controlled-execution path, River-compatible evidence is produced, the realized effect is verified, and capability evidence is updated from observed work.

The R0.1 proof is intentionally narrow. It is not a capability marketplace, workforce platform, autonomous organization compiler, or production deployment.

## Canonical chain

`Objective → Workflow Instance → Work Unit → Capability Demand → Candidate Composition → Warden Eligibility → Assignment → Controlled Execution → Observation → Verified Effect → Reconciliation/Exception → Capability Evidence Update`

## Core invariants

1. Work exists before assignment. A Work Unit does not contain a preselected worker, agent, or machine.
2. Capability is contextual. A capability claim is valid only for its stated operation/context envelope and evidence lineage.
3. Eligibility is fail-closed and precedes optimization. No score can override a Warden denial, escalation, expired authority, invalid checkpoint, or missing required evidence.
4. Synnergyze selects only among already eligible compositions.
5. Execution must reuse `ControlledExecutionGateV1`; no direct side-effect path is introduced.
6. River/effect evidence records what occurred, not what the plan expected.
7. Capability status is not automatically promoted from telemetry. Observed performance and formal capability status remain distinct.
8. Exact replay must be stable; mutated reuse of an execution/work identity must fail closed.
9. Human, agent, machine, and institutional actors may share a common scheduling envelope without being treated as legally equivalent.
10. R0.1 remains synthetic/reference unless and until explicitly connected to non-synthetic operational adapters and evidence.

## Runtime objects

R0.1 introduces the minimum new object family:

- `ObjectiveWorkRefV1`
- `WorkflowInstanceV1`
- `WorkUnitV1`
- `CapabilityV1`
- `ActorCapabilityProfileV1`
- `CapabilityDemandV1`
- `CandidateCompositionV1`
- `WorkAssignmentV1`
- `CapabilityEvidenceV1`
- `CapabilityOutcomeV1`

Existing objects are reused for:

- Warden decision and execution checkpoint;
- River reservation/evidence lineage;
- Synnergyze execution receipt;
- post-execution observation;
- verified effect;
- reconciliation / exception / remedy handling.

## Actor model

`ActorCapabilityProfileV1.actorClass` supports:

- `HUMAN`
- `AGENT`
- `MACHINE`
- `INSTITUTION`

Each actor profile contains only scheduling/capability metadata required by this slice. Human principals remain resolved through existing DigitalMe/Genesis semantics outside this local contract. Agent and machine capability claims must include implementation/version or asset identity where relevant.

## Composite capability

A `CandidateCompositionV1` may contain one or more actors. R0.1 must support at least:

- human-only;
- human + machine;
- human + agent;
- human + agent + machine.

The composition is evaluated as a unit because observed productive capability may depend on the specific combination of human, agent, machine, process, and context.

## Work Unit

A Work Unit is the smallest governable unit of productive work in this slice. Minimum fields:

- `workUnitRef`
- `objectiveRef`
- `workflowRef`
- `stageRef`
- `action`
- `targetRef`
- `inputStateRef`
- `requiredOutputStateRef`
- `requiredCapabilityRefs[]`
- `qualityThresholds`
- `deadline`
- `riskClass`
- `requiredEvidenceRefs[]`
- `correlationId`

The Work Unit does not embed an assignment.

## Capability Demand

`CapabilityDemandV1` binds a Work Unit to the capability envelope required for execution. R0.1 supports deterministic matching against explicit capability references and context constraints only. No semantic/LLM capability matching is required for this slice.

A demand may be `COVERED`, `CONSTRAINED`, or `MISSING`.

`MISSING` or `CONSTRAINED` must be observable as capability debt; the runtime must not fabricate a candidate.

## Eligibility and assignment

Eligibility is a two-stage boundary:

### Stage 1 — hard eligibility

A candidate composition must satisfy:

- required capability coverage;
- required actor/context binding;
- current availability;
- explicit Warden decision/checkpoint requirements;
- any required evidence/qualification references.

Warden outcomes retain current canonical semantics: `ALLOW`, `ESCALATE`, `DENY`. Execution requires the existing `ALLOW` + valid execution checkpoint path.

### Stage 2 — deterministic selection

Among eligible compositions only, R0.1 may choose by a small explicit comparator:

1. higher evidence confidence;
2. higher expected first-pass quality;
3. lower expected cycle time;
4. deterministic tie-break by composition reference.

No opaque model score is permitted in R0.1.

## Execution integration

The selected assignment is compiled into the existing action/envelope path. The implementation must bind the Work Unit and assignment identity into the action/request lineage without weakening existing Warden, reservation, checkpoint, device-security, correlation, or idempotency constraints.

Execution continues through `ControlledExecutionGateV1` and returns the existing `SynnergyzeExecutionReceiptV1` with `EXECUTED_UNVERIFIED` state.

R0.1 must not create a bypass adapter that writes capability outcomes without the controlled execution gate.

## Observation and effect verification

R0.1 reuses the existing post-execution observation and `EffectVerificationServiceV1` boundary. The Work/Capability layer may add a thin domain adapter that translates an observed production result into the existing observation contract.

A verified effect is still distinct from objective acceptance. Quantity shortfall, quality shortfall, or mismatched state may produce a reconciliation/exception path even where an execution technically completed.

## Capability evidence update

After a verified effect/reconciliation result, the runtime may append `CapabilityEvidenceV1` for every participating actor and for the composite composition.

Minimum evidence fields:

- `capabilityEvidenceRef`
- `capabilityRef`
- `actorOrCompositionRef`
- `workUnitRef`
- `executionReceiptRef`
- `verifiedEffectRef`
- `observedPerformance`
- `evidenceRefs[]`
- `observedAt`
- `synthetic`

Observed performance may include quantity, accepted quantity, rework quantity, first-pass quality, and cycle time where the fixture supplies them.

R0.1 does not automatically mutate formal qualifications or legal credentials. It may update a local evidence-confidence projection only.

## Reference fixture

The first acceptance fixture is a synthetic garment-production Work Unit, because it naturally demonstrates a human/agent/machine composition while remaining isolated from live factory systems.

Reference Work Unit:

`Attach waistband for batch B124`

Target effect:

`500 units reach WAISTBAND_ATTACHED with first-pass quality >= 0.97`

Reference actors:

- `HUMAN:OPERATOR-P17`
- `MACHINE:LOCKSTITCH-M04`
- `AGENT:WORK-INSTRUCTION-A2`

Reference composition:

`P17 + M04 + A2`

The fixture remains explicitly synthetic and does not claim live PLC/MES, machine telemetry, worker credential, payroll, production, or factory activation.

## Failure / exception fixture

At least one acceptance test must produce a partial effect, e.g. accepted quantity below required quantity while quality threshold passes. This must not be relabeled success. It must produce an exception/reconciliation result and a recompilation signal describing the remaining required quantity.

The R0.1 recompilation result may be a deterministic proposal object; it need not execute a second work unit automatically.

## Storage

R0.1 may use in-memory stores for the first conformance slice, matching the existing synthetic runtime style. Contract boundaries must not preclude later PostgreSQL adapters.

No production migration is part of this slice.

## Module placement

Recommended files:

- `modules/work-capability/contracts.ts`
- `modules/work-capability/runtime.ts`
- `modules/work-capability/runtime.test.ts`
- optional thin fixture adapter under `modules/work-capability/fixtures/garment.ts`

Existing Warden/River/Synnergyze modules should be imported rather than duplicated.

## TDD acceptance sequence

Implementation follows RED → GREEN → REFACTOR. Minimum acceptance behaviors:

1. compiler produces Work Units without assignment;
2. missing capability produces capability debt and no fabricated candidate;
3. Warden `DENY`/`ESCALATE` candidate cannot be assigned or executed;
4. human + machine composition can be selected and executed through existing controlled execution;
5. human + agent composition can be represented and evidenced;
6. human + agent + machine composition can be represented and executed;
7. verified product effect produces capability evidence tied to execution/effect lineage;
8. partial effect produces exception/reconciliation and remaining-work recompilation proposal;
9. exact replay is stable;
10. mutated reuse of work/assignment identity fails closed.

A focused package script may be added as `test:work-capability` once the first failing test exists.

## R0.1 success criteria

The slice is complete only when the repository can demonstrate:

- 1 objective;
- 1 workflow blueprint/instance;
- at least 10 Work Units in the reference workflow fixture;
- human, agent, and machine actor profiles;
- at least 1 composite capability;
- Warden-gated eligibility and controlled execution;
- River-compatible execution/observation evidence;
- effect verification;
- at least 1 capability-debt case;
- at least 1 partial-effect exception/recompilation case;
- capability evidence update for an actor and a composition;
- focused tests plus repository type-check/lint/test gates passing on the exact head.

## Explicit non-claims

R0.1 does not claim:

- live Doddaballapur factory integration;
- live worker identity/credential verification;
- live machine telemetry or PLC/MES connectivity;
- autonomous workforce management;
- employment-law determination;
- payroll or SILK settlement finality;
- capability marketplace/exchange;
- city/national capability mapping;
- production Warden/River activation;
- production PostgreSQL persistence;
- autonomous objective decomposition from arbitrary natural language.

## Next slice after R0.1

Only after this closed-loop proof is verified should the architecture expand to durable capability evidence, richer Workflow Blueprint compilation, cross-location capability sourcing, capability-development recommendations, and SILK-linked contribution/settlement semantics.
