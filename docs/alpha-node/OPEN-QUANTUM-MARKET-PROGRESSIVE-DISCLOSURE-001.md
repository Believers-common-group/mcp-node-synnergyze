# OPEN-QUANTUM-MARKET-PROGRESSIVE-DISCLOSURE-001

Status: PROPOSED / NOT ADMITTED  
Revision: R0.1  
Estate: Virtual Silk Road (VSR)  
Surface: Open Quantum Market  
Authority: Warden policy evaluation required before disclosure  
Commercial-plan host: VSR  
Registry/admission metadata: BNR/authorized registry layer

## Purpose

Open Quantum Market is open for discovery, not unrestricted intelligence extraction.
The market uses one governed knowledge graph and returns progressively richer
projections according to identity, subscription entitlement, purpose,
jurisdiction and Warden policy.

Information visibility is evaluated as:

`visibility = f(identity, accountTier, entitlement, purpose, jurisdiction, wardenPolicy)`

A subscription tier sets only the maximum commercial entitlement. It does not
override client isolation, confidentiality, transaction state or regulation.

## Account tiers

| Tier | Name | Default purpose |
| --- | --- | --- |
| Q0 | Guest Discovery | Discover that an object/capability exists |
| Q1 | Free Member | Understand introductory details |
| Q2 | Market Pro | Evaluate and prepare commercial action |
| Q3 | Market Premium | Model, optimize, orchestrate and act |

## Disclosure classifications

- `OPEN`: may be shown to guests.
- `REGISTERED`: requires an authenticated account (Q1+).
- `SUBSCRIBER`: requires Q2 or Q3.
- `PREMIUM`: requires Q3.
- `COMMERCIAL_CONFIDENTIAL`: requires an explicit eligible business relationship.
- `ESTATE_PRIVATE`: requires estate/client scope match.
- `TRANSACTION_BOUND`: requires an eligible transaction/workflow state.
- `REGULATED`: requires an affirmative Warden policy decision for the relevant jurisdiction/purpose.
- `NEVER_PUBLIC`: never disclosed by Quantum Market discovery.

## Non-bypass rule

Higher payment tier MUST NOT bypass protected classifications. In particular,
Q3 Premium does not automatically receive COMMERCIAL_CONFIDENTIAL,
ESTATE_PRIVATE, TRANSACTION_BOUND or REGULATED fields.

## Progressive disclosure funnel

Discover -> Curiosity -> Identity -> Insight -> Subscription -> Decision -> Transaction

## Runtime chain

Open Web -> VSR -> Quantum Market -> DigitalMe/Account -> VSR Entitlement ->
Warden disclosure decision -> authorized Quantum Market projection

For actionable work:

Insight -> Ask Warden -> Synnergyze -> eligible provider/capability ->
provider-native execution -> River evidence

## Search behavior by tier

Q0 should return a deliberately limited public projection and bounded result
set. Q1 may add introductory filters, comparisons, saved discovery and basic
Warden explanations. Q2 may expose decision-grade commercial fields and
workflow preparation where authorized. Q3 may expose eligible advanced
analysis, modelling, orchestration and agentic actions.

Search/index access must not be treated as disclosure authority. The search
layer may retrieve or rank objects whose protected fields are removed from the
returned projection.

## Required decision inputs

Each disclosure evaluation should receive, at minimum:

- authenticated state / DigitalMe principal reference when available
- account tier
- subscription/entitlement state
- requested field classification
- purpose
- jurisdiction
- estate/client scope
- commercial relationship state
- transaction/workflow state
- Warden policy decision for regulated content

## Evidence

Every protected disclosure decision SHOULD be River-evidenced with at least:
request/principal reference, object reference, requested classifications,
effective tier, Warden decision, policy version, decision timestamp and result.

## Alpha admission rule

This R0.1 is an additive proposal. It MUST NOT directly mutate live Alpha
registry state. Promotion remains:

proposal -> validation -> dry-run -> local approval -> Warden admission -> River evidence

