# BNR Company Registration Door R0.5 - governed approval intake

**Status: REVIEW OPEN / NOT APPROVED / NON-EXECUTABLE.**  
**Work order:** `WARDEN-BNR-CRD-R05-REGISTRY-READINESS`  
**Reference node:** `ALPHA-NODE-001`  
**Jurisdiction:** India (registration rules); technical controls may be reused only after separately approved jurisdictional packs.  
**Scope:** Public-safe governance coordination only. No MCA, DSC, payment, actual DigitalMe, Warden, or Registry integration.

## Why this document exists

R0.1-R0.4 produced offline registration drafting and Registry-resolution prototypes. R0.5 assembled eight synthetic workstreams W01-W08, with human approval still pending. This document opens a human-review intake; **a pull request, reviewer tick, file commit or green CI is not a source of Registry authority**.

This GitHub repository stores public-safe contracts. It is **not** the canonical Registry, Warden issuer, DigitalMe issuer, official filing system, or independently verified RiverOS evidence store.

`REQUEST != IDENTITY != REGISTRY RESOLUTION != WARDEN AUTHORITY != EXECUTION != RECEIPT != GOVERNMENT INCORPORATION`

## Work packages requiring review

| Workstream | Proposed product | Owner role | Status |
| --- | --- | --- | --- |
| W01 | Canonical source-of-truth and provenance decision | Registry custodian, data steward | PENDING |
| W02 | Read-only, case- and tenant-scoped Registry projection | Registry custodian, security reviewer | PENDING |
| W03 | DigitalMe issuer, session, representation and revocation contract | DigitalMe issuer owner | PENDING |
| W04 | Signed Warden case-scoped authority and independent decision verifier | Independent Warden policy owner | PENDING |
| W05 | Deny-by-default Synnergyze MCP allowlist, input digest, egress guard | MCP owner, security reviewer | PENDING |
| W06 | RLS, BOLA/IDOR, consent, privacy, replay and retention assessment | Independent security/privacy reviewer | PENDING |
| W07 | RiverOS signed receipt and independent verification contract | RiverOS evidence owner | PENDING |
| W08 | Synthetic SILK journal; separate statutory and financial gates | Legal/finance reviewer | PENDING |

**No individual, account, database, model, MCP tool, project or operator is designated as an approver or authoritative issuer by this document.**

## Required human decision records

For each item above, record a restricted decision reference (never the contents of a private evidence file), approving role, named accountable owner in the *private* Registry, reviewed artifact revision/hash, time, expiry/review horizon, decision type (`APPROVE_FOR_NEXT_REVIEW`, `NEEDS_CHANGES`, `REJECT`), and any conditions. The canonical, independently verified record belongs in the authorised Registry. A comment in this public pull request is **not** an approval signal.

Review conditions for later sandbox **proposal**:

1. Confirm canonical source-of-truth provenance, owner and legal data steward; do not select by a project name.
2. Confirm private, least-privilege read API design; explicit tenant + case + revision checks, service-only grant policy, RLS/IDOR negative tests.
3. Confirm DigitalMe issuer/audience/session identity and representation chain with revocation.
4. Confirm signed Warden decisions bound to operation, principal, audience, case, scope, expiry, document digest, and single-use lease; check replay denial.
5. Confirm per-tool Synnergyze allowlist, schema validation, frozen argument digest and network-egress prohibition by default.
6. Confirm independent RiverOS signer/verifier separation, no-effect evidence, and protection of private records.
7. Confirm SILK amounts stay simulated and statutory signatures, filing, money movement and production changes remain outside this release.
8. Only then request a **separate** documented change approval for an isolated non-production integration.

## Current verification (offline only)

- Node unit/contract tests rerun for R0.1-R0.4: **125 passed, zero failed**.
- R0.5 Warden policy and offline task router: **84 passed, zero failed**.
- Combined local test count: **209 passed, zero failed**. These tests do **not** attest live identity, real Supabase RLS, runtime availability, official filings or actual Warden authority.
- Actual Warden dispatch: `NOT_CONNECTED`.
- Actual Warden decision: `NOT_REQUESTED`.
- Canonical Registry binding: `NONE`.
- Execution lease: `NONE`.
- Verified RiverOS receipt: `NONE`.
- Official MCA filing or incorporation: `NOT_CONNECTED`.
- Production deployment and real SILK settlement: `NONE`.

## Explicit do-not-execute boundary

**Permitted:** read-only architecture inspection of public-safe documentation, local mock evaluation, synthetic acceptance tests, draft contract review.

**Prohibited:** opening any real applicant file; binding a live database; changing Supabase RLS/grants/schema; issuing authority; dispatching external agents; connecting Warden/MCP runtimes; initiating government filings or digital signatures; creating actual invoices or settlements; deploying to staging/production; merging this change as evidence of system connectivity.

## Public-safe references

- [ALPHA-NODE-001 operating boundary](./ALPHA-NODE-001-OPERATING-BOUNDARY.md)
- [Cross-surface manifest contract](./CROSS-SURFACE-MANIFEST-CONTRACT.md)
- [Genesis ARK control-plane source](https://github.com/Esomoire-consultancy-Company/genesis-ark/tree/main/control-plane)

**Review status transition:** only a separately recorded, independently verified human authority decision can change a real integration gate. This PR is documentation only and should remain draft until reviewed.
