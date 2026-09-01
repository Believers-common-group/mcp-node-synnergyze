# PESTEL Legislative Evidence Contract — R0.1

R0.1 keeps five concepts deliberately separate.

## Source observation

A `SourceEnvelopeV1` records what the official source returned and the non-secret metadata necessary to identify and verify that retrieval. Source material is evidence, not interpretation or authority.

## Interpretation

`NormalizedLegislativeEventV1`, `PestelSignalV1`, and `ImpactBriefV1` are deterministic or explicitly bounded interpretations. Their identities are content-addressed and their evidence references point back to source observations. Hypotheses must remain labeled as hypotheses.

## Local River receipt

`LegislativeEvidenceReceiptV1` records digests, versions, statuses, non-secret credential admission metadata, and output identities required for replay. Its `persistenceState` is `LOCAL_DOMAIN_RECEIPT`.

`LOCAL_DOMAIN_RECEIPT` does **not** mean the receipt has been published to or durably persisted in a live RiverOS deployment.

## Registry candidate

A `RegistryImpactCandidateV1` proposes a relation such as `MAY_AFFECT`. It never mutates stable Registry identity and exposes no Registry write capability in R0.1.

## Warden authority

PESTEL evidence and interpretation never grant authority. Consequential action requires an explicit proposal routed through the existing Warden request boundary. PESTEL evidence refs remain evidence refs; they must not be promoted into authority refs.
