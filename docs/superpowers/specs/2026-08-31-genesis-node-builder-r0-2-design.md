# GENESIS-NODE-BUILDER-001 R0.2 — Governed Source Adapter Fabric + Deterministic Evidence Normalization

Status: DESIGN SPECIFICATION
Date: 2026-08-31
Base branch: `genesis`
Design branch: `design/genesis-node-builder-r0-2`
R0.2 design base: `2e2faac75174fe530316407e61b2898950bfdc53`
Predecessor: `GENESIS-NODE-BUILDER-001 R0.1` — Acquisition Intake + Evidence Reconciliation
Reference asset: `GENESIS-REFERENCE-ASSET-MOA-001` — Phoenix Mall of Asia, Bengaluru
Reference-asset status: `PUBLIC-EVIDENCE PROTOTYPE — NOT AUTHORITATIVE PROPERTY RECORD`

## Purpose

`GENESIS-NODE-BUILDER-001 R0.2` adds the governed source-adapter fabric by which external observations can enter the R0.1 acquisition/evidence model without turning an external provider, connector, website, document, authenticated session, or government system into Genesis authority.

R0.2 answers:

1. Which external source is being used, for what proposition and jurisdiction?
2. Is the adapter merely normalizing already obtained material, or is it authorized to retrieve from the source?
3. What exact Warden authority permits a bounded retrieval?
4. What was actually observed, when, through which adapter version, and with what digest?
5. How is that observation mechanically normalized into R0.1-compatible evidence and claim candidates?
6. What remains missing, ambiguous, stale, inaccessible, unverified, or outside the source's competence?

Canonical flow:

`SOURCE REQUEST -> SOURCE REGISTRY RESOLUTION -> WARDEN ADMISSION -> ADAPTER -> RAW OBSERVATION -> EVIDENCE ENVELOPE -> CLAIM CANDIDATES -> PROVENANCE/DIGEST VALIDATION -> R0.1 INGESTION -> RECONCILIATION -> READINESS`

R0.2 does not create title truth, acquisition approval, Genesis admission, unrestricted browsing authority, credentials, legal opinion, or production access to restricted government systems.

## Canonical boundaries

Existing system invariant:

`REQUEST != AUTHORITY != EXECUTION != EFFECT`

R0.1 invariant:

`DISCOVERY != CLAIM != EVIDENCE != VERIFICATION != ACQUISITION APPROVAL != GENESIS ADMISSION`

R0.2 adds:

`REGISTERED SOURCE != CONNECTED SOURCE != RETRIEVABLE SOURCE != TRUSTED PROPOSITION`

and:

`RETRIEVAL AUTHORITY != EVIDENCE AUTHORITY != CLAIM AUTHORITY != GENESIS ADMISSION AUTHORITY`

and:

`NORMALIZATION MAY CHANGE REPRESENTATION; IT MAY NEVER INCREASE AUTHORITY`

Responsibilities remain separated:

- Genesis Node Builder — candidate semantics, evidence/claim ingestion, reconciliation, requirements and readiness.
- Source Registry — registered source and adapter definitions, capabilities, jurisdiction and status metadata.
- Source Adapter Fabric — bounded retrieval/reference processing, immutable observations and deterministic normalization.
- Warden — source-access admissibility and exact retrieval authority; no adapter self-authorizes.
- RiverOS — evidence movement, access-attempt receipts, observation/provenance references and effect evidence.
- Genesis Registry — canonical admitted identities/relationships only after later admission.
- Synnergyze reconciliation — deterministic conflict/exception handling after ingestion.
- Credential/secret boundary — supplies short-lived capability or secret references without placing secret values in Node Builder domain objects.

## Architectural choice

### Chosen: provider-neutral canonical adapter contract with source-specific implementations

Every source-specific adapter may retrieve and parse differently, but it must cross the Node Builder boundary through the same typed contracts.

Canonical sequence:

`SourceObservationV1 -> NormalizedEvidenceEnvelopeV1 -> ClaimCandidateEnvelopeV1`

Source-specific details may be retained in a bounded `sourceNativeMetadata` field, but provider-specific schemas do not become the canonical downstream interface.

Rejected for R0.2:

1. **Generic untyped JSON connector envelope** — fast to add providers but pushes ambiguity, trust semantics and validation into reconciliation.
2. **Independent canonical model per provider** — preserves native fidelity but creates schema proliferation and tight coupling between downstream logic and provider implementations.
3. **Direct adapter writes into R0.1 stores** — collapses retrieval, normalization and ingestion validation and makes authority escalation difficult to detect.

## Adapter modes

R0.2 supports exactly two source-access modes.

### `REFERENCE_ONLY`

The adapter receives material that has already been lawfully obtained or a pre-existing reference to that material.

Properties:

- no external retrieval authority;
- no generic network capability;
- may validate, parse and normalize only the admitted referenced material;
- preserves the source material's access classification;
- produces deterministic normalization from a sealed observation.

Typical R0.2 use: owner-supplied document reference or previously captured public disclosure.

### `BOUNDED_RETRIEVAL`

The adapter may contact an explicitly registered source only after Warden admission of the exact retrieval scope.

Warden authority binds at minimum:

- `sourceRef`
- `adapterRef`
- `adapterVersion`
- `candidateRef`
- operation
- purpose
- requested evidence/field scope
- jurisdiction scope
- access class
- credential class where required
- validity window
- correlation ID
- applicable execution constraints

There is no generic `internet allowed` or broad connector token in this design.

## Source Registry

### `SourceDefinitionV1`

Represents an external evidence provider or source class known to the adapter fabric.

Required design fields:

- `sourceRef`
- `displayName`
- `sourceClass`
- `jurisdictionScopes[]`
- `operatorRef?`
- `authorityNature`
- `supportedAccessModes[]`
- `allowedOperations[]`
- `evidenceClasses[]`
- `defaultAccessClass`
- `credentialClass?`
- `termsOrPolicyRefs[]`
- `freshnessPolicy`
- `status`

Initial source status values:

- `REGISTERED`
- `ACTIVE`
- `DEGRADED`
- `SUSPENDED`
- `RETIRED`
- `NOT_CONNECTED`
- `ACCESS_NOT_ADMITTED`

Retrieval executes only against `ACTIVE` sources. A non-consequential `REFERENCE_ONLY` path may process already captured material from another status only when the operation itself remains policy-admissible and the historical source state is retained in provenance.

`authorityNature` describes the source's nature, not an automatic claim state. Initial values may include:

- `PUBLIC_INFORMATION`
- `OFFICIAL_RECORD_SOURCE`
- `OWNER_SUPPLIED`
- `PROFESSIONAL_ATTESTATION`
- `SURVEY_TECHNICAL`
- `GIS_SPATIAL`
- `CORPORATE_DISCLOSURE`

A government domain or authenticated source does not automatically produce `AUTHORITATIVELY_VERIFIED` claims.

### `SourceAdapterDefinitionV1`

Required design fields:

- `adapterRef`
- `adapterVersion`
- `sourceRef`
- `mode`
- `capabilities[]`
- `inputSchemaRef`
- `outputSchemaRef`
- `networkRequired`
- `credentialClass?`
- `normalizationVersion`
- `status`

Adapter version is part of Warden scope and deterministic lineage. Authority issued for version `1.0` does not silently authorize version `1.1`.

### Capability vocabulary

R0.2 uses meaningful, least-privilege operations rather than a generic `READ` capability.

Initial operations:

- `LOOKUP_DOCUMENT_REFERENCE`
- `FETCH_PUBLIC_DISCLOSURE`
- `FETCH_SPATIAL_FEATURE`
- `INGEST_OWNER_DOCUMENT`
- `RESOLVE_IDENTIFIER`
- `FETCH_REGISTERED_DOCUMENT_METADATA`

Additional operations require additive contract evolution.

## Source-access request and Warden binding

### `SourceRetrievalRequestV1`

Required design fields:

- `requestRef`
- `candidateRef`
- `sourceRef`
- `adapterRef`
- `adapterVersion`
- `mode`
- `operation`
- `purpose`
- `requestedEvidenceClasses[]`
- `requestedFields[]`
- `jurisdictionRef`
- `requestedAt`
- `correlationId`

For `REFERENCE_ONLY`, the request also binds the admitted source/document/observation reference and does not request network execution.

For `BOUNDED_RETRIEVAL`, execution is impossible without a matching Warden `ALLOW` decision.

### `SourceAccessDecisionV1`

R0.2 should reuse the existing Warden decision service rather than create an independent authorization engine. A Node Builder projection/wrapper may expose the exact bindings required for source execution, but the Warden decision remains the authority object.

The execution gate validates:

- decision is `ALLOW`;
- action/capability matches the requested operation;
- target/source scope matches;
- candidate scope matches;
- adapter/version matches;
- jurisdiction/purpose constraints match;
- decision is not expired;
- required credential class is available through the secret boundary;
- source and adapter are executable under current registry status.

Any mismatch fails before external execution.

## Credential isolation

Credentials are not Node Builder domain data.

The adapter may receive a short-lived capability, handle, or secret reference from the execution/secret boundary. Raw credential values must never appear in:

- `SourceRetrievalRequestV1`
- `SourceObservationV1`
- `CandidateEvidenceV1`
- `CandidateClaimV1`
- adapter receipts
- River evidence bodies intended for normal domain consumption
- application logs
- public fixtures
- GitHub

Credential availability authorizes neither the source operation nor the resulting proposition. Authentication and retrieval capability remain separate from Warden authorization and evidence authority.

## Observation model

### `SourceObservationV1`

A source observation records what the adapter actually received or was given. It does not assert that the observed content is true.

Required design fields:

- `observationRef`
- `candidateRef`
- `sourceRef`
- `adapterRef`
- `adapterVersion`
- `mode`
- `operation`
- `sourceLocatorRef`
- `observedAt`
- `effectiveAt?`
- `contentDigest`
- `contentType`
- `accessClass`
- `authorityNature`
- `wardenDecisionRef?`
- `sourceStatusAtObservation`
- `sourceNativeMetadata?`

The observation is immutable/hash-addressed after sealing.

Retrieval is time-varying; normalization of a captured observation is deterministic. If a source later changes, the adapter creates a new observation with a new digest and explicit lineage. It never mutates the prior observation.

Raw sensitive content may remain in an appropriate controlled evidence/document store. `SourceObservationV1` may carry references and digests rather than embedding the content.

## Normalization and trust separation

R0.2 uses typed canonical envelopes.

### `NormalizedEvidenceEnvelopeV1`

The envelope links one sealed observation to a proposed R0.1 `CandidateEvidenceV1` representation.

Conceptual layers:

1. `rawObservationRef` — immutable captured material/reference.
2. `normalizedFacts` — mechanically normalized values.
3. evidence candidate — R0.1-compatible evidence metadata.
4. `normalizationReceipt` — transformation lineage and deterministic digest.

Mechanical normalization may include:

- unit normalization;
- date normalization;
- identifier formatting;
- coordinate normalization;
- whitespace/case normalization where semantics are preserved;
- structured extraction from a known schema;
- canonical content hashing.

Normalization may not:

- infer clean title from registration metadata;
- promote GIS geometry to cadastral/survey truth;
- convert source authentication into proposition verification;
- silently resolve ambiguous parties, identifiers or boundaries;
- upgrade `OBSERVED`, `INFERRED` or public assertions to `AUTHORITATIVELY_VERIFIED`.

### `ClaimCandidateEnvelopeV1`

Contains zero or more proposed R0.1 claim candidates derived from the observation.

Each proposed claim carries an explicit authority basis. Initial authority-basis values:

- `SOURCE_ASSERTION`
- `SOURCE_COMPETENCE`
- `CROSS_SOURCE_CORROBORATION`
- `PROFESSIONAL_VERIFICATION`
- `INFERENCE`

The adapter may describe the basis; it cannot grant final authoritative claim state. R0.1 ingestion/reconciliation and later governed verification decide how the candidate enters the claim graph.

Derived interpretation beyond mechanical normalization must be explicit and typed as inference. It cannot be hidden inside a normalizer.

### `NormalizationReceiptV1`

Required design fields:

- `receiptRef`
- `observationRef`
- `adapterRef`
- `adapterVersion`
- `normalizationVersion`
- `transformationRuleRefs[]`
- `warnings[]`
- `inputDigest`
- `outputDigest`
- `normalizedAt`

Given the same sealed observation, adapter version, normalization version and rules, normalization must produce the same canonical output digest.

## Adapter execution receipts

### `AdapterReceiptV1`

Every access attempt produces a receipt, including denial and failure.

Outcome values:

- `SUCCEEDED`
- `PARTIAL`
- `DENIED`
- `SOURCE_UNAVAILABLE`
- `AUTHORITY_EXPIRED`
- `CREDENTIAL_UNAVAILABLE`
- `RATE_LIMITED`
- `SOURCE_CHANGED`
- `VALIDATION_FAILED`
- `FAILED`

A denied attempt produces a receipt but no fabricated observation.

`PARTIAL` is evidence-bearing only for what was actually obtained. It never implies completeness. Unsatisfied R0.1 evidence requirements remain `MISSING` or `PARTIAL` according to the requirement engine.

Receipts should be River-addressable and correlate source request, Warden decision where present, execution result and observation refs where created.

## First R0.2 adapter portfolio

### Concrete adapter 1 — `PUBLIC_CORPORATE_DISCLOSURE`

Purpose: normalize public company/project disclosures and published asset facts.

Initial operation: `FETCH_PUBLIC_DISCLOSURE` for bounded retrieval and reference-only normalization of an already captured disclosure.

Expected evidence remains public unless another governed evidence source independently changes the access classification. Corporate publication does not equal title/municipal/survey authority.

### Concrete adapter 2 — `PUBLIC_GIS_SPATIAL`

Purpose: capture and normalize public GIS/map geometry and spatial observations.

Initial operation: `FETCH_SPATIAL_FEATURE`.

GIS geometry retains its geometry/source provenance. Approximate or public GIS geometry cannot satisfy an authoritative parcel-boundary requirement merely because parsing succeeds.

### Concrete adapter 3 — `OWNER_DOCUMENT_REFERENCE`

Purpose: ingest controlled material already supplied by an owner or authorized party.

Initial operation: `INGEST_OWNER_DOCUMENT`.

R0.2 preserves the supplied material's access classification. Controlled/confidential material cannot leak into a public evidence envelope or public fixture. Owner supply is evidence provenance, not automatic authoritative verification.

## Registered but not connected sources

R0.2 registers governed descriptors/capability interfaces for:

- `KAVERI_REGISTRATION`
- `BHOOMI_LAND_RECORD`
- `E_AASTHI_MUNICIPAL`

These are not fake live integrations.

Until a lawful supported interface, credential path, Warden policy and execution adapter exist, their source/adapter state remains `NOT_CONNECTED` and/or `ACCESS_NOT_ADMITTED` and retrieval fails closed.

Registration of these descriptors means only that Genesis knows how such a source would be classified and what capability/evidence boundary a future lawful adapter must satisfy.

No design statement implies:

- that an API exists;
- that credentials exist;
- that scraping is permitted;
- that every record is legally retrievable;
- that Genesis has a contractual or statutory access right;
- that the record proves clean title;
- that a government website's content is automatically authoritative for every proposition.

## Integration with R0.1

R0.2 does not replace R0.1 contracts. It terminates at validated candidate evidence/claims that R0.1 can ingest.

Existing R0.1 `CandidateEvidenceV1` remains the canonical acquisition evidence object and already carries:

- `sourceAuthorityRef?`
- `sourceSystemRef?`
- `documentRef?`
- `retrievedAt`
- `effectiveAt?`
- `evidenceState`
- `contentDigest?`
- `accessClass`
- `sourceLocatorRef?`

R0.2 populates these through validated provenance rather than allowing source adapters to mutate the evidence store directly.

The ingestion boundary validates:

- candidate binding;
- observation/evidence lineage;
- content digest;
- access-class compatibility;
- source/adapter identity and version;
- deterministic replay/idempotency;
- chronology;
- allowed evidence class;
- no prohibited authority escalation.

Only after validation does the existing R0.1 evidence/claim machinery receive the candidate objects.

Source adapters never mutate readiness directly.

## Mall of Asia reference fixture

R0.2 extends `GENESIS-REFERENCE-ASSET-MOA-001` only with public/synthetic source-adapter fixtures.

The fixture must demonstrate:

1. a public corporate disclosure can create a sealed public observation, normalized evidence and public claim candidate;
2. a GIS observation can create approximate spatial evidence while remaining distinguishable from authoritative parcel geometry;
3. Kaveri/Bhoomi/e-Aasthi descriptors can be discovered but cannot execute while not connected/admitted;
4. title-chain and parcel-boundary requirements remain unsatisfied;
5. evidence coverage may improve without causing G3/G4 admission;
6. no private Phoenix material, government record body, credential, personal information or regulated evidence is committed.

The fixture remains:

`PUBLIC-EVIDENCE PROTOTYPE — NOT AUTHORITATIVE PROPERTY RECORD`

## Proposed module structure

R0.2 should extend the existing module without moving R0.1 responsibilities:

```text
modules/genesis-node-builder/
  source-adapters/
    contracts.ts
    source-registry.ts
    execution-gate.ts
    observation-store.ts
    normalization.ts
    receipts.ts
    adapters/
      public-corporate-disclosure.ts
      public-gis-spatial.ts
      owner-document-reference.ts
    descriptors/
      kaveri-registration.ts
      bhoomi-land-record.ts
      e-aasthi-municipal.ts
```

Tests mirror the focused units rather than concentrating the subsystem into one large file.

External MCP/API exposure remains outside the first implementation slice until the domain contracts and execution boundary are proven.

## Error handling

R0.2 fails closed on access, lineage and authority ambiguity.

Normalization failures include:

- `UNSUPPORTED_FORMAT`
- `SOURCE_SCHEMA_CHANGED`
- `AMBIGUOUS_EXTRACTION`
- `DIGEST_MISMATCH`
- `MISSING_LINEAGE`
- `STALE_SOURCE`
- `OUT_OF_SCOPE`
- `NORMALIZATION_CONFLICT`

Execution failures include the `AdapterReceiptV1` outcomes above.

Required behavior:

- unknown/unregistered source -> reject before execution;
- unsupported adapter/version -> reject;
- source not executable -> reject bounded retrieval;
- missing Warden decision -> no bounded retrieval;
- expired Warden authority -> no bounded retrieval;
- candidate/source/adapter/operation/purpose mismatch -> no bounded retrieval;
- missing credential capability -> no retrieval where credential is required;
- digest mismatch -> reject observation/evidence transition;
- parser ambiguity -> explicit review/conflict output, never guessed value;
- changed source content -> new observation/version, never mutation;
- stale observation -> retain history but do not silently satisfy freshness-sensitive requirement;
- jurisdiction mismatch -> reject or review according to declared source scope, never silently broaden scope;
- access-class violation -> reject normalization/ingestion path;
- partial response -> preserve obtained evidence and leave missing requirements unresolved.

## Idempotency and lineage

The deterministic boundary begins after capture.

External retrieval may legitimately return different content at different times. Each captured response is sealed by content digest and becomes an immutable observation.

Deterministic replay rule:

`same SourceObservationV1 + same adapterVersion + same normalizationVersion + same transformation rules = same normalized output digest`

Changed source content creates a new observation. Changed normalization behavior requires a new normalization/adapter version. Neither case silently rewrites history.

Lineage is:

`SourceDefinition -> SourceAdapterDefinition -> SourceRetrievalRequest -> WardenDecision -> AdapterReceipt -> SourceObservation -> NormalizationReceipt -> EvidenceEnvelope/ClaimCandidate -> R0.1 Evidence/Claim -> Reconciliation -> Readiness`

For `REFERENCE_ONLY`, the Warden retrieval decision step is absent because no external retrieval capability is granted; any separate access/admission policy governing controlled referenced material remains preserved.

## Public-repository safety

Never commit:

- raw credentials, API keys, passwords, cookies, bearer/session tokens;
- Warden token bodies, nonces or signatures;
- private title/registered-document bodies;
- personal identifiers from non-public records;
- private municipal/revenue records;
- owner-confidential acquisition material;
- regulated source payloads;
- browser-session artifacts;
- material obtained through unsupported or unauthorized access.

Use synthetic/redacted fixtures, references, hashes, source descriptors and access-class metadata.

## Testing and acceptance contract

Implementation is test-driven.

Minimum mandatory scenarios:

1. Reference-only public disclosure normalizes deterministically without requesting network authority.
2. Bounded public retrieval executes only under exact matching Warden `ALLOW` scope.
3. Missing Warden decision prevents network execution.
4. Expired authority prevents execution.
5. Authority for Candidate A cannot retrieve for Candidate B.
6. Authority for adapter version `1.0` cannot silently authorize `1.1`.
7. Credential values never appear in domain objects, receipts or logs under test.
8. Sealed observations are immutable; later source changes create a new observation.
9. Same sealed observation plus same normalization version produces the same digest.
10. Changed external content creates explicit new observation/content lineage.
11. Official/government source origin alone cannot cause an adapter to emit `AUTHORITATIVELY_VERIFIED`.
12. Approximate GIS geometry cannot satisfy authoritative parcel-boundary evidence merely because normalization succeeds.
13. Ambiguous extraction becomes review/conflict state rather than guessed interpretation.
14. Partial retrieval retains obtained evidence but leaves unresolved requirements unresolved.
15. Unknown/unregistered source is rejected before execution.
16. Suspended/non-executable source is rejected even when an adapter implementation exists.
17. Kaveri/Bhoomi/e-Aasthi descriptors resolve but retrieval fails closed while `NOT_CONNECTED`/`ACCESS_NOT_ADMITTED`.
18. Owner-document ingestion preserves controlled/confidential access classification and cannot leak to public evidence output.
19. Warden denial produces a receipt but no fabricated `SourceObservationV1`.
20. Mall of Asia end-to-end adapter fixture improves the public evidence graph while title-chain/parcel-boundary requirements remain unsatisfied and Genesis admission remains impossible.

## Out of scope R0.2

- CAPTCHA bypass;
- browser impersonation or stealth automation;
- credential harvesting;
- uncontrolled/general-purpose scraping;
- automated legal opinion or title certification;
- automatic government-record access;
- production Kaveri/Bhoomi/e-Aasthi integration;
- direct source-adapter writes to Genesis Registry;
- automatic acquisition approval;
- G4 Genesis admission;
- autonomous authoritative claim verification;
- BIM/CAD reconstruction or editing;
- owner evidence portal UI;
- acquisition workroom UI;
- portfolio capital allocation;
- ARK installation.

## Success criteria

R0.2 is implementation-ready when the implementation plan can demonstrate:

1. both `REFERENCE_ONLY` and `BOUNDED_RETRIEVAL` through one canonical contract;
2. exact Warden-bound source execution for bounded retrieval;
3. credential isolation from Node Builder domain data;
4. immutable hash-addressed observations;
5. deterministic normalization of sealed observations;
6. no adapter authority escalation;
7. R0.1-compatible evidence and claim candidates with complete provenance;
8. public corporate, public GIS and owner-document reference adapters;
9. fail-closed registered descriptors for Kaveri/Bhoomi/e-Aasthi;
10. River-addressable receipts for successful, partial, denied and failed access attempts;
11. Mall of Asia public fixture remains non-authoritative and cannot self-admit;
12. all acceptance scenarios are covered by automated tests.

## Follow-on slices

R0.2 preserves the established Node Builder sequence:

- R0.3 — spatial reconciliation: cadastral vs municipal vs satellite vs survey vs BIM.
- R0.4 — owner evidence portal and controlled document request/receipt.
- R0.5 — acquisition workroom: legal/technical/commercial reviewers, exceptions and Warden decisions.
- R0.6 — Genesis admission bridge: verified candidate -> canonical Location/Parcel/Structure.
- R0.7 — operational Node Builder: structures -> floors -> spaces -> Rooms -> Doors -> Pods.
- R0.8 — ARK installation onto admitted Nodes.

A production restricted-source connector may be added as its own later governed slice when lawful access, supported interface, credential management and provider-specific testing are available; registering its descriptor in R0.2 does not accelerate that authority decision.

## Design invariants

1. External sources are evidence providers, not Genesis authority.
2. Registered source does not imply connected, retrievable or trusted source.
3. Warden authority is mandatory for bounded retrieval and is exact, short-lived and least-privilege.
4. Reference-only normalization grants no external retrieval capability.
5. Credentials never become Node Builder domain data.
6. Observation is distinct from evidence; evidence is distinct from claim; claim is distinct from verification.
7. Normalization may change representation but never increase authority.
8. Government or authenticated origin alone does not create `AUTHORITATIVELY_VERIFIED` state.
9. Source competence is proposition-specific, not source-wide.
10. Geometry always preserves provenance and authority class.
11. Captured observations are immutable; source changes create new observations.
12. Normalization is deterministic against a fixed captured observation and versioned rules.
13. Partial retrieval never means complete evidence coverage.
14. Missing evidence remains explicit and is not guessed away.
15. Ambiguity fails closed to review/conflict where consequential.
16. Denied/failed access attempts remain evidentially traceable without fabricating observations.
17. Source adapters do not mutate readiness or Registry state directly.
18. Kaveri/Bhoomi/e-Aasthi remain non-live until lawful supported access is separately admitted and implemented.
19. R0.2 cannot self-authorize acquisition or G4 Genesis admission.
20. R0.2 extends R0.1 without discarding or rewriting R0.1 diligence lineage.
