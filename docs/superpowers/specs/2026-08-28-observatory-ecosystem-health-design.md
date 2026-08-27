# Synnergyze Observatory Ecosystem Health R0.1 Design

## Scope

Implement the first executable health-compiler slice for `SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001 R0.1` inside the existing Genesis/Warden/River lineage. This is not a parallel monitoring stack and does not authorize remediation.

## Core invariants

1. Missing or stale evidence MUST NOT compile to `HEALTHY`.
2. Desired state, observed state, derived health, inferred cause, and verified effect remain distinct objects.
3. SentinelX is an adapter/sensor-actuator source; it does not define canonical node identity, desired state, affiliation, or authority.
4. Health is multi-dimensional; a summary state may be derived but cannot erase dimension-level evidence.
5. `UNKNOWN` is preferred to unjustified `HEALTHY`.
6. Every derived health result carries evidence references, freshness, confidence, and evaluation time.
7. Dependency propagation must preserve root observation versus downstream derived impact.
8. Observatory may propose or expose conditions, but Warden remains the authority gate for any corrective actuation.

## R0.1 deliverable

Add a focused `modules/observatory` subsystem with:

- Health subject contracts for hosts, services, applications, databases, repositories, locations, factories, networks, programmes, workflows, capabilities, and infrastructure clusters.
- Health dimensions: availability, performance, capacity, configuration integrity, security posture, software currency, dependency health, evidence freshness, resilience, maintenance condition, operational reliability, and recovery readiness.
- Health states: `HEALTHY`, `WATCH`, `DEGRADED`, `CRITICAL`, `RECOVERING`, `MAINTENANCE`, `ISOLATED`, `UNKNOWN`, `STALE`, `NOT_APPLICABLE`.
- Evidence freshness states: `FRESH`, `AGING`, `STALE`, `MISSING`.
- A deterministic health compiler that evaluates dimension evidence without producing false green states.
- A dependency compiler that can project upstream conditions into downstream impact without reclassifying a suspected root cause as verified fact.

## Data flow

`adapter observation -> River evidence ref -> health observation -> freshness evaluation -> dimension result -> subject health profile -> dependency projection`

Corrective flow remains outside this R0.1 slice:

`health condition -> Synnergyze candidate correction -> Warden decision -> adapter execution -> River effect verification`

## SentinelX boundary

The first SentinelX-backed projection will bind an enrolled host to an Observatory host subject through an adapter reference. SentinelX `host_id` remains an adapter identity; the canonical node identity remains a Genesis reference. SentinelX-derived data is treated as observed evidence, never as desired state or authority.

## Error and uncertainty handling

- Invalid or future timestamps produce an explicit invalid evaluation result rather than health.
- Missing evidence produces `UNKNOWN`/`MISSING`.
- Evidence older than the permitted interval produces `STALE` and cannot yield `HEALTHY`.
- A fresh negative observation may compile to `WATCH`, `DEGRADED`, or `CRITICAL` according to the supplied condition severity.
- Dependency effects remain `DERIVED`; root causes remain `SUSPECTED` until separately verified.

## Testing

Use Vitest and TDD. First red test proves stale/missing evidence cannot compile to `HEALTHY`. Additional tests cover fresh healthy evidence, severe negative evidence, multi-dimensional aggregation, and dependency propagation lineage.

## Non-goals for R0.1

No automatic remediation, no universal percentage health score, no machine-learning prognostics, no maintenance scheduling, no fleet UI, no raw SentinelX shell exposure, and no replacement of the existing `api/health.ts` liveness endpoint.
