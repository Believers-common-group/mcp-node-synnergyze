# BNR-PARTICIPANT-CONFORMANCE-001

## Purpose

Define the minimum participant-visible success condition for a BNR node.

A node is not conformant merely because its Registry, workflow engine, database, agent or UI is online. It is conformant when a participant can receive an intelligible answer to the five canonical Registry questions without collapsing routing into authority.

## Five participant outcomes

| Registry question | Participant outcome | Minimum conformance condition |
| --- | --- | --- |
| R1 — WHO | **I am recognized.** | Identity is explicitly resolved. |
| R2 — HOW CONNECTED | **My relationship/context is understood.** | Relationship/context is explicitly resolved. |
| R3 — WHAT APPLIES | **I can see what governs this participation.** | Applicability is resolved, authorization is explicitly required, or a denial is tied to an authority reference. |
| R4 — WHAT IS REQUIRED | **I know what remains required.** | Requirements are satisfied, or every blocker is named by requirement/evidence reference. |
| R5 — WHAT NEXT | **I know the next permissible step.** | The next state is explicit: satisfy requirements, await Warden, await review, accept denial, or execute an authorized candidate action. |

## Critical separation

```text
R5 CANDIDATE ACTION != WARDEN AUTHORIZATION != EXECUTION AUTHORITY
```

A Registry-resolved candidate action is routing/context. It is never executable merely because R5 resolved it.

Only an explicit Warden `AUTHORIZED` decision may make the candidate action executable.

## Experience conformance vs actionability

The contract deliberately separates two questions.

### Experience conformance

`CONFORMANT` means the participant has an intelligible answer for R1-R5.

A conformant experience may still end in:

- a known requirement blocker;
- Warden review;
- an explicit denial;
- an authorized executable action.

A participant does not need to be permitted to act for the node to explain the state correctly.

### Actionability

The runtime classifies present actionability as:

- `EXECUTABLE` — Warden has explicitly authorized the R5 candidate;
- `KNOWN_BLOCKER` — the next step is understood but cannot yet execute;
- `DENIED` — Registry/Warden has explicitly denied the participation path;
- `UNRESOLVED` — one or more canonical questions cannot yet be answered.

## Fail-closed rules

1. `R1 != RESOLVED` is non-conformant.
2. `R2 != RESOLVED` is non-conformant.
3. `R3 = DENIED|EXPIRED|REVOKED` without an authority reference is non-conformant.
4. `R4 = REQUIRES_EVIDENCE` without explicit requirement/evidence references is non-conformant.
5. `R5 = RESOLVED` without a `candidateAction` is non-conformant.
6. R5 without a Warden decision remains non-executable.
7. Warden `REVIEW_REQUIRED` remains non-executable.
8. Warden `DENIED` remains non-executable.

## Requirement-first next action

If R4 identifies explicit unmet requirements, the participant-visible next step is `SATISFY_REQUIREMENTS` even when the final R5 candidate cannot yet be resolved.

This is descriptive guidance, not execution authority. It prevents the participant from receiving a meaningless `UNKNOWN` when the system already knows the concrete blocker.

## Runtime object

Implementation: `api/runtime/participant-conformance.ts`

Version:

```text
bnr.participant-conformance.v1
```

The output contains:

- `experienceStatus`;
- `actionability`;
- assessments for `recognized`, `connected`, `applies`, `required`, and `next`;
- a non-authoritative participant `nextAction` description;
- `unresolvedQuestions` for operational remediation.

## Alpha Node acceptance gate

For `ALPHA-NODE-001`, the first issuance should not be considered participant-ready merely because data has reached a projection.

A bounded VSR/Front Gate surface should be capable of producing this conformance snapshot from Registry R1-R5 plus the relevant Warden decision.

The minimum acceptance rule is:

```text
NO PARTICIPANT SURFACE GRANT
UNLESS
R1-R5 CAN BE EXPLAINED
AND
ANY EXECUTABLE ACTION CARRIES EXPLICIT WARDEN AUTHORIZATION
```

## Future BNR node inheritance

Every future BNR node may use different infrastructure, databases, agents, models or interfaces, but this semantic participant contract should remain stable.

The implementation may evolve. The participant invariant should not:

> I am recognized; my relationship is understood; I can see what applies; I know what is required; and I know what I may do next.
