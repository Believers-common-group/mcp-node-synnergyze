# PESTEL-Friendly Legislative Intelligence R0.1 Architecture

## Purpose

R0.1 converts official legislative observations into bounded, reviewable external-environment intelligence. It does not create legal authority, mutate Registry identity, publish to live River infrastructure, or execute settlement.

## Processing chain

```text
Congress.gov
  -> source envelopes
  -> deterministic lifecycle normalization
  -> six-dimensional PESTEL signal
  -> Registry impact candidates
  -> LOCAL_DOMAIN_RECEIPT evidence
  -> Synnergyze REVIEW_CANDIDATE
```

A consequential downstream action follows a separate authority path:

```text
PESTEL review candidate
  -> explicit action proposal
  -> existing Synnergyze Warden request bridge
  -> Warden decision
```

## Authority boundaries

- Congress.gov is an official evidence source for United States federal legislative records; it is not Warden authority.
- Lifecycle normalization and PESTEL classification are interpretations over evidence.
- Registry matches are relational candidates only; R0.1 exposes no Registry write method.
- `LOCAL_DOMAIN_RECEIPT` is a reconstructable local evidence receipt, not live River publication.
- Synnergyze work is non-authoritative until a consequential action is separately proposed and admitted to the existing Warden boundary.
- R0.1 performs no SILK settlement.

## Runtime exposure

The MCP operations are disabled by default. Exposure requires both `VSR_PESTEL_MCP_R0_1=1` and the exact operation ID in the explicit tool allow-list.
