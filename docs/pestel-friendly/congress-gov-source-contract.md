# Congress.gov Source Contract — R0.1

## Source role

Congress.gov is the R0.1 reference legislative source adapter for United States federal material. Source observations remain distinct from normalized lifecycle state and PESTEL interpretation.

## Transport

- Fixed API base: `https://api.congress.gov/v3`.
- Credential admission reference: `CONGRESS-GOV-API-KEY-001`.
- Credential transport: `X-Api-Key` request header only.
- API keys are prohibited in query strings, persisted source envelopes, logs, generated briefs, errors, and evidence receipts.
- The runtime follows pagination only when the resolved URL remains under the fixed Congress.gov `/v3` base and contains no `api_key` or `apikey` parameter.

## Minimum R0.1 observations

For a bill, the adapter may read the bill record plus related actions, subjects, committees, amendments, and summaries. Official law detail is read only when authoritative law linkage exists or is otherwise explicitly required by the source contract.

## Retries and failures

Retries are bounded and limited to rate-limit and upstream-server responses. Retry delay is bounded. Authentication, authorization, not-found, malformed-path, and out-of-base failures terminate with non-secret error codes. Response bodies and request headers are never copied into errors.

## Evidence discipline

Each successful source envelope records a source identity, object identity, retrieval time, HTTP status, non-secret rate-limit observations, raw content digest, credential admission reference, and optional non-secret credential fingerprint prefix. Interpretation is produced later and remains separately addressable.
