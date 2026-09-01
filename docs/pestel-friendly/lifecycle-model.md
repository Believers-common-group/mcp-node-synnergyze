# Legislative Lifecycle Model — R0.1

## States

`SIGNAL`, `PROPOSAL`, `ADVANCING`, `ADOPTED`, `EFFECTIVE`, `ENFORCED`, `SUPERSEDED`, `WITHDRAWN`, `FAILED`, `UNKNOWN`.

## Deterministic precedence

The normalizer applies the least-advanced defensible state using this order:

1. explicit supersession -> `SUPERSEDED`
2. explicit withdrawal -> `WITHDRAWN`
3. explicit failure -> `FAILED`
4. enforcement evidence -> `ENFORCED`
5. authoritative law number plus effective date at or before evaluation time -> `EFFECTIVE`
6. authoritative law number -> `ADOPTED`
7. recognized advancing evidence -> `ADVANCING`
8. introduction evidence -> `PROPOSAL`
9. otherwise -> `UNKNOWN`

Recognized advancing families are `committee_reported`, `chamber_passed`, `conference`, `enrolled`, and `presented_to_president`. None of those alone means `ADOPTED`.

## Guardrail

An introduced, referred, debated, amended, reported, or chamber-passed measure must never be described as enacted law unless authoritative law evidence is present. Ambiguity is represented as `UNKNOWN` or a less-advanced state rather than inferred upward.
