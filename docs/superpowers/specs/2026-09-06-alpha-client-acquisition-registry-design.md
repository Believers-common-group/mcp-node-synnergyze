# ALPHA Client Acquisition Registry R0.1 — Design

Status: DESIGN FOR REVIEW

Date: 2026-09-06

Target node: `ALPHA-NODE-001`

Repository: `Believers-common-group/mcp-node-synnergyze`

## 1. Purpose

Define the governed registry contract that lets ALPHA-NODE-001 trace a prospective client from an existing global network record through outreach, qualification, solution mapping, provisioning, Warden admission, River evidence, and creation of a countable node in the first-100 cohort.

This design does **not** make Alpha a duplicate global database. Believers Common (BC), Virtual Silk Road (VSR), and Creators Common (CC) remain upstream network/registry systems. Alpha stores governed source references plus its own commercial/provisioning state.

The first release creates four logical registry surfaces:

1. `ALPHA-CLIENT-ACQUISITION-REGISTRY-001`
2. `ALPHA-ACQUISITION-EVENT-LEDGER-001`
3. `ALPHA-SOURCE-NODE-YIELD-LEDGER-001`
4. `ALPHA-T01-QUALIFICATION-LEDGER-001`

## 2. Existing Alpha boundary preserved

This design is additive to the existing Alpha operating boundary:

- Supabase remains canonical Registry truth for identity, relationships, governed request state, authority/consent references and durable acquisition/provisioning state.
- Warden remains the authority/policy boundary.
- RiverOS remains the evidence/event movement layer.
- GitHub contains only public-safe schemas, code, adapters, contracts and redacted fixtures.
- Airtable may be used as an optional human operating queue, but never as canonical truth.
- Private client names, domains, contact data, private BC/VSR/CC rows, credentials and evidence bodies must not be committed to this public repository.

## 3. Design decision

### Option A — CRM-only pipeline

Keep leads in a conventional CRM and create a Genesis node record only after conversion.

**Advantages:** fastest operationally; familiar sales model.

**Rejected because:** loses source-node lineage as a first-class network property and makes first-100 qualification dependent on an external sales application's mutable status model.

### Option B — Alpha canonical acquisition graph backed by Supabase — RECOMMENDED

Store Alpha acquisition state in the canonical Registry and reference upstream BC/VSR/CC records without copying their databases. Record every state transition append-only. Derive yield projections and T01 qualification from canonical records.

**Advantages:** preserves network provenance, supports deterministic node counting, separates source node from destination node, and follows Alpha's existing Registry/Warden/River boundaries.

**Trade-off:** requires schema and transition validation rather than free-form CRM status changes.

### Option C — Airtable-first operating inventory

Use Airtable as the main prospect inventory and sync later into Registry.

**Rejected because:** Alpha's standing boundary explicitly prevents Airtable from becoming Registry truth. It may still provide an operator-facing projection after R0.1.

## 4. Canonical entities

### 4.1 Acquisition

Primary ID grammar:

`ALPHA-ACQ-000001`

One acquisition record survives the complete commercial/provisioning journey.

Required fields:

```yaml
acquisition_id: ALPHA-ACQ-000001
issuer_node: ALPHA-NODE-001
client_candidate_ref: ALPHA-CLIENT-000001

origin:
  registry: BC | VSR | CC | EXTERNAL
  source_object_type: NODE | PRINCIPAL | ORGANISATION | LOCATION | PROGRAMME | ROUTE | OTHER
  source_object_id: <external canonical reference>
  source_node_id: <external node reference or null>
  source_relationship_id: <external relationship reference or null>

state: DISCOVERED

first_100:
  cohort_id: ALPHA-T01
  candidate: true
  countable: false

created_at: <timestamp>
updated_at: <timestamp>
```

`origin.registry`, `origin.source_object_id`, and first meaningful provenance must be immutable after the acquisition is established. Corrections require a superseding/correction event, not silent overwrite.

### 4.2 Acquisition event

Primary ID grammar:

`ALPHA-ACQ-EVT-00000001`

Append-only transition record:

```yaml
event_id: ALPHA-ACQ-EVT-00000001
acquisition_id: ALPHA-ACQ-000001
from_state: ENGAGED
to_state: DISCOVERY_ACTIVE
actor_ref: DIGITALME-...
warden_decision_ref: null
river_receipt_ref: null
occurred_at: <timestamp>
idempotency_key: <stable unique key>
```

Events are immutable. Current acquisition state is a derived/canonical projection of accepted events.

### 4.3 Source-node yield projection

Primary key is a compound projection identity:

`<source_registry>:<source_node_id>`

Example metrics:

```yaml
source_registry: BC
source_node_id: BC-NODE-000314
opportunities: 18
engaged: 11
qualified: 8
commercial_agreed: 5
provisioned: 4
countable_nodes: 4
active_nodes: 4
as_of: <timestamp>
```

This ledger is rebuildable from acquisition and qualification records. It is an analytical projection, not authority.

### 4.4 T01 qualification

Primary ID grammar:

`ALPHA-T01-QUAL-000001`

A node counts only after all mandatory gates pass:

```yaml
qualification_id: ALPHA-T01-QUAL-000001
cohort_id: ALPHA-T01
acquisition_id: ALPHA-ACQ-000001
provision_id: ALPHA-PROV-000001
destination_node_id: GENESIS-NODE-...

checks:
  independently_provisioned: true
  canonical_node_exists: true
  warden_admitted: true
  river_evidenced: true
  duplicate_check: PASS
  placeholder_check: PASS

countable: true
sequence: 1
qualified_at: <timestamp>
warden_decision_ref: WARDEN-DEC-...
river_receipt_ref: RIVER-REC-...
```

The sequence is allocated transactionally and uniquely only when `countable=true`.

## 5. Source and destination are different identities

The design must preserve this invariant:

`SOURCE NODE != DESTINATION/CLIENT NODE`

Example lineage:

`VSR-NODE-001922 -> ALPHA-ACQ-000007 -> ALPHA-PROV-000037 -> GENESIS-NODE-000037`

The source node answers where the opportunity originated. The destination node is the operating node eventually created/admitted.

## 6. Acquisition state machine

Allowed primary path:

```text
DISCOVERED
  -> SELECTED_FOR_OUTREACH
  -> CONTACTED
  -> ENGAGED
  -> DISCOVERY_ACTIVE
  -> QUALIFIED
  -> SOLUTION_MAPPED
  -> PROPOSAL_ACTIVE
  -> COMMERCIAL_AGREED
  -> PROVISIONING_READY
  -> PROVISIONING
  -> WARDEN_ADMISSION
  -> NODE_REGISTERED
  -> NODE_ACTIVE
```

Side/terminal states:

- `DISQUALIFIED`
- `DEFERRED`
- `WITHDRAWN`
- `LOST`
- `SUSPENDED`

Transitions are validated server-side. Free-form status mutation is not allowed.

## 7. Toolkit relationship

The toolkit registry is deployment inventory, not acquisition inventory.

A toolkit assignment begins only after sufficient discovery/solution mapping. Alpha may then attach one or more toolkit requirements to the acquisition/provisioning plan.

Example:

```yaml
acquisition_id: ALPHA-ACQ-000007
solution_profile:
  integration_mode: BRIDGE
  deployment_level: L3
required_toolkits:
  - ALPHA-TK-0001
  - ALPHA-TK-0003
  - ALPHA-TK-0004
  - ALPHA-TK-0007
```

This makes forward toolkit demand derivable from qualified client inventory.

## 8. First-100 rule

A record does not count toward T01 merely because it is a lead, contract, reservation, copied container, placeholder or partially provisioned workspace.

Canonical gate:

```text
COUNTABLE =
  independently_provisioned
  AND canonical_node_exists
  AND warden_admitted
  AND river_evidenced
  AND duplicate_check = PASS
  AND placeholder_check = PASS
```

T01 is complete when exactly 100 unique countable qualification records exist with unique destination node IDs and sequence values 1..100.

Reaching 100 creates a qualification/release assessment point. It does not by itself infer BNR authority or activation.

## 9. Data ownership and privacy

### Stored canonically in Alpha/Supabase

- acquisition IDs and state
- external BC/VSR/CC references
- source-node attribution
- campaign/touchpoint references
- client candidate references
- solution/provisioning references
- Warden decision references
- River receipt references
- T01 qualification state

### Not copied from upstream global databases unless explicitly required

- full BC/VSR/CC member records
- unrelated relationship graphs
- whole source-database documents
- unnecessary personal data

### Never committed to this public repository

- the real 11 client rows
- private client domains/contact details where not already intentionally public
- credentials or tokens
- private Registry rows
- Warden token bodies/nonces/signatures
- restricted River/Box evidence bodies

Only redacted synthetic fixtures are permitted in tests.

## 10. Storage model for R0.1

Recommended Supabase/Postgres tables:

- `alpha_client_acquisitions`
- `alpha_acquisition_events`
- `alpha_acquisition_source_refs`
- `alpha_acquisition_toolkit_requirements`
- `alpha_provisioning_refs`
- `alpha_t01_qualifications`

Recommended SQL views/materialized views:

- `alpha_source_node_yield_v`
- `alpha_t01_progress_v`
- `alpha_toolkit_forward_demand_v`
- `alpha_acquisition_funnel_v`

R0.1 does not require Airtable synchronization, UI dashboards, marketing automation, or automatic writes to BC/VSR/CC.

## 11. API/MCP boundary

R0.1 should expose a narrow service contract rather than raw table mutation.

Planned operations:

- `create_acquisition`
- `record_acquisition_transition`
- `attach_source_reference`
- `attach_toolkit_requirement`
- `attach_provisioning_reference`
- `evaluate_t01_qualification`
- `get_t01_progress`
- `get_source_node_yield`

Consequential transitions may require Warden admission according to policy. Read operations do not infer authority.

Every write operation must support idempotency.

## 12. Error and reconciliation rules

- Unknown source registry -> reject.
- Missing mandatory source object reference -> reject acquisition creation except explicitly classified `EXTERNAL` origin.
- Illegal state transition -> reject without mutating current state.
- Duplicate idempotency key -> return prior accepted result.
- Duplicate destination node in T01 -> fail closed.
- Missing Warden decision or River receipt when required -> qualification remains non-countable.
- Upstream source reference temporarily unavailable -> retain reference and mark resolution state; do not fabricate/replace source identity.
- Corrections to immutable provenance -> append correction/supersession event and preserve prior value in history.

## 13. Testing strategy

R0.1 tests must cover:

1. acquisition ID uniqueness;
2. allowed and forbidden state transitions;
3. immutable first-source provenance;
4. source node distinct from destination node;
5. idempotent duplicate event handling;
6. T01 duplicate-node rejection;
7. no T01 count before all gates pass;
8. transactional unique sequence allocation;
9. source-node yield rebuilt correctly from synthetic events;
10. public fixtures contain no actual client/private registry data.

## 14. Rollout order

1. Commit this design contract.
2. Add SQL migration + row constraints.
3. Add TypeScript domain types and transition validator.
4. Add repository/service layer around Supabase.
5. Add T01 qualification evaluator.
6. Add derived views for funnel, source-node yield and toolkit forward demand.
7. Add MCP/read-write adapters under Warden policy.
8. Load the real 11 candidates privately into Supabase after schema validation; do not seed them into GitHub.
9. Verify River/Warden references on the first controlled conversion.

## 15. R0.1 acceptance criteria

R0.1 is acceptable when:

- a prospect can be created with BC/VSR/CC/EXTERNAL provenance;
- state progression is append-only and validated;
- source node provenance cannot be silently overwritten;
- a qualified client can reference required toolkits and a provision;
- a destination node cannot count twice;
- T01 progress derives only from fully admitted/evidenced countable records;
- source-node yield can be calculated without treating the projection as authority;
- no real private client data is present in GitHub;
- the implementation preserves the existing Supabase/Warden/RiverOS/GitHub operating boundary.

## 16. Explicitly deferred

- automated marketing campaign execution;
- outbound email/social automation;
- BC/VSR/CC write-back;
- revenue settlement or SILK incentives;
- node-referral compensation;
- Airtable operating projection;
- dashboard UI;
- BNR activation logic beyond exposing the T01 assessment state.

These should be separate follow-on designs after the canonical acquisition and qualification spine is proven.
