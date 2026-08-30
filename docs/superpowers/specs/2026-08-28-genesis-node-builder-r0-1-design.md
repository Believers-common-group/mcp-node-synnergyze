# GENESIS-NODE-BUILDER-001 R0.1 — Acquisition Intake + Evidence Reconciliation

Status: DESIGN SPECIFICATION
Date: 2026-08-28
Base branch: `genesis`
Design branch: `design/genesis-node-builder-r0-1`
Reference asset: `GENESIS-REFERENCE-ASSET-MOA-001` — Phoenix Mall of Asia, Bengaluru
Reference-asset status: `PUBLIC-EVIDENCE PROTOTYPE — NOT AUTHORITATIVE PROPERTY RECORD`

## Purpose

`GENESIS-NODE-BUILDER-001 R0.1` creates a governed provisional Genesis Node from incomplete property information and progressively reconciles it against stronger evidence.

Flow:

`IDENTIFY -> RESOLVE -> INGEST -> RECONCILE -> SCORE -> REQUEST MISSING EVIDENCE -> ADMISSION REVIEW`

R0.1 does not determine legal title, approve an acquisition, create Warden authority, or convert public information into authoritative property truth.

It answers:

1. What real-world asset do we believe this candidate refers to?
2. What claims can currently be supported, and by what evidence?
3. What conflicts or missing evidence prevent stronger confidence or admission?
4. What exact evidence should be requested next?

## Canonical boundary

Existing invariant:

`REQUEST != AUTHORITY != EXECUTION != EFFECT`

Node Builder invariant:

`DISCOVERY != CLAIM != EVIDENCE != VERIFICATION != ACQUISITION APPROVAL != GENESIS ADMISSION`

Responsibilities:

- Genesis Node Builder — candidate construction, claim/evidence graph, requirement evaluation, readiness projection.
- Genesis Registry — canonical admitted node identity and authoritative relationships after admission.
- Warden — authority, policy, review and admission decision boundary.
- RiverOS — evidence references, evidence movement, provenance and receipts.
- Synnergyze reconciliation — deterministic conflict classification and exception handling.
- UI / MCP / Vercel — interaction surfaces only; never authority.

No Node Builder status may self-promote a candidate into an admitted Genesis Node.

## Architectural choice

### Chosen: first-class governed module

Add:

`modules/genesis-node-builder/`

This module owns acquisition-candidate semantics and imports existing Warden/River/Synnergyze contracts instead of recreating them.

Rejected for R0.1:

- separate acquisition microservice — duplicates authority/evidence/reconciliation too early;
- extending `site-handoff` — overloads a deployment concern with property semantics.

## Core domain objects

### GenesisCandidateV1

Required fields:

- `candidateRef`
- `candidateType`
- `displayName`
- `jurisdictionRef`
- `assetClass`
- `lifecycle`
- `createdAt`
- `sourceEvidenceRefs[]`
- `correlationId`

Lifecycle:

- `DISCOVERED`
- `IDENTIFIED`
- `DILIGENCE_READY`
- `ACQUISITION_READY_CANDIDATE`
- `ADMISSION_REVIEW`
- `ADMITTED`
- `REJECTED`
- `SUPERSEDED`

Only Warden-governed admission may produce `ADMITTED`.

### CandidateIdentityV1

Identity clues may include:

- address/free text
- geospatial point or polygon
- survey number
- PID / EID / municipal identifier
- registered-document reference
- owner-supplied identifier
- uploaded drawing/document reference

Identity clues are evidence-bearing inputs, not canonical identity by themselves.

### CandidateClaimV1

Required fields:

- `claimRef`
- `candidateRef`
- `claimType`
- `subjectRef`
- `predicate`
- `value`
- `valueUnit?`
- `effectiveFrom?`
- `effectiveUntil?`
- `sourceEvidenceRefs[]`
- `claimState`
- `confidenceBand`
- `supersedesClaimRef?`

Claim states:

- `OBSERVED`
- `EVIDENCED`
- `CORROBORATED_PUBLIC`
- `AUTHORITATIVELY_VERIFIED`
- `INFERRED`
- `DISPUTED`
- `SUPERSEDED`
- `REJECTED`

No score may silently upgrade `INFERRED` or `CORROBORATED_PUBLIC` to `AUTHORITATIVELY_VERIFIED`.

### CandidateEvidenceV1

Required fields:

- `evidenceRef`
- `candidateRef`
- `evidenceClass`
- `sourceAuthorityRef?`
- `sourceSystemRef?`
- `documentRef?`
- `retrievedAt`
- `effectiveAt?`
- `evidenceState`
- `contentDigest?`
- `accessClass`
- `sourceLocatorRef?`

Evidence states:

- `DISCOVERED`
- `RETRIEVED`
- `SEALED`
- `VALIDATED`
- `STALE`
- `SUPERSEDED`
- `REJECTED`

Access classes:

- `PUBLIC`
- `CONTROLLED`
- `CONFIDENTIAL`
- `REGULATED`

### CandidateConflictV1

Required fields:

- `conflictRef`
- `candidateRef`
- `claimRefs[]`
- `evidenceRefs[]`
- `classification`
- `severity`
- `resolutionState`
- `requiredReviewCapabilityRef`

Classifications:

- `IDENTITY_CONFLICT`
- `BOUNDARY_CONFLICT`
- `AREA_CONFLICT`
- `PARTY_CONFLICT`
- `CHRONOLOGY_CONFLICT`
- `APPROVAL_CONFLICT`
- `USE_CONFLICT`
- `EVIDENCE_INSUFFICIENT`

Unsafe ambiguity goes to manual review; the system does not guess.

### EvidenceRequirementV1

Required fields:

- `requirementRef`
- `candidateRef`
- `requirementClass`
- `assetClass`
- `jurisdictionRef`
- `mandatoryForGate`
- `acceptableEvidenceClasses[]`
- `status`
- `reasonCode`
- `satisfiedByEvidenceRefs[]`

Statuses:

- `MISSING`
- `PARTIAL`
- `SATISFIED`
- `WAIVED_BY_WARDEN`
- `NOT_APPLICABLE`

A waiver must reference a Warden decision.

### AcquisitionReadinessSnapshotV1

Required fields:

- `snapshotRef`
- `candidateRef`
- `gate`
- `categoryScores`
- `blockingRequirementRefs[]`
- `blockingConflictRefs[]`
- `evidenceCoverage`
- `computedAt`
- `sourceDigest`
- `projectionOnly: true`

The snapshot is never authority and is rebuildable.

## Asset class scope

R0.1 ships the generic contract plus one blueprint:

`MALL`

The MALL blueprint defines evidence requirements for:

- identity/jurisdiction
- parcel/boundary
- registration/title-chain evidence
- encumbrance/charge evidence
- municipal identifiers
- building approvals
- sanctioned/as-built geometry
- completion/occupancy evidence
- fire/statutory approvals
- parking/loading/common areas
- utilities/MEP/BMS topology
- tenant/occupancy register
- operating/service contracts

Jurisdiction-specific requirements are configuration, not hard-coded universal law.

## Warden gates

### G0 — Discoverable
Enough information exists to identify a probable real-world asset.

### G1 — Identified
Jurisdiction and candidate identity are sufficiently resolved for targeted diligence.

### G2 — Diligence Ready
The minimum evidence set exists to begin legal, technical and commercial diligence.

### G3 — Acquisition Ready Candidate
Mandatory requirements are satisfied or explicitly waived by an authorized Warden decision, and no unresolved blocking conflict remains.

This is still a candidate state; it is not transaction approval.

### G4 — Genesis Admission
A separate Warden-governed admission decision authorizes creation/activation of canonical Genesis Location/Node identity.

Node Builder may prepare a request for G4 but never self-issue it.

## Readiness model

Readiness is two-dimensional:

1. Coverage score — how much required evidence is present.
2. Gate status — whether mandatory constraints are satisfied.

A high score cannot override a failed gate.

Initial MALL categories:

- identity
- jurisdiction
- registration
- title-chain evidence
- encumbrance evidence
- land/boundary
- municipal
- building approvals
- spatial/as-built
- statutory/fire
- tenancy/commercial
- engineering/utilities

The score is deterministic and carries a `sourceDigest` over requirement/evidence/conflict inputs.

## Data flow

### Intake

Supported intake:

- address/free text
- map point/polygon
- survey number
- PID/EID/municipal identifier
- registration/document reference
- uploaded public or owner-supplied document reference

Output: `GenesisCandidateV1` plus `CandidateIdentityV1[]`.

### Ingestion

Source adapters emit evidence and claims. They do not mutate readiness directly.

Provider classes can include:

- registration/SRO evidence provider
- revenue/land evidence provider
- municipal evidence provider
- GIS/spatial evidence provider
- public corporate disclosure provider
- owner-document provider
- survey/BIM/CAD provider

No production government-system adapter is implied by this design; integrations require lawful access and supported interfaces.

### Reconciliation

Rules:

- compatible claims may corroborate one another;
- stronger evidence may supersede weaker claims without erasing history;
- conflicting authoritative evidence creates a conflict;
- missing authoritative evidence remains missing;
- inferred geometry remains distinguishable from survey/sanctioned geometry.

### Readiness projection

Evaluate blueprint requirements against reconciled state and emit `AcquisitionReadinessSnapshotV1`.

### Missing Evidence Contract

Emit a stable ordered list of unsatisfied requirements grouped by party/source and domain. For a mall this becomes the client-facing document request without rewriting the acquisition model.

## Reference asset — Mall of Asia

`GENESIS-REFERENCE-ASSET-MOA-001` is the first synthetic/public-evidence fixture.

Rules:

1. Only public evidence refs and synthetic fixture data are committed.
2. No private Phoenix document, private registry record, personal information, credential, title document body or regulated evidence is committed.
3. Public claims remain `CORROBORATED_PUBLIC` unless an authoritative permitted source exists.
4. The fixture intentionally includes missing evidence.
5. The fixture includes at least one controlled conflict to test reconciliation.
6. Fixture data alone can never produce G4 `ADMITTED`.

## Proposed module structure

```text
modules/genesis-node-builder/
  contracts.ts
  candidate-store.ts
  claim-engine.ts
  reconciliation.ts
  requirement-engine.ts
  readiness-engine.ts
  blueprints/
    mall.ts
  fixtures/
    mall-of-asia.public.ts
```

Tests:

```text
modules/genesis-node-builder/
  contracts.test.ts
  claim-engine.test.ts
  reconciliation.test.ts
  requirement-engine.test.ts
  readiness-engine.test.ts
  mall-of-asia.public.test.ts
```

External API/MCP exposure comes only after domain contracts are proven.

## Integration points

Reuse:

- `modules/warden/decision-service.ts` for Warden decisions and admission/manual review capability gates.
- `modules/river/contracts.ts` for evidence/causal references where appropriate.
- `modules/synnergyze/reconciliation-fabric.ts` conventions for deterministic hashing, idempotent replay, conflict classification and fresh Warden decisions for consequential remedies.
- `api/registry-bridge.ts` only in a later slice that projects admitted state to/from the canonical Registry.

Node Builder must not write directly to Registry during discovery, diligence or scoring.

## Idempotency and lineage

Every deterministic output carries a canonical digest of its inputs:

- candidate creation fingerprint
- claim fingerprint
- evidence fingerprint
- conflict fingerprint
- requirement evaluation fingerprint
- readiness snapshot fingerprint

Replay of the same logical input returns the same canonical result or an explicit idempotency conflict.

Supersession is append-only:

`old claim -> supersession event -> new claim`

## Error handling

Fail closed on admission-relevant ambiguity.

Required behavior:

- unknown jurisdiction -> block G1
- multiple unresolved candidate identities -> `IDENTITY_CONFLICT`
- conflicting parcel boundaries -> `BOUNDARY_CONFLICT`
- required evidence missing -> remains `MISSING`
- invalid evidence lineage -> `REJECTED`
- invalid chronology -> conflict/manual review
- unsupported asset class -> reject blueprint evaluation
- Warden policy absent for waiver/admission -> no waiver/admission

No automatic recovery is authorized by a reconciliation result.

## Public-repository safety

Never commit:

- title-deed bodies/private registered documents
- personal identifiers from non-public records
- private municipal/revenue records
- credentials/keys/cookies/session artifacts
- Warden token bodies/nonces/signatures
- confidential acquisition terms
- private valuation/bid material

Use references, hashes, redacted/synthetic fixtures and access-class metadata.

## Testing strategy

Implementation must be test-driven.

Minimum scenarios:

1. Address-only candidate reaches G0 but not G1 when ambiguous.
2. Survey/PID evidence resolves unique candidate and reaches G1.
3. Missing mandatory title-chain evidence prevents G3 regardless of high coverage.
4. Conflicting public area claims create a conflict according to blueprint policy.
5. Conflicting authoritative parcel boundaries create a blocking conflict.
6. Stronger evidence supersedes weaker claim while preserving history.
7. Duplicate ingestion is idempotent.
8. Same logical evidence with changed content digest is a conflict/new version, never silent mutation.
9. Missing evidence produces stable requirements.
10. Warden waiver can satisfy only explicitly waivable requirements.
11. G4 admission is impossible without valid Warden decision.
12. Mall of Asia public fixture remains non-authoritative and cannot self-admit.

## Out of scope R0.1

- live scraping of government websites
- production Kaveri/Bhoomi/e-Aasthi integrations
- legal opinion generation/title certification
- automated acquisition approval
- valuation/lending/conveyance execution
- BIM editing
- production-scale tenant lease ingestion
- map/CAD UI
- portfolio capital allocation
- ARK installation

## Success criteria

R0.1 is implementation-ready when it can be planned to demonstrate with synthetic/public evidence:

1. Mall of Asia candidate creation from limited intake;
2. separate claims and evidence;
3. at least one conflict detected without guessing;
4. deterministic MALL missing-evidence contract;
5. separate coverage score and Warden gate status;
6. one mandatory unsatisfied requirement blocks G3;
7. G4 cannot occur without Warden decision;
8. all consequential derived records are lineage-addressable and replay-safe.

## Follow-on slices

- R0.2 — lawful source-adapter interface + first public/government adapters.
- R0.3 — spatial reconciliation: cadastral vs municipal vs satellite vs survey vs BIM.
- R0.4 — owner evidence portal and controlled document request/receipt.
- R0.5 — acquisition workroom: legal/technical/commercial reviewers, exceptions, Warden decisions.
- R0.6 — Genesis admission bridge: verified candidate -> canonical Location/Parcel/Structure.
- R0.7 — operational Node Builder: structures -> floors -> spaces -> Rooms -> Doors -> Pods.
- R0.8 — ARK installation onto admitted Nodes.

## Design invariants

1. Public discovery never equals legal verification.
2. Registration evidence alone never equals clean title.
3. Geometry always carries provenance.
4. Claims and evidence are distinct.
5. Missing evidence is explicit and never guessed away.
6. Conflicting authoritative evidence fails closed to review.
7. Readiness percentage cannot override a mandatory Warden gate.
8. Node Builder never self-authorizes acquisition or admission.
9. Historical claim/evidence lineage is append-only.
10. The acquisition candidate must be promotable into the permanent Genesis Node without discarding diligence history.
