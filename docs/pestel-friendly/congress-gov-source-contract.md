# Congress.gov Source Contract — R0.1

## Source role

Congress.gov is the R0.1 reference legislative source adapter for United States federal material. Source observations remain distinct from normalized lifecycle state and PESTEL interpretation.

## Transport

- Fixed API base: `https://api.congress.gov/v3`.
- Credential admission reference: `CONGRESS-GOV-API-KEY-001`.
- Credential transport: `X-Api-Key` request header only.
- API keys are prohibited in query strings, persisted source envelopes, logs, generated briefs, errors, and evidence receipts.
- Every V1 request forces `format=json` at dispatch and sends `Accept: application/json`. R0.1 does not depend on the upstream default representation.
- The source envelope records the actual dispatched relative source path, including the explicit `format=json` query parameter.
- The runtime follows pagination only when the resolved URL remains under the fixed Congress.gov `/v3` base and contains no `api_key` or `apikey` parameter.

## Minimum R0.1 observations

For a bill, the adapter reads the bill record plus related actions, subjects, committees, amendments, and summaries.

### Introduction evidence

The bill record's official `introducedDate` is authoritative introduction evidence when present. Action text such as `Introduced in House` or `Introduced in Senate` is a fallback only. An introduced bill remains `PROPOSAL` unless stronger recognized lifecycle evidence exists.

### CRS summary selection

Congress.gov summaries can correspond to different legislative-action stages. R0.1 does not trust response array or pagination order to select the current summary. Eligible summary records are ranked deterministically by associated `actionDate`, then `updateDate`, then `versionCode`, with a deterministic textual tie-breaker. The most recent ranked summary is used for the normalized event.

### Enacted-law resolution

Official law detail is read only when the bill record declares a law. R0.1 resolves that law from canonical bill fields rather than trusting a supplied URL:

- `Public Law` maps to law type `pub`.
- `Private Law` maps to law type `priv`.
- The declared NARA law number must be shaped as `<congress>-<sequence>`.
- The declared Congress must equal the bill Congress and the sequence must be positive.
- The resulting fixed path is `/law/<congress>/<pub|priv>/<sequence>`.
- Any law URL present in source material is ignored for routing.
- A declared law that cannot be mapped from these canonical fields fails closed as `LAW_DETAIL_UNRESOLVABLE` rather than being guessed.

## Retries and failures

Retries are bounded and limited to rate-limit and upstream-server responses. Retry delay is bounded. Authentication, authorization, not-found, malformed-path, out-of-base, unsafe-pagination, and unresolved-law failures terminate with non-secret error codes. Response bodies and request headers are never copied into errors.

## Evidence discipline

Each successful source envelope records a source identity, object identity, retrieval time, HTTP status, non-secret rate-limit observations, raw content digest, credential admission reference, and optional non-secret credential fingerprint prefix. Interpretation is produced later and remains separately addressable.

Observation timestamps are provenance metadata, not substantive identity. Stable legislative-event, PESTEL-signal, impact-brief, River-evidence, and Synnergyze-work references remain content-addressed across timestamp-only re-observation. The process-local result store treats those stable references as the collision boundary and still fails closed if substantive identities conflict under one `signalRef`.
