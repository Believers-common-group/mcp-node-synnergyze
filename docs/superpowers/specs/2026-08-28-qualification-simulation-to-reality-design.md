# Qualification + Simulation-to-Reality Fabric — Design Specification

**Date:** 2026-08-28  
**Status:** DESIGN / NOT LIVE  
**Target repository:** `Believers-common-group/mcp-node-synnergyze`  
**Initial branch:** `design/qualification-simulation-reality-r0.1`  

## 1. Purpose

This specification defines the first implementation boundary for a VSR qualification system that can learn from synthetic and historical evidence before any qualification, authority, economic obligation, stored value, or settlement becomes real.

The design introduces two coordinated but independent canonical objects:

- `WARDEN-QUALIFICATION-FABRIC-001 R0.1`
- `VSR-SIMULATION-TO-REALITY-FABRIC-001 R0.1`

A sibling pre-economic ledger is defined as:

- `VSR-QUALIFIED-TIME-LEDGER-001 R0.1`

The initial implementation is deliberately simulation-first. It must be useful before SILK is economically active and must not silently create a currency, wallet, payment instrument, legal wage substitute, contractual entitlement, or transferable balance.

## 2. Core architectural thesis

The system must distinguish three independent questions:

1. **Qualification:** what has a principal demonstrably become capable or eligible to do?
2. **Authorization:** may that principal perform this particular action, on this resource, for this purpose, now?
3. **Economic recognition:** what governed economic consequence, if any, should follow from a verified contribution?

The canonical dependency direction is therefore:

```text
Genesis identity/state
        ↓
River evidence/provenance
        ↓
Qualification evaluation
        ↓
Warden runtime authorization
        ↓
Synnergyze execution/simulation
        ↓
River observed effect/reconciliation
        ↓
Pre-economic eligibility
        ↓
──── SILK admission boundary ────
        ↓
Economic obligation / settlement / finality
```

SILK is not a universal runtime dependency for qualification. It becomes relevant only at the economic admission boundary.

## 3. Non-goals for R0.1

R0.1 must **not** implement:

- a universal human reputation score;
- automatic promotion based on hours alone;
- stored monetary value;
- a wallet;
- transfer, redemption, merchant acceptance or payment functionality;
- an exchange rate between time and money;
- SILK settlement;
- employee wage substitution;
- autonomous AI changes to qualification standards;
- standing authorization derived from qualification;
- hidden scoring of real people from unapproved data;
- automated adverse action against a real person based only on simulation output.

## 4. Fundamental invariants

The following invariants are release blockers and should eventually become executable assertions where practical.

1. A principal has **scoped qualifications**, not one universal rank.
2. Every qualification is bound to a scheme, scheme revision, scope and validity window.
3. Qualification never implies current authority.
4. Warden authorization remains action/resource/context/purpose specific.
5. No elevation occurs without attributable evidence satisfying the scheme revision.
6. Evidence quantity cannot automatically substitute for evidence quality.
7. AI or statistical models may assist evaluation but cannot independently create high-assurance live qualification.
8. Qualification history is append-only; current standing is a projection.
9. Failure creates evidence and possibly review; failure does not automatically demote qualification.
10. Observed time, attributable time, verified contribution time, qualified time, economic eligibility and economic value are distinct states.
11. Pre-SILK qualified time has no stored monetary value, redemption, transfer or payment power.
12. Qualified time cannot substitute for statutory wages or other legally payable obligations.
13. Economic eligibility is not an economic obligation.
14. SILK alone crosses from pre-economic eligible input into governed settlement/finality when an approved economic policy permits it.
15. Simulated output cannot silently cross into live authority or live economic effect.
16. The minimum necessary qualification claim should be disclosed to downstream decision points; raw history remains governed evidence.
17. A rule learned from data is a proposal until an authorized governance process approves a new scheme revision.

Canonical shorthand:

```text
AVAILABLE ≠ AUTHORIZED
QUALIFIED ≠ AUTHORIZED
AUTHORIZED ≠ EXECUTED
EXECUTED ≠ VERIFIED_EFFECT
SIMULATED ≠ REAL
ECONOMIC_ELIGIBLE ≠ ECONOMIC_OBLIGATION
```

## 5. Qualification model

### 5.1 Canonical fact model

Do not persist `person.level = N` as the source of truth.

Persist a scoped assertion:

```text
QualificationAssertion
  principal_ref
  scheme_ref
  scheme_revision_ref
  scope_ref
  progression_level_ref
  qualification_vector
  criteria_satisfied
  evidence_bundle_ref
  assessed_at
  valid_from
  valid_until
  status
  issuer_authority_ref
  supersedes_ref?
```

### 5.2 Qualification vector

The first vector supports independent dimensions rather than an opaque score:

- `identity_assurance`
- `evidence_assurance`
- `competence`
- `responsibility_autonomy`
- `experience_recency`
- `effect_reliability`
- `economic_readiness`

These dimensions may be extended by scheme revision, but R0.1 must not collapse them into a network-wide trust score.

### 5.3 Human-facing progression projection

A simple visible projection is permitted for experience and workflow purposes:

```text
L0 DISCOVERED
L1 IDENTIFIED
L2 EVIDENCED
L3 DEMONSTRATED
L4 QUALIFIED
L5 RELIED_UPON
```

This is a projection of scheme-specific facts. It is not a universal rank and not an authorization state.

### 5.4 Qualification status lifecycle

Supported status events:

```text
QUALIFICATION_ASSERTED
QUALIFICATION_RENEWED
QUALIFICATION_LIMITED
QUALIFICATION_SUSPENDED
QUALIFICATION_EXPIRED
QUALIFICATION_REVOKED
QUALIFICATION_SUPERSEDED
QUALIFICATION_REVIEW_REQUIRED
```

Historical assertions remain preserved.

## 6. Evidence model

### 6.1 Evidence grades

Initial evidence assurance grades:

```text
E0 CLAIMED
E1 OBSERVED
E2 CORROBORATED
E3 VERIFIED
E4 ASSURED
```

A qualification scheme revision declares the minimum grade and evidence classes required per criterion.

### 6.2 Evidence bundle

A qualification evaluation consumes an immutable evidence bundle snapshot containing references, not uncontrolled copies of evidence:

```text
QualificationEvidenceBundle
  bundle_id
  principal_ref
  scheme_revision_ref
  evidence_refs[]
  evidence_grades[]
  provenance_status
  integrity_status
  recency_snapshot
  conflict_refs[]
  created_at
  bundle_hash
```

The evaluation decision is bound to this snapshot/hash so later database changes cannot retroactively rewrite the reviewed basis.

## 7. Warden Qualification Engine

Canonical component:

`WARDEN-QUALIFICATION-ENGINE-001`

### 7.1 Input

```text
QualificationEvaluationRequest
  request_id
  principal_ref
  scheme_revision_ref
  requested_level_ref?
  scope_ref
  context_ref
  evidence_bundle_ref
  current_assertion_refs[]
  applicable_policy_refs[]
  evaluation_time
```

### 7.2 Evaluation pipeline

```text
resolve principal
→ resolve scheme revision
→ resolve prerequisites
→ verify evaluator/issuer authority
→ resolve evidence bundle
→ validate evidence provenance/integrity
→ evaluate recency
→ evaluate criteria
→ evaluate conflicts/adverse evidence
→ evaluate required independent assessment
→ calculate qualification vector
→ determine eligible progression
→ produce Warden qualification decision
→ issue or refuse assertion
→ write River decision/evidence receipt
```

### 7.3 Decision outcomes

```text
ASSERT
MAINTAIN
LIMIT
REQUIRE_REASSESSMENT
SUSPEND
REVOKE
REFUSE
UNKNOWN
```

`UNKNOWN` is mandatory when sufficient evidence or authority cannot be established.

## 8. Authorization remains separate

Qualification facts are attributes available to the Warden runtime decision service.

Example:

```text
subject qualification:
  industrial.cold_storage.supervision = L4

request:
  action = START_COMPRESSOR_BANK
  resource = COMPRESSOR-BANK-03
  context = LOCATION-DODDABALLAPUR
```

The runtime Warden still returns an independent decision such as:

```text
ALLOW | DENY | CHALLENGE | ESCALATE | UNKNOWN
```

The qualification assertion must never be treated as an execution token.

## 9. Qualified time model

The pre-economic time chain is:

```text
T0 Observed Duration
→ T1 Attributable Time
→ T2 Verified Contribution Time
→ T3 Qualified Contribution Time
→ T4 Economic-Eligible Time
→ [SILK boundary]
→ T5 Valued Economic Input
→ T6 Obligation
→ T7 Settlement / Finality
```

R0.1 implements only T0–T4.

### 9.1 R0.1 time objects

```text
time_observation
  time_observation_id
  start_at
  end_at
  duration
  source_ref
  reality_class

 time_attribution
  attribution_id
  time_observation_ref
  principal_ref
  activity_ref
  attribution_method
  evidence_refs

 contribution_record
  contribution_id
  principal_ref
  task_objective_ref
  capability_ref
  scope_ref
  attributed_duration
  evidence_bundle_ref

 qualified_time_claim
  claim_id
  contribution_ref
  scheme_revision_ref
  qualification_assertion_ref
  verified_duration
  qualified_duration
  qualification_basis
  reality_class

 economic_eligibility_result
  result_id
  qualified_time_claim_ref
  policy_revision_ref
  state
  reasons[]
  economic_value = NULL
  settlement_ref = NULL
```

### 9.2 Economic readiness states

```text
V0 NONE
V1 CONTRIBUTION_RECORDED
V2 CONTRIBUTION_VERIFIED
V3 ECONOMIC_ELIGIBLE
V4 SILK_ADMISSIBLE
```

R0.1 may simulate V4 but cannot make V4 live.

## 10. Simulation-to-Reality maturity axis

Every learned or computed output that could later influence people, authority or economics must have a `reality_class` / maturity designation.

```text
M0 MODELLED
M1 SYNTHETIC
M2 REPLAYED
M3 SHADOW
M4 ADVISORY
M5 GOVERNED_PILOT
M6 VERIFIED_LIVE
M7 ECONOMICALLY_ADMISSIBLE
M8 SILK_ACTIVE
```

R0.1 runtime scope is M0–M3 only. M4 may be represented in schema but must remain disabled by default until an explicit later admission decision.

## 11. Compute Governance Assurance Levels

A separate compute-governance axis determines what computational output may be relied upon.

```text
CG0 EXPERIMENTAL
CG1 REPRODUCIBLE
CG2 EVIDENCE_BOUND
CG3 POLICY_GOVERNED
CG4 INDEPENDENTLY_VERIFIABLE
CG5 CONTROLLED_LIVE
CG6 ECONOMIC_COMPUTATION
CG7 SETTLEMENT_GRADE
```

Initial admission mapping:

```text
synthetic simulation        requires CG1+
historical replay           requires CG2+
shadow recommendation       requires CG2+
advisory use                requires CG3+ [future]
live qualification issuance requires CG4+ [future]
controlled execution        requires CG5+ [future]
economic eligibility live   requires CG6+ [future]
SILK finality               requires CG7+ [future]
```

R0.1 should make this mapping data-driven and versioned rather than hard-coded wherever practical.

## 12. Simulation boundary

Every simulation-derived record must carry an explicit reality class and negative capabilities.

Minimum fields:

```text
reality_class
may_create_authority
may_create_qualification
may_create_obligation
may_create_payment
may_trigger_execution
```

For M0–M3 in R0.1 all five effect flags are `false`.

A validation rule must reject persistence or handoff that attempts to set a prohibited effect flag true.

## 13. Counterfactual simulation model

Each real, historical or synthetic source event may spawn one or more simulation branches.

```text
SimulationScenario
  scenario_id
  source_reality_ref?
  population_snapshot_ref
  policy_revision_refs[]
  qualification_scheme_revision_refs[]
  compute_model_refs[]
  created_at
  reality_class

SimulationBranch
  branch_id
  scenario_ref
  parent_branch_ref?
  intervention_set
  output_snapshot_ref
  output_hash
```

The system must preserve the distinction between:

- observed historical result;
- replayed result using current policy;
- counterfactual result using alternate policy;
- shadow result generated during real operations;
- actual live outcome.

## 14. Learning and model-change governance

Simulation may discover candidate improvements, but learned rules must not self-promote into policy.

A learner can emit:

```text
QualificationModelChangeProposal
  proposal_id
  source_scheme_revision_ref
  candidate_change
  dataset_snapshot_ref
  simulation_refs[]
  affected_population_summary
  false_positive_delta
  false_negative_delta
  safety_delta
  distributional_delta
  uncertainty
  confidence
  limitations
  created_by_model_ref
```

A separate authorized governance process decides whether a new scheme revision is admitted.

Canonical direction:

```text
data learns
→ model proposes
→ Warden evaluates admissibility
→ authorized human/institutional authority approves where required
→ Genesis versions scheme
→ River preserves evidence/decision
```

## 15. Database objects for R0.1

Required logical records:

```text
qualification_scheme
qualification_scheme_revision
competency
competency_requirement
progression_model
progression_level
assessment_method
evidence_requirement
qualification_evidence_bundle
qualification_evaluation
criterion_result
qualification_assertion
qualification_status_event
qualification_review
qualification_appeal

simulation_scenario
simulation_branch
simulation_input_snapshot
simulation_output_snapshot
simulation_comparison
model_change_proposal
compute_governance_profile
reality_admission_policy
reality_admission_evaluation

time_observation
time_attribution
contribution_record
qualified_time_claim
economic_eligibility_policy
economic_eligibility_result
```

R0.1 deliberately excludes:

```text
wallet
currency
exchange_rate
transfer
redemption
merchant_acceptance
payment
settlement
```

## 16. Reality admission gate

No simulation object becomes live merely by changing a status field.

A transition request must create an immutable admission envelope:

```text
RealityAdmissionRequest
  admission_request_id
  object_type
  object_ref
  from_maturity
  requested_maturity
  qualification_scheme_revision_refs[]
  compute_governance_profile_ref
  evidence_snapshot_ref
  legal_policy_refs[]
  privacy_policy_refs[]
  authority_snapshot_ref
  risk_snapshot_ref
  submitted_at
  envelope_hash
```

The Warden admission decision is bound to this envelope and cannot be reused after supersession or material drift.

R0.1 permits automated admission only within M0–M3 where no real-world effect can occur.

Any M3→M4+ transition must be blocked as:

```text
REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY
```

until a later release explicitly defines and verifies the live admission contract.

## 17. Data separation and privacy

Simulation data must distinguish:

```text
SYNTHETIC_PERSONA
PSEUDONYMIZED_HISTORICAL
IDENTIFIABLE_HISTORICAL
LIVE_IDENTIFIABLE
```

R0.1 should prefer synthetic data for initial testing and pseudonymized/minimized historical projections for replay where lawful and authorized.

A downstream verifier should receive the minimal necessary qualification claim rather than the entire work/evidence history.

Simulation datasets must be bound to a declared purpose, permitted scope, retention rule and provenance reference.

## 18. Bias, distribution and institutional-effect evaluation

A policy cannot be considered successful merely because prediction accuracy improves.

Simulation comparison should support at least:

- qualification false-positive rate;
- qualification false-negative rate;
- abstention/UNKNOWN rate;
- reassessment rate;
- evidence insufficiency rate;
- outcome/effect success rate;
- recency sensitivity;
- concentration of economic eligibility;
- concentration by role/capability/location/programme;
- new-entrant disadvantage;
- dependence on subjective assessor evidence;
- distributional change between policy revisions;
- safety-significant adverse cases;
- counterfactual stability under small input changes.

R0.1 should store these as explicit simulation metrics, not infer a moral or legal conclusion automatically.

## 19. Failure semantics

The system must fail closed on missing authority, missing required evidence, invalid scheme revision, invalid provenance, unsupported reality promotion, or material plan/input drift.

Canonical blocker codes should include:

```text
QUALIFICATION_SCHEME_NOT_FOUND
QUALIFICATION_SCHEME_NOT_ACTIVE
EVIDENCE_INSUFFICIENT
EVIDENCE_INTEGRITY_UNKNOWN
EVIDENCE_RECENCY_FAILED
ASSESSOR_AUTHORITY_MISSING
PREREQUISITE_NOT_MET
CONFLICT_REQUIRES_REVIEW
SIMULATION_INPUT_DRIFT
SIMULATION_OUTPUT_NOT_REPRODUCIBLE
COMPUTE_GOVERNANCE_INSUFFICIENT
REALITY_PROMOTION_NOT_PERMITTED
REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY
ECONOMIC_EFFECT_PROHIBITED_PRE_SILK
```

## 20. R0.1 implementation slices

### Slice A — canonical contracts and persistence

Implement types/schema/migrations for qualification schemes, evidence bundles, qualification evaluations/assertions, reality classes, compute governance profiles, simulation scenarios and qualified-time claims.

No live promotion.

### Slice B — deterministic synthetic evaluator

Implement a pure deterministic qualification evaluator over synthetic fixtures.

Outputs must be reproducible from the same scheme revision + evidence snapshot.

### Slice C — replay harness

Implement historical/synthetic event replay into qualification and qualified-time projections without mutating live authority or economic state.

### Slice D — counterfactual branch runner

Run multiple scheme/policy versions over one source dataset and persist comparison metrics.

### Slice E — shadow boundary

Permit M3 SHADOW outputs to be generated from current operations while guaranteeing they cannot create authority, execution or economic effect.

### Slice F — model-change proposal generator

Produce evidence-backed scheme-change proposals from simulation comparisons. Proposals have no authority to alter a live scheme.

R0.1 stops here.

## 21. Testing strategy

Implementation should use test-driven development.

Required proof categories:

1. qualification is scoped; no universal-level shortcut exists;
2. the same principal can hold different levels in different schemes/scopes;
3. qualification does not create runtime authorization;
4. evidence snapshot/hash binds the decision;
5. superseded scheme revisions cannot silently rewrite prior assertions;
6. insufficient evidence returns REFUSE/UNKNOWN as defined;
7. failure evidence does not automatically demote;
8. synthetic/replay/shadow records cannot create live qualification or authority;
9. pre-SILK records cannot create money/payment/settlement fields;
10. identical simulation inputs reproduce identical outputs;
11. changed inputs produce detectable snapshot/hash drift;
12. counterfactual branches preserve source reality separately;
13. model-change proposals cannot activate themselves;
14. M3→M4 promotion is blocked in R0.1;
15. repository boundary tests prevent Warden qualification code from depending on SILK implementation internals.

## 22. Observability and audit evidence

Each evaluation/simulation should expose structured evidence sufficient to answer:

- What rule/version ran?
- On which immutable input snapshot?
- Under which authority/purpose?
- Which evidence was used?
- Which evidence was excluded and why?
- Which criteria passed/failed/abstained?
- What model/code version ran?
- Was the result reproducible?
- Was it synthetic/replay/shadow/live?
- Could it create authority or economic effect?
- Which later record superseded it?

These are evidence requirements, not merely debug logs.

## 23. Relationship to existing VSR systems

### Genesis

Canonical identities, relationships, scheme identities, revisions and current projections.

### River

Evidence provenance, event history, effect observations, decision receipts, simulation evidence and supersession lineage.

### Warden

Qualification admission/evaluation governance; runtime authorization remains separate; reality promotion is governed.

### Synnergyze

Simulation orchestration, work/capability context, scenario execution and counterfactual branch management.

### SILK

No R0.1 runtime dependency. Future consumer of economically admissible pre-economic outputs only after explicit admission and settlement-grade governance.

## 24. Relationship to SILK dependency isolation

This design complements, but does not replace, the separate SILK/Warden dependency-isolation work.

For this fabric, the desired direction is:

```text
Warden Qualification → canonical pre-economic contracts ← SILK [future]
```

Warden qualification code must not import SILK runtime/store/provider/database implementations.

## 25. Promotion roadmap

The roadmap is evidence-driven rather than date-driven.

```text
R0.1  M0–M3 model/synthetic/replay/shadow only
R0.2  M4 advisory, after explicit governance design and verification
R0.3  bounded M5 qualification pilot
R0.4  M6 verified live qualification
R0.5  economic shadow calculations with no obligations
R0.6  bounded M7 economic-admission pilot after legal/economic authority review
R1.0  M8 SILK-active only after CG7 settlement-grade proof
```

Every promotion requires a new reviewed release. No release may infer that the next maturity stage is authorized simply because the previous stage passed tests.

## 26. Initial acceptance criteria for the design

Before implementation planning begins, confirm that the design intentionally establishes:

- scoped qualifications rather than universal social ranking;
- simulation-first learning;
- separate qualification, authorization and economics;
- explicit M0–M8 reality maturity;
- explicit CG0–CG7 compute governance maturity;
- T0–T4 only before SILK;
- immutable evidence/decision binding;
- counterfactual simulation and shadow operation;
- controlled model-change proposals;
- hard prohibition on simulation leaking into real authority/economic effect;
- a deliberate stop at M3 for R0.1.

## 27. Open questions for later releases

These questions are intentionally not resolved by R0.1 and should not block simulation-first implementation:

- who may approve M4/M5 qualification schemes for each domain;
- which domains require external statutory/professional credentials;
- how appeals/independent review are staffed operationally;
- whether Commons Time and Productive Qualified Time become separate economic schemes;
- economic valuation functions and distribution constraints;
- SILK asset/unit representation;
- treatment of tax, wages, benefits, securities, stored value and payment-system boundaries;
- legal entity responsibility for economic obligations;
- cross-jurisdiction qualification portability;
- privacy-preserving credential presentation format;
- settlement finality and compensation architecture.

---

### Design checkpoint

This specification intentionally stops before production implementation. Once the design is reviewed and approved, the next step is a separate implementation plan with ordered TDD slices, exact files, migrations, tests, verification commands and rollback points.
